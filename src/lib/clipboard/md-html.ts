// Clean, dependency-free Markdown → HTML for clipboard export (text/html for
// Notion/Word/Slack). Deliberately emits semantic, class-free HTML (not Killio's
// styled brick HTML) so it pastes cleanly into other apps. Block + inline.

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Inline renderer — mirrors the unified text-brick's read-only inline grammar:
 *  bold/italic/strike/code, links, images, and the [size]/[color]/[bg]/[link]
 *  styling wrappers — but emits clean, class-free HTML for external paste. */
export function inlineMdToHtml(s: string): string {
  let h = escHtml(s);
  // Styling wrappers (Killio) → inline-styled spans (non-nested, good enough for clipboard).
  h = h.replace(/\[size:([^\]]+)\]([\s\S]*?)\[\/size\]/g, (_m, v, inner) => `<span style="font-size:${escHtml(String(v).trim())}">${inner}</span>`);
  h = h.replace(/\[color:([^\]]+)\]([\s\S]*?)\[\/color\]/g, (_m, v, inner) => `<span style="color:${escHtml(String(v).trim())}">${inner}</span>`);
  h = h.replace(/\[bg:([^\]]+)\]([\s\S]*?)\[\/bg\]/g, (_m, v, inner) => `<span style="background:${escHtml(String(v).trim())}">${inner}</span>`);
  h = h.replace(/\[link:([^\]]+)\]([\s\S]*?)\[\/link\]/g, (_m, url, inner) => `<a href="${escHtml(String(url).trim())}">${inner}</a>`);
  // Reference pills (@[type:id:name]) → bold label (drop the token on export).
  h = h.replace(/@\[(?:doc|document|board|mesh|card|user|folder):[^:\]]+(?::([^\]]+))?\]/g, (_m, name) => `<strong>${name || "ref"}</strong>`);
  // Standard markdown inlines.
  h = h.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt, url) => `<img src="${url}" alt="${alt}" />`);
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, txt, url) => `<a href="${url}">${txt}</a>`);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  h = h.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return h;
}

/** Block-level Markdown → HTML (headings, lists, quotes, code fences, hr, tables, paragraphs). */
export function markdownToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Fenced code block.
    const fence = t.match(/^```(.*)$/);
    if (fence) {
      closeList();
      const lang = fence[1].trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code${lang ? ` class="language-${escHtml(lang)}"` : ""}>${escHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // GFM table.
    if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      closeList();
      const rows: string[] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(lines[i].trim()); i += 1; }
      const cells = rows.map((r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
      const sepIdx = cells.findIndex((r) => r.every((c) => /^:?-+:?$/.test(c)));
      const header = sepIdx > 0 ? cells[sepIdx - 1] : null;
      const body = cells.filter((_, idx) => idx !== sepIdx && (!header || idx !== sepIdx - 1));
      out.push(`<table>${header ? `<thead><tr>${header.map((c) => `<th>${inlineMdToHtml(c)}</th>`).join("")}</tr></thead>` : ""}<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inlineMdToHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    if (t === "") { closeList(); i += 1; continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); const lvl = h[1].length; out.push(`<h${lvl}>${inlineMdToHtml(h[2])}</h${lvl}>`); i += 1; continue; }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) { closeList(); out.push("<hr />"); i += 1; continue; }

    if (/^>\s?/.test(t)) {
      closeList();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, "")); i += 1; }
      const cm = q[0]?.match(/^\[!(\w+)\][+-]?\s*(.*)$/);
      if (cm) {
        const title = cm[2].trim() || cm[1].charAt(0).toUpperCase() + cm[1].slice(1);
        const body = q.slice(1);
        out.push(`<blockquote><p><strong>${escHtml(title)}</strong></p>${body.length ? `<p>${body.map(inlineMdToHtml).join("<br>")}</p>` : ""}</blockquote>`);
      } else {
        out.push(`<blockquote>${q.map(inlineMdToHtml).join("<br>")}</blockquote>`);
      }
      continue;
    }

    const chk = t.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (chk) { if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; } out.push(`<li>${chk[1].toLowerCase() === "x" ? "☑" : "☐"} ${inlineMdToHtml(chk[2])}</li>`); i += 1; continue; }
    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ul) { if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; } out.push(`<li>${inlineMdToHtml(ul[1])}</li>`); i += 1; continue; }
    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ol) { if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; } out.push(`<li>${inlineMdToHtml(ol[1])}</li>`); i += 1; continue; }

    closeList();
    out.push(`<p>${inlineMdToHtml(t)}</p>`);
    i += 1;
  }
  closeList();
  return out.join("");
}
