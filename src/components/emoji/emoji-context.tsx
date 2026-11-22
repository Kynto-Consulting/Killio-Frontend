"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CustomEmoji } from "@/lib/emoji/types";
import { customByName } from "@/lib/emoji/shortcodes";

interface EmojiContextValue {
  customEmojis: CustomEmoji[];
  customMap: Map<string, CustomEmoji>;
  /** Looks a custom emoji up by id or by its `custom:<id>` reaction key. */
  customById: Map<string, CustomEmoji>;
}

const EMPTY: EmojiContextValue = { customEmojis: [], customMap: new Map(), customById: new Map() };
const Ctx = createContext<EmojiContextValue>(EMPTY);

/**
 * Gives the renderers and pickers below it the custom emojis of the current space. Nothing in the app mounts it
 * with data yet (there is no backend for custom emojis); without it everything works with Unicode emojis only.
 */
export function EmojiProvider({ customEmojis, children }: { customEmojis: CustomEmoji[]; children: ReactNode }) {
  const value = useMemo(() => ({ customEmojis, customMap: customByName(customEmojis), customById: new Map(customEmojis.map((c) => [c.id, c])) }), [customEmojis]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomEmojis(): EmojiContextValue {
  return useContext(Ctx);
}
