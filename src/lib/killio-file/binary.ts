// Low-level binary primitives + a compact JSON-like value codec for Killio
// local files. Not JSON: a tagged binary encoding with an inline key dictionary
// seeded with common schema keys, so repeated object keys (kind, position,
// content, childOrder, …) cost a single varint instead of a quoted string.

// ── Byte writer / reader ──────────────────────────────────────────────────────
export class ByteWriter {
  private buf: Uint8Array;
  private len = 0;
  constructor(initial = 1024) { this.buf = new Uint8Array(initial); }

  private ensure(extra: number) {
    if (this.len + extra <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + extra) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number) { this.ensure(1); this.buf[this.len++] = v & 0xff; }

  /** Unsigned LEB128 varint. Uses % / Math.floor (not bitwise) so values above
   *  2^32 up to MAX_SAFE_INTEGER encode correctly (bitwise ops truncate to 32b). */
  uvarint(v: number) {
    let n = Math.floor(v);
    if (n < 0) throw new Error("uvarint: negative");
    this.ensure(10);
    while (n >= 0x80) { this.buf[this.len++] = (n % 128) | 0x80; n = Math.floor(n / 128); }
    this.buf[this.len++] = n % 128;
  }

  /** Signed varint via zigzag. */
  svarint(v: number) { this.uvarint(v < 0 ? -v * 2 - 1 : v * 2); }

  f64(v: number) {
    this.ensure(8);
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.len, 8);
    dv.setFloat64(0, v, true);
    this.len += 8;
  }

  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }

  str(s: string) {
    const enc = new TextEncoder().encode(s);
    this.uvarint(enc.length);
    this.bytes(enc);
  }

  finish(): Uint8Array { return this.buf.slice(0, this.len); }
}

export class ByteReader {
  private pos = 0;
  private readonly buf: Uint8Array;
  constructor(buf: Uint8Array) { this.buf = buf; }

  get offset() { return this.pos; }
  get done() { return this.pos >= this.buf.length; }

  u8(): number {
    if (this.pos >= this.buf.length) throw new Error("ByteReader: EOF");
    return this.buf[this.pos++];
  }

  uvarint(): number {
    let result = 0, shift = 0, byte: number;
    do {
      if (this.pos >= this.buf.length) throw new Error("ByteReader: EOF varint");
      byte = this.buf[this.pos++];
      result += (byte & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while (byte & 0x80);
    return result;
  }

  svarint(): number {
    const u = this.uvarint();
    return u & 1 ? -(u + 1) / 2 : u / 2;
  }

  f64(): number {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    this.pos += 8;
    return dv.getFloat64(0, true);
  }

  take(n: number): Uint8Array {
    if (this.pos + n > this.buf.length) throw new Error("ByteReader: EOF take");
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  str(): string {
    const n = this.uvarint();
    return new TextDecoder().decode(this.take(n));
  }
}

// ── Value codec ───────────────────────────────────────────────────────────────
const TAG_NULL = 0;
const TAG_FALSE = 1;
const TAG_TRUE = 2;
const TAG_INT = 3;
const TAG_FLOAT = 4;
const TAG_STR = 5;
const TAG_ARR = 6;
const TAG_OBJ = 7;

// Pre-registered keys shared by encoder + decoder. Order is the format contract:
// never reorder or remove — only append. Covers mesh/doc/kanban/script schemas.
export const SCHEMA_KEYS: string[] = [
  "id", "kind", "type", "title", "name", "label", "content", "markdown",
  "parentId", "position", "size", "rotation", "metadata", "x", "y", "w", "h", "zoom",
  "bricks", "connections", "cons", "style", "rootOrder", "childOrder", "isContainer",
  "shapePreset", "vectorPoints", "manualStrokes", "color", "width", "points",
  "stroke", "fill", "strokeWidth", "strokeStyle", "opacity", "edges",
  "viewport", "schemaVersion", "version", "exportedAt", "order",
  "columns", "lists", "cards", "description", "assignees", "tags", "priority",
  "nodes", "edges", "triggerType", "source", "target", "data", "value", "checked", "items",
  "targetType", "targetId", "targetLabel", "sourceId", "unifierKind", "collapsed",
];

const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER;

class KeyDict {
  private toIdx = new Map<string, number>();
  private list: string[] = [];
  constructor(seed: string[]) { seed.forEach((k) => this.register(k)); }
  private register(k: string): number { const i = this.list.length; this.list.push(k); this.toIdx.set(k, i); return i; }
  indexOf(k: string): number | undefined { return this.toIdx.get(k); }
  add(k: string): number { return this.register(k); }
  at(i: number): string {
    const k = this.list[i];
    if (k === undefined) throw new Error(`KeyDict: bad key index ${i}`);
    return k;
  }
}

/** Encode a JSON-like value. Throws on functions/undefined/symbols/bigint. */
export function encodeValue(w: ByteWriter, value: unknown, dict: KeyDict): void {
  if (value === null || value === undefined) { w.u8(TAG_NULL); return; }
  const t = typeof value;
  if (t === "boolean") { w.u8(value ? TAG_TRUE : TAG_FALSE); return; }
  if (t === "number") {
    const n = value as number;
    if (Number.isInteger(n) && Math.abs(n) <= MAX_SAFE_INT) { w.u8(TAG_INT); w.svarint(n); }
    else { w.u8(TAG_FLOAT); w.f64(n); }
    return;
  }
  if (t === "string") { w.u8(TAG_STR); w.str(value as string); return; }
  if (Array.isArray(value)) {
    w.u8(TAG_ARR); w.uvarint(value.length);
    for (const item of value) encodeValue(w, item, dict);
    return;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined && typeof obj[k] !== "function");
    w.u8(TAG_OBJ); w.uvarint(keys.length);
    for (const k of keys) {
      const existing = dict.indexOf(k);
      if (existing !== undefined) {
        w.uvarint(existing * 2); // even = existing key index
      } else {
        const enc = new TextEncoder().encode(k);
        w.uvarint(enc.length * 2 + 1); // odd = new key, payload length
        w.bytes(enc);
        dict.add(k);
      }
      encodeValue(w, obj[k], dict);
    }
    return;
  }
  throw new Error(`encodeValue: unsupported type ${t}`);
}

export function decodeValue(r: ByteReader, dict: KeyDict): unknown {
  const tag = r.u8();
  switch (tag) {
    case TAG_NULL: return null;
    case TAG_FALSE: return false;
    case TAG_TRUE: return true;
    case TAG_INT: return r.svarint();
    case TAG_FLOAT: return r.f64();
    case TAG_STR: return r.str();
    case TAG_ARR: {
      const n = r.uvarint();
      const arr: unknown[] = new Array(n);
      for (let i = 0; i < n; i++) arr[i] = decodeValue(r, dict);
      return arr;
    }
    case TAG_OBJ: {
      const n = r.uvarint();
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) {
        const token = r.uvarint();
        let key: string;
        if (token % 2 === 0) {
          key = dict.at(token / 2);
        } else {
          const klen = (token - 1) / 2;
          key = new TextDecoder().decode(r.take(klen));
          dict.add(key);
        }
        obj[key] = decodeValue(r, dict);
      }
      return obj;
    }
    default: throw new Error(`decodeValue: bad tag ${tag}`);
  }
}

export function newKeyDict(): KeyDict { return new KeyDict(SCHEMA_KEYS); }
