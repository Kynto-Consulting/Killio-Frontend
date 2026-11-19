/**
 * Pure helpers that turn the payload of an `<asset type="brick" ...>{json}</asset>`
 * tag into something the brick renderer can draw. No React, no DOM: they never
 * throw, and malformed input degrades to `null` so the caller can fall back to text.
 */

export type BrickPayload = {
  kind: string;
  content: Record<string, unknown>;
};

const decodeEntities = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The decoding the chat panel always applied (entities, then `\"` -> `"`), kept as the last resort. */
const legacyDecode = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\"/g, '"');

const stripFence = (value: string): string =>
  value
    .replace(/^```[a-z0-9_-]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function tryParse(source: string): Record<string, unknown> | null {
  try {
    let parsed: unknown = JSON.parse(source);
    // A model sometimes double-encodes: the tag body is a JSON string that holds the JSON.
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Decode the JSON body of a brick asset tag. Tries the raw text first (so valid JSON
 * with legitimate `\"` escapes is never corrupted), then HTML-entity decoding, then
 * the lenient legacy path. Returns null when nothing parses to an object.
 */
export function decodeBrickJson(raw: string | null | undefined): Record<string, unknown> | null {
  const source = stripFence(String(raw ?? "").trim());
  if (!source) return null;
  const decoded = decodeEntities(source);
  const candidates = [source, decoded, decoded.replace(/\\"/g, '"'), legacyDecode(source)];
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed) return parsed;
  }
  return null;
}

/** Kind names the model uses that the renderer knows under another name. */
const KIND_ALIASES: Record<string, string> = {
  chart: "graph",
  plot: "graph",
  beautifultable: "beautiful_table",
  "beautiful-table": "beautiful_table",
  todo: "checklist",
};

function normalizeKind(kind: unknown): string {
  const k = typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (!k) return "";
  return KIND_ALIASES[k] ?? k;
}

function normalizeChecklistItems(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item, index) => {
    if (typeof item === "string") return { id: `item-${index}`, label: item, checked: false };
    if (isPlainObject(item)) {
      const label = item.label ?? item.text ?? item.title ?? "";
      return {
        ...item,
        id: typeof item.id === "string" && item.id ? item.id : `item-${index}`,
        label: typeof label === "string" ? label : String(label),
        checked: Boolean(item.checked ?? item.done),
      };
    }
    return { id: `item-${index}`, label: String(item ?? ""), checked: false };
  });
}

/**
 * Resolve { kind, content } from the tag's `kind` attribute and the decoded JSON.
 * The model may send either the bare content object or `{ kind, content }`.
 */
export function resolveBrickPayload(attrKind: string | undefined, data: Record<string, unknown>): BrickPayload | null {
  const nested = isPlainObject(data.content) ? data.content : null;
  const nestedKind = nested && typeof nested.kind === "string" ? nested.kind : undefined;
  const kind =
    normalizeKind(attrKind) ||
    normalizeKind(data.kind) ||
    normalizeKind(nestedKind) ||
    "text";
  let content: Record<string, unknown> = nested ?? data;
  if (Object.keys(content).length === 0) return null;

  if (kind === "checklist" && "items" in content) {
    content = { ...content, items: normalizeChecklistItems(content.items) };
  }
  return { kind, content };
}
