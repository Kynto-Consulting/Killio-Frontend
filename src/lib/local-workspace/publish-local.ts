// Publish a local-workspace entity (document/board/mesh) to the user's personal
// cloud workspace and make it public. The local file stays on disk untouched;
// this creates a fresh cloud copy and returns its in-app route.

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
import { kdToDocDraft, kbToBoardDraft } from "./adapters.ts";
import { deserializeKmToMesh } from "@/lib/mesh-file";

export type PublishCtx = { teamId: string; accessToken: string };
export type PublishResult = { id: string; route: string };
/** Optional asset reader so publish can upload local images referenced by asset:<name>. */
export type PublishOpts = { readAsset?: (name: string) => Promise<File | null> };

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "untitled";

const ASSET_RE = /asset:([A-Za-z0-9._\-]+)/g;

function collectAssetNames(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") { ASSET_RE.lastIndex = 0; let m: RegExpExecArray | null; while ((m = ASSET_RE.exec(value)) !== null) acc.add(m[1]); return; }
  if (Array.isArray(value)) { value.forEach((v) => collectAssetNames(v, acc)); return; }
  if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => collectAssetNames(v, acc));
}

function deepRemapAssets<T>(value: T, assetMap: Map<string, string>): T {
  if (typeof value === "string") return value.replace(ASSET_RE, (m, name) => assetMap.get(name) ?? m) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepRemapAssets(v, assetMap)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepRemapAssets(v, assetMap);
    return out as unknown as T;
  }
  return value;
}

/** Upload every asset:<name> referenced in a payload → map name → cloud url. */
async function uploadReferencedAssets(payload: unknown, ctx: PublishCtx, opts: PublishOpts): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!opts.readAsset) return map;
  const names = new Set<string>();
  collectAssetNames(payload, names);
  for (const name of names) {
    try {
      const file = await opts.readAsset(name);
      if (!file) continue;
      const up = await uploadFile(file, ctx.accessToken, { ownerScopeType: "team", ownerScopeId: ctx.teamId });
      map.set(name, up.url);
    } catch { /* leave unmapped */ }
  }
  return map;
}

/** Map a stored content brick to the card brick mutation input. Best-effort. */
function toCardBrickInput(kind: string, content: any): BrickMutationInput | null {
  const k = String(kind || content?.kind || "text").toLowerCase();
  if (k === "text") return { kind: "text", displayStyle: content?.displayStyle || "paragraph", markdown: String(content?.markdown ?? content?.text ?? "") };
  if (k === "checklist") return { kind: "checklist", items: Array.isArray(content?.items) ? content.items : [] } as BrickMutationInput;
  if (k === "table") return { kind: "table", rows: Array.isArray(content?.rows) ? content.rows : [] } as BrickMutationInput;
  if (k === "media" || k === "image" || k === "video" || k === "audio" || k === "file" || k === "bookmark")
    return { kind: "media", mediaType: content?.mediaType || "file", title: content?.title ?? null, url: content?.url ?? null, mimeType: content?.mimeType ?? null, sizeBytes: content?.sizeBytes ?? null, caption: content?.caption ?? null } as BrickMutationInput;
  // Fallback: serialize unknown brick as a text block so nothing is silently lost.
  return { kind: "text", displayStyle: "paragraph", markdown: typeof content === "string" ? content : "" };
}

/** Publish a .kd document payload → cloud document, public. */
export async function publishLocalDocument(payload: unknown, ctx: PublishCtx, opts: PublishOpts = {}): Promise<PublishResult> {
  const draft = kdToDocDraft(payload);
  const assetMap = await uploadReferencedAssets(payload, ctx, opts);
  const doc = await createDocument({ teamId: ctx.teamId, title: draft.title }, ctx.accessToken);
  for (let i = 0; i < draft.bricks.length; i += 1) {
    const b = draft.bricks[i];
    try { await createDocumentBrick(doc.id, { kind: b.kind, position: b.position ?? i, content: deepRemapAssets(b.content ?? {}, assetMap) }, ctx.accessToken); }
    catch { /* skip a brick the backend rejects rather than abort the whole publish */ }
  }
  await updateDocumentVisibility(doc.id, "public_link", ctx.accessToken);
  return { id: doc.id, route: `/d/${doc.id}` };
}

/** Publish a .kb board payload → cloud board with lists+cards, public. */
export async function publishLocalBoard(payload: unknown, ctx: PublishCtx, opts: PublishOpts = {}): Promise<PublishResult> {
  const kb = kbToBoardDraft(payload);
  const assetMap = await uploadReferencedAssets(payload, ctx, opts);
  const board = await createBoard(
    { name: kb.name, slug: slug(kb.name), boardType: "kanban", description: kb.description ?? undefined,
      backgroundKind: (kb.backgroundKind as any) || "none", backgroundValue: kb.backgroundValue ?? undefined },
    ctx.teamId, ctx.accessToken,
  );
  for (let li = 0; li < kb.lists.length; li += 1) {
    const list = kb.lists[li];
    const createdList = await createList(board.id, { name: list.name, position: li }, ctx.accessToken);
    for (const card of list.cards) {
      try {
        const createdCard = await createCard(
          { listId: createdList.id, title: card.title || "Card", dueAt: typeof card.dueAt === "string" ? card.dueAt : undefined },
          ctx.accessToken,
        );
        const blocks = Array.isArray(card.blocks) ? card.blocks : [];
        for (const blk of blocks as any[]) {
          const input = toCardBrickInput(blk?.kind, deepRemapAssets(blk?.content ?? blk, assetMap));
          if (input) { try { await createCardBrick(createdCard.id, input, ctx.accessToken); } catch { /* skip */ } }
        }
      } catch { /* skip a card the backend rejects */ }
    }
  }
  await updateBoardVisibility(board.id, "public_link", ctx.accessToken);
  return { id: board.id, route: `/b/${board.id}` };
}

/** Publish a .km mesh payload → cloud mesh board with state, public. */
export async function publishLocalMesh(payload: unknown, ctx: PublishCtx, opts: PublishOpts = {}): Promise<PublishResult> {
  const { state, meta } = deserializeKmToMesh(payload);
  const assetMap = await uploadReferencedAssets(state, ctx, opts);
  const board = await createBoard(
    { name: meta.title || "Mesh", slug: slug(meta.title || "mesh"), boardType: "mesh" },
    ctx.teamId, ctx.accessToken,
  );
  // A freshly created mesh starts at revision 0; fetch to be safe then push state.
  let revision = 0;
  try { revision = (await getMesh(board.id, ctx.accessToken)).revision ?? 0; } catch { /* default 0 */ }
  await updateMeshState(board.id, { state: deepRemapAssets(state, assetMap) as any, expectedRevision: revision }, ctx.accessToken);
  await updateMeshVisibility(board.id, "public_link", ctx.accessToken);
  return { id: board.id, route: `/m/${board.id}` };
}
