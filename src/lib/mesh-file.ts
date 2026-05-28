import type { MeshState, MeshBrick, MeshConnection } from "@/lib/api/contracts";

// Mesh ↔ .km object adapter. This module maps runtime MeshState (bricks stored
// as maps + order arrays) to/from the portable .km payload shape (flat arrays,
// per the local-first spec capabilities/plans/11-local-first-offline-crdt.md).
// Binary transport (encode/decode/download/read) lives in src/lib/killio-file.

export const KM_SCHEMA_VERSION = "2026-v1";

export type KmFile = {
  id: string;
  schemaVersion: string;
  title: string;
  viewport: { x: number; y: number; zoom: number };
  bricks: MeshBrick[];
  connections: MeshConnection[];
  rootOrder?: string[];
  exportedAt?: string;
};

function safeViewport(v: unknown): { x: number; y: number; zoom: number } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const num = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? n : d);
  return { x: num(o.x, 0), y: num(o.y, 0), zoom: num(o.zoom, 1) };
}

/** Serialize live MeshState into a portable .km file object. Pure. */
export function serializeMeshToKm(
  state: MeshState,
  opts: { meshId: string; title: string },
): KmFile {
  return {
    id: opts.meshId,
    schemaVersion: KM_SCHEMA_VERSION,
    title: opts.title || "Mesh",
    viewport: safeViewport(state.viewport),
    bricks: Object.values(state.bricksById ?? {}),
    connections: Object.values(state.connectionsById ?? {}),
    rootOrder: Array.isArray(state.rootOrder) ? [...state.rootOrder] : [],
    exportedAt: new Date().toISOString(),
  };
}

export class KmParseError extends Error {}

/** Validate + convert a parsed .km object back into runtime MeshState. Pure. */
export function deserializeKmToMesh(raw: unknown): { state: MeshState; meta: { id: string; title: string } } {
  if (!raw || typeof raw !== "object") throw new KmParseError("Not a .km object");
  const km = raw as Record<string, unknown>;
  const bricksArr = Array.isArray(km.bricks) ? (km.bricks as MeshBrick[]) : null;
  const connsArr = Array.isArray(km.connections) ? (km.connections as MeshConnection[]) : [];
  if (!bricksArr) throw new KmParseError("Missing bricks array");

  const bricksById: Record<string, MeshBrick> = {};
  for (const b of bricksArr) {
    if (!b || typeof b !== "object" || typeof (b as MeshBrick).id !== "string") continue;
    const brick = b as MeshBrick;
    bricksById[brick.id] = {
      ...brick,
      parentId: typeof brick.parentId === "string" ? brick.parentId : null,
      position: brick.position ?? { x: 0, y: 0 },
      size: brick.size ?? { w: 120, h: 80 },
    };
  }

  const connectionsById: Record<string, MeshConnection> = {};
  for (const c of connsArr) {
    if (!c || typeof c !== "object" || typeof (c as MeshConnection).id !== "string") continue;
    const conn = c as MeshConnection;
    if (!Array.isArray(conn.cons) || conn.cons.length !== 2) continue;
    if (typeof conn.cons[0] !== "string" || typeof conn.cons[1] !== "string") continue;
    // drop dangling connections
    if (!bricksById[conn.cons[0]] || !bricksById[conn.cons[1]]) continue;
    connectionsById[conn.id] = conn;
  }

  const declaredRoot = Array.isArray(km.rootOrder) ? (km.rootOrder as string[]).filter((id) => bricksById[id]) : [];
  const rootOrder = declaredRoot.length
    ? declaredRoot
    : Object.values(bricksById).filter((b) => !b.parentId).map((b) => b.id);

  const state: MeshState = {
    version: "1.0.0",
    viewport: safeViewport(km.viewport),
    rootOrder,
    bricksById,
    connectionsById,
  };
  return {
    state,
    meta: {
      id: typeof km.id === "string" ? km.id : "",
      title: typeof km.title === "string" ? km.title : "Mesh",
    },
  };
}

