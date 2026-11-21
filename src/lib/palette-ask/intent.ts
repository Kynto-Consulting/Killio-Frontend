/**
 * "Is this a command or a question?" for the Ctrl/Cmd+K palette.
 *
 * Pure on purpose (no React, no router, no river): the palette feeds it the raw
 * text and whether that text matches a command, and renders whatever comes back.
 */

export type AskPosition = "first" | "second";

export type PaletteIntent = {
  /**
   * empty         nothing typed: the row reads "Preguntar o pedir algo…"
   * forced        `?` or `/ia` prefix: always a question
   * command-first the text matches a command, the command wins
   * ask-first     nothing matches: the question is the default row
   */
  kind: "empty" | "forced" | "command-first" | "ask-first";
  /** Where the ask row sits: first (default row) or second (below the matching commands). */
  askPosition: AskPosition;
  /** The question without the `?` / `/ia` prefix, trimmed. */
  question: string;
  /** True when there is something to send. */
  canSubmit: boolean;
  /** No command matched and the phrase has more than 3 words: it is offered as a question. */
  suggested: boolean;
};

const IA_PREFIX = /^\/ia(?:\s+|$)/i;

export function stripAskPrefix(raw: string): { forced: boolean; text: string } {
  const value = (raw ?? "").trim();
  if (value.startsWith("?")) return { forced: true, text: value.slice(1).trim() };
  const m = IA_PREFIX.exec(value);
  if (m) return { forced: true, text: value.slice(m[0].length).trim() };
  return { forced: false, text: value };
}

export function countWords(text: string): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

export function resolvePaletteIntent(raw: string, commandMatches: boolean): PaletteIntent {
  const { forced, text } = stripAskPrefix(raw);

  if (forced) {
    return { kind: "forced", askPosition: "first", question: text, canSubmit: text.length > 0, suggested: false };
  }
  if (!text) {
    return { kind: "empty", askPosition: "first", question: "", canSubmit: false, suggested: false };
  }
  if (commandMatches) {
    return { kind: "command-first", askPosition: "second", question: text, canSubmit: true, suggested: false };
  }
  return { kind: "ask-first", askPosition: "first", question: text, canSubmit: true, suggested: countWords(text) > 3 };
}

/** What Enter does when no list item was moved to by the user. */
export function resolveEnterAction(intent: PaletteIntent): "ask" | "command" | "none" {
  if (intent.kind === "empty") return "none";
  if (intent.askPosition === "first") return intent.canSubmit ? "ask" : "none";
  return "command";
}

/**
 * Tab completes the command when that would change the text. When the command is
 * already complete (or nothing matches) Tab picks the ask row instead.
 */
export function resolveTabAction(intent: PaletteIntent, autocompleteChangesText: boolean): "ask" | "autocomplete" | "none" {
  if (intent.askPosition === "second" && autocompleteChangesText) return "autocomplete";
  return intent.canSubmit ? "ask" : "none";
}
