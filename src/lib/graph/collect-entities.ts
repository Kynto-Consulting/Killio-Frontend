// Collect normalized EntityInput[] for the graph, from a local workspace
// (decode .kd/.kb/.km files) or from the cloud (fetch docs/boards/meshes).

import type { EntityInput } from "./types.ts";
import type { WorkspaceFileEntry } from "@/lib/local-workspace/fs-access";
import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft } from "@/lib/local-workspace/adapters";
import { deserializeKmToMesh } from "@/lib/mesh-file";
import { getTeamGraph } from "@/lib/api/contracts";

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
  // One batched request to the backend (replaces N per-entity round-trips).
  const g = await getTeamGraph(teamId, accessToken);
  const out: EntityInput[] = [];
  for (const d of g.documents) out.push({ type: "document", id: d.id, title: d.title || "Untitled", route: `/d/${d.id}`, bricks: d.bricks || [] });
  for (const b of g.boards) out.push({ type: "board", id: b.id, title: b.name || "Board", route: `/b/${b.id}`, cards: (b.cards || []).map((c) => ({ id: c.id, title: c.title || "Card", blocks: c.blocks || [] })) });
  for (const m of g.meshes) out.push({ type: "mesh", id: m.id, title: m.name || "Mesh", route: `/m/${m.id}`, bricks: m.bricks || [], connections: m.connections || [] });
  onProgress?.(1, 1);
  return out;
}
