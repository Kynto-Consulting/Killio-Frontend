"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/ui/portal";

interface RoomModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** `md` fits a form, `lg` the permission editor. */
  size?: "sm" | "md" | "lg";
  closeLabel: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Dialog used by every rooms form: bottom sheet on phones, centred card elsewhere. Escape closes, Tab stays inside,
 * focus goes to the first field and comes back to the opener. Corporate Memphis: hard line and soft offset shadow.
 */
export function RoomModalShell({ open, onClose, title, icon, children, footer, size = "md", closeLabel }: RoomModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea");
      (first ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      opener.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "sm:max-w-xs" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md";

  return (
    <Portal>
      <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border-2 border-[var(--memphis-line)] bg-card text-card-foreground shadow-[4px_4px_0_0_var(--memphis-shadow)] sm:rounded-2xl ${width}`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-[var(--memphis-line)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {icon}
              <h2 id={titleId} className="truncate text-sm font-bold">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] motion-reduce:transition-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="shrink-0 border-t-2 border-[var(--memphis-line)] bg-muted/30 px-4 py-3">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Shared look of text fields and buttons inside the rooms forms. */
export const roomField =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]";
export const roomPrimaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--memphis-line)] bg-[hsl(var(--accent-ink))] px-4 py-2 text-sm font-bold text-[hsl(var(--accent-ink-fg))] shadow-[2px_2px_0_0_var(--memphis-shadow)] transition-[transform,box-shadow] hover:-translate-x-px hover:-translate-y-px hover:shadow-[3px_3px_0_0_var(--memphis-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0";
export const roomGhostButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-50 motion-reduce:transition-none";
export const roomLabel = "mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground";
