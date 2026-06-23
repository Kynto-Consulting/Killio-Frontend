// Publish an ENTIRE local workspace to the user's personal cloud workspace,
// remapping inter-entity references (@-mention pills + deep refs) from local
// file paths to the freshly-created cloud ids, and uploading referenced assets,
// so the published copies are 100% functional in the cloud. Local files stay
// untouched on disk.

import {
  createDocument,
  createDocumentsBatch,
  createDocumentBricks,
  updateDocumentVisibility,
  deleteDocument,
  deleteDocumentBrick,
  getDocumentBricks,
  getDocument,
  updateDocumentTitle,
} from "@/lib/api/documents";
import {
  createBoard,
  createList,
  createCard,
  createCardBrick,
  updateBoardVisibility,
  getMesh,
  updateMeshState,
  updateMeshVisibility,
  uploadFiles,
  deleteBoard,
  deleteList,
  getBoard,
  type BrickMutationInput,
} from "@/lib/api/contracts";
import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft } from "./adapters.ts";
import { deserializeKmToMesh } from "@/lib/mesh-file";

export type PublishCtx = { teamId: string; accessToken: string };

export type WorkspaceFile = { path: string; kind: "kd" | "km" | "kb"; text: string; lastModified?: number };

/**
 * Delete previously-published cloud entities (used by "Override" re-sync — wipe
 * the prior upload, then publish fresh). Meshes are boards, so both go through
 * deleteBoard. Best-effort: already-deleted entities are ignored.
 */
export async function deleteWorkspaceEntities(
  entityMap: Record<string, { type: "doc" | "board" | "mesh"; id: string }>,
  ctx: PublishCtx,
): Promise<void> {
  for (const ref of Object.values(entityMap)) {
    try {
      if (ref.type === "doc") await deleteDocument(ref.id, ctx.accessToken);
      else await deleteBoard(ref.id, ctx.accessToken);
    } catch { /* already gone / no access → skip */ }
  }
}

export type WorkspacePublishSummary = {
  total: number;
  published: number;
  failed: number;
  results: Array<{ path: string; route?: string; ok: boolean }>;
  /** local file path → the cloud entity it was published as (for later merge). */
  entityMap: Record<string, { type: "doc" | "board" | "mesh"; id: string }>;
};

type RefEntry = { type: "doc" | "board" | "mesh"; id: string; route: string };

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "untitled";

// Allow path separators so `asset:img/icon.png` is captured whole; the file is
// stored flat under assets/<basename>, so we read/replace by basename.
const ASSET_RE = /asset:([A-Za-z0-9._\-/]+)/g;
const assetBase = (name: string) => name.split("/").pop() || name;

/**
 * Upload ONLY the assets actually referenced by the entities (or by widget code
 * inside them) — collected via collectAssetNames — deduped by basename. Returns
 * a map of every captured ref token → its cloud URL so references can be remapped
 * everywhere.
 */
async function uploadUsedAssets(
  decoded: Array<{ payload: unknown }>,
  ctx: PublishCtx,
  readAsset?: (name: string) => Promise<File | null>,
): Promise<Map<string, string>> {
  const assetMap = new Map<string, string>();
  if (!readAsset) return assetMap;
  const refs = new Set<string>();
  decoded.forEach((f) => collectAssetNames(f.payload, refs));
  if (!refs.size) return assetMap;
  // Read each unique asset file (local FS), then upload them ALL in ONE request.
  const bases = [...new Set([...refs].map(assetBase))];
  const files: File[] = [];
  const baseOrder: string[] = [];
  for (const base of bases) {
    try { const file = await readAsset(base); if (file) { files.push(file); baseOrder.push(base); } } catch { /* skip */ }
  }
  const urlByBase = new Map<string, string>();
  try {
    const uploaded = await uploadFiles(files, ctx.accessToken, { ownerScopeType: "team", ownerScopeId: ctx.teamId });
    uploaded.forEach((u, i) => { if (u?.url) urlByBase.set(baseOrder[i], u.url); });
  } catch { /* leave unmapped */ }
  for (const ref of refs) {
    const url = urlByBase.get(assetBase(ref));
    if (url) assetMap.set(ref, url); // key by the exact token so remap matches
  }
  return assetMap;
}

// ── Reference remapping ───────────────────────────────────────────────────────

function makeRemapString(refMap: Map<string, RefEntry>, assetMap: Map<string, string>) {
  return (input: string): string => {
    let s = input;
    // @-mention pills: @[doc|board|mesh:<localPath>:name]
    s = s.replace(/@\[(doc|board|mesh):([^:\]]+)((?::[^\]]*)?)\]/g, (m, _type, path, rest) => {
      const entry = refMap.get(path);
      if (!entry) return m;
      return `@[${entry.type}:${entry.id}${rest || ""}]`;
    });
    // Deep tokens: $[…] (inlined value) AND #[…] (visual pill) — same path
    // grammar [entityType:scopeId:]brickId:selector, where the scope id is a
    // local path that must become the cloud id. Both sigils are remapped.
    const remapDeep = (sigil: "$" | "#") => {
      const re = new RegExp(`\\${sigil}\\[([^\\]]+)\\]`, "g");
      s = s.replace(re, (m, inner) => {
        const tokens = String(inner).split(":");
        // entityType-prefixed form: doc|board|card|mesh:<scopePath>:…
        if (/^(doc|board|card|mesh)$/i.test(tokens[0] ?? "") && tokens[1]) {
          const e = refMap.get(tokens[1]);
          if (e) { tokens[1] = e.id; return `${sigil}[${tokens.join(":")}]`; }
          return m;
        }
        const e = refMap.get(tokens[0]);
        if (e) { tokens[0] = e.id; return `${sigil}[${tokens.join(":")}]`; }
        return m;
      });
    };
    remapDeep("$");
    remapDeep("#");
    // Asset refs anywhere in the string (covers url/src fields + JSON captions).
    s = s.replace(ASSET_RE, (m, name) => assetMap.get(name) ?? m);
    // Bare id fields that equal a known local path (e.g. portal targetId /
    // mirror sourceId) → cloud id.
    const exact = refMap.get(s);
    if (exact) return exact.id;
    return s;
  };
}

function deepRemap<T>(value: T, remap: (s: string) => string): T {
  if (typeof value === "string") return remap(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepRemap(v, remap)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepRemap(v, remap);
    return out as unknown as T;
  }
  return value;
}

/** Collect every unique `asset:<name>` referenced anywhere in a JSON-able value. */
function collectAssetNames(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") {
    let m: RegExpExecArray | null;
    ASSET_RE.lastIndex = 0;
    while ((m = ASSET_RE.exec(value)) !== null) acc.add(m[1]);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectAssetNames(v, acc)); return; }
  if (value && typeof value === "object") { Object.values(value as Record<string, unknown>).forEach((v) => collectAssetNames(v, acc)); }
}

function toCardBrickInput(kind: string, content: any): BrickMutationInput | null {
  const k = String(kind || content?.kind || "text").toLowerCase();
  if (k === "text") return { kind: "text", displayStyle: content?.displayStyle || "paragraph", markdown: String(content?.markdown ?? content?.text ?? "") };
  if (k === "checklist") return { kind: "checklist", items: Array.isArray(content?.items) ? content.items : [] } as BrickMutationInput;
  if (k === "table") return { kind: "table", rows: Array.isArray(content?.rows) ? content.rows : [] } as BrickMutationInput;
  if (["media", "image", "video", "audio", "file", "bookmark"].includes(k))
    return { kind: "media", mediaType: content?.mediaType || "file", title: content?.title ?? null, url: content?.url ?? null, mimeType: content?.mimeType ?? null, sizeBytes: content?.sizeBytes ?? null, caption: content?.caption ?? null } as BrickMutationInput;
  return { kind: "text", displayStyle: "paragraph", markdown: typeof content === "string" ? content : "" };
}

// ── Workspace publish ─────────────────────────────────────────────────────────

export async function publishLocalWorkspace(
  files: WorkspaceFile[],
  ctx: PublishCtx,
  opts: { readAsset?: (name: string) => Promise<File | null>; onProgress?: (done: number, total: number) => void } = {},
): Promise<WorkspacePublishSummary> {
  // Decode everything up front.
  const decoded = files
    .map((f) => { try { return { ...f, payload: decodeKillioFile(f.text).payload }; } catch { return null; } })
    .filter(Boolean) as Array<WorkspaceFile & { payload: unknown }>;

  // 1) Create cloud shells so we know every entity's new id before remapping.
  //    Documents are created in ONE batch (already public, so no per-doc
  //    visibility call); boards/meshes individually.
  const refMap = new Map<string, RefEntry>();
  const created: Array<{ file: WorkspaceFile & { payload: unknown }; entry: RefEntry }> = [];
  const kdFiles = decoded.filter((f) => f.kind === "kd");
  if (kdFiles.length) {
    try {
      const createdDocs = await createDocumentsBatch(
        kdFiles.map((f) => ({ teamId: ctx.teamId, title: kdToDocDraft(f.payload).title, visibility: "public_link" as const })),
        ctx.accessToken,
      );
      kdFiles.forEach((f, i) => {
        const d = createdDocs[i];
        if (!d) return;
        const entry: RefEntry = { type: "doc", id: d.id, route: `/d/${d.id}` };
        refMap.set(f.path, entry); created.push({ file: f, entry });
      });
    } catch { /* docs batch failed → all reported below */ }
  }
  for (const f of decoded) {
    if (f.kind === "kd") continue;
    try {
      if (f.kind === "kb") {
        const kb = kbToBoardDraft(f.payload);
        const board = await createBoard({ name: kb.name, slug: slug(kb.name), boardType: "kanban", description: kb.description ?? undefined }, ctx.teamId, ctx.accessToken);
        const entry: RefEntry = { type: "board", id: board.id, route: `/b/${board.id}` };
        refMap.set(f.path, entry); created.push({ file: f, entry });
      } else if (f.kind === "km") {
        const { meta } = deserializeKmToMesh(f.payload);
        const board = await createBoard({ name: meta.title || "Mesh", slug: slug(meta.title || "mesh"), boardType: "mesh" }, ctx.teamId, ctx.accessToken);
        const entry: RefEntry = { type: "mesh", id: board.id, route: `/m/${board.id}` };
        refMap.set(f.path, entry); created.push({ file: f, entry });
      }
    } catch { /* shell creation failed → entity reported as failed below */ }
  }

  // 2) Upload referenced assets once → asset:<name> → cloud url map.
  const assetMap = await uploadUsedAssets(decoded, ctx, opts.readAsset);

  const remap = makeRemapString(refMap, assetMap);

  // 3) Fill content (remapped) + make public.
  const results: WorkspacePublishSummary["results"] = [];
  let done = 0;
  for (const { file: f, entry } of created) {
    try {
      if (f.kind === "kd") {
        const draft = kdToDocDraft(f.payload);
        const bricks = draft.bricks.map((b, i) => ({ id: b.id, kind: b.kind, position: b.position ?? i, content: deepRemap(b.content ?? {}, remap) }));
        if (bricks.length) await createDocumentBricks(entry.id, bricks, ctx.accessToken); // 1 request
        // visibility already public from the batch shell-create.
      } else if (f.kind === "kb") {
        const kb = kbToBoardDraft(f.payload);
        for (let li = 0; li < kb.lists.length; li += 1) {
          const list = kb.lists[li];
          const createdList = await createList(entry.id, { name: list.name, position: li }, ctx.accessToken);
          for (const card of list.cards) {
            try {
              const createdCard = await createCard({ listId: createdList.id, title: remap(card.title || "Card"), dueAt: typeof card.dueAt === "string" ? card.dueAt : undefined }, ctx.accessToken);
              for (const blk of (Array.isArray(card.blocks) ? card.blocks : []) as any[]) {
                const input = toCardBrickInput(blk?.kind, deepRemap(blk?.content ?? blk, remap));
                if (input) { try { await createCardBrick(createdCard.id, input, ctx.accessToken); } catch { /* skip */ } }
              }
            } catch { /* skip card */ }
          }
        }
        await updateBoardVisibility(entry.id, "public_link", ctx.accessToken);
      } else if (f.kind === "km") {
        const { state } = deserializeKmToMesh(f.payload);
        const remappedState = deepRemap(state, remap);
        let revision = 0;
        try { revision = (await getMesh(entry.id, ctx.accessToken)).revision ?? 0; } catch { /* default */ }
        await updateMeshState(entry.id, { state: remappedState as any, expectedRevision: revision }, ctx.accessToken);
        await updateMeshVisibility(entry.id, "public_link", ctx.accessToken);
      }
      results.push({ path: f.path, route: entry.route, ok: true });
    } catch {
      results.push({ path: f.path, ok: false });
    }
    done += 1;
    opts.onProgress?.(done, created.length);
  }

  // Files whose shell creation failed.
  for (const f of decoded) {
    if (!refMap.has(f.path)) results.push({ path: f.path, ok: false });
  }

  const published = results.filter((r) => r.ok).length;
  const entityMap: Record<string, { type: "doc" | "board" | "mesh"; id: string }> = {};
  for (const [path, entry] of refMap) entityMap[path] = { type: entry.type, id: entry.id };
  return { total: decoded.length, published, failed: decoded.length - published, results, entityMap };
}

const routeFor = (type: "doc" | "board" | "mesh", id: string) =>
  `/${type === "doc" ? "d" : type === "board" ? "b" : "m"}/${id}`;

async function cloudUpdatedAtMs(ref: RefEntry, ctx: PublishCtx): Promise<number> {
  // Only documents expose a reliable updatedAt. Boards/meshes don't, so we
  // return 0 → they're treated as "cloud unchanged" (local-wins on local edits).
  if (ref.type !== "doc") return 0;
  try { return Date.parse((await getDocument(ref.id, ctx.accessToken)).updatedAt) || 0; }
  catch { return 0; }
}

/**
 * Merge a local workspace into an EXISTING cloud workspace, last-writer-wins per
 * entity (the user's "apply only the newest"): for each mapped entity compare
 * local file mtime and cloud updatedAt against the last upload time — push local
 * only when it's the newer side, otherwise keep the cloud copy. New local files
 * are created; cloud-only entities are kept. Updates happen IN PLACE (same cloud
 * id) so cross-entity references stay valid.
 */
export async function mergeLocalWorkspace(
  files: WorkspaceFile[],
  ctx: PublishCtx,
  prevEntityMap: Record<string, { type: "doc" | "board" | "mesh"; id: string }>,
  uploadedAt: string,
  opts: { readAsset?: (name: string) => Promise<File | null>; onProgress?: (done: number, total: number) => void } = {},
): Promise<WorkspacePublishSummary> {
  const uploadedMs = Date.parse(uploadedAt) || 0;
  const SKEW = 5000; // clock-skew margin between device + server (ms)

  const decoded = files
    .map((f) => { try { return { ...f, payload: decodeKillioFile(f.text).payload }; } catch { return null; } })
    .filter(Boolean) as Array<WorkspaceFile & { payload: unknown }>;

  // 1) Seed refMap with existing cloud ids; create shells for brand-new files.
  const refMap = new Map<string, RefEntry>();
  const newlyCreated = new Set<string>();
  for (const f of decoded) {
    const prev = prevEntityMap[f.path];
    if (prev) refMap.set(f.path, { type: prev.type, id: prev.id, route: routeFor(prev.type, prev.id) });
  }
  for (const f of decoded) {
    if (refMap.has(f.path)) continue;
    try {
      if (f.kind === "kd") {
        const draft = kdToDocDraft(f.payload);
        const doc = await createDocument({ teamId: ctx.teamId, title: draft.title }, ctx.accessToken);
        refMap.set(f.path, { type: "doc", id: doc.id, route: `/d/${doc.id}` });
      } else if (f.kind === "kb") {
        const kb = kbToBoardDraft(f.payload);
        const board = await createBoard({ name: kb.name, slug: slug(kb.name), boardType: "kanban", description: kb.description ?? undefined }, ctx.teamId, ctx.accessToken);
        refMap.set(f.path, { type: "board", id: board.id, route: `/b/${board.id}` });
      } else if (f.kind === "km") {
        const { meta } = deserializeKmToMesh(f.payload);
        const board = await createBoard({ name: meta.title || "Mesh", slug: slug(meta.title || "mesh"), boardType: "mesh" }, ctx.teamId, ctx.accessToken);
        refMap.set(f.path, { type: "mesh", id: board.id, route: `/m/${board.id}` });
      }
      newlyCreated.add(f.path);
    } catch { /* shell failed → reported below */ }
  }

  // 2) Upload only the assets actually referenced (incl. inside widget code).
  const assetMap = await uploadUsedAssets(decoded, ctx, opts.readAsset);
  const remap = makeRemapString(refMap, assetMap);

  const fillDoc = async (id: string, payload: unknown, wipe: boolean) => {
    const draft = kdToDocDraft(payload);
    if (wipe) {
      try { await updateDocumentTitle(id, draft.title, ctx.accessToken); } catch { /* keep */ }
      try {
        const existing = await getDocumentBricks(id, ctx.accessToken);
        for (const b of existing as Array<{ id: string }>) { try { await deleteDocumentBrick(id, b.id, ctx.accessToken); } catch { /* skip */ } }
      } catch { /* none */ }
    }
    const bricks = draft.bricks.map((b, i) => ({ id: b.id, kind: b.kind, position: b.position ?? i, content: deepRemap(b.content ?? {}, remap) }));
    if (bricks.length) await createDocumentBricks(id, bricks, ctx.accessToken); // 1 request
    await updateDocumentVisibility(id, "public_link", ctx.accessToken);
  };
  const fillBoard = async (id: string, payload: unknown, wipe: boolean) => {
    const kb = kbToBoardDraft(payload);
    if (wipe) {
      try {
        const board = await getBoard(id, ctx.accessToken);
        for (const l of ((board as any).lists ?? []) as Array<{ id: string }>) { try { await deleteList(l.id, ctx.accessToken); } catch { /* skip */ } }
      } catch { /* none */ }
    }
    for (let li = 0; li < kb.lists.length; li += 1) {
      const list = kb.lists[li];
      const createdList = await createList(id, { name: list.name, position: li }, ctx.accessToken);
      for (const card of list.cards) {
        try {
          const createdCard = await createCard({ listId: createdList.id, title: remap(card.title || "Card"), dueAt: typeof card.dueAt === "string" ? card.dueAt : undefined }, ctx.accessToken);
          for (const blk of (Array.isArray(card.blocks) ? card.blocks : []) as any[]) {
            const input = toCardBrickInput(blk?.kind, deepRemap(blk?.content ?? blk, remap));
            if (input) { try { await createCardBrick(createdCard.id, input, ctx.accessToken); } catch { /* skip */ } }
          }
        } catch { /* skip card */ }
      }
    }
    await updateBoardVisibility(id, "public_link", ctx.accessToken);
  };
  const fillMesh = async (id: string, payload: unknown) => {
    const { state } = deserializeKmToMesh(payload);
    const remappedState = deepRemap(state, remap);
    let revision = 0;
    try { revision = (await getMesh(id, ctx.accessToken)).revision ?? 0; } catch { /* default */ }
    await updateMeshState(id, { state: remappedState as any, expectedRevision: revision }, ctx.accessToken);
    await updateMeshVisibility(id, "public_link", ctx.accessToken);
  };

  // 3) Per-entity decision + apply.
  const results: WorkspacePublishSummary["results"] = [];
  let done = 0;
  const total = decoded.length;
  for (const f of decoded) {
    const entry = refMap.get(f.path);
    if (!entry) { results.push({ path: f.path, ok: false }); done += 1; opts.onProgress?.(done, total); continue; }
    try {
      let apply = newlyCreated.has(f.path);
      if (!apply) {
        const localMs = f.lastModified ?? uploadedMs;
        const localChanged = localMs > uploadedMs + SKEW;
        const cloudMs = await cloudUpdatedAtMs(entry, ctx);
        const cloudChanged = cloudMs > uploadedMs + SKEW;
        if (!localChanged && !cloudChanged) apply = false;            // nothing changed
        else if (localChanged && !cloudChanged) apply = true;          // only local moved
        else if (!localChanged && cloudChanged) apply = false;         // only cloud moved → keep cloud
        else apply = localMs >= cloudMs;                               // both → newest wins
      }
      if (apply) {
        const wipe = !newlyCreated.has(f.path);
        if (f.kind === "kd") await fillDoc(entry.id, f.payload, wipe);
        else if (f.kind === "kb") await fillBoard(entry.id, f.payload, wipe);
        else if (f.kind === "km") await fillMesh(entry.id, f.payload);
      }
      results.push({ path: f.path, route: entry.route, ok: true });
    } catch {
      results.push({ path: f.path, ok: false });
    }
    done += 1;
    opts.onProgress?.(done, total);
  }

  // 4) Final map: every local entity + cloud-only entities that survive (Merge).
  const entityMap: Record<string, { type: "doc" | "board" | "mesh"; id: string }> = {};
  for (const [path, entry] of refMap) entityMap[path] = { type: entry.type, id: entry.id };
  for (const [path, ref] of Object.entries(prevEntityMap)) if (!entityMap[path]) entityMap[path] = ref;

  const publishedN = results.filter((r) => r.ok).length;
  return { total, published: publishedN, failed: total - publishedN, results, entityMap };
}
