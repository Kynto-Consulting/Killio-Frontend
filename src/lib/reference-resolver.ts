import { DocumentSummary } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { Folder } from "@/lib/api/folders";
import { sheetEngine } from "@/lib/sheetEngine";

type ResolverBrick = {
  id: string;
  kind: string;
  content?: Record<string, any>;
  [key: string]: any;
};

export interface ResolverContext {
  documents: DocumentSummary[];
  boards: BoardSummary[];
  folders?: Folder[];
  activeBricks?: ResolverBrick[]; // Bricks available in current scope for local resolution
  documentBricksById?: Record<string, ResolverBrick[]>;
  cardBricksById?: Record<string, ResolverBrick[]>;
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

export class ReferenceResolver {
  private static parseDeepReference(inner: string): {
    entityType?: string;
    scopeId: string;
    brickId: string;
    selector: string;
    args: string[];
  } | null {
    const tokens = String(inner || "").split(":");
    if (tokens.length < 2) return null;

    const first = String(tokens[0] || "").toLowerCase();
    const hasScopedPrefix = (first === "card" || first === "doc" || first === "document" || first === "board") && tokens.length >= 4;

    if (hasScopedPrefix) {
      const entityType = first;
      const scopeId = tokens[1] || "";
      const brickId = tokens[2] || "";
      const selector = (tokens[3] || "text").toLowerCase();
      const args = tokens.slice(4);
      return { entityType, scopeId, brickId, selector, args };
    }

    const scopeId = tokens[0] || "";
    const brickId = tokens[1] || "";
    const selector = (tokens[2] || "text").toLowerCase();
    const args = tokens.slice(3);
    return { scopeId, brickId, selector, args };
  }

  private static findBrickByIdOrAlias(bricks: any[] | undefined, brickId: string): any {
    const safeBricks = Array.isArray(bricks) ? bricks : [];
    if (!safeBricks.length || !brickId) return null;

    const exact = safeBricks.find((b) => String(b?.id || "") === brickId);
    if (exact) return exact;

    const normalized = String(brickId).trim().toLowerCase();
    const aliasMatch = normalized.match(/^brick(\d+)$/);
    if (aliasMatch) {
      const index = Math.max(0, (Number.parseInt(aliasMatch[1], 10) || 1) - 1);
      return safeBricks[index] || null;
    }

    if (/^\d+$/.test(normalized)) {
      const index = Math.max(0, (Number.parseInt(normalized, 10) || 1) - 1);
      return safeBricks[index] || null;
    }

    return null;
  }

  private static stripOuterBoldMarkers(value: string): string {
    if (!value) return value;
    const trimmed = value.trim();
    if (/^\*\*[\s\S]+\*\*$/.test(trimmed)) {
      return trimmed.slice(2, -2).trim();
    }
    return value;
  }

  private static buildDeepLabel(resolvedValue: string, fallbackLabel: string): string {
    const cleanResolved = this.stripOuterBoldMarkers(String(resolvedValue || "")).trim();
    if (!cleanResolved) return fallbackLabel;

    const lines = cleanResolved
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const preview = lines[0] || cleanResolved;
    if (preview.length > 120) return `${preview.slice(0, 117)}...`;
    return preview;
  }

  private static removeBoldWrappersAroundReferences(parts: (string | any)[]): (string | any)[] {
    const normalized = [...parts];

    for (let i = 1; i < normalized.length - 1; i += 1) {
      const current = normalized[i];
      if (!current || typeof current === "string") continue;

      const prev = normalized[i - 1];
      const next = normalized[i + 1];
      if (typeof prev !== "string" || typeof next !== "string") continue;

      const hasBoldStart = /\*\*\s*$/.test(prev);
      const hasBoldEnd = /^\s*\*\*/.test(next);
      if (!hasBoldStart || !hasBoldEnd) continue;

      normalized[i - 1] = prev.replace(/\*\*\s*$/, "");
      normalized[i + 1] = next.replace(/^\s*\*\*\s*/, "");
    }

    return normalized;
  }

  private static columnLettersToIndex(letters: string): number {
    let result = 0;
    const normalized = letters.toUpperCase();
    for (let i = 0; i < normalized.length; i += 1) {
      result = result * 26 + (normalized.charCodeAt(i) - 64);
    }
    return result - 1;
  }

  private static parseCellAddress(value: string): { row: number; col: number } | null {
    const match = value.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    const col = this.columnLettersToIndex(match[1]);
    const row = Number.parseInt(match[2], 10) - 1;
    if (Number.isNaN(row) || row < 0 || col < 0) return null;
    return { row, col };
  }

  private static parseRange(value: string): { start: { row: number; col: number }; end: { row: number; col: number } } | null {
    const normalized = value.replace(/-/g, ":");
    const [a, b] = normalized.split(":");
    if (!a || !b) return null;
    const start = this.parseCellAddress(a);
    const end = this.parseCellAddress(b);
    if (!start || !end) return null;
    return { start, end };
  }

  private static normalizeBrickPayload(brick: any): { kind: string; payload: any } {
    if (!brick) return { kind: "", payload: {} };
    if (brick.content && typeof brick.content === "object") {
      return { kind: String(brick.kind || ""), payload: brick.content };
    }
    return { kind: String(brick.kind || ""), payload: brick };
  }

  private static extractTextLike(kind: string, payload: any): string {
    if (kind === "text") return String(payload.markdown ?? payload.text ?? "");
    if (kind === "accordion") return String(payload.body ?? "");
    if (kind === "ai") return String(payload.response ?? payload.prompt ?? "");
    return String(payload.markdown ?? payload.text ?? payload.body ?? payload.summary ?? "");
  }

  private static lineSelector(text: string, lineRange?: string, charRange?: string): string {
    const lines = String(text || "").split(/\r?\n/);
    if (!lineRange) return text;

    const [fromRaw, toRaw] = lineRange.split("-");
    const from = Math.max(1, Number.parseInt(fromRaw, 10) || 1);
    const to = Math.max(from, Number.parseInt(toRaw || fromRaw, 10) || from);

    let out = lines.slice(from - 1, to).join("\n");
    if (!charRange) return out;

    const [cFromRaw, cToRaw] = charRange.split("-");
    const cFrom = Math.max(0, Number.parseInt(cFromRaw, 10) || 0);
    const cTo = Number.parseInt(cToRaw, 10);
    if (Number.isNaN(cTo)) return out.slice(cFrom);
    return out.slice(cFrom, Math.max(cFrom, cTo));
  }

  private static tableSelector(rows: any[][], selector: string, args: string[]): string {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) return "";
    const normalized = safeRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
    const cols = normalized[0]?.length || 1;
    const tableId = `resolver-preview-${normalized.length}x${cols}`;
    sheetEngine.updateSheet(tableId, normalized);
    const computed = sheetEngine.getComputedData(tableId, normalized.length, cols);

    if (selector === "cell") {
      const address = args[0] || "A1";
      const parsed = this.parseCellAddress(address);
      if (!parsed) return "";
      return computed[parsed.row]?.[parsed.col] ?? "";
    }

    if (selector === "row") {
      const rowIdx = Math.max(0, (Number.parseInt(args[0] || "1", 10) || 1) - 1);
      return (computed[rowIdx] || []).join(" | ");
    }

    if (selector === "col") {
      const source = (args[0] || "A").toUpperCase();
      const colIdx = /^\d+$/.test(source) ? Math.max(0, Number.parseInt(source, 10) - 1) : this.columnLettersToIndex(source);
      return computed.map((row) => row[colIdx] ?? "").join("\n");
    }

    if (selector === "range") {
      const rangeArg = args.length > 1 ? `${args[0]}:${args[1]}` : (args[0] || "A1:A1");
      const parsed = this.parseRange(rangeArg);
      if (!parsed) return "";

      const minRow = Math.min(parsed.start.row, parsed.end.row);
      const maxRow = Math.max(parsed.start.row, parsed.end.row);
      const minCol = Math.min(parsed.start.col, parsed.end.col);
      const maxCol = Math.max(parsed.start.col, parsed.end.col);

      const block: string[] = [];
      for (let r = minRow; r <= maxRow; r += 1) {
        const line: string[] = [];
        for (let c = minCol; c <= maxCol; c += 1) {
          line.push(computed[r]?.[c] ?? "");
        }
        block.push(line.join(" | "));
      }
      return block.join("\n");
    }

    if (selector === "csv") {
      return computed.map((row) => row.join(",")).join("\n");
    }

    return computed.map((row) => row.join(" | ")).join("\n");
  }

  private static checklistSelector(items: any[], selector: string, args: string[]): string {
    const safeItems = Array.isArray(items) ? items : [];

    if (selector === "checked") {
      return safeItems.filter((i) => !!i?.checked).map((i) => String(i?.label ?? "")).join("\n");
    }

    if (selector === "unchecked") {
      return safeItems.filter((i) => !i?.checked).map((i) => String(i?.label ?? "")).join("\n");
    }

    if (selector === "item") {
      const idx = Math.max(0, (Number.parseInt(args[0] || "1", 10) || 1) - 1);
      return String(safeItems[idx]?.label ?? "");
    }

    if (selector === "items") {
      const [fromRaw, toRaw] = (args[0] || "1").split("-");
      const from = Math.max(1, Number.parseInt(fromRaw, 10) || 1);
      const to = Math.max(from, Number.parseInt(toRaw || fromRaw, 10) || from);
      return safeItems.slice(from - 1, to).map((i) => String(i?.label ?? "")).join("\n");
    }

    return safeItems.map((i) => String(i?.label ?? "")).join("\n");
  }

  private static mediaSelector(payload: any, selector: string): string {
    if (selector === "url") return String(payload.url ?? "");
    if (selector === "title") return String(payload.title ?? "");
    if (selector === "caption") return String(payload.caption ?? "");
    if (selector === "mime") return String(payload.mimeType ?? "");
    if (selector === "size") return String(payload.sizeBytes ?? "");
    if (selector === "asset") return String(payload.assetId ?? "");
    return String(payload.url ?? payload.title ?? payload.caption ?? "");
  }

  private static graphSelector(payload: any, selector: string, args: string[]): string {
    const data = Array.isArray(payload.data) ? payload.data : [];
    if (!data.length) return "";

    if (selector === "series") {
      const key = args[0] || "value";
      return data.map((row: any) => String(row?.[key] ?? "")).join("\n");
    }

    if (selector === "point") {
      const pointIdx = Math.max(0, (Number.parseInt(args[0] || "1", 10) || 1) - 1);
      return JSON.stringify(data[pointIdx] ?? {});
    }

    return JSON.stringify(data);
  }

  private static describeSelector(selector: string, args: string[]): string {
    if (selector === "line") return `linea ${args[0] || "1"}`;
    if (selector === "chars") return `chars ${args[0] || "0"}`;
    if (selector === "cell") return `celda ${args[0] || "A1"}`;
    if (selector === "row") return `fila ${args[0] || "1"}`;
    if (selector === "col") return `columna ${args[0] || "A"}`;
    if (selector === "range") return `rango ${args[0] || "A1:A1"}`;
    if (selector === "item") return `item ${args[0] || "1"}`;
    if (selector === "items") return `items ${args[0] || "1"}`;
    return selector;
  }

  private static findDeepBrick(parsed: {
    entityType?: string;
    scopeId: string;
    brickId: string;
  }, prefix: "$" | "#", context: ResolverContext): any {
    const { entityType, scopeId, brickId } = parsed;

    const localBrick = this.findBrickByIdOrAlias(context.activeBricks as any[], brickId) as any;
    if (localBrick) return localBrick;

    if (entityType === "card") {
      const cardBricks = context.cardBricksById?.[scopeId] || [];
      const cardBrick = this.findBrickByIdOrAlias(cardBricks, brickId) as any;
      if (cardBrick) return cardBrick;
      return null;
    }

    if (entityType === "doc" || entityType === "document") {
      const docBricks = context.documentBricksById?.[scopeId] || [];
      const docBrick = this.findBrickByIdOrAlias(docBricks as any[], brickId) as any;
      if (docBrick) return docBrick;
      return null;
    }

    if (prefix === "$") {
      const docBricks = context.documentBricksById?.[scopeId] || [];
      const docBrick = this.findBrickByIdOrAlias(docBricks as any[], brickId) as any;
      if (docBrick) return docBrick;
    }

    return null;
  }

  private static resolveDeepToken(inner: string, context: ResolverContext, prefix: "$" | "#"): string {
    const parsed = this.parseDeepReference(inner);
    if (!parsed) return `${prefix}[${inner}]`;

    const { selector, args } = parsed;
    const selectorRaw = selector;
    const brick = this.findDeepBrick(parsed, prefix, context);
    if (!brick) return `${prefix}[${inner}]`;

    const { kind, payload } = this.normalizeBrickPayload(brick);

    if (kind === "table") {
      const rows = payload.rows || brick.rows || [];
      const safeSelector = selectorRaw ? selector : "range";
      return this.tableSelector(rows, safeSelector, args);
    }

    if (kind === "checklist") {
      return this.checklistSelector(payload.items || brick.items || [], selector, args);
    }

    if (kind === "media" || kind === "image" || kind === "file") {
      return this.mediaSelector(payload, selector);
    }

    if (kind === "graph") {
      return this.graphSelector(payload, selector, args);
    }

    if (selector === "kind") {
      return kind;
    }

    if (selector === "json" || selector === "raw") {
      return JSON.stringify(payload);
    }

    if (selector === "line") {
      return this.lineSelector(this.extractTextLike(kind, payload), args[0], args[1]);
    }

    if (selector === "chars") {
      const text = this.extractTextLike(kind, payload);
      const [fromRaw, toRaw] = (args[0] || "0").split("-");
      const from = Math.max(0, Number.parseInt(fromRaw, 10) || 0);
      const to = Number.parseInt(toRaw, 10);
      return Number.isNaN(to) ? text.slice(from) : text.slice(from, Math.max(from, to));
    }

    if (selector === "title") return String(payload.title ?? "");
    if (selector === "body") return String(payload.body ?? this.extractTextLike(kind, payload));
    if (selector === "prompt") return String(payload.prompt ?? "");
    if (selector === "response") return String(payload.response ?? "");

    return this.extractTextLike(kind, payload);
  }

  /**
   * Resolves @[type:id:extra] into a display value or link data.
   * Format: @[doc:uuid] -> { link: '/d/uuid', label: 'DocTitle' }
   * Format: @[doc:uuid:brickId:A1] -> { value: 'CellContent' }
   */
  static resolve(ref: string, context: ResolverContext): { label: string; href?: string; value?: any } {
    const parts = ref.replace(/^@\[/, '').replace(/\]$/, '').split(':');
    if (parts.length < 2) return { label: ref };

    const [type, id, ...extra] = parts;

    if (type === 'doc') {
      const doc = context.documents.find(d => d.id === id);
      const label = doc ? doc.title : 'Unknown Document';

      if (extra.length >= 2) {
        // Deep reference @[doc:uuid:brickId:property]
        // This would require fetching the doc bricks if not already in context.
        // For now, we only support local brick references or we assume bricks are passed.
        return { label: `[${label} > ${extra[0]} > ${extra[1]}]`, value: '...' };
      }

      return { label, href: `/d/${id}` };
    }

    if (type === 'board') {
      const board = context.boards.find(b => b.id === id);
      return { label: board ? board.name : 'Unknown Board', href: `/b/${id}` };
    }

    if (type === 'folder' && context.folders) {
      const folder = context.folders.find(b => b.id === id);
      return { label: folder ? folder.name : 'Carpeta', href: `/d?folder=${id}` };
    }

    if (type === 'brick' && context.activeBricks) {
      // Local brick reference: @[brick:id:property]
      const brick = context.activeBricks.find(b => b.id === id);
      if (brick && extra[0]) {
        if (brick.kind === 'table') {
          const cell = extra[0]; // e.g., 'A1'
          const parsed = this.parseCellAddress(cell);
          if (!parsed) return { label: cell };
          const rows = (brick as any).rows || (brick as any).content?.rows || [];
          const val = rows?.[parsed.row]?.[parsed.col];
          return { label: val || cell, value: val };
        }
      }
    }

    if (type === 'user' && context.users) {
      const user = context.users.find(u => u.id === id);
      return { label: user ? user.name : (extra[0] || 'Unknown User') };
    }

    return { label: extra[0] || id };
  }

  /**
   * Resolves text for LOGIC/AI purposes: replaces $[...] and #[...] with actual values.
   */
  static resolveValue(text: string, context: ResolverContext): string {
    let processed = text.replace(/@\[brick:[^\]]+\]/g, (match) => {
      const resolved = this.resolve(match, context);
      return String(resolved.value ?? resolved.label);
    });

    processed = processed.replace(/([$#])\[([^\]]+)\]/g, (_match, rawPrefix, inner) => {
      const prefix = (rawPrefix === "$" ? "$" : "#") as "$" | "#";
      return this.resolveDeepToken(inner, context, prefix);
    });

    return processed;
  }

  /**
   * Processes text for UI DISPLAY: returns an array of strings and React components (pills).
   */
  static renderRich(text: string, _context: ResolverContext): (string | any)[] {
    const context = _context;
    const parts = text.split(/(@\[(?:doc|board|card|user|folder):[^\]]+\]|[$#]\[[^\]]+\])/g);

    const resolvedParts = parts.map((part, i) => {
      const match = part.match(/@\[(doc|board|card|user|folder):([^:\]]+)(?::([^\]]+))?\]/);
      if (match) {
        const [_m, type, id, nameRaw] = match;
        const mentionType = type as "doc" | "board" | "card" | "user" | "folder";
        const fallbackName =
          mentionType === "doc"
            ? context.documents.find((d) => d.id === id)?.title
            : mentionType === "board"
              ? context.boards.find((b) => b.id === id)?.name
              : mentionType === "folder"
                ? context.folders?.find((f) => f.id === id)?.name
              : mentionType === "user"
                ? context.users?.find((u) => u.id === id)?.name
                : undefined;
        const name = String(nameRaw || fallbackName || "Referencia");
        return { type: 'mention', mentionType: type, id, name, key: i };
      }

      const deepMatch = part.match(/([$#])\[([^\]]+)\]/);
      if (deepMatch) {
        const [_m, prefix, inner] = deepMatch;
        const deepPrefix = (prefix === "$" ? "$" : "#") as "$" | "#";
        const parsed = this.parseDeepReference(inner);
        if (!parsed) return part;

        const brick = this.findDeepBrick(parsed, deepPrefix, context);
        const { entityType, scopeId, selector, args } = parsed;
        const selectorLabel = this.describeSelector(selector, args);
        const docTitle = context.documents.find((d) => d.id === scopeId)?.title;
        const resolvedValue = brick ? this.resolveDeepToken(inner, context, deepPrefix) : "";
        const normalizedResolvedValue = this.stripOuterBoldMarkers(String(resolvedValue || ""));

        const nonInlineSelectors = new Set(["range", "csv", "items", "checked", "unchecked", "json", "raw", "series"]);
        const isSingleLine = !normalizedResolvedValue.includes("\n");
        const isInline = !!brick && !nonInlineSelectors.has(selector) && isSingleLine;
        const scopeLabel = entityType === "card"
          ? "Tarjeta"
          : entityType === "board"
            ? "Board"
            : docTitle;
        const fallbackLabel = brick
          ? `${String(brick.kind || "brick")} · ${selectorLabel}`
          : scopeLabel
            ? `${scopeLabel} · ${selectorLabel}`
            : `Referencia · ${selectorLabel}`;

        const label = this.buildDeepLabel(normalizedResolvedValue, fallbackLabel);

        return { type: 'deep', prefix, inner, label, key: i, isInline, resolvedValue: normalizedResolvedValue };
      }

      return part;
    });

    return this.removeBoldWrappersAroundReferences(resolvedParts)
      .filter((part, index, arr) => !(typeof part === "string" && part.length === 0 && typeof arr[index - 1] === "string" && typeof arr[index + 1] === "string"));
  }
}
