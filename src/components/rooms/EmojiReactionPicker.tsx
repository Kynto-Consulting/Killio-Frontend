"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EmojiPickerReact, { EmojiClickData, Theme } from "emoji-picker-react";
import { SmilePlus } from "lucide-react";
import { Portal } from "@/components/ui/portal";

// ── Usage tracking ────────────────────────────────────────────────────────────

const STORAGE_KEY = "emoji_reaction_usage";
const MAX_STORED = 100;

interface UsageEntry { count: number; lastUsed: number; }
type UsageMap = Record<string, UsageEntry>;

function loadUsage(): UsageMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveUsage(map: UsageMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function trackEmojiUse(emoji: string) {
  const map = loadUsage();
  const now = Date.now();
  map[emoji] = { count: (map[emoji]?.count ?? 0) + 1, lastUsed: now };
  // Trim to MAX_STORED by score descending
  const entries = Object.entries(map);
  if (entries.length > MAX_STORED) {
    const sorted = entries.sort(([, a], [, b]) => score(b) - score(a));
    const trimmed = Object.fromEntries(sorted.slice(0, MAX_STORED));
    saveUsage(trimmed);
  } else {
    saveUsage(map);
  }
}

function score(e: UsageEntry): number {
  const ageMs = Date.now() - e.lastUsed;
  const hourAgo = 3_600_000;
  const dayAgo = 86_400_000;
  const recency = ageMs < hourAgo ? 3 : ageMs < dayAgo ? 1.5 : 1;
  return e.count * recency;
}

const FALLBACK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙌", "🔥"];

function getTopEmojis(n = 5): string[] {
  const map = loadUsage();
  const sorted = Object.entries(map)
    .sort(([, a], [, b]) => score(b) - score(a))
    .map(([emoji]) => emoji);

  const result: string[] = [];
  for (const e of sorted) {
    if (result.length >= n) break;
    result.push(e);
  }
  // Fill remainder with fallbacks not already included
  for (const e of FALLBACK_EMOJIS) {
    if (result.length >= n) break;
    if (!result.includes(e)) result.push(e);
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EmojiReactionPickerProps {
  onReact: (emoji: string) => void;
  isOwn?: boolean;
}

export function EmojiReactionPicker({ onReact, isOwn }: EmojiReactionPickerProps) {
  const [open, setOpen] = useState<"quick" | "full" | null>(null);
  const [quickEmojis, setQuickEmojis] = useState<string[]>(FALLBACK_EMOJIS);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Load personalized quick emojis once on open
  useEffect(() => {
    if (open === "quick") setQuickEmojis(getTopEmojis(5));
  }, [open]);

  // Position popover near trigger
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 360),
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(null);
      }
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

      {open && (
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
                  title="More emojis"
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
                searchPlaceholder="Search emoji..."
                width={320}
                height={380}
              />
            )}
          </div>
        </Portal>
      )}
    </>
  );
}
