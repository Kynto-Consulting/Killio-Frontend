"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

interface RoomsLayoutProps {
  sidebar: (onClose: () => void) => React.ReactNode;
  /** Receives `openSidebar`, so the channel header can hold the menu button on phones (no extra bar). */
  children: React.ReactNode | ((api: { openSidebar: () => void }) => React.ReactNode);
  /** Label of the drawer for screen readers (already translated). */
  drawerLabel?: string;
}

/**
 * Two columns on desktop (channel bar + content); on phones the channel bar is a drawer. The drawer closes with Escape or
 * a tap outside, and the page behind it is not reachable while it is open.
 */
export function RoomsLayout({ sidebar, children, drawerLabel = "Channels" }: RoomsLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setDrawerOpen(false), []);
  const open = useCallback(() => setDrawerOpen(true), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>("a[href], button, input")?.focus());
    return () => { document.removeEventListener("keydown", onKey); cancelAnimationFrame(frame); };
  }, [drawerOpen]);

  return (
    <div className="relative flex h-full overflow-hidden">
      {drawerOpen && (
        <button type="button" tabIndex={-1} aria-hidden className="fixed inset-0 z-40 cursor-default bg-black/50 lg:hidden" onClick={close} />
      )}

      <div
        ref={drawerRef}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? drawerLabel : undefined}
        className={[
          "fixed inset-y-0 left-0 z-50 max-w-[85vw] pt-[env(safe-area-inset-top)] lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:pt-0",
          "transition-transform duration-200 ease-out motion-reduce:transition-none lg:transition-none",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {sidebar(close)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {typeof children === "function" ? (
          children({ openSidebar: open })
        ) : (
          <>
            {/* Plain children (pages without their own header): a slim bar holds the menu button on phones. */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 px-3 py-2 lg:hidden">
              <button
                type="button"
                onClick={open}
                aria-label={drawerLabel}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"
              >
                <Menu className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {children}
          </>
        )}
      </div>
    </div>
  );
}
