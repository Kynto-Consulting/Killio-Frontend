"use client";

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { placePopover, type PopoverPlacement } from "@/lib/ui/popover-position";

/**
 * Keeps a fixed-position popover next to its anchor: inside the viewport (flipping above or shrinking when there is
 * no room) and following the anchor while any ancestor scrolls or the window / popover resizes.
 */
export function useAnchoredPopover(open: boolean, anchorRef: RefObject<HTMLElement | null>, popRef: RefObject<HTMLElement | null>, width = 520): PopoverPlacement {
  const [placement, setPlacement] = useState<PopoverPlacement>({ top: 0, left: 0, maxHeight: 480, side: "below" });

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const pop = popRef.current;
    // natural (unclamped) height of the content, so a popover that was shrunk can grow again when there is room
    const natural = pop ? pop.scrollHeight + (pop.offsetHeight - pop.clientHeight) : 320;
    const next = placePopover({ top: r.top, left: r.left, width: r.width, height: r.height }, { width: Math.min(width, window.innerWidth - 16), height: natural }, { width: window.innerWidth, height: window.innerHeight });
    setPlacement((cur) => (cur.top === next.top && cur.left === next.left && cur.maxHeight === next.maxHeight && cur.side === next.side ? cur : next));
  }, [anchorRef, popRef, width]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    // capture: scroll events do not bubble, so this also catches the editor's inner scroll container
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (popRef.current) ro?.observe(popRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [open, update, popRef]);

  return placement;
}
