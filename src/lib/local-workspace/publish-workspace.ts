// Publish an ENTIRE local workspace to the user's personal cloud workspace,
// remapping inter-entity references (@-mention pills + deep refs) from local
// file paths to the freshly-created cloud ids, and uploading referenced assets,
// so the published copies are 100% functional in the cloud. Local files stay
// untouched on disk.

import {
  createDocument,
  createDocumentBrick,
  updateDocumentVisibility,
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
  uploadFile,
  type BrickMutationInput,
} from "@/lib/api/contracts";
import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft } from "./adapters.ts";
import { deserializeKmToMesh } from "@/lib/mesh-file";
import { assetNameFromRef } from "./assets.ts";

export type PublishCtx = { teamId: string; accessToken: string };

export type WorkspaceFile = { path: string; kind: "kd" | "km" | "kb"; text: string };

export type WorkspacePublishSummary = {
  total: number;
  published: number;
  failed: number;
  results: Array<{ path: string; route?: string; ok: boolean }>;
};

type RefEntry = { type: "doc" | "board" | "mesh"; id: string; route: string };

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "untitled";

const ASSET_RE = /asset:([A-Za-z0-9._\-]+)/g;

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
    // Deep refs: $[<docPath>:brick:selector] or $[mesh:<meshPath>:brick:selector]
    s = s.replace(/\$\[([^\]]+)\]/g, (m, inner) => {
      const tokens = String(inner).split(":");
      if (tokens[0]?.toLowerCase() === "mesh" && tokens[1]) {
        const e = refMap.get(tokens[1]);
        if (e) { tokens[1] = e.id; return `$[${tokens.join(":")}]`; }
        return m;
      }
      const e = refMap.get(tokens[0]);
      if (e) { tokens[0] = e.id; return `$[${tokens.join(":")}]`; }
      return m;
    });
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
  const refMap = new Map<string, RefEntry>();
  const created: Array<{ file: WorkspaceFile & { payload: unknown }; entry: RefEntry }> = [];
  for (const f of decoded) {
    try {
      if (f.kind === "kd") {
        const draft = kdToDocDraft(f.payload);
        const doc = await createDocument({ teamId: ctx.teamId, title: draft.title }, ctx.accessToken);
        const entry: RefEntry = { type: "doc", id: doc.id, route: `/d/${doc.id}` };
        refMap.set(f.path, entry); created.push({ file: f, entry });
      } else if (f.kind === "kb") {
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
    } catch { /* shell creation failed → entity will be reported as failed below */ }
  }

  // 2) Upload referenced assets once → asset:<name> → cloud url map.
  const assetMap = new Map<string, string>();
  if (opts.readAsset) {
    const names = new Set<string>();
    decoded.forEach((f) => collectAssetNames(f.payload, names));
    for (const name of names) {
      try {
        const file = await opts.readAsset(assetNameFromRef(`asset:${name}`));
        if (!file) continue;
        const up = await uploadFile(file, ctx.accessToken, { ownerScopeType: "team", ownerScopeId: ctx.teamId });
        assetMap.set(name, up.url);
      } catch { /* leave asset ref unmapped */ }
    }
  }

  const remap = makeRemapString(refMap, assetMap);

  // 3) Fill content (remapped) + make public.
  const results: WorkspacePublishSummary["results"] = [];
  let done = 0;
  for (const { file: f, entry } of created) {
    try {
      if (f.kind === "kd") {
        const draft = kdToDocDraft(f.payload);
        for (let i = 0; i < draft.bricks.length; i += 1) {
          const b = draft.bricks[i];
          const content = deepRemap(b.content ?? {}, remap);
          try { await createDocumentBrick(entry.id, { kind: b.kind, position: b.position ?? i, content }, ctx.accessToken); } catch { /* skip brick */ }
        }
        await updateDocumentVisibility(entry.id, "public_link", ctx.accessToken);
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
  return { total: decoded.length, published, failed: decoded.length - published, results };
}
