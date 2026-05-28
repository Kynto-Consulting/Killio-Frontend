// Optimized codec for the *unified content brick* family — the second brick
// type in Killio. These bricks are shared across documents (.kd), kanban cards
// (.kb), and mesh portal/mirror "unifier" content. Their kind strings overlap
// with mesh brick kinds but mean different things, so this family keeps its OWN
// append-only enum table (never share codes with the mesh codec).
//
// Envelope: kind collapses to one byte; everything else (id + free-form body)
// rides the dictionary value codec, which dedupes the well-known content keys.

import { ByteWriter, ByteReader, encodeValue, decodeValue } from "./binary.ts";

// APPEND-ONLY. Union of document + kanban + mesh-unifier content kinds.
// Never reorder/remove — only append new kinds at the end.
export const CONTENT_BRICK_KINDS = [
  "text", "table", "beautiful_table", "graph", "checklist", "quote", "divider",
  "callout", "accordion", "media", "image", "video", "audio", "bookmark", "file",
  "code", "math", "tabs", "columns", "form", "database", "payment",
  "popup_document", "ai", "form_field",
] as const;

const KIND_TO_CODE = new Map(CONTENT_BRICK_KINDS.map((k, i) => [k as string, i]));
const UNKNOWN_KIND = 255;

type AnyDict = Parameters<typeof encodeValue>[2];

export type ContentBrickLike = {
  id: string;
  kind: string;
  [field: string]: unknown;
};

/**
 * Encode a unified content brick: kind byte + id, then all remaining fields
 * (position, content, parentBlockId, displayStyle, rows, items, …) as one
 * dictionary-compressed object. Lossless for arbitrary per-kind bodies.
 */
export function encodeContentBrick(w: ByteWriter, b: ContentBrickLike, dict: AnyDict): void {
  const code = KIND_TO_CODE.get(b.kind);
  if (code === undefined) { w.u8(UNKNOWN_KIND); w.str(b.kind); }
  else w.u8(code);
  w.str(b.id ?? "");
  const rest: Record<string, unknown> = {};
  for (const k of Object.keys(b)) {
    if (k === "id" || k === "kind") continue;
    rest[k] = b[k];
  }
  encodeValue(w, rest, dict);
}

export function decodeContentBrick(r: ByteReader, dict: AnyDict): ContentBrickLike {
  const code = r.u8();
  const kind = code === UNKNOWN_KIND ? r.str() : CONTENT_BRICK_KINDS[code] ?? "text";
  const id = r.str();
  const rest = decodeValue(r, dict) as Record<string, unknown>;
  return { id, kind, ...(rest && typeof rest === "object" ? rest : {}) };
}

export function encodeContentBricks(w: ByteWriter, bricks: ContentBrickLike[], dict: AnyDict): void {
  w.uvarint(bricks.length);
  for (const b of bricks) encodeContentBrick(w, b, dict);
}

export function decodeContentBricks(r: ByteReader, dict: AnyDict): ContentBrickLike[] {
  const n = r.uvarint();
  const out: ContentBrickLike[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = decodeContentBrick(r, dict);
  return out;
}
