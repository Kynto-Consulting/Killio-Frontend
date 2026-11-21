/**
 * Turns the long description / documentation of a pack (written in the same Markdown + bracket-token + LaTeX
 * format as Killio text bricks) into a list of read-only bricks.
 *
 * Rules: a new `text` brick starts at every level 1-2 heading (outside code fences and `$$` blocks); a blockquote that starts with a
 * `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]` or `> [!IMPORTANT]` line becomes a `callout` brick.
 *
 * Future: when packs carry a real "description as a document" (bricks stored with the pack version), the detail page
 * would render those bricks directly and this splitter would only be the fallback for plain-text localizations.
 */
export type PackDocBrick = { id: string; kind: "text" | "callout"; text: string };

const CALLOUT_RE = /^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*$/i;

export function splitDocumentationBricks(markdown: string | null | undefined, idPrefix = "doc"): PackDocBrick[] {
  const source = (markdown ?? "").replace(/\r\n?/g, "\n").trim();
  if (!source) return [];
  const sections: string[][] = [[]];
  let fence: string | null = null;
  let inMath = false;
  for (const line of source.split("\n")) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch && !inMath) fence = fence === null ? fenceMatch[1] : fence === fenceMatch[1] ? null : fence;
    else if (fence === null && line.trim() === "$$") inMath = !inMath;
    if (fence === null && !inMath && !fenceMatch && /^#{1,2}\s+\S/.test(line) && sections[sections.length - 1].some((l) => l.trim())) {
      sections.push([]);
    }
    sections[sections.length - 1].push(line);
  }
  const bricks: PackDocBrick[] = [];
  const push = (kind: PackDocBrick["kind"], lines: string[]) => {
    const text = lines.join("\n").trim();
    if (text) bricks.push({ id: `${idPrefix}-${bricks.length}`, kind, text });
  };
  for (const lines of sections) {
    let buffer: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (CALLOUT_RE.test(lines[i].trim())) {
        const body: string[] = [];
        while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith(">")) {
          i += 1;
          body.push(lines[i].trimStart().replace(/^>\s?/, ""));
        }
        if (body.some((l) => l.trim())) {
          push("text", buffer);
          buffer = [];
          push("callout", body);
          continue;
        }
      }
      buffer.push(lines[i]);
    }
    push("text", buffer);
  }
  return bricks;
}
