/**
 * Table bricks (database / bountiful / beautiful / simple table) as KQL tables, so a query can run
 * locally over the tables of the open document. Port of Killio-Backend/src/modules/query/sources/tables.ts:
 * keep both converters behaving the same.
 */
import type { DocumentBrick } from "../api/documents.ts";
import type { KqlCard, KqlTable } from "./kql.ts";

export const TABLE_KINDS = ["table", "database", "beautiful_table", "bountiful_table"] as const;
export const MAX_TABLE_ROWS = 20_000;

type CellValue = string | number | boolean | string[] | null;

export interface TableBrick {
  id: string;
  kind: string;
  /** Title of the owner (document or card), used when the brick has no title of its own. */
  owner?: string | null;
  content: unknown;
}

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

const iso = (v: unknown): string | null => {
  if (!v || (typeof v !== "string" && !(v instanceof Date))) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const asObject = (v: unknown): Record<string, any> => {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(v) ? v : {};
};

const names = (list: unknown, ...keys: string[]): string[] =>
  (Array.isArray(list) ? list : [])
    .map((x) => {
      if (typeof x === "string") return x;
      if (!isRecord(x)) return "";
      for (const k of keys) if (str(x[k])) return x[k] as string;
      return "";
    })
    .filter((s) => s !== "");

/** One Bountiful cell (or a bare value) as a KQL field value. */
export function normalizeCell(raw: unknown): CellValue {
  if (raw == null) return null;
  if (typeof raw === "string") return raw === "" ? null : raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "string" ? x : isRecord(x) ? String(x.name ?? x.label ?? x.text ?? x.id ?? "") : String(x ?? "")))
      .filter(Boolean);
  }
  if (!isRecord(raw)) return null;
  const c = raw;
  switch (c.type) {
    case "checkbox":
      return !!c.checked;
    case "number":
    case "rating":
    case "progress":
    case "currency":
      if (typeof c.number === "number") return c.number;
      break;
    case "select":
    case "status":
      if (str(c.name)) return c.name;
      break;
    case "multiselect":
    case "multi_select":
      return names(c.items, "name", "label");
    case "person":
    case "people":
    case "user":
    case "users":
      return names(c.users, "name", "email", "id");
    case "document":
    case "documents":
      return names(c.documents, "name", "id");
    case "board":
    case "boards":
      return names(c.boards, "name", "id");
    case "card":
    case "cards":
      return names(c.cards, "name", "id");
    case "date":
    case "datetime":
      return iso(str(c.start) ?? str(c.end)) ?? str(c.start) ?? str(c.end);
    case "formula": {
      const v = c.value ?? c.formula;
      if (typeof v === "number") return v;
      if (str(v)) return Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : (v as string);
      return null;
    }
    default:
      break;
  }
  // Unknown type, or a typed cell without its expected key: take the first value present.
  if (typeof c.checked === "boolean") return c.checked;
  if (typeof c.number === "number") return c.number;
  if (Array.isArray(c.items) && c.items.length) return names(c.items, "name", "label");
  if (Array.isArray(c.users) && c.users.length) return names(c.users, "name", "email", "id");
  if (Array.isArray(c.documents) && c.documents.length) return names(c.documents, "name", "id");
  if (Array.isArray(c.boards) && c.boards.length) return names(c.boards, "name", "id");
  if (Array.isArray(c.cards) && c.cards.length) return names(c.cards, "name", "id");
  if (str(c.start) || str(c.end)) return iso(str(c.start) ?? str(c.end)) ?? str(c.start) ?? str(c.end);
  for (const k of ["text", "name", "value", "url", "title"]) if (str(c[k])) return c[k] as string;
  if (typeof c.value === "number") return c.value;
  return null;
}

/** Column names made unique: repeated (or empty) names become "Name (2)", "Name (3)"... */
export function uniqueColumnNames(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((n, i) => {
    const base = n.trim() || `Column ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

const asScalar = (s: string): string | number => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : s);

function rowRecord(id: string, columns: string[], values: CellValue[], textIdx: number[], meta?: { created?: string | null; updated?: string | null }): KqlCard {
  const fields: Record<string, CellValue> = {};
  columns.forEach((name, i) => {
    fields[name] = values[i] ?? null;
  });
  let title = "";
  for (const i of textIdx) {
    const v = values[i];
    if (typeof v === "string" && v.trim()) {
      title = v;
      break;
    }
  }
  if (!title) {
    const first = values.find((v) => v != null && !(Array.isArray(v) && v.length === 0));
    title = first == null ? "" : Array.isArray(first) ? first.join(", ") : String(first);
  }
  return { id, title, created: meta?.created ?? null, updated: meta?.updated ?? null, fields } as KqlCard;
}

/** A table brick as a KQL table, or null when its content has no table shape. */
export function tableFromBrick(brick: TableBrick): KqlTable | null {
  const content = asObject(brick.content);
  const ownTitle = str(content.title) ?? str(brick.owner) ?? brick.kind;

  // Bountiful / database: typed columns, rows with cells keyed by column id.
  if (Array.isArray(content.columns) && content.columns.some((c: unknown) => isRecord(c))) {
    const cols = (content.columns as unknown[]).filter(isRecord);
    const columns = uniqueColumnNames(cols.map((c) => String(c.name ?? c.id ?? "")));
    const textIdx = cols.map((c, i) => (c.type === "text" || c.type === undefined ? i : -1)).filter((i) => i >= 0);
    const rowsRaw: unknown[] = Array.isArray(content.rows) ? content.rows : [];
    const rows: KqlCard[] = [];
    for (const [n, r] of rowsRaw.entries()) {
      if (rows.length >= MAX_TABLE_ROWS) break;
      if (!isRecord(r)) continue;
      const cells = isRecord(r.cells) ? r.cells : {};
      const values = cols.map((c) => normalizeCell(cells[String(c.id)] ?? cells[String(c.name)]));
      rows.push(rowRecord(String(r.id ?? `${brick.id}:${n}`), columns, values, textIdx, { created: iso(r._createdAt), updated: iso(r._lastEditedAt) }));
    }
    return { id: brick.id, title: ownTitle, kind: brick.kind, columns, rows };
  }

  // Simple table: rows of strings, the first one is the header.
  if (Array.isArray(content.rows) && content.rows.every((r: unknown) => Array.isArray(r))) {
    const grid = content.rows as unknown[][];
    if (!grid.length) return { id: brick.id, title: ownTitle, kind: brick.kind, columns: [], rows: [] };
    const columns = uniqueColumnNames(grid[0].map((h) => String(h ?? "")));
    const textIdx = columns.map((_, i) => i);
    const rows: KqlCard[] = [];
    for (let i = 1; i < grid.length && rows.length < MAX_TABLE_ROWS; i++) {
      const values = columns.map((_, j) => {
        const v = grid[i][j];
        return v == null || v === "" ? null : typeof v === "string" ? asScalar(v) : normalizeCell(v);
      });
      rows.push(rowRecord(`${brick.id}:${i}`, columns, values, textIdx));
    }
    return { id: brick.id, title: ownTitle, kind: brick.kind, columns, rows };
  }
  return null;
}

/** KQL tables of the bricks of a document (table, database, beautiful and bountiful tables). */
export function tablesFromBricks(bricks: Array<Pick<DocumentBrick, "id" | "kind" | "content"> | { id: string; kind: string; content?: unknown }>): KqlTable[] {
  const kinds: readonly string[] = TABLE_KINDS;
  const out: KqlTable[] = [];
  for (const brick of bricks ?? []) {
    if (!brick || !kinds.includes(String(brick.kind))) continue;
    const table = tableFromBrick({ id: String(brick.id), kind: String(brick.kind), owner: null, content: (brick as { content?: unknown }).content });
    if (table) out.push({ ...table, title: str(asObject((brick as { content?: unknown }).content).title) ?? String(brick.id) });
  }
  return out;
}
