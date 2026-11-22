"use client";

/** Small pieces shared by the profile card and the moderator view. */

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { SHEET_MAX_WIDTH, type Presence } from "@/lib/rooms/user-profile";

/** Under 640px the card and the moderator view are bottom sheets. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(max-width: ${SHEET_MAX_WIDTH}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

export const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Keeps Tab inside `root`. Call from the onKeyDown of the dialog element. */
export function trapTab(e: React.KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Solid status dot (never translucent): online, in a call, offline. */
export function PresenceDot({ presence, label, size = "md" }: { presence: Presence; label: string; size?: "md" | "sm" }) {
  const tone = presence === "in-call" ? "bg-sky-500" : presence === "online" ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500";
  return <span role="img" aria-label={label} className={`absolute rounded-full border-[3px] border-card ${tone} ${size === "md" ? "-bottom-0.5 -right-0.5 h-[18px] w-[18px]" : "-bottom-0.5 -right-0.5 h-3.5 w-3.5 border-2"}`} />;
}

export const BotBadge = ({ label }: { label: string }) => (
  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-violet-500/15 px-1 text-[10px] font-bold uppercase tracking-tight text-violet-700 dark:text-violet-300">
    <Bot className="h-2.5 w-2.5" aria-hidden />{label}
  </span>
);

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {["w-full", "w-4/5", "w-2/3", "w-3/4"].slice(0, lines).map((w) => <div key={w} className={`h-3 ${w} animate-pulse rounded bg-muted motion-reduce:animate-none`} />)}
    </div>
  );
}

/** Accessible tooltip for an icon button: shown on hover and keyboard focus, wired with aria-describedby. */
export function Tip({ id, text }: { id: string; text: string }) {
  return (
    <span id={id} role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-md border border-border/50 bg-popover px-2 py-1 text-[11px] font-medium text-popover-foreground shadow-md group-hover/tip:block group-focus-within/tip:block">
      {text}
    </span>
  );
}
