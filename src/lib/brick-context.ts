/**
 * Shared utility to convert any array of bricks (document or card)
 * into a plain-text context summary suitable for AI prompts.
 *
 * Brick kinds covered:
 *  text, quote, callout           → markdown / text field
 *  accordion                      → title + body
 *  table                          → rows as pipe-delimited lines
 *  checklist                      → [ ] / [x] items
 *  graph                          → type + title description
 *  tabs                           → tab labels
 *  columns                        → column count note
 *  code (stored as text kind)     → handled by extractText (markdown field)
 *  math (stored as text kind)     → handled by extractText (markdown field)
 *  image, video, audio, file,
 *  media, bookmark                → url + caption/subtitle
 *  divider                        → skipped (no content)
 */

/** Extract the primary text value from a brick content object */
function extractText(c: any): string {
  if (!c || typeof c !== "object") return "";
  if (typeof c.markdown === "string" && c.markdown.trim()) return c.markdown.trim();
  if (typeof c.body === "string" && c.body.trim()) return c.body.trim();
  if (typeof c.text === "string" && c.text.trim()) return c.text.trim();
  if (typeof c.title === "string" && c.title.trim()) return c.title.trim();
  if (typeof c.value === "string" && c.value.trim()) return c.value.trim();
  return "";
}

function stringifyTableCell(cell: any): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (Array.isArray(cell)) {
    return cell.map(stringifyTableCell).filter(Boolean).join(", ");
  }
  if (typeof cell !== "object") return String(cell).trim();

  if (typeof cell.markdown === "string" && cell.markdown.trim()) return cell.markdown.trim();
  if (typeof cell.text === "string" && cell.text.trim()) return cell.text.trim();
  if (typeof cell.value === "string" && cell.value.trim()) return cell.value.trim();
  if (typeof cell.name === "string" && cell.name.trim()) return cell.name.trim();
  if (typeof cell.title === "string" && cell.title.trim()) return cell.title.trim();
  if (typeof cell.number === "number") return String(cell.number);
  if (typeof cell.checked === "boolean") return cell.checked ? "true" : "false";

  if (Array.isArray(cell.items) && cell.items.length > 0) {
    return cell.items.map((item: any) => stringifyTableCell(item?.name || item?.label || item)).filter(Boolean).join(", ");
  }
  if (Array.isArray(cell.users) && cell.users.length > 0) {
    return cell.users.map((user: any) => stringifyTableCell(user?.name || user?.email || user?.id || user)).filter(Boolean).join(", ");
  }
  if (Array.isArray(cell.documents) && cell.documents.length > 0) {
    return cell.documents.map((doc: any) => stringifyTableCell(doc?.name || doc?.title || doc?.id || doc)).filter(Boolean).join(", ");
  }
  if (Array.isArray(cell.boards) && cell.boards.length > 0) {
    return cell.boards.map((board: any) => stringifyTableCell(board?.name || board?.title || board?.id || board)).filter(Boolean).join(", ");
  }
  if (Array.isArray(cell.cards) && cell.cards.length > 0) {
    return cell.cards.map((card: any) => stringifyTableCell(card?.name || card?.title || card?.id || card)).filter(Boolean).join(", ");
  }

  return extractText(cell) || "";
}

function summarizeAdvancedColumn(col: any, index: number): string {
  const colId = String(col?.id ?? `c${index + 1}`);
  const colName = String(col?.name || col?.label || col?.title || colId).trim();
  const colType = String(col?.type || "text").trim();
  const optionSummary = Array.isArray(col?.options) && col.options.length > 0
    ? ` options=${col.options.slice(0, 6).map((opt: any) => String(opt?.name || opt?.id || "").trim()).filter(Boolean).join(", ")}`
    : "";
  return `${colName}[${colId}]{${colType}}${optionSummary}`;
}

function stringifyAdvancedTableCell(cell: any, columnType?: string): string {
  if (cell === null || cell === undefined) return "empty";
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return `${columnType ? `${columnType}:` : ""}${String(cell)}`;
  }
  if (Array.isArray(cell)) {
    return `${columnType ? `${columnType}:` : ""}${cell.map((item) => stringifyTableCell(item)).filter(Boolean).join(", ")}`;
  }
  if (typeof cell !== "object") return `${columnType ? `${columnType}:` : ""}${String(cell)}`;

  const cellType = String(cell.type || columnType || "text").trim();
  if (cellType === "number") {
    return `number:${typeof cell.number === "number" ? cell.number : stringifyTableCell(cell) || "empty"}`;
  }
  if (cellType === "checkbox") {
    return `checkbox:${cell.checked ? "true" : "false"}`;
  }
  if (cellType === "select") {
    const name = String(cell.name || cell.text || "").trim() || "empty";
    const color = String(cell.color || "default").trim();
    return `select:${name}${color ? `(${color})` : ""}`;
  }
  if (cellType === "multi_select") {
    const items = Array.isArray(cell.items) ? cell.items.map((item: any) => String(item?.name || item?.label || item || "").trim()).filter(Boolean) : [];
    return `multi_select:${items.join(", ") || "empty"}`;
  }
  if (cellType === "date") {
    const start = String(cell.start || "").trim();
    const end = String(cell.end || "").trim();
    return `date:${start || "empty"}${end ? ` -> ${end}` : ""}`;
  }
  if (cellType === "user") {
    const users = Array.isArray(cell.users) ? cell.users.map((user: any) => String(user?.name || user?.email || user?.id || "").trim()).filter(Boolean) : [];
    return `user:${users.join(", ") || "empty"}`;
  }
  if (cellType === "document") {
    const docs = Array.isArray(cell.documents) ? cell.documents.map((doc: any) => String(doc?.name || doc?.title || doc?.id || "").trim()).filter(Boolean) : [];
    return `document:${docs.join(", ") || "empty"}`;
  }
  if (cellType === "board") {
    const boards = Array.isArray(cell.boards) ? cell.boards.map((board: any) => String(board?.name || board?.title || board?.id || "").trim()).filter(Boolean) : [];
    return `board:${boards.join(", ") || "empty"}`;
  }
  if (cellType === "card") {
    const cards = Array.isArray(cell.cards) ? cell.cards.map((card: any) => String(card?.name || card?.title || card?.id || "").trim()).filter(Boolean) : [];
    return `card:${cards.join(", ") || "empty"}`;
  }

  return `${cellType}:${stringifyTableCell(cell) || "empty"}`;
}

function formatAdvancedTableBrick(kind: string, c: any): string[] {
  const lines: string[] = [];
  const tableTitle = typeof c.title === "string" ? c.title.trim() : "";
  const columns: any[] = Array.isArray(c.columns) ? c.columns : [];
  const rows: any[] = Array.isArray(c.rows) ? c.rows : [];
  const isDatabase = kind === "database";

  if (tableTitle) lines.push(`[${isDatabase ? "Database" : "Tabla avanzada"}: ${tableTitle}]`);
  lines.push(`[${isDatabase ? "Database" : "Tabla avanzada"}${columns.length ? ` · ${columns.length} columnas` : ""}${rows.length ? ` · ${rows.length} filas` : ""}]`);
  lines.push(`[Regla IA: si propones cambios para esta estructura, usa rowId y colId exactos, respeta el tipo de columna y conserva la forma de la celda. No conviertas columnas tipadas a texto plano si son number/select/status/date/checkbox/user/document/board/card/multi_select.]`);

  if (columns.length > 0) {
    const headers = columns
      .slice(0, 12)
      .map((col: any, index: number) => summarizeAdvancedColumn(col, index))
      .join(" | ");
    if (headers) lines.push(`| ${headers} |`);
  }

  const maxRows = Math.min(rows.length, 12);
  for (let i = 0; i < maxRows; i++) {
    const row = rows[i];
    if (!row) continue;

    if (Array.isArray(row)) {
      const cells = row.slice(0, 12).map((cell: any) => stringifyTableCell(cell)).join(" | ");
      if (cells.trim()) lines.push(`| ${cells} |`);
      continue;
    }

    const rowCells = row?.cells && typeof row.cells === "object" ? row.cells : row;
    const columnOrder = columns.length > 0
      ? columns.map((col: any, index: number) => ({ id: String(col?.id ?? index), name: String(col?.name ?? col?.label ?? col?.title ?? `col ${index + 1}`), type: String(col?.type || "text") }))
      : Object.keys(rowCells || {}).map((key) => ({ id: key, name: key, type: "text" }));

    const cells = columnOrder.slice(0, 12).map(({ id, name, type }) => {
      const value = stringifyAdvancedTableCell(rowCells?.[id], type);
      return `${name}[${id}]{${type}}: ${value || "empty"}`;
    });

    const rowId = String(row?.id || `row_${i + 1}`);
    if (cells.length > 0) lines.push(`- rowId=${rowId} | ${cells.join(" | ")}`);
  }

  if (rows.length > maxRows) lines.push(`[${rows.length - maxRows} filas más omitidas]`);
  return lines;
}

/**
 * Serialize bricks to a text block suitable as AI context.
 * @param bricks - Array of brick objects (DocumentBrick, BoardBrick, or any)
 * @param maxLength - Maximum output characters (default 8000)
 */
export function buildBricksContextText(bricks: any[], maxLength = 8000): string {
  if (!bricks || bricks.length === 0) return "";
  const lines: string[] = [];

  for (const brick of bricks) {
    const kind: string = (brick.kind || "text").toLowerCase();
    const c: any = brick.content || {};

    switch (kind) {
      // ── Pure text bricks (text, quote, callout) ─────────────────────────
      case "text":
      case "quote":
      case "callout": {
        const val = extractText(c);
        if (val) lines.push(val);
        break;
      }

      // ── Accordion: title + body text ─────────────────────────────────────
      case "accordion": {
        const titleVal = typeof c.title === "string" ? c.title.trim() : "";
        const bodyVal = typeof c.body === "string" ? c.body.trim() : "";
        if (titleVal) lines.push(`### ${titleVal}`);
        if (bodyVal) lines.push(bodyVal);
        break;
      }

      // ── Table: pipe-delimited rows ────────────────────────────────────────
      case "table": {
        const tableTitle = typeof c.title === "string" ? c.title.trim() : "";
        if (tableTitle) lines.push(`[Tabla: ${tableTitle}]`);
        const rows: any[][] = Array.isArray(c.rows) ? c.rows : [];
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          const cells = row
            .map((cell: any) =>
              typeof cell === "string"
                ? cell
                : (cell?.markdown || cell?.value || cell?.text || "")
            )
            .join(" | ");
          if (cells.trim()) lines.push(`| ${cells} |`);
        }
        break;
      }

      // ── Advanced / bountiful tables: include columns + row previews ──────
      case "database":
      case "beautiful_table":
      case "bountiful_table": {
        lines.push(...formatAdvancedTableBrick(kind, c));
        break;
      }

      // ── Checklist ────────────────────────────────────────────────────────
      case "checklist": {
        const items: any[] = Array.isArray(c.items)
          ? c.items
          : Array.isArray(c.tasks)
          ? c.tasks
          : [];
        for (const item of items) {
          const label =
            typeof item === "string"
              ? item
              : typeof item?.label === "string"
              ? item.label
              : typeof item?.text === "string"
              ? item.text
              : extractText(item);
          const done = item?.checked || item?.done ? "[x]" : "[ ]";
          if (label.trim()) lines.push(`${done} ${label.trim()}`);
        }
        break;
      }

      // ── Graph ─────────────────────────────────────────────────────────────
      case "graph": {
        const graphTitle = typeof c.title === "string" ? c.title.trim() : "";
        const graphType = typeof c.type === "string" ? c.type : "chart";
        lines.push(`[Gráfico ${graphType}${graphTitle ? `: ${graphTitle}` : ""}]`);
        break;
      }

      // ── Tabs: list tab labels ─────────────────────────────────────────────
      case "tabs": {
        const tabs: any[] = Array.isArray(c.tabs) ? c.tabs : [];
        if (tabs.length > 0) {
          const labels = tabs
            .map((t: any) => (typeof t?.label === "string" ? t.label : ""))
            .filter(Boolean)
            .join(", ");
          if (labels) lines.push(`[Tabs: ${labels}]`);
        }
        break;
      }

      // ── Columns ───────────────────────────────────────────────────────────
      case "columns": {
        const colCount = Array.isArray(c.columns) ? c.columns.length : 2;
        lines.push(`[Columnas: ${colCount} columnas]`);
        break;
      }

      // ── Media: image, video, audio, file, bookmark ───────────────────────
      case "media":
      case "image":
      case "video":
      case "audio":
      case "file":
      case "bookmark": {
        const mediaUrl = typeof c.url === "string" ? c.url.trim() : "";
        // Caption may be a plain string or our MEDIA_META JSON blob — extract subtitle
        const rawCaption = c.caption || c.subtitle || c.alt || c.title || "";
        let caption = "";
        if (typeof rawCaption === "string") {
          caption = rawCaption.startsWith("MEDIA_META:") ? "" : rawCaption.trim();
        }
        // Check for items array (multi-media)
        if (Array.isArray(c.items) && c.items.length > 0) {
          const itemSummary = c.items
            .map((it: any) => (typeof it?.url === "string" ? it.url : ""))
            .filter(Boolean)
            .slice(0, 3)
            .join(", ");
          lines.push(`[${kind}: ${itemSummary}${c.items.length > 3 ? ` + ${c.items.length - 3} más` : ""}]`);
        } else if (mediaUrl) {
          lines.push(`[${kind}${caption ? `: ${caption}` : ""} → ${mediaUrl}]`);
        }
        break;
      }

      // ── Divider: no content ───────────────────────────────────────────────
      case "divider":
        break;

      // ── Fallback ──────────────────────────────────────────────────────────
      default: {
        const val = extractText(c);
        if (val) lines.push(`[${kind}] ${val}`);
        break;
      }
    }
  }

  return lines.join("\n").slice(0, maxLength);
}

/**
 * Build the full context summary block for a document.
 * Wraps buildBricksContextText with === headers.
 */
export function buildDocumentContextSummary(
  bricks: any[],
  prefixSummary = "",
  maxLength = 8000
): string {
  const inventory = buildDocumentBrickInventory(bricks, Math.min(2600, Math.max(900, Math.floor(maxLength * 0.32))));
  const bodyBudget = Math.max(1200, maxLength - inventory.length - 180);
  const body = buildBricksContextText(bricks, bodyBudget);
  if (!body && !inventory) return prefixSummary || "";
  const parts: string[] = [];
  if (prefixSummary) parts.push(prefixSummary, "");
  if (inventory) {
    parts.push("=== BRICKS DISPONIBLES (usar IDs exactos, no inventar) ===", inventory, "=== FIN BRICKS DISPONIBLES ===", "");
  }
  parts.push(
    "=== ACCIONES IA PERMITIDAS EN DOCUMENTOS ===",
    "- DOC_RENAME { title }",
    "- DOC_BRICK_INSERT { kind, content, position? }",
    "- DOC_BRICK_APPEND { kind, content, position? }",
    "- DOC_BRICK_REPLACE { brickId, content }",
    "- DOC_BRICK_DELETE { brickId }",
    "Reglas: usa brickId/rowId/colId exactos del contexto. Para beautiful_table/database/bountiful_table conserva columns, rows, tipos de columna y forma de cada celda; no conviertas celdas tipadas a texto plano.",
    "=== FIN ACCIONES IA ===",
    ""
  );
  parts.push("=== CONTENIDO DEL DOCUMENTO ===", body, "=== FIN DEL DOCUMENTO ===");
  return parts.join("\n").slice(0, maxLength);
}

function buildDocumentBrickInventory(bricks: any[], maxLength: number): string {
  if (!Array.isArray(bricks) || bricks.length === 0) return "";

  const lines: string[] = [];
  const capped = bricks.slice(0, 80);

  for (let index = 0; index < capped.length; index += 1) {
    const brick = capped[index] || {};
    const brickId = String(brick.id || "").trim();
    const kind = String(brick.kind || "unknown").trim().toLowerCase();
    const content = brick.content || {};
    if (!brickId) continue;

    const base = `${index + 1}. id=${brickId} kind=${kind}`;

    if (kind === "table") {
      const rows = Array.isArray(content.rows) ? content.rows : [];
      const cols = rows[0] && Array.isArray(rows[0]) ? rows[0].length : 0;
      lines.push(`${base} rows=${rows.length} cols=${cols}`);
      continue;
    }

    if (kind === "database" || kind === "beautiful_table" || kind === "bountiful_table") {
      const columns = Array.isArray(content.columns) ? content.columns : [];
      const rows = Array.isArray(content.rows) ? content.rows : [];
      const columnSummary = columns
        .slice(0, 8)
        .map((col: any, colIdx: number) => {
          const colId = String(col?.id ?? `c${colIdx + 1}`);
          const colName = String(col?.name || col?.label || col?.title || colId);
          const colType = String(col?.type || "text");
          return `${colName}[${colId}]{${colType}}`;
        })
        .join(", ");
      const rowSummary = rows
        .slice(0, 8)
        .map((row: any, rowIdx: number) => String(row?.id || `row_${rowIdx + 1}`))
        .join(", ");
      lines.push(`${base} rows=${rows.length} columns=${columns.length}${columnSummary ? ` (${columnSummary})` : ""}${rowSummary ? ` rowIds=${rowSummary}` : ""}`);
      continue;
    }

    if (kind === "checklist") {
      const items = Array.isArray(content.items) ? content.items : (Array.isArray(content.tasks) ? content.tasks : []);
      lines.push(`${base} items=${items.length}`);
      continue;
    }

    const preview = extractText(content).replace(/\s+/g, " ").trim();
    lines.push(preview ? `${base} preview="${preview.slice(0, 140)}"` : base);
  }

  if (bricks.length > capped.length) {
    lines.push(`... ${bricks.length - capped.length} bricks mas omitidos`);
  }

  return lines.join("\n").slice(0, maxLength);
}
