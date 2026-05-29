// Collect normalized EntityInput[] for the graph, from a local workspace
// (decode .kd/.kb/.km files) or from the cloud (fetch docs/boards/meshes).

import type { EntityInput } from "./types.ts";
import type { WorkspaceFileEntry } from "@/lib/local-workspace/fs-access";
import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft } from "@/lib/local-workspace/adapters";
import { deserializeKmToMesh } from "@/lib/mesh-file";
import { listAllTeamDocuments, getDocument } from "@/lib/api/documents";
import { listTeamBoards, getBoard, getMesh } from "@/lib/api/contracts";

export type CollectProgress = (done: number, total: number) => void;

function localRoute(kind: string, path: string): string {
  const base = kind === "kd" ? "d" : kind === "kb" ? "b" : "m";
  return `/${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function collectLocalEntities(
  files: WorkspaceFileEntry[],
  readFile: (path: string) => Promise<string>,
  onProgress?: CollectProgress,
): Promise<EntityInput[]> {
  const targets = files.filter((f) => f.kind === "kd" || f.kind === "kb" || f.kind === "km");
  const out: EntityInput[] = [];
  let done = 0;
  for (const f of targets) {
    try {
      const payload = decodeKillioFile(await readFile(f.path)).payload;
      const route = localRoute(f.kind, f.path);
      if (f.kind === "kd") {
        const d = kdToDocDraft(payload);
        out.push({ type: "document", id: f.path, title: d.title, route, bricks: d.bricks.map((b) => ({ kind: b.kind, content: b.content })) });
      } else if (f.kind === "kb") {
        const kb = kbToBoardDraft(payload);
        const cards = kb.lists.flatMap((l, li) => l.cards.map((c, ci) => ({
          id: c.id || `${f.path}::c${li}-${ci}`, title: c.title || "Card",
          blocks: (Array.isArray(c.blocks) ? c.blocks : []).map((b: any) => ({ kind: String(b?.kind || "text"), content: b?.content ?? b })),
        })));
        out.push({ type: "board", id: f.path, title: kb.name, route, cards });
      } else {
        const { state, meta } = deserializeKmToMesh(payload);
        const bricks = Object.values(state.bricksById).map((b) => ({ id: b.id, kind: b.kind, content: b.content }));
        const connections = Object.values(state.connectionsById).map((c) => ({ source: c.cons?.[0] || "", target: c.cons?.[1] || "" }));
        out.push({ type: "mesh", id: f.path, title: meta.title || f.name.replace(/\.km$/, ""), route, bricks, connections });
      }
    } catch { /* skip unreadable/corrupt file */ }
    onProgress?.(++done, targets.length);
  }
  return out;
}

export async function collectOnlineEntities(
  teamId: string,
  accessToken: string,
  onProgress?: CollectProgress,
): Promise<EntityInput[]> {
  const [docList, boardList] = await Promise.all([
    listAllTeamDocuments(teamId, accessToken).catch(() => []),
    listTeamBoards(teamId, accessToken).catch(() => []),
  ]);
  const out: EntityInput[] = [];
  const total = docList.length + boardList.length;
  let done = 0;

  for (const d of docList) {
    try {
      const view = await getDocument(d.id, accessToken);
      out.push({ type: "document", id: d.id, title: view.title || d.title || "Untitled", route: `/d/${d.id}`, bricks: (view.bricks || []).map((b) => ({ kind: b.kind, content: b.content })) });
    } catch { /* skip */ }
    onProgress?.(++done, total);
  }

  for (const b of boardList) {
    try {
      if (b.boardType === "mesh") {
        const snap = await getMesh(b.id, accessToken);
        const st = snap.state;
        const bricks = Object.values(st?.bricksById || {}).map((mb: any) => ({ id: mb.id, kind: mb.kind, content: mb.content }));
        const connections = Object.values(st?.connectionsById || {}).map((c: any) => ({ source: c.cons?.[0] || "", target: c.cons?.[1] || "" }));
        out.push({ type: "mesh", id: b.id, title: b.name || "Mesh", route: `/m/${b.id}`, bricks, connections });
      } else {
        const bv = await getBoard(b.id, accessToken);
        const cards = (bv.lists || []).flatMap((l: any) => (l.cards || []).map((c: any) => ({
          id: c.id, title: c.title || "Card",
          blocks: (Array.isArray(c.blocks) ? c.blocks : []).map((blk: any) => ({ kind: String(blk?.kind || "text"), content: blk?.content ?? blk })),
        })));
        out.push({ type: "board", id: b.id, title: b.name || "Board", route: `/b/${b.id}`, cards });
      }
    } catch { /* skip */ }
    onProgress?.(++done, total);
  }
  return out;
}
