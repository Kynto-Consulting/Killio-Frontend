import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { sheetEngine } from "@/lib/sheetEngine";

export interface ResolverContext {
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks?: DocumentBrick[]; // Bricks of the current document for local resolution
  documentBricksById?: Record<string, DocumentBrick[]>;
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

export class ReferenceResolver {
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

  private static findDeepBrick(scopeId: string, brickId: string, prefix: "$" | "#", context: ResolverContext): any {
    const localBrick = context.activeBricks?.find((b) => b.id === brickId) as any;
    if (localBrick) return localBrick;

    if (prefix === "$") {
      const docBricks = context.documentBricksById?.[scopeId] || [];
      const docBrick = docBricks.find((b) => b.id === brickId) as any;
      if (docBrick) return docBrick;
    }

    return null;
  }

  private static resolveDeepToken(inner: string, context: ResolverContext, prefix: "$" | "#"): string {
    const parts = inner.split(":");
    if (parts.length < 2) return `${prefix}[${inner}]`;

    const [scopeId, brickId, selectorRaw, ...args] = parts;
    const selector = (selectorRaw || "text").toLowerCase();
    const brick = this.findDeepBrick(scopeId, brickId, prefix, context);
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
    const parts = text.split(/(@\[(?:doc|board|card|user):[^\]]+\]|[$#]\[[^\]]+\])/g);

    return parts.map((part, i) => {
      const match = part.match(/@\[(doc|board|card|user):([^:\]]+)(?::([^\]]+))?\]/);
      if (match) {
        const [_m, type, id, nameRaw] = match;
        const mentionType = type as "doc" | "board" | "card" | "user";
        const fallbackName =
          mentionType === "doc"
            ? context.documents.find((d) => d.id === id)?.title
            : mentionType === "board"
              ? context.boards.find((b) => b.id === id)?.name
              : mentionType === "user"
                ? context.users?.find((u) => u.id === id)?.name
                : undefined;
        const name = String(nameRaw || fallbackName || "Referencia");
        return { type: 'mention', mentionType: type, id, name, key: i };
      }

      const deepMatch = part.match(/([$#])\[([^\]]+)\]/);
      if (deepMatch) {
        const [_m, prefix, inner] = deepMatch;
        const tokens = inner.split(':');
        const scopeId = tokens[0] || "";
        const brickId = tokens[1] || "";
        const selector = (tokens[2] || "text").toLowerCase();
        const args = tokens.slice(3);
        const selectorLabel = this.describeSelector(selector, args);
        const deepPrefix = (prefix === "$" ? "$" : "#") as "$" | "#";
        const brick = this.findDeepBrick(scopeId, brickId, deepPrefix, context);
        const docTitle = context.documents.find((d) => d.id === scopeId)?.title;
        const resolvedValue = brick ? this.resolveDeepToken(inner, context, deepPrefix) : "";

        const nonInlineSelectors = new Set(["range", "csv", "items", "checked", "unchecked", "json", "raw", "series"]);
        const isSingleLine = !String(resolvedValue).includes("\n");
        const isInline = !!brick && !nonInlineSelectors.has(selector) && isSingleLine;
        const valueLabel = String(resolvedValue || "").trim();

        const label = isInline && valueLabel.length > 0
          ? valueLabel
          : brick
            ? `${String(brick.kind || "brick")} · ${selectorLabel}`
            : docTitle
              ? `${docTitle} · ${selectorLabel}`
              : `Referencia · ${selectorLabel}`;

        return { type: 'deep', prefix, inner, label, key: i, isInline, resolvedValue };
      }

      return part;
    });
  }
}
