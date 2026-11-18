"use client";

import { useEffect, useRef } from "react";

/** Elements that keep their own behaviour: pressing on them never starts a pan. */
const INTERACTIVE = 'button, a, input, textarea, select, label, [contenteditable="true"], [data-list-column], [role="dialog"], [data-no-pan]';

/**
 * Drag the empty area of a scrollable surface to move around it (like a canvas). Pressing on a list, a card, a button or a
 * field does nothing special, so cards still drag with the sortable sensors and text can still be selected.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = false;
    let startX = 0;
    let startY = 0;
    let left = 0;
    let top = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      left = el.scrollLeft;
      top = el.scrollTop;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      el.scrollLeft = left - (e.clientX - startX);
      el.scrollTop = top - (e.clientY - startY);
    };
    const up = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      el.releasePointerCapture?.(e.pointerId);
      el.style.cursor = "";
      el.style.userSelect = "";
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, []);
  return ref;
}
