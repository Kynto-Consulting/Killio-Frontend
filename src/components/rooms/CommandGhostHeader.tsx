"use client";

/**
 * The "ghost" of a slash command, Discord style: a small line above the bot's answer ("Ana used /hola"). The command itself is never a
 * message. Pressing the line opens a soft popover with the command, who used it, when and the parameters (a bottom sheet under 640px).
 * Pure rules (reading the metadata, placement) are in lib/rooms/command-ghost.ts.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownRight, X } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { formatInvokedAt, popoverPosition, type CommandGhost } from "@/lib/rooms/command-ghost";

const PANEL_WIDTH = 288;

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function CommandGhostHeader({ ghost, className = "" }: { ghost: CommandGhost; className?: string }) {
  const t = useTranslations("rooms");
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Desktop placement: measured once the panel exists; follows resize and scroll while open.
  useLayoutEffect(() => {
    if (!open || narrow) return;
    const place = () => {
      const a = buttonRef.current?.getBoundingClientRect();
      const p = panelRef.current?.getBoundingClientRect();
      if (!a) return;
      const next = popoverPosition(a, { width: PANEL_WIDTH, height: p?.height ?? 180 }, { width: window.innerWidth, height: window.innerHeight });
      setPos({ left: next.left, top: next.top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, narrow]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  const when = ghost.invokedAt ? formatInvokedAt(ghost.invokedAt, locale) : "";
  const who = ghost.invokerName || t("bot.command.someone");

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={narrow ? true : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="command-ghost-popover"
      style={narrow ? undefined : { left: pos?.left ?? 0, top: pos?.top ?? 0, width: PANEL_WIDTH, visibility: pos ? "visible" : "hidden" }}
      className={
        narrow
          ? "fixed inset-x-0 bottom-0 z-[320] max-h-[70vh] overflow-y-auto rounded-t-2xl border border-b-0 border-border/50 bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-sm text-foreground shadow-xl outline-none motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
          : "fixed z-[320] rounded-xl border border-border/50 bg-card p-3 text-sm text-foreground shadow-lg outline-none motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      }
    >
      {narrow && <span className="mx-auto mb-2 block h-1 w-9 rounded-full bg-border" aria-hidden />}
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id={titleId} className="min-w-0 truncate font-mono text-[13px] font-semibold">/{ghost.commandName}</h3>
        <button
          type="button"
          onClick={close}
          aria-label={t("bot.command.close")}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="text-muted-foreground">{t("bot.command.usedBy")}</dt>
        <dd className="min-w-0 truncate font-medium">{who}</dd>
        {when && (
          <>
            <dt className="text-muted-foreground">{t("bot.command.when")}</dt>
            <dd className="min-w-0 truncate">{when}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("bot.command.params")}</dt>
        <dd className="min-w-0">
          {ghost.params.length === 0 ? (
            <span className="text-muted-foreground">{t("bot.command.noParams")}</span>
          ) : (
            <ul className="space-y-0.5">
              {ghost.params.map((p, i) => (
                <li key={`${p.name}-${i}`} className="break-words font-mono text-[11px]">
                  <span className="text-muted-foreground">{p.name}:</span> {p.value}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="command-ghost"
        className={`mb-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none ${className}`}
      >
        <CornerDownRight className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground/80">{who}</span> {t("bot.command.used")} <span className="font-mono font-medium text-primary/90">/{ghost.commandName}</span>
        </span>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className={`fixed inset-0 z-[310] ${narrow ? "bg-foreground/20" : "bg-transparent"}`} onClick={close} aria-hidden data-testid="command-ghost-backdrop" />
            {panel}
          </>,
          document.body,
        )}
    </>
  );
}
