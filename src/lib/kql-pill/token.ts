/**
 * KQL reference pill token:  @[kql:<mode>.<encodeURIComponent(script)>:<label>]
 *
 * mode: value (scalar as text/number, list as "a, b, c") | list (bullets) | table | count (matched records).
 * The encoded script never contains ":" or "]" (encodeURIComponent escapes both), so the token
 * survives markdown copy/paste and the generic `@[type:id:name]` mention regexes. The label is
 * what read-only contexts show when the query cannot be run.
 */

export type KqlPillMode = "value" | "list" | "table" | "count";

export const KQL_PILL_MODES: readonly KqlPillMode[] = ["value", "list", "table", "count"];
export const KQL_PILL_MAX_SCRIPT = 2000;
export const KQL_PILL_MAX_LABEL = 60;

export interface KqlPillSpec {
  script: string;
  mode: KqlPillMode;
  label: string;
}

export type KqlPillValidationError = "empty-script" | "script-too-long" | "label-too-long" | "label-bracket" | "bad-mode" | "bad-unicode";

export function isKqlPillMode(value: unknown): value is KqlPillMode {
  return typeof value === "string" && (KQL_PILL_MODES as readonly string[]).includes(value);
}

/** Collapses whitespace/newlines of a label to single spaces. */
export function normalizeKqlPillLabel(label: string): string {
  return String(label ?? "").replace(/\s+/g, " ").trim();
}

/** A short default label derived from the script (first line, clipped). */
export function defaultKqlPillLabel(script: string): string {
  const first = String(script ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  const clean = first.replace(/[\]]/g, ")").replace(/\s+/g, " ").trim();
  return clean.length > 40 ? `${clean.slice(0, 39)}…` : clean;
}

export function validateKqlPill(script: string, mode: string, label: string): KqlPillValidationError | null {
  if (!isKqlPillMode(mode)) return "bad-mode";
  if (!String(script ?? "").trim()) return "empty-script";
  if (script.length > KQL_PILL_MAX_SCRIPT) return "script-too-long";
  const l = normalizeKqlPillLabel(label);
  if (l.length > KQL_PILL_MAX_LABEL) return "label-too-long";
  if (l.includes("]")) return "label-bracket";
  try {
    encodeURIComponent(script);
  } catch {
    return "bad-unicode";
  }
  return null;
}

/**
 * `encodeURIComponent` leaves `* _ ~ ! ' ( )` as they are, and Markdown reads a pair of `*` or `_` in a paragraph as
 * emphasis (`select *` ... `select *` turned the script into `select <i>...</i>`). They are percent-encoded too; decoding is unchanged.
 */
export function encodeKqlScript(script: string): string {
  return encodeURIComponent(script).replace(/[*_~!'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildKqlPillToken(script: string, mode: KqlPillMode, label: string): string {
  const err = validateKqlPill(script, mode, label);
  if (err) throw new Error(`Invalid KQL pill: ${err}`);
  const l = normalizeKqlPillLabel(label);
  return `@[kql:${mode}.${encodeKqlScript(script)}${l ? `:${l}` : ""}]`;
}

const TOKEN_RE = /^@\[kql:([^:\]]+)(?::([^\]]*))?\]$/;

/** Parses a whole `@[kql:...]` token. Returns null when it is not a valid KQL pill token. */
export function parseKqlPillToken(token: string): KqlPillSpec | null {
  const m = TOKEN_RE.exec(String(token ?? "").trim());
  if (!m) return null;
  const id = m[1];
  const dot = id.indexOf(".");
  let mode: KqlPillMode = "value";
  let encoded = id;
  if (dot > 0 && isKqlPillMode(id.slice(0, dot))) {
    mode = id.slice(0, dot) as KqlPillMode;
    encoded = id.slice(dot + 1);
  }
  let script: string;
  try {
    script = decodeURIComponent(encoded);
  } catch {
    script = encoded; // hand-written, unencoded script
  }
  if (!script.trim() || script.length > KQL_PILL_MAX_SCRIPT) return null;
  const label = normalizeKqlPillLabel(m[2] ?? "").slice(0, KQL_PILL_MAX_LABEL);
  return { script, mode, label: label || defaultKqlPillLabel(script) };
}

/** Matches every kql token in a text (global, fresh instance on each call). */
export const kqlPillTokenRegex = () => /@\[kql:[^\]]+\]/g;

export function findKqlPillTokens(text: string): Array<{ token: string; index: number }> {
  const out: Array<{ token: string; index: number }> = [];
  const re = kqlPillTokenRegex();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || "")) !== null) out.push({ token: m[0], index: m.index });
  return out;
}

/** Replaces the n-th (0-based) kql token of a markdown text. Returns the text unchanged if absent. */
export function replaceKqlPillTokenAt(text: string, n: number, newToken: string): string {
  const found = findKqlPillTokens(text)[n];
  if (!found) return text;
  return text.slice(0, found.index) + newToken + text.slice(found.index + found.token.length);
}

/** Replaces kql tokens by `render(spec)` (used by plain-text/HTML exports). Unparseable tokens are kept. */
export function replaceKqlPillTokens(text: string, render: (spec: KqlPillSpec, token: string) => string): string {
  return String(text ?? "").replace(kqlPillTokenRegex(), (token) => {
    const spec = parseKqlPillToken(token);
    return spec ? render(spec, token) : token;
  });
}

/** Replaces the n-th (0-based) occurrence of this exact token. Returns the text unchanged if absent. */
export function replaceNthTokenOccurrence(text: string, token: string, n: number, newToken: string): string {
  if (!token) return text;
  let from = 0;
  for (let i = 0; i <= n; i++) {
    const at = text.indexOf(token, from);
    if (at < 0) return text;
    if (i === n) return text.slice(0, at) + newToken + text.slice(at + token.length);
    from = at + token.length;
  }
  return text;
}
