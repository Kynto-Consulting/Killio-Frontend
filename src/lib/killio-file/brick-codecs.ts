// Optimized, schema-specific codecs for mesh bricks/connections. Instead of
// encoding each brick as a generic object (repeating the keys id/kind/parentId/
// position/size on every brick), the envelope is written positionally and the
// brick kind collapses to a single byte. Free-form `content`/`metadata` fall
// back to the dictionary value codec (binary.ts), which still dedupes the
// well-known content keys (shapePreset, style, childOrder, …).

import { ByteWriter, ByteReader, encodeValue, decodeValue } from "./binary.ts";

// Kind ↔ code table. APPEND-ONLY — never reorder/remove (format contract).
const MESH_KINDS = ["board_empty", "text", "frame", "script", "mirror", "portal", "decision", "draw", "geometry"];
const KIND_TO_CODE = new Map<string, number>(MESH_KINDS.map((k, i) => [k, i]));
const UNKNOWN_KIND = 255;

type AnyDict = Parameters<typeof encodeValue>[2];

type MeshBrickLike = {
  id: string;
  kind: string;
  parentId: string | null;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation?: number;
  metadata?: unknown;
  content?: unknown;
};

type MeshConnectionLike = {
  id: string;
  cons: [string, string];
  label: unknown;
  style?: unknown;
};

export function encodeMeshBrick(w: ByteWriter, b: MeshBrickLike, dict: AnyDict): void {
  const code = KIND_TO_CODE.get(b.kind);
  if (code === undefined) { w.u8(UNKNOWN_KIND); w.str(b.kind); }
  else w.u8(code);
  w.str(b.id);
  encodeValue(w, b.parentId ?? null, dict);
  // numbers go through the value codec: integer coords become 1-3 byte varints.
  encodeValue(w, b.position?.x ?? 0, dict);
  encodeValue(w, b.position?.y ?? 0, dict);
  encodeValue(w, b.size?.w ?? 0, dict);
  encodeValue(w, b.size?.h ?? 0, dict);
  encodeValue(w, b.rotation ?? null, dict);
  encodeValue(w, b.metadata ?? null, dict);
  encodeValue(w, b.content ?? null, dict);
}

export function decodeMeshBrick(r: ByteReader, dict: AnyDict): MeshBrickLike {
  const code = r.u8();
  const kind = code === UNKNOWN_KIND ? r.str() : MESH_KINDS[code] ?? "draw";
  const id = r.str();
  const parentId = decodeValue(r, dict) as string | null;
  const x = decodeValue(r, dict) as number;
  const y = decodeValue(r, dict) as number;
  const w = decodeValue(r, dict) as number;
  const h = decodeValue(r, dict) as number;
  const rotation = decodeValue(r, dict) as number | null;
  const metadata = decodeValue(r, dict);
  const content = decodeValue(r, dict);
  const brick: MeshBrickLike = {
    id, kind,
    parentId: typeof parentId === "string" ? parentId : null,
    position: { x: typeof x === "number" ? x : 0, y: typeof y === "number" ? y : 0 },
    size: { w: typeof w === "number" ? w : 0, h: typeof h === "number" ? h : 0 },
  };
  if (typeof rotation === "number") brick.rotation = rotation;
  if (metadata !== null && metadata !== undefined) brick.metadata = metadata;
  if (content !== null && content !== undefined) brick.content = content;
  return brick;
}

export function encodeMeshConnection(w: ByteWriter, c: MeshConnectionLike, dict: AnyDict): void {
  w.str(c.id);
  w.str(c.cons?.[0] ?? "");
  w.str(c.cons?.[1] ?? "");
  encodeValue(w, c.label ?? null, dict);
  encodeValue(w, c.style ?? null, dict);
}

export function decodeMeshConnection(r: ByteReader, dict: AnyDict): MeshConnectionLike {
  const id = r.str();
  const a = r.str();
  const b = r.str();
  const label = decodeValue(r, dict);
  const style = decodeValue(r, dict);
  const conn: MeshConnectionLike = { id, cons: [a, b], label: label ?? { type: "doc", content: [] } };
  if (style !== null && style !== undefined) conn.style = style;
  return conn;
}

// ── Full mesh (.km) payload codec ─────────────────────────────────────────────
// Payload shape mirrors KmFile: { id, schemaVersion, title, viewport, bricks[],
// connections[], rootOrder[] }. schemaVersion is held by the container envelope.

export type MeshPayload = {
  id: string;
  title: string;
  viewport: { x: number; y: number; zoom: number };
  bricks: MeshBrickLike[];
  connections: MeshConnectionLike[];
  rootOrder: string[];
};

export function encodeMeshPayload(w: ByteWriter, p: MeshPayload, dict: AnyDict): void {
  w.str(p.id ?? "");
  w.str(p.title ?? "");
  w.f64(p.viewport?.x ?? 0);
  w.f64(p.viewport?.y ?? 0);
  w.f64(p.viewport?.zoom ?? 1);
  w.uvarint(p.bricks.length);
  for (const b of p.bricks) encodeMeshBrick(w, b, dict);
  w.uvarint(p.connections.length);
  for (const c of p.connections) encodeMeshConnection(w, c, dict);
  w.uvarint(p.rootOrder.length);
  for (const id of p.rootOrder) w.str(id);
}

export function decodeMeshPayload(r: ByteReader, dict: AnyDict): MeshPayload {
  const id = r.str();
  const title = r.str();
  const viewport = { x: r.f64(), y: r.f64(), zoom: r.f64() };
  const bn = r.uvarint();
  const bricks: MeshBrickLike[] = new Array(bn);
  for (let i = 0; i < bn; i++) bricks[i] = decodeMeshBrick(r, dict);
  const cn = r.uvarint();
  const connections: MeshConnectionLike[] = new Array(cn);
  for (let i = 0; i < cn; i++) connections[i] = decodeMeshConnection(r, dict);
  const rn = r.uvarint();
  const rootOrder: string[] = new Array(rn);
  for (let i = 0; i < rn; i++) rootOrder[i] = r.str();
  return { id, title, viewport, bricks, connections, rootOrder };
}
