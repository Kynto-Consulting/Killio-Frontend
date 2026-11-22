import twemoji from "@twemoji/api";
import type { CustomEmoji } from "./types.ts";

export type EmojiSegment =
  | { type: "text"; value: string }
  | { type: "emoji"; value: string }
  | { type: "custom"; value: string; emoji: CustomEmoji };

/**
 * Regions that must never be touched: inline code, markdown links and mention tokens (`@[Ana](user:1)`, `[x](y)`),
 * bare URLs and HTML-ish tags. Emojis inside them stay as written.
 */
const PROTECTED_RE = /(`[^`\n]*`|[@$#]\[[^\]\n]*\]|@?\[[^\]\n]*\]\([^)\n]*\)|https?:\/\/[^\s<>)]+|<[^>\n]+>)/g;
const CUSTOM_TOKEN_RE = /:([A-Za-z0-9_]{2,32}):/g;

/**
 * Number of emojis when the text is made ONLY of emojis (Unicode or `:custom:`) and spaces and there are 1..max of them
 * (the "jumbo" case of a message); otherwise 0.
 */
export function emojiOnlyCount(text: string, custom?: Map<string, CustomEmoji>, max = 27): number {
  if (!text || !text.trim()) return 0;
  let count = 0;
  for (const s of splitEmojiSegments(text, custom)) {
    if (s.type === "text") { if (s.value.trim() !== "") return 0; }
    else count++;
  }
  return count >= 1 && count <= max ? count : 0;
}

/** True when the text has at least one emoji (cheap pre-check before allocating segments). */
export function hasEmoji(text: string): boolean {
  return twemoji.test(text);
}

function splitUnprotected(text: string, custom: Map<string, CustomEmoji> | undefined, out: EmojiSegment[]): void {
  const pushText = (value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.value += value;
    else out.push({ type: "text", value });
  };

  const emojiPass = (chunk: string) => {
    let cursor = 0;
    twemoji.replace(chunk, (match: string, ...rest: unknown[]) => {
      // String.prototype.replace passes (match, ...groups, offset, input); the offset is the number before the input string.
      const offset = rest[rest.length - 2] as number;
      if (match === "️") return match; // a stray variation selector is not an emoji
      pushText(chunk.slice(cursor, offset));
      // Lone "©", "™" or digits are not matched without U+FE0F by the regex, so everything reaching here is a real emoji.
      out.push({ type: "emoji", value: match });
      cursor = offset + match.length;
      return match;
    });
    pushText(chunk.slice(cursor));
  };

  if (!custom || custom.size === 0 || !text.includes(":")) { emojiPass(text); return; }

  let cursor = 0;
  for (const m of text.matchAll(CUSTOM_TOKEN_RE)) {
    const emoji = custom.get(m[1].toLowerCase());
    if (!emoji) continue;
    emojiPass(text.slice(cursor, m.index));
    out.push({ type: "custom", value: m[0], emoji });
    cursor = m.index! + m[0].length;
  }
  emojiPass(text.slice(cursor));
}

/**
 * Splits a text into plain text, Unicode emojis and (optionally) `:custom:` emojis, leaving the protected regions
 * (code, links, mentions, URLs) as text. Concatenating the `value`s always gives back the original string.
 */
export function splitEmojiSegments(text: string, custom?: Map<string, CustomEmoji>): EmojiSegment[] {
  const out: EmojiSegment[] = [];
  if (!text) return out;
  const parts = text.split(PROTECTED_RE);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const last = out[out.length - 1];
      if (last && last.type === "text") last.value += part;
      else out.push({ type: "text", value: part });
    } else splitUnprotected(part, custom, out);
  });
  return out;
}
