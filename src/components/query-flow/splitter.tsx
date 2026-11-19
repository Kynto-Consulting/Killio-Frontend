"use client";

import { useRef } from "react";

import { resizeFromDrag, type PaneKey } from "@/lib/query-flow/layout-state";
import { cn } from "@/lib/utils";

/**
 * A drag handle between two panes. `grow` is +1 when moving right / down makes the pane bigger (the pane is on the left /
 * top of the handle) and -1 when it makes it smaller. The clamping is `resizeFromDrag` (pure, tested).
 */
export function Splitter({
  orientation,
  paneKey,
  size,
  grow,
  onResize,
  label,
  available,
}: {
  orientation: "vertical" | "horizontal";
  paneKey: PaneKey;
  size: number;
  grow: 1 | -1;
  onResize: (size: number) => void;
  label: string;
  available?: () => number | undefined;
}) {
  const start = useRef<{ pointer: number; size: number } | null>(null);
  const vertical = orientation === "vertical";
  const point = (e: { clientX: number; clientY: number }) => (vertical ? e.clientX : e.clientY);
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={size}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pointer: point(e), size };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onResize(resizeFromDrag(paneKey, start.current.size, point(e) - start.current.pointer, grow, available?.()));
      }}
      onPointerUp={(e) => {
        start.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const keys = vertical ? { less: "ArrowLeft", more: "ArrowRight" } : { less: "ArrowUp", more: "ArrowDown" };
        if (e.key === keys.less) { e.preventDefault(); onResize(resizeFromDrag(paneKey, size, -step, grow, available?.())); }
        if (e.key === keys.more) { e.preventDefault(); onResize(resizeFromDrag(paneKey, size, step, grow, available?.())); }
      }}
      className={cn(
        "shrink-0 touch-none bg-border transition-colors hover:bg-primary/50 focus-visible:bg-primary/60 focus-visible:outline-none",
        vertical ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
      )}
    />
  );
}
