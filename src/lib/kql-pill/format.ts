/** Pure formatting of a KQL result for the pill. No React, no engine imports (structural types only). */
import type { KqlPillMode } from "./token.ts";

export interface KqlPillResultColumn { key?: string; label: string; kind?: string }
export interface KqlPillResultRow { keys?: string[]; labels?: string[]; values?: number[]; cells?: string[] }
export interface KqlPillResult {
  columns: KqlPillResultColumn[];
  rows: KqlPillResultRow[];
  shape?: "scalar" | "list" | "table";
  matched: number;
  total?: number;
  /** Where the query read from ("whole team", "Board / List", a source or a table title) and how many records that scope holds. */
  scope?: { source: string; label: string; cards: number; qualifiers: Array<{ kind: string; name: string; id?: string }> };
}

export const KQL_PILL_MAX_ROWS = 20;
export const EMPTY_RESULT_TEXT = "—";

export interface KqlPillFormatted {
  kind: "text" | "list" | "table";
  /** One-line text (inline rendering, copy). */
  text: string;
  items: string[];
  header: string[];
  rows: string[][];
  /** Rows beyond the display cap. */
  hiddenRows: number;
  empty: boolean;
}

const fmtNum = (n: number) => String(Math.round(n * 100) / 100);

/** Display cells of a row; derives them from labels/values when the engine did not provide `cells`. */
export function rowCells(row: KqlPillResultRow, columns: KqlPillResultColumn[]): string[] {
  if (Array.isArray(row.cells)) return row.cells.map((c) => String(c ?? ""));
  const labels = row.labels ?? [];
  const values = row.values ?? [];
  let li = 0;
  let vi = 0;
  return columns.map((c) => {
    if (c.kind === "metric") return vi < values.length ? fmtNum(values[vi++]) : "";
    if (c.kind === "dim") return li < labels.length ? String(labels[li++] ?? "") : "";
    return "";
  });
}

const joinCells = (cells: string[]) => cells.filter((c) => c !== "").join(" · ");

function shapeOf(result: KqlPillResult): "scalar" | "list" | "table" {
  if (result.shape) return result.shape;
  if (result.columns.length > 1) return "table";
  return result.rows.length <= 1 ? "scalar" : "list";
}

function build(kind: KqlPillFormatted["kind"], partial: Partial<KqlPillFormatted>): KqlPillFormatted {
  const f: KqlPillFormatted = { kind, text: "", items: [], header: [], rows: [], hiddenRows: 0, empty: false, ...partial };
  if (!f.text && kind !== "table") f.text = f.items.join(", ");
  return f;
}

/** `limit` caps displayed rows (default 20); pass Infinity for the full export. */
export function formatKqlResult(result: KqlPillResult, mode: KqlPillMode, limit = KQL_PILL_MAX_ROWS): KqlPillFormatted {
  const columns = result.columns ?? [];
  const allRows = (result.rows ?? []).map((r) => rowCells(r, columns));

  if (mode === "count") {
    const n = Number.isFinite(result.matched) ? result.matched : allRows.length;
    return build("text", { text: String(n), items: [String(n)] });
  }

  if (allRows.length === 0) {
    if (mode === "table") return build("table", { header: columns.map((c) => c.label), empty: true });
    return build(mode === "list" ? "list" : "text", { text: EMPTY_RESULT_TEXT, empty: true });
  }

  const shown = allRows.slice(0, limit);
  const hiddenRows = allRows.length - shown.length;

  if (mode === "table") {
    return build("table", { header: columns.map((c) => c.label), rows: shown, hiddenRows, text: allRows.map((r) => r.join("\t")).join("\n") });
  }

  const items = shown.map(joinCells);
  if (mode === "list") {
    return build("list", { items, hiddenRows, text: items.join("\n") });
  }

  // value
  if (shapeOf(result) === "scalar") {
    const text = joinCells(allRows[0]) || EMPTY_RESULT_TEXT;
    return build("text", { text, items: [text] });
  }
  return build("text", { items, hiddenRows, text: items.join(", ") + (hiddenRows > 0 ? ` +${hiddenRows}` : "") });
}

/** Plain text of the full result ("copy as text"): table = header + TSV rows, list = lines, value = text. */
export function kqlResultToPlainText(result: KqlPillResult, mode: KqlPillMode): string {
  const f = formatKqlResult(result, mode, Number.POSITIVE_INFINITY);
  if (f.kind === "table") {
    return [f.header.join("\t"), ...f.rows.map((r) => r.join("\t"))].join("\n");
  }
  if (f.kind === "list") return f.items.join("\n");
  return f.text;
}
