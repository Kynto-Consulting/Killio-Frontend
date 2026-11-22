"use client";

import { useState } from "react";
import { useCustomEmojis } from "./emoji-context";
import { useI18n } from "@/components/providers/i18n-provider";
import { EMOJI_INLINE_ALIGN, EMOJI_INLINE_SIZE, EMOJI_JUMBO_SIZE } from "@/lib/emoji/token-html";
import { getCachedDataset } from "@/lib/emoji/dataset";
import { normalizeGlyph, twemojiUrl } from "@/lib/emoji/twemoji-url";

export interface EmojiProps {
  /** The Unicode emoji ("😀", "👍🏽", "🇪🇸"). */
  value: string;
  /** Pixels (number) or any CSS length. Default "1.25em", which follows the surrounding text. */
  size?: number | string;
  /** Large variant for messages made only of emojis (Discord "jumbo"). */
  jumbo?: boolean;
  className?: string;
  /** Accessible name; defaults to the emoji name when the list is already loaded, else the glyph itself. */
  label?: string;
}

/**
 * One emoji drawn with the Twemoji set (the same look on every OS), falling back to the native glyph if the image
 * cannot be loaded (offline, blocked CDN, emoji newer than the set).
 */
export function Emoji({ value, size, jumbo = false, className = "", label }: EmojiProps) {
  const align = jumbo ? "align-bottom" : EMOJI_INLINE_ALIGN;
  const { locale } = useI18n();
  const { customById } = useCustomEmojis();
  const [failed, setFailed] = useState(false);
  const eff = size ?? (jumbo ? EMOJI_JUMBO_SIZE : EMOJI_INLINE_SIZE);
  const dim = typeof eff === "number" ? `${eff}px` : eff;
  const name = label ?? getCachedDataset(locale === "es" ? "es" : "en")?.byNative.get(normalizeGlyph(value))?.name ?? value;

  if (!value) return null;
  if (value.startsWith("custom:")) {
    const c = customById.get(value.slice(7));
    if (!c) return <span aria-hidden className={`inline-block rounded-sm bg-muted ${className}`} style={{ width: dim, height: dim }} />;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- custom emoji of the team
      <img src={c.url} alt={`:${c.name}:`} draggable={false} loading="lazy" className={`inline-block select-none ${align} object-contain ${className}`} style={{ width: dim, height: dim }} />
    );
  }
  if (failed) {
    return <span role="img" aria-label={name} className={className} style={{ fontSize: dim, lineHeight: 1 }}>{value}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny CDN SVGs cached by the service worker; next/image would proxy each one
    <img
      src={twemojiUrl(value)}
      alt={name}
      title={undefined}
      draggable={false}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      onError={() => setFailed(true)}
      className={`inline-block select-none ${align} ${className}`}
      style={{ width: dim, height: dim }}
    />
  );
}
