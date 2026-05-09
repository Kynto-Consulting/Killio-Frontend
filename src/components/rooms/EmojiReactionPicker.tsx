"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import EmojiPickerReact, { EmojiClickData, Theme } from "emoji-picker-react";
import { SmilePlus } from "lucide-react";
import { Portal } from "@/components/ui/portal";

// ── Usage tracking ────────────────────────────────────────────────────────────

const STORAGE_KEY = "emoji_reaction_usage";
const MAX_STORED = 100;

interface UsageEntry { count: number; lastUsed: number; }
type UsageMap = Record<string, UsageEntry>;

function loadUsage(): UsageMap {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveUsage(map: UsageMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export function trackEmojiUse(emoji: string) {
  const map = loadUsage();
  map[emoji] = { count: (map[emoji]?.count ?? 0) + 1, lastUsed: Date.now() };
  const entries = Object.entries(map);
  if (entries.length > MAX_STORED) {
    const sorted = entries.sort(([, a], [, b]) => score(b) - score(a));
    saveUsage(Object.fromEntries(sorted.slice(0, MAX_STORED)));
  } else {
    saveUsage(map);
  }
}

function score(e: UsageEntry): number {
  const ageMs = Date.now() - e.lastUsed;
  const recency = ageMs < 3_600_000 ? 3 : ageMs < 86_400_000 ? 1.5 : 1;
  return e.count * recency;
}

const FALLBACK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙌", "🔥"];

function getTopEmojis(n = 5): string[] {
  const map = loadUsage();
  const sorted = Object.entries(map)
    .sort(([, a], [, b]) => score(b) - score(a))
    .map(([emoji]) => emoji);
  const result: string[] = [];
  for (const e of sorted) { if (result.length >= n) break; result.push(e); }
  for (const e of FALLBACK_EMOJIS) {
    if (result.length >= n) break;
    if (!result.includes(e)) result.push(e);
  }
  return result;
}

// ── Position calculator ────────────────────────────────────────────────────────

function calcPos(
  triggerRect: DOMRect,
  mode: "quick" | "full"
): { top: number; left: number } {
  const popH = mode === "full" ? 330 : 52;
  const popW = mode === "full" ? 290 : 304;

  const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
  const spaceAbove = triggerRect.top - 8;
  const openAbove = spaceBelow < popH && spaceAbove >= popH;

  const top = openAbove
    ? triggerRect.top - popH - 4
    : Math.min(triggerRect.bottom + 4, window.innerHeight - popH - 8);

  const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - popW - 8));

  return { top, left };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EmojiReactionPickerProps {
  onReact: (emoji: string) => void;
  isOwn?: boolean;
  t: (key: string) => string;
}

export function EmojiReactionPicker({ onReact, isOwn, t }: EmojiReactionPickerProps) {
  const [open, setOpen] = useState<"quick" | "full" | null>(null);
  const [quickEmojis, setQuickEmojis] = useState<string[]>(FALLBACK_EMOJIS);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Track position + whether it's been positioned yet (to avoid flash at 0,0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open === "quick") setQuickEmojis(getTopEmojis(5));
  }, [open]);

  // useLayoutEffect fires synchronously after DOM mutations, before paint —
  // so the popover is positioned before the user ever sees it
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPos(calcPos(rect, open));
  }, [open]);

  // Re-calc on scroll or resize while open
  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos(calcPos(rect, open));
    };
    window.addEventListener("scroll", recalc, { passive: true, capture: true });
    window.addEventListener("resize", recalc, { passive: true });
    return () => {
      window.removeEventListener("scroll", recalc, { capture: true });
      window.removeEventListener("resize", recalc);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  const handlePick = useCallback((emoji: string) => {
    trackEmojiUse(emoji);
    onReact(emoji);
    setOpen(null);
  }, [onReact]);

  const handleEmojiPickerClick = useCallback((data: EmojiClickData) => {
    handlePick(data.emoji);
  }, [handlePick]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => (v ? null : "quick"))}
        className={`absolute -top-2.5 ${isOwn ? "left-2" : "right-2"} hidden group-hover:flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-0.5 shadow-sm text-muted-foreground hover:text-foreground transition-colors z-10`}
      >
        <SmilePlus className="w-3 h-3" />
      </button>

      {open && pos && (
        <Portal>
          <div
            ref={popoverRef}
            className="fixed z-[300] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
          >
            {open === "quick" && (
              <div className="flex items-center gap-0.5 p-2">
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handlePick(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-xl hover:scale-125 hover:bg-muted/50 rounded-lg transition-all"
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  onClick={() => setOpen("full")}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors text-xs font-bold"
                  title={t("chat.reactions.more")}
                >
                  ＋
                </button>
              </div>
            )}

            {open === "full" && (
              <EmojiPickerReact
                onEmojiClick={handleEmojiPickerClick}
                theme={Theme.DARK}
                lazyLoadEmojis
                skinTonesDisabled
                searchPlaceholder={t("chat.reactions.search")}
                width={290}
                height={330}
              />
            )}
          </div>
        </Portal>
      )}
    </>
  );
}
