"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Info, Wrench } from "lucide-react";

/**
 * "TOOL CALL RAW" info popover of a tool event. Rendered in a portal with fixed positioning clamped to the viewport, so it is
 * never cut by the panel (overflow) or the screen edge, and flips below the icon when there is no room above.
 */
export function ToolRawPopover({ input }: { input: unknown }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const open = useCallback(() => {
    cancel();
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    const above = r.top > 220;
    setPos({ left, top: above ? r.top - 6 : r.bottom + 6, above });
  }, []);
  const close = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setPos(null), 120);
  }, []);
  useEffect(() => cancel, []);
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pos]);

  const json = JSON.stringify(input ?? {}, null, 2);
  return (
    <span ref={anchor} className="relative ml-auto inline-flex shrink-0" onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
      <button type="button" aria-label="Tool call details" className="rounded outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Info className="h-2.5 w-2.5 cursor-help text-muted-foreground transition-colors hover:text-primary" aria-hidden />
      </button>
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              onMouseEnter={cancel}
              onMouseLeave={close}
              className="fixed z-[300] w-[320px] max-w-[calc(100vw-16px)] rounded-lg border border-neutral-800 bg-neutral-900 p-2 shadow-xl"
              style={{ left: pos.left, top: pos.top, transform: pos.above ? "translateY(-100%)" : undefined }}
            >
              <div className="mb-1 flex items-center justify-between font-mono text-[9px] text-primary">
                <span className="flex items-center gap-1">
                  <Wrench className="h-2 w-2" aria-hidden />
                  TOOL CALL RAW
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard?.writeText(json);
                  }}
                  className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-violet-400"
                  title="Copy JSON"
                >
                  <Copy className="h-2 w-2" aria-hidden />
                </button>
              </div>
              <pre className="custom-scrollbar max-h-[160px] overflow-y-auto whitespace-pre-wrap break-all font-mono text-[9px] text-neutral-300">{json}</pre>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
