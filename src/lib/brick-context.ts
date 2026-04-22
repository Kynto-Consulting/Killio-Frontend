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

function formatAdvancedTableBrick(kind: string, c: any): string[] {
  const lines: string[] = [];
  const tableTitle = typeof c.title === "string" ? c.title.trim() : "";
  const columns: any[] = Array.isArray(c.columns) ? c.columns : [];
  const rows: any[] = Array.isArray(c.rows) ? c.rows : [];

  if (tableTitle) lines.push(`[Tabla: ${tableTitle}]`);
  lines.push(`[Tabla avanzada${columns.length ? ` · ${columns.length} columnas` : ""}${rows.length ? ` · ${rows.length} filas` : ""}]`);

  if (columns.length > 0) {
    const headers = columns
      .slice(0, 12)
      .map((col: any) => {
        const name = typeof col?.name === "string" ? col.name.trim() : typeof col?.label === "string" ? col.label.trim() : typeof col?.title === "string" ? col.title.trim() : "";
        const type = typeof col?.type === "string" ? col.type.trim() : "";
        return name ? `${name}${type ? `(${type})` : ""}` : type || "col";
      })
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
      ? columns.map((col: any, index: number) => ({ id: String(col?.id ?? index), name: String(col?.name ?? col?.label ?? col?.title ?? `col ${index + 1}`) }))
      : Object.keys(rowCells || {}).map((key) => ({ id: key, name: key }));

    const cells = columnOrder.slice(0, 12).map(({ id, name }) => {
      const value = stringifyTableCell(rowCells?.[id]);
      return `${name}: ${value || "—"}`;
    });

    if (cells.length > 0) lines.push(`- ${cells.join(" | ")}`);
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
  const body = buildBricksContextText(bricks, maxLength - 60);
  if (!body) return prefixSummary || "";
  const parts: string[] = [];
  if (prefixSummary) parts.push(prefixSummary, "");
  parts.push("=== CONTENIDO DEL DOCUMENTO ===", body, "=== FIN DEL DOCUMENTO ===");
  return parts.join("\n").slice(0, maxLength);
}
