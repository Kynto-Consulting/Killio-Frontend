// KAML — Killio's human-readable, editable document format. A focused YAML-ish
// subset tuned for Killio entities: 2-space indentation, `key: value` maps,
// `- ` sequences, double-quoted strings (so "123" never parses as a number),
// and `|` block scalars for multi-line markdown. Lossless for the JSON-like
// value space we produce (null/bool/number/string/array/object).

const IND = "  ";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function quoteString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
}

function unquoteString(tok: string): string {
  const inner = tok.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\\" && i + 1 < inner.length) {
      const n = inner[++i];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n;
    } else out += c;
  }
  return out;
}

function keyToken(k: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k) ? k : quoteString(k);
}

function inlineScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "string") return quoteString(v);
  return "null";
}

function isCollection(v: unknown): boolean {
  return Array.isArray(v) || isPlainObject(v);
}

function isEmptyCollection(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.keys(v).filter((k) => v[k] !== undefined).length === 0;
  return false;
}

function writeBlockScalar(s: string, indent: number, out: string[]): void {
  const pad = IND.repeat(indent);
  // each physical line of the string, prefixed; empty lines kept as bare pad
  for (const line of s.split("\n")) out.push(line === "" ? "" : pad + line);
}

function writeObject(obj: Record<string, unknown>, indent: number, out: string[]): void {
  const pad = IND.repeat(indent);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined || typeof val === "function") continue;
    const kt = keyToken(key);
    if (isCollection(val) && !isEmptyCollection(val)) {
      out.push(`${pad}${kt}:`);
      if (Array.isArray(val)) writeArray(val, indent + 1, out);
      else writeObject(val as Record<string, unknown>, indent + 1, out);
    } else if (isEmptyCollection(val)) {
      out.push(`${pad}${kt}: ${Array.isArray(val) ? "[]" : "{}"}`);
    } else if (typeof val === "string" && val.includes("\n")) {
      out.push(`${pad}${kt}: |`);
      writeBlockScalar(val, indent + 1, out);
    } else {
      out.push(`${pad}${kt}: ${inlineScalar(val)}`);
    }
  }
}

function writeArray(arr: unknown[], indent: number, out: string[]): void {
  const pad = IND.repeat(indent);
  for (const item of arr) {
    if (isCollection(item) && !isEmptyCollection(item)) {
      out.push(`${pad}-`);
      if (Array.isArray(item)) writeArray(item, indent + 1, out);
      else writeObject(item as Record<string, unknown>, indent + 1, out);
    } else if (isEmptyCollection(item)) {
      out.push(`${pad}- ${Array.isArray(item) ? "[]" : "{}"}`);
    } else if (typeof item === "string" && item.includes("\n")) {
      out.push(`${pad}- |`);
      writeBlockScalar(item, indent + 1, out);
    } else {
      out.push(`${pad}- ${inlineScalar(item)}`);
    }
  }
}

export function stringifyKaml(value: unknown): string {
  const out: string[] = [];
  if (Array.isArray(value)) writeArray(value, 0, out);
  else if (isPlainObject(value)) writeObject(value, 0, out);
  else out.push(inlineScalar(value));
  return out.join("\n");
}

// ── Parser ────────────────────────────────────────────────────────────────────
export class KamlParseError extends Error {}

function indentOf(line: string): number {
  let n = 0;
  while (line[n] === " ") n++;
  return n;
}

function parseScalar(tok: string): unknown {
  const t = tok.trim();
  if (t === "null" || t === "~" || t === "") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "[]") return [];
  if (t === "{}") return {};
  if (t[0] === '"') return unquoteString(t);
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return Number(t);
  return t; // tolerate hand-typed bare string
}

function splitKeyValue(content: string): { key: string; rest: string } {
  // find the first top-level ": " or trailing ":" not inside a quoted key
  if (content[0] === '"') {
    let i = 1;
    while (i < content.length) {
      if (content[i] === "\\") { i += 2; continue; }
      if (content[i] === '"') break;
      i++;
    }
    const key = unquoteString(content.slice(0, i + 1));
    let rest = content.slice(i + 1);
    if (rest.startsWith(":")) rest = rest.slice(1);
    return { key, rest: rest.replace(/^\s+/, "") };
  }
  const idx = content.indexOf(":");
  if (idx === -1) throw new KamlParseError(`Expected 'key:' in "${content}"`);
  return { key: content.slice(0, idx).trim(), rest: content.slice(idx + 1).replace(/^\s+/, "") };
}

type Line = { indent: number; content: string; raw: string };

class Cursor {
  i = 0;
  lines: Line[];
  constructor(lines: Line[]) { this.lines = lines; }
  peek(): Line | undefined { return this.lines[this.i]; }
}

function readBlockScalar(c: Cursor, baseIndent: number, rawLines: string[]): string {
  // consume subsequent lines with indent >= baseIndent (blanks allowed), strip baseIndent
  const collected: string[] = [];
  while (c.i < c.lines.length) {
    const ln = c.lines[c.i];
    const raw = rawLines[c.i];
    if (raw.trim() === "") { collected.push(""); c.i++; continue; }
    if (ln.indent < baseIndent) break;
    collected.push(raw.slice(baseIndent));
    c.i++;
  }
  // drop trailing blank lines introduced by blank handling
  while (collected.length && collected[collected.length - 1] === "") collected.pop();
  return collected.join("\n");
}

function skipBlank(c: Cursor): void {
  while (c.i < c.lines.length) {
    const ct = c.lines[c.i].content;
    if (ct === "" || ct.startsWith("#")) c.i++;
    else break;
  }
}

function parseNode(c: Cursor, indent: number, rawLines: string[]): unknown {
  skipBlank(c);
  const first = c.peek();
  if (!first || first.indent < indent) return null;
  const isSeq = first.content === "-" || first.content.startsWith("- ");
  return isSeq ? parseSeq(c, indent, rawLines) : parseMap(c, indent, rawLines);
}

function parseMap(c: Cursor, indent: number, rawLines: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  while (c.i < c.lines.length) {
    if (c.lines[c.i].content === "" || c.lines[c.i].content.startsWith("#")) { c.i++; continue; }
    const ln = c.lines[c.i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new KamlParseError(`Unexpected indent at "${ln.content}"`);
    const { key, rest } = splitKeyValue(ln.content);
    c.i++;
    if (rest === "|") {
      obj[key] = readBlockScalar(c, indent + IND.length, rawLines);
    } else if (rest === "") {
      obj[key] = parseNode(c, indent + IND.length, rawLines) ?? {};
    } else {
      obj[key] = parseScalar(rest);
    }
  }
  return obj;
}

function parseSeq(c: Cursor, indent: number, rawLines: string[]): unknown[] {
  const arr: unknown[] = [];
  while (c.i < c.lines.length) {
    if (c.lines[c.i].content === "" || c.lines[c.i].content.startsWith("#")) { c.i++; continue; }
    const ln = c.lines[c.i];
    if (ln.indent < indent) break;
    if (ln.indent > indent || !(ln.content === "-" || ln.content.startsWith("- "))) break;
    const after = ln.content === "-" ? "" : ln.content.slice(2);
    c.i++;
    if (after === "|") {
      arr.push(readBlockScalar(c, indent + IND.length, rawLines));
    } else if (after === "") {
      arr.push(parseNode(c, indent + IND.length, rawLines) ?? {});
    } else {
      arr.push(parseScalar(after));
    }
  }
  return arr;
}

export function parseKaml(text: string): unknown {
  const rawLines = text.split(/\r?\n/);
  const lines: Line[] = rawLines.map((raw) => ({ indent: indentOf(raw), content: raw.trim(), raw }));
  // skip leading blank/comment lines for the structural pass; block scalars use rawLines directly
  const c = new Cursor(lines);
  // find first meaningful line
  while (c.i < lines.length && (lines[c.i].content === "" || lines[c.i].content.startsWith("#"))) c.i++;
  if (c.i >= lines.length) return null;
  const baseIndent = lines[c.i].indent;
  return parseNode(c, baseIndent, rawLines);
}
