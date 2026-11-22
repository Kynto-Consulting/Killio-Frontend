"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/portal";
import { EmojiPicker, type EmojiPickerProps } from "./EmojiPicker";

export type EmojiAnchor = HTMLElement | DOMRect | { top: number; left: number } | null;

export interface EmojiPickerPopoverProps extends Omit<EmojiPickerProps, "layout" | "className"> {
  /** Element (or rectangle / point) the popover opens next to. */
  anchor: EmojiAnchor;
  onClose: () => void;
}

const W = 352;
const H = 420;
const GAP = 6;

function rectOf(anchor: EmojiAnchor): { top: number; bottom: number; left: number } | null {
  if (!anchor) return null;
  if (anchor instanceof HTMLElement) { const r = anchor.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left }; }
  if ("bottom" in anchor) return { top: anchor.top, bottom: anchor.bottom, left: anchor.left };
  return { top: anchor.top, bottom: anchor.top, left: anchor.left };
}

/**
 * Floating emoji picker: placed next to the anchor (above when there is no room below), closed with Esc or a click
 * outside, and a bottom sheet under 640px. Focus goes back to the anchor element on close.
 */
export function EmojiPickerPopover({ anchor, onClose, ...pickerProps }: EmojiPickerPopoverProps) {
  const [isSheet, setIsSheet] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      const sheet = window.innerWidth < 640;
      setIsSheet(sheet);
      const r = rectOf(anchor);
      if (sheet || !r) { setPos(null); return; }
      const below = window.innerHeight - r.bottom - GAP;
      const top = below >= H || below >= r.top ? Math.min(r.bottom + GAP, window.innerHeight - H - 8) : Math.max(8, r.top - H - GAP);
      setPos({ top: Math.max(8, top), left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true, capture: true });
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, { capture: true }); };
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (anchor instanceof HTMLElement && anchor.contains(target)) return; // the trigger toggles it itself
      closeRef.current();
    };
    document.addEventListener("mousedown", down, true);
    const el = anchor instanceof HTMLElement ? anchor : null;
    return () => { document.removeEventListener("mousedown", down, true); el?.focus?.({ preventScroll: true }); };
  }, [anchor]);

  if (!isSheet && !pos) return <Portal>{null}</Portal>;

  return (
    <Portal>
      {isSheet ? (
        <div className="fixed inset-0 z-[1300] flex items-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div ref={boxRef} className="h-[70vh] w-full">
            <EmojiPicker {...pickerProps} onClose={onClose} layout="sheet" />
          </div>
        </div>
      ) : (
        <div ref={boxRef} className="fixed z-[1300]" style={{ top: pos!.top, left: pos!.left }}>
          <EmojiPicker {...pickerProps} onClose={onClose} />
        </div>
      )}
    </Portal>
  );
}
