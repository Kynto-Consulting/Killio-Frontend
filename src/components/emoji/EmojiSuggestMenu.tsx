"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Emoji } from "./Emoji";
import type { EmojiSuggestion } from "@/lib/emoji/suggest";

export const emojiSuggestOptionId = (listId: string, index: number) => `${listId}-opt-${index}`;

/**
 * Floating list shown above a composer while the person types `:sm`. The editor keeps the focus: it points at the
 * active option with aria-activedescendant (see the `a11y` prop of ReferenceTokenInput), the list only renders.
 */
export function EmojiSuggestMenu({ id, items, activeIndex, onPick, className = "" }: { id: string; items: EmojiSuggestion[]; activeIndex: number; onPick: (item: EmojiSuggestion) => void; className?: string }) {
  const t = useTranslations("emoji");
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={t("picker.suggestions")}
      className={`absolute bottom-full left-0 z-40 mb-2 max-h-64 w-full max-w-sm overflow-y-auto rounded-xl border border-border/50 bg-popover p-1 shadow-lg ${className}`}
    >
      <li role="presentation" className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("picker.suggestions")}</li>
      {items.map((it, i) => (
        <li key={it.key} id={emojiSuggestOptionId(id, i)} ref={i === activeIndex ? activeRef : undefined} role="option" aria-selected={i === activeIndex}>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => { e.preventDefault(); onPick(it); }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors motion-reduce:transition-none ${i === activeIndex ? "bg-primary/10" : "hover:bg-muted/60"}`}
          >
            {it.custom
              // eslint-disable-next-line @next/next/no-img-element -- custom emoji of the team
              ? <img src={it.custom.url} alt="" className="h-6 w-6 shrink-0 object-contain" />
              : <Emoji value={it.insert} size={24} label="" className="shrink-0" />}
            <span className="min-w-0 truncate font-medium">:{it.shortcode}:</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
