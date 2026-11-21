/**
 * Search snippets: plain text where the server wraps the matches in private-use markers (U+E000 start, U+E001 end) and
 * joins its fragments with an ellipsis (a private U+E002 separator is accepted too). The snippet is TEXT, never HTML: it is
 * cut into parts here and rendered by React as text nodes, so nothing a message contains can become markup.
 * Tolerant to broken input (an end without a start, a start never closed, nested starts). Pure, tested in
 * search-snippet.test.ts.
 */

export const HL_START = "";
export const HL_END = "";
export const FRAG_SEP = "";
const ELLIPSIS = "…";

export interface SnippetPart {
  text: string;
  match: boolean;
}

/** Cuts the snippet into alternating plain and highlighted parts. Empty parts are dropped; adjacent equal kinds are merged. */
export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let buf = "";
  let on = false;
  const flush = () => {
    if (!buf) return;
    const last = parts[parts.length - 1];
    if (last && last.match === on) last.text += buf;
    else parts.push({ text: buf, match: on });
    buf = "";
  };
  for (const ch of snippet) {
    if (ch === HL_START) {
      if (!on) { flush(); on = true; }
    } else if (ch === HL_END) {
      if (on) { flush(); on = false; }
    } else if (ch === FRAG_SEP) {
      // a fragment boundary closes any open highlight
      flush();
      on = false;
      buf = ELLIPSIS;
      flush();
    } else {
      buf += ch;
    }
  }
  flush();
  return parts;
}

/** The snippet without markers (for aria labels and tooltips). */
export function plainSnippet(snippet: string): string {
  return splitSnippet(snippet).map((p) => p.text).join("");
}

/** Number of highlighted parts. */
export const matchCount = (snippet: string): number => splitSnippet(snippet).filter((p) => p.match).length;
