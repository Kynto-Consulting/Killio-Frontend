export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PopoverPlacement {
  top: number;
  left: number;
  /** Space the popover may use vertically; the content scrolls inside when it is taller. */
  maxHeight: number;
  side: "below" | "above";
}

/**
 * Places a popover next to an anchor, inside the viewport. Prefers below the anchor; flips above when below has less
 * room than the popover needs and above has more; otherwise it stays below and gets a smaller max height. Horizontally
 * it aligns to the anchor's left edge and slides back inside the viewport. Pure so it can be tested.
 */
export function placePopover(anchor: Box, pop: { width: number; height: number }, viewport: { width: number; height: number }, gap = 6, pad = 8): PopoverPlacement {
  const spaceBelow = viewport.height - (anchor.top + anchor.height) - gap - pad;
  const spaceAbove = anchor.top - gap - pad;
  const side: "below" | "above" = pop.height <= spaceBelow || spaceBelow >= spaceAbove ? "below" : "above";
  const room = Math.max(120, side === "below" ? spaceBelow : spaceAbove);
  const height = Math.min(pop.height, room);
  const top = side === "below" ? anchor.top + anchor.height + gap : anchor.top - gap - height;
  const width = Math.min(pop.width, viewport.width - pad * 2);
  const left = Math.max(pad, Math.min(anchor.left, viewport.width - width - pad));
  return {
    top: Math.max(pad, Math.min(top, viewport.height - height - pad)),
    left,
    maxHeight: room,
    side,
  };
}
