"use client";

import { Fragment, useMemo } from "react";
import { Emoji } from "./Emoji";
import { useCustomEmojis } from "./emoji-context";
import { hasEmoji, splitEmojiSegments } from "@/lib/emoji/segments";
import { EMOJI_INLINE_ALIGN, EMOJI_INLINE_SIZE, EMOJI_JUMBO_SIZE } from "@/lib/emoji/token-html";

/**
 * Renders a string turning every emoji inside it into an <Emoji/> (Twemoji). Code spans, markdown links, mention
 * tokens and URLs are left untouched, and the stored text is never modified: this is display only.
 */
export function EmojiText({ text, size, className, jumbo = false }: { text: string; size?: number | string; className?: string; jumbo?: boolean }) {
  const { customMap } = useCustomEmojis();
  const segments = useMemo(() => {
    if (!text) return null;
    const maybeCustom = customMap.size > 0 && text.includes(":");
    if (!maybeCustom && !hasEmoji(text)) return null;
    return splitEmojiSegments(text, customMap);
  }, [text, customMap]);

  if (!segments) return <>{text}</>;
  return (
    <>
      {segments.map((s, i) => {
        if (s.type === "text") return <Fragment key={i}>{s.value}</Fragment>;
        if (s.type === "emoji") return <Emoji key={i} value={s.value} size={size} jumbo={jumbo} className={className} />;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- custom emoji of the space
          <img
            key={i}
            src={s.emoji.url}
            alt={`:${s.emoji.name}:`}
            draggable={false}
            loading="lazy"
            className={`inline-block ${jumbo ? "align-bottom" : EMOJI_INLINE_ALIGN} ${className ?? ""}`}
            style={{ width: size ?? (jumbo ? EMOJI_JUMBO_SIZE : EMOJI_INLINE_SIZE), height: size ?? (jumbo ? EMOJI_JUMBO_SIZE : EMOJI_INLINE_SIZE), objectFit: "contain" }}
          />
        );
      })}
    </>
  );
}
