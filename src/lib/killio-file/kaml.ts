// KAML — Killio's own human + AI readable document format. NOT YAML: there is
// NO significant indentation. It is flat and line-oriented:
//
//   title = "My Mesh"
//   viewport = (x=0, y=0, zoom=1)
//   rootOrder = [b1, a]
//
//   [[bricks]]
//   id = b1
//   kind = draw
//   pos = (x=12, y=34)
//   content = (shapePreset=diamond, style=(stroke="#22d3ee", opacity=0.5))
//
// `key = value`, repeated `[[section]]` blocks for arrays-of-objects, inline
// records `(k=v, ...)` and lists `[a, b]`. Strings are bare when unambiguous
// (kind = draw) and quoted otherwise. Lossless over the JSON-like value space.

const RESERVED = new Set(["null", "true", "false"]);
const BARE_RE = /^[A-Za-z_][A-Za-z0-9_.\-/]*$/;
const NUMERIC_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
}

function unquote(tok: string): string {
  const inner = tok.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && i + 1 < inner.length) {
      const n = inner[++i];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n;
    } else out += inner[i];
  }
  return out;
}

function bareOrQuote(s: string): string {
  if (BARE_RE.test(s) && !RESERVED.has(s) && !NUMERIC_RE.test(s)) return s;
  return quote(s);
}

function keyTok(k: string): string {
  return BARE_RE.test(k) ? k : quote(k);
}

/** Render any value as a single-line inline token. */
export function inlineValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "string") return bareOrQuote(v);
  if (Array.isArray(v)) return `[${v.map(inlineValue).join(", ")}]`;
  if (isPlainObject(v)) {
    const parts = Object.keys(v)
      .filter((k) => v[k] !== undefined && typeof v[k] !== "function")
      .map((k) => `${keyTok(k)}=${inlineValue(v[k])}`);
    return `(${parts.join(", ")})`;
  }
  return "null";
}

function isArrayOfObjects(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
}

export class KamlParseError extends Error {}

export function stringifyKaml(value: unknown): string {
  if (!isPlainObject(value)) {
    // payloads are objects; fall back to a single inline line for anything else
    return `_ = ${inlineValue(value)}`;
  }
  const lines: string[] = [];
  const sectionKeys: string[] = [];
  for (const k of Object.keys(value)) {
    const val = value[k];
    if (val === undefined || typeof val === "function") continue;
    if (isArrayOfObjects(val)) { sectionKeys.push(k); continue; }
    lines.push(`${keyTok(k)} = ${inlineValue(val)}`);
  }
  for (const k of sectionKeys) {
    for (const el of value[k] as Record<string, unknown>[]) {
      lines.push("");
      lines.push(`[[${k}]]`);
      for (const ek of Object.keys(el)) {
        if (el[ek] === undefined || typeof el[ek] === "function") continue;
        lines.push(`${keyTok(ek)} = ${inlineValue(el[ek])}`);
      }
    }
  }
  return lines.join("\n");
}

// ── inline value parser ─────────────────────────────────────────────────────
// Split a string on top-level separators (`,` for lists/records), respecting
// nested () [] and quoted strings.
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, inStr = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  const last = s.slice(start);
  if (last.trim() !== "" || parts.length > 0) parts.push(last);
  return parts;
}

function findTopEquals(s: string): number {
  let depth = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === "=" && depth === 0) return i;
  }
  return -1;
}

export function parseInline(raw: string): unknown {
  const s = raw.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "[]") return [];
  if (s === "()") return {};
  if (s[0] === '"') return unquote(s);
  if (s[0] === "[") {
    if (s[s.length - 1] !== "]") throw new KamlParseError(`Unterminated list: ${s}`);
    return splitTop(s.slice(1, -1)).filter((p) => p.trim() !== "").map(parseInline);
  }
  if (s[0] === "(") {
    if (s[s.length - 1] !== ")") throw new KamlParseError(`Unterminated record: ${s}`);
    const obj: Record<string, unknown> = {};
    for (const part of splitTop(s.slice(1, -1))) {
      if (part.trim() === "") continue;
      const eq = findTopEquals(part);
      if (eq === -1) throw new KamlParseError(`Expected key=value in record: ${part}`);
      const keyRaw = part.slice(0, eq).trim();
      const key = keyRaw[0] === '"' ? unquote(keyRaw) : keyRaw;
      obj[key] = parseInline(part.slice(eq + 1));
    }
    return obj;
  }
  if (NUMERIC_RE.test(s)) return Number(s);
  return s; // bareword string
}

export function parseKaml(text: string): unknown {
  const result: Record<string, unknown> = {};
  let currentSection: string | null = null;
  let currentObj: Record<string, unknown> | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const sectionMatch = line.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      currentObj = {};
      if (!Array.isArray(result[currentSection])) result[currentSection] = [];
      (result[currentSection] as Record<string, unknown>[]).push(currentObj);
      continue;
    }
    const eq = findTopEquals(line);
    if (eq === -1) throw new KamlParseError(`Expected 'key = value' or '[[section]]': ${line}`);
    const keyRaw = line.slice(0, eq).trim();
    const key = keyRaw[0] === '"' ? unquote(keyRaw) : keyRaw;
    const val = parseInline(line.slice(eq + 1));
    if (currentObj) currentObj[key] = val;
    else result[key] = val;
  }
  return result;
}
