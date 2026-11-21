"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnchoredPopover } from "@/hooks/use-anchored-popover";
import { AlertTriangle, Check, Copy, Database, Pencil, RefreshCw } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Portal } from "./portal";
import type { KqlTable } from "@/lib/query/kql";
import { formatKqlResult, kqlResultToPlainText, type KqlPillFormatted } from "@/lib/kql-pill/format";
import { buildKqlPillToken, type KqlPillMode } from "@/lib/kql-pill/token";
import { useKqlPillResult } from "@/lib/kql-pill/use-kql-pill-result";
import { KqlPillDialog } from "./kql-pill-dialog";

export interface KqlPillProps {
  script: string;
  mode: KqlPillMode;
  label: string;
  /** Tables of the open document: lets scripts over them run locally. */
  tables?: KqlTable[];
  /** Editors can change the query from the popover. */
  editable?: boolean;
  /** Receives the new `@[kql:...]` token after an edit. */
  onChangeToken?: (token: string) => void;
  /** false: never run the query (read-only/public contexts); shows the label. */
  live?: boolean;
}

const CHIP = "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-100";
const ERR_CHIP = "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200";

function CompactTable({ f, moreLabel }: { f: KqlPillFormatted; moreLabel: string }) {
  return (
    <span className="block max-w-full overflow-x-auto">
      <table className="border-collapse text-[11px] leading-tight">
        <thead>
          <tr>
            {f.header.map((h, i) => (
              <th key={i} className="border border-border bg-muted px-1.5 py-0.5 text-left font-semibold text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {f.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border border-border bg-card px-1.5 py-0.5 text-foreground">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {f.hiddenRows > 0 ? <span className="mt-0.5 block text-[10px] text-muted-foreground">{moreLabel}</span> : null}
    </span>
  );
}

export function KqlPill({ script, mode, label, tables, editable, onChangeToken, live = true }: KqlPillProps) {
  const t = useTranslations("kql");
  const { state, refresh, canRun } = useKqlPillResult(script, { tables, enabled: live });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPopover(open, triggerRef, popRef);

  const outcome = state.status === "ok" ? state.outcome : null;
  const formatted = useMemo(() => (outcome ? formatKqlResult(outcome.result, mode) : null), [outcome, mode]);
  const popFormatted = useMemo(() => (outcome ? formatKqlResult(outcome.result, "table", 100) : null), [outcome]);
  const canEdit = Boolean(editable && onChangeToken);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copy = useCallback(async () => {
    if (!outcome) return;
    try {
      await navigator.clipboard.writeText(kqlResultToPlainText(outcome.result, mode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [outcome, mode]);

  // Read-only / signed-out: nothing to run, show the label.
  if (!live || (!canRun && state.status === "idle")) {
    return (
      <span
        data-kql-static
        title={script}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 align-baseline text-[0.9em] font-medium text-foreground"
      >
        <Database className="h-3 w-3 text-muted-foreground" aria-hidden />
        {label}
      </span>
    );
  }

  const isBlock = mode === "table" || mode === "list";
  const more = formatted && formatted.hiddenRows > 0 ? t("pill.more", { count: formatted.hiddenRows }) : "";

  let body: React.ReactNode;
  if (state.status === "error") {
    body = (
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        <span>{t("pill.error")}</span>
      </span>
    );
  } else if (!formatted) {
    body = <span aria-label={t("pill.loading")} className="inline-block h-3.5 w-10 animate-pulse rounded bg-muted align-middle" />;
  } else if (formatted.kind === "table") {
    body = formatted.empty ? <span className="text-muted-foreground">{t("pill.empty")}</span> : <CompactTable f={formatted} moreLabel={more} />;
  } else if (formatted.kind === "list" && !formatted.empty) {
    body = (
      <span className="block">
        <ul className="m-0 list-disc pl-4 text-[0.95em]">
          {formatted.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
        {more ? <span className="block text-[10px] text-muted-foreground">{more}</span> : null}
      </span>
    );
  } else {
    body = <span className="font-semibold tabular-nums">{formatted.text}</span>;
  }

  const refreshing = state.status === "loading" || (state.status === "ok" && state.refreshing);
  const title = state.status === "error" ? `${state.error.message}${state.error.position !== undefined ? ` (${state.error.position})` : ""}` : `${label} · ${script}`;

  return (
    <>
      <span
        ref={triggerRef as React.RefObject<HTMLSpanElement>}
        role="button"
        tabIndex={0}
        data-kql-pill
        title={title}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className={`group relative mx-0.5 cursor-pointer rounded-md border px-1.5 py-0.5 text-[0.95em] leading-snug ${isBlock ? "inline-block align-top" : "inline-flex items-center gap-1 align-baseline"} ${state.status === "error" ? ERR_CHIP : CHIP}`}
      >
        {body}
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("pill.refresh")}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); refresh(); }}
          className={`absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 ${refreshing ? "opacity-100" : ""}`}
        >
          <RefreshCw className={`h-2.5 w-2.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </span>

      {open && (
        <Portal>
          <div
            ref={popRef}
            role="dialog"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="fixed z-[180] w-[min(520px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-border bg-card p-3 text-foreground shadow-2xl"
            style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-sky-700 dark:text-sky-300" aria-hidden />
              <div className="min-w-0 flex-1 truncate text-sm font-semibold">{label || t("pill.queryResult")}</div>
              {outcome ? <span className="text-[10px] text-muted-foreground">{t("pill.matched", { matched: outcome.result.matched })}</span> : null}
            </div>
            {outcome?.result.scope ? (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground" title={t("pill.scopeHint")}>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-foreground">
                  {t("pill.scope", { label: outcome.result.scope.label === "whole team" ? t("pill.scopeTeam") : outcome.result.scope.label })}
                </span>
                <span>{t("pill.scopeCount", { cards: outcome.result.scope.cards, matched: outcome.result.matched })}</span>
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className={`mb-2 rounded-md border px-2 py-1.5 text-xs ${ERR_CHIP}`}>
                {state.error.message}
                {state.error.position !== undefined ? <div className="opacity-80">{t("pill.errorAt", { position: state.error.position })}</div> : null}
              </div>
            ) : popFormatted ? (
              <div className="mb-2 max-h-64 overflow-auto">
                {popFormatted.empty ? <div className="text-xs text-muted-foreground">{t("pill.empty")}</div> : <CompactTable f={popFormatted} moreLabel={t("pill.more", { count: popFormatted.hiddenRows })} />}
              </div>
            ) : (
              <div className="mb-2 h-6 w-24 animate-pulse rounded bg-muted" />
            )}

            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("pill.script")}</div>
            <pre className="mb-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">{script}</pre>

            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={copy} disabled={!outcome} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? t("pill.copied") : t("pill.copyText")}
              </button>
              <button type="button" onClick={refresh} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted">
                <RefreshCw className="h-3 w-3" />
                {t("pill.refresh")}
              </button>
              {canEdit ? (
                <button type="button" onClick={() => { setOpen(false); setEditing(true); }} className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                  <Pencil className="h-3 w-3" />
                  {t("pill.edit")}
                </button>
              ) : null}
            </div>
          </div>
        </Portal>
      )}

      {editing && canEdit ? (
        <KqlPillDialog
          open
          initial={{ script, mode, label }}
          tables={tables}
          onClose={() => setEditing(false)}
          onSubmit={(spec) => {
            setEditing(false);
            try { onChangeToken!(buildKqlPillToken(spec.script, spec.mode, spec.label)); } catch { /* validated by the dialog */ }
          }}
        />
      ) : null}
    </>
  );
}
