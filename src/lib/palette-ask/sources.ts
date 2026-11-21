/**
 * Helpers for the palette's answer panel: where an answer came from (source
 * chips), what a pending write will do (approval card) and what the agent is
 * doing right now (status line). Pure, so they can be tested with node --test.
 */

export type SourceKind = "board" | "document" | "mesh" | "card";

export type PaletteSource = {
  kind: SourceKind;
  id: string;
  title: string;
  /** In-app link; null when the entity has no page of its own. */
  href: string | null;
};

type Json = unknown;

const MAX_DEPTH = 5;
const MAX_SOURCES = 8;

function normalizeKind(raw: unknown): SourceKind | null {
  const v = String(raw ?? "").toLowerCase();
  if (v === "board" || v === "kanban") return "board";
  if (v === "document" || v === "doc") return "document";
  if (v === "mesh") return "mesh";
  if (v === "card") return "card";
  return null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hrefFor(kind: SourceKind, id: string, boardId?: string): string | null {
  if (kind === "board") return `/b/${id}`;
  if (kind === "document") return `/d/${id}`;
  if (kind === "mesh") return `/m/${id}`;
  return boardId ? `/b/${boardId}` : null;
}

function toolKind(tool: string): SourceKind | null {
  const t = tool.toLowerCase();
  if (t.startsWith("board_") || t.includes("_board")) return "board";
  if (t.startsWith("document_") || t.includes("_document")) return "document";
  if (t.startsWith("mesh_") || t.includes("_mesh")) return "mesh";
  if (t.startsWith("card_") || t.includes("_card")) return "card";
  return null;
}

function visit(node: Json, tool: string, depth: number, out: Map<string, PaletteSource>): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) visit(item, tool, depth + 1, out);
    return;
  }
  const obj = node as Record<string, unknown>;

  // search_workspace style: { entityType, entityId, sourceLabel }
  const typed = normalizeKind(obj.entityType);
  const typedId = str(obj.entityId);
  if (typed && typedId) {
    add(out, typed, typedId, str(obj.sourceLabel) || str(obj.title) || str(obj.name), str(obj.boardId));
  } else {
    // tool-shaped results: board_* -> { id, name }, document_* -> { id, title }, card_* -> { id, title, boardId }
    const kind = toolKind(tool);
    const id = str(obj.id);
    const title = str(obj.title) || str(obj.name);
    if (kind && id && title) add(out, kind, id, title, str(obj.boardId));
    // a card/list row that names its board
    if (str(obj.boardId) && str(obj.boardName)) add(out, "board", str(obj.boardId), str(obj.boardName));
  }

  for (const value of Object.values(obj)) visit(value, tool, depth + 1, out);
}

function add(out: Map<string, PaletteSource>, kind: SourceKind, id: string, title: string, boardId?: string) {
  const key = `${kind}:${id}`;
  const existing = out.get(key);
  if (existing) {
    if (!existing.title && title) existing.title = title;
    return;
  }
  out.set(key, { kind, id, title, href: hrefFor(kind, id, boardId) });
}

/** Collects the boards/documents/meshes/cards a turn actually touched, deduplicated, in first-seen order. */
export function extractSources(
  events: Array<{ tool?: string; phase?: string; success?: boolean; output?: unknown }> | undefined,
  results?: Array<{ tool?: string; data?: unknown }>,
): PaletteSource[] {
  const out = new Map<string, PaletteSource>();
  for (const e of events ?? []) {
    if (e.phase !== "done" || e.success === false) continue;
    visit(e.output, String(e.tool ?? ""), 0, out);
  }
  for (const r of results ?? []) visit(r.data, String(r.tool ?? ""), 0, out);
  return [...out.values()]
    .map((s) => ({ ...s, title: s.title || s.id.slice(0, 8) }))
    .slice(0, MAX_SOURCES);
}

// ── status line ─────────────────────────────────────────────────────────────

export type ToolStatusKind = "searching" | "querying" | "running";

export function toolStatusKind(tool: string): ToolStatusKind {
  const t = tool.toLowerCase();
  if (t.includes("search") || t.includes("find")) return "searching";
  if (t.includes("kql") || t.includes("query") || t.includes("list") || t.includes("_get") || t.startsWith("get_")) return "querying";
  return "running";
}

export function humanizeTool(tool: string): string {
  return tool.replace(/_/g, " ").trim();
}

// ── approval card ───────────────────────────────────────────────────────────

export type InputRow = { key: string; value: string };

const MAX_VALUE_CHARS = 600;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > MAX_VALUE_CHARS ? `${value.slice(0, MAX_VALUE_CHARS)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/** Every top-level field of the tool input, nothing hidden: the card must show what will be written. */
export function describeToolInput(input: Record<string, unknown> | undefined | null): InputRow[] {
  if (!input || typeof input !== "object") return [];
  return Object.entries(input).map(([key, value]) => ({ key, value: formatValue(value) }));
}
