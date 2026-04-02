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
