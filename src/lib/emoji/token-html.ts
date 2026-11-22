import { splitEmojiSegments } from "./segments.ts";
import { twemojiUrl } from "./twemoji-url.ts";
import type { CustomEmoji } from "./types.ts";

/** Sizes shared by every place that draws an emoji next to text (Discord-like). */
export const EMOJI_INLINE_SIZE = "1.375em";
export const EMOJI_JUMBO_SIZE = "2.75em";
/** Vertical alignment that centers a 1.375em image on the text's x-height. */
export const EMOJI_INLINE_ALIGN = "align-[-0.4em]";
/** A message with only emojis (and spaces) up to this many gets the jumbo size. */
export const JUMBO_MAX = 27;

const ZWSP = "​";

const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escHtml = (v: string) => escAttr(v).replace(/'/g, "&#39;");

/**
 * Markup of one emoji token inside the composer: a non-editable span whose `data-token` is what the editor
 * serializes (`:name:` for a custom emoji, the glyph for a Unicode one). The image is only decoration.
 */
export function emojiTokenHtml(kind: "unicode" | "custom", token: string, opts: { src: string; label: string }): string {
  return (
    `${ZWSP}<span contenteditable="false" data-token="${escAttr(token)}" data-emoji="${kind}" role="img" aria-label="${escAttr(opts.label)}" ` +
    `class="mx-px inline-block select-none ${EMOJI_INLINE_ALIGN}">` +
    `<img src="${escAttr(opts.src)}" alt="${escAttr(opts.label)}" draggable="false" class="inline-block h-[1.375em] w-[1.375em] object-contain"></span>${ZWSP}`
  );
}

/**
 * HTML for a plain-text piece of the composer: text escaped (newlines as <br>), emojis as tokens.
 * `shortcodeOf` gives the `:shortcode:` label of a Unicode glyph when the emoji list is loaded.
 */
export function textToEditorHtml(text: string, custom: Map<string, CustomEmoji> | undefined, shortcodeOf?: (glyph: string) => string | undefined): string {
  return splitEmojiSegments(text, custom)
    .map((s) => {
      if (s.type === "text") return escHtml(s.value).replace(/\n/g, "<br>");
      if (s.type === "emoji") return emojiTokenHtml("unicode", s.value, { src: twemojiUrl(s.value), label: shortcodeOf?.(s.value) ?? s.value });
      return emojiTokenHtml("custom", s.value, { src: s.emoji.url, label: s.value });
    })
    .join("");
}

// ── clipboard ────────────────────────────────────────────────────────────────

/** The few DOM properties the serializer reads, so it can be tested without a DOM. */
export interface ClipNode {
  nodeType: number;
  textContent: string | null;
  tagName?: string;
  dataset?: { token?: string; emoji?: string };
  childNodes: ArrayLike<ClipNode>;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Plain text for Ctrl+C / Ctrl+X of a piece of the editor: emoji tokens become `:name:` (custom) or the glyph;
 * other chips (mentions...) keep the text they show, as the browser copies them today.
 */
export function serializeClipboardText(node: ClipNode): string {
  if (node.nodeType === TEXT_NODE) return (node.textContent ?? "").replace(/​/g, "");
  if (node.nodeType !== ELEMENT_NODE) return "";
  if (node.dataset?.emoji && node.dataset.token) return node.dataset.token;
  if (node.dataset?.token) return (node.textContent ?? "").replace(/​/g, "");
  if (node.tagName === "BR") return "\n";
  const inner = Array.from(node.childNodes).map(serializeClipboardText).join("");
  return (node.tagName === "DIV" || node.tagName === "P") && inner && !inner.endsWith("\n") ? `${inner}\n` : inner;
}

/** HTML flavor of the clipboard: the same text, escaped, with no image or token markup. */
export function clipboardHtml(text: string): string {
  return escHtml(text).replace(/\n/g, "<br>");
}
