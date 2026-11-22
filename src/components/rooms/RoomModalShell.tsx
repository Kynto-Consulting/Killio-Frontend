"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/ui/portal";

interface RoomModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
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
 * focus goes to the first field and comes back to the opener. Soft look shared with the document dialogs.
 */
export function RoomModalShell({ open, onClose, title, subtitle, icon, children, footer, size = "md", closeLabel }: RoomModalShellProps) {
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
      <div className="fixed inset-0 z-[260] flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`flex max-h-[92vh] supports-[height:1dvh]:max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-2xl ${width}`}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-border/60 p-5">
            {icon && <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</div>}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-base font-semibold leading-tight text-foreground">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="shrink-0 rounded-md p-2 text-muted-foreground opacity-70 sm:p-1 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer ? <div className="shrink-0 border-t border-border/60 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Shared look of text fields and buttons inside the rooms forms (same tokens as roles/ui.tsx). */
export const roomField =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";
export const roomPrimaryButton =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 sm:h-9 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
export const roomGhostButton =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-input sm:h-9 bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
export const roomDangerButton =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-red-600 sm:h-9 px-5 text-xs font-semibold text-white transition-colors hover:bg-red-600/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none";
export const roomLabel = "mb-1 block text-xs font-medium text-muted-foreground";
