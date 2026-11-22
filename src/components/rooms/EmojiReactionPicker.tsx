"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SmilePlus, Plus } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { Emoji, EmojiPickerPopover } from "@/components/emoji";
import { DEFAULT_QUICK_EMOJIS, getTopEmojis, trackEmojiUse } from "@/lib/emoji/usage";

// Usage tracking lives in lib/emoji/usage (same storage key as before); re-exported for existing importers.
export { trackEmojiUse };

function calcPos(triggerRect: DOMRect): { top: number; left: number } {
  const popH = 52;
  const popW = 304;
  const spaceBelow = window.innerHeight - triggerRect.bottom - 8;
  const spaceAbove = triggerRect.top - 8;
  const openAbove = spaceBelow < popH && spaceAbove >= popH;
  const top = openAbove ? triggerRect.top - popH - 4 : Math.min(triggerRect.bottom + 4, window.innerHeight - popH - 8);
  const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - popW - 8));
  return { top, left };
}

interface EmojiReactionPickerProps {
  onReact: (emoji: string) => void;
  isOwn?: boolean;
  t: (key: string) => string;
}

/** Quick row with the most used emojis; "+" opens the full Discord-style picker. */
export function EmojiReactionPicker({ onReact, t }: EmojiReactionPickerProps) {
  const [open, setOpen] = useState<"quick" | "full" | null>(null);
  const [quickEmojis, setQuickEmojis] = useState<string[]>(DEFAULT_QUICK_EMOJIS);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (open === "quick") setQuickEmojis(getTopEmojis(5));
  }, [open]);

  useLayoutEffect(() => {
    if (open !== "quick" || !triggerRef.current) { setPos(null); return; }
    const recalc = () => { if (triggerRef.current) setPos(calcPos(triggerRef.current.getBoundingClientRect())); };
    recalc();
    window.addEventListener("scroll", recalc, { passive: true, capture: true });
    window.addEventListener("resize", recalc, { passive: true });
    return () => { window.removeEventListener("scroll", recalc, { capture: true }); window.removeEventListener("resize", recalc); };
  }, [open]);

  useEffect(() => {
    if (open !== "quick") return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler, true); document.removeEventListener("keydown", esc); };
  }, [open]);

  const handlePick = useCallback((emoji: string) => {
    trackEmojiUse(emoji);
    onReact(emoji);
    setOpen(null);
  }, [onReact]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => (v ? null : "quick"))}
        aria-label={t("chat.reactions.add")}
        title={t("chat.reactions.add")}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <SmilePlus className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open === "quick" && pos && (
        <Portal>
          <div
            ref={popoverRef}
            role="toolbar"
            aria-label={t("chat.reactions.add")}
            className="fixed z-[300] flex items-center gap-0.5 rounded-2xl border border-border bg-card p-2 shadow-xl"
            style={{ top: pos.top, left: pos.left }}
          >
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handlePick(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-transform hover:scale-125 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                <Emoji value={emoji} size={22} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen("full")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              title={t("chat.reactions.more")}
              aria-label={t("chat.reactions.more")}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </Portal>
      )}

      {open === "full" && (
        <EmojiPickerPopover
          anchor={triggerRef.current}
          onClose={() => setOpen(null)}
          onSelect={(emoji, sel) => handlePick(sel.type === "custom" ? (sel.custom.reaction ?? `custom:${sel.custom.id}`) : emoji)}
        />
      )}
    </>
  );
}
