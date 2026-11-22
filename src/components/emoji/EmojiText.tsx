"use client";

import { Fragment, useMemo } from "react";
import { Emoji } from "./Emoji";
import { useCustomEmojis } from "./emoji-context";
import { hasEmoji, splitEmojiSegments } from "@/lib/emoji/segments";

/**
 * Renders a string turning every emoji inside it into an <Emoji/> (Twemoji). Code spans, markdown links, mention
 * tokens and URLs are left untouched, and the stored text is never modified: this is display only.
 */
export function EmojiText({ text, size, className }: { text: string; size?: number | string; className?: string }) {
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
        if (s.type === "emoji") return <Emoji key={i} value={s.value} size={size} className={className} />;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- custom emoji of the space
          <img
            key={i}
            src={s.emoji.url}
            alt={`:${s.emoji.name}:`}
            draggable={false}
            loading="lazy"
            className={`inline-block align-[-0.25em] ${className ?? ""}`}
            style={{ width: size ?? "1.25em", height: size ?? "1.25em", objectFit: "contain" }}
          />
        );
      })}
    </>
  );
}
