"use client";

import { useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { getCachedDataset } from "@/lib/emoji/dataset";
import { normalizeGlyph, twemojiUrl } from "@/lib/emoji/twemoji-url";

export interface EmojiProps {
  /** The Unicode emoji ("😀", "👍🏽", "🇪🇸"). */
  value: string;
  /** Pixels (number) or any CSS length. Default "1.25em", which follows the surrounding text. */
  size?: number | string;
  className?: string;
  /** Accessible name; defaults to the emoji name when the list is already loaded, else the glyph itself. */
  label?: string;
}

/**
 * One emoji drawn with the Twemoji set (the same look on every OS), falling back to the native glyph if the image
 * cannot be loaded (offline, blocked CDN, emoji newer than the set).
 */
export function Emoji({ value, size = "1.25em", className = "", label }: EmojiProps) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState(false);
  const dim = typeof size === "number" ? `${size}px` : size;
  const name = label ?? getCachedDataset(locale === "es" ? "es" : "en")?.byNative.get(normalizeGlyph(value))?.name ?? value;

  if (!value) return null;
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
      className={`inline-block select-none align-[-0.25em] ${className}`}
      style={{ width: dim, height: dim }}
    />
  );
}
