"use client";

import { KqlInput } from "@/components/ui/kql-input";
import { buildKqlSchema } from "@/lib/query/kql-complete";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Workflow, X } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Portal } from "./portal";
import { QueryFlowDialog } from "@/components/query-flow";
import { KQL_SYNTAX_GUIDE, type KqlTable } from "@/lib/query/kql";
import { kqlGuideExamples, KQL_PILL_STARTERS } from "@/lib/kql-pill/examples";
import { formatKqlResult } from "@/lib/kql-pill/format";
import { checkKqlPillSyntax } from "@/lib/kql-pill/runner";
import { useKqlPillResult } from "@/lib/kql-pill/use-kql-pill-result";
import {
  defaultKqlPillLabel,
  KQL_PILL_MAX_LABEL,
  KQL_PILL_MAX_SCRIPT,
  KQL_PILL_MODES,
  validateKqlPill,
  type KqlPillMode,
  type KqlPillSpec,
} from "@/lib/kql-pill/token";

export interface KqlPillDialogProps {
  open: boolean;
  initial?: Partial<KqlPillSpec>;
  tables?: KqlTable[];
  onClose: () => void;
  onSubmit: (spec: KqlPillSpec) => void;
}

const VALIDATION_KEYS: Record<string, string> = {
  "empty-script": "pill.emptyScript",
  "script-too-long": "pill.scriptTooLong",
  "label-too-long": "pill.labelTooLong",
  "label-bracket": "pill.labelBracket",
  "bad-unicode": "pill.badUnicode",
};

function Preview({ script, mode, tables, enabled }: { script: string; mode: KqlPillMode; tables?: KqlTable[]; enabled: boolean }) {
  const t = useTranslations("kql");
  const { state, canRun } = useKqlPillResult(script, { tables, enabled, debounceMs: 450 });
  const f = useMemo(() => (state.status === "ok" ? formatKqlResult(state.outcome.result, mode) : null), [state, mode]);

  if (!enabled) return <div className="text-xs text-muted-foreground">{t("pill.previewIdle")}</div>;
  if (!canRun) return <div className="text-xs text-muted-foreground">{t("pill.noSession")}</div>;
  if (state.status === "error") {
    return (
      <div className="flex items-start gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-800 dark:text-red-200">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <span>{state.error.message}</span>
      </div>
    );
  }
  if (!f) return <div className="h-5 w-24 animate-pulse rounded bg-muted" aria-label={t("pill.loading")} />;
  if (f.kind === "table") {
    return f.empty ? <div className="text-xs text-muted-foreground">{t("pill.empty")}</div> : (
      <div className="max-h-40 overflow-auto">
        <table className="border-collapse text-[11px]">
          <thead><tr>{f.header.map((h, i) => <th key={i} className="border border-border bg-muted px-1.5 py-0.5 text-left font-semibold text-foreground">{h}</th>)}</tr></thead>
          <tbody>{f.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border border-border bg-card px-1.5 py-0.5 text-foreground">{c}</td>)}</tr>)}</tbody>
        </table>
        {f.hiddenRows > 0 ? <div className="text-[10px] text-muted-foreground">{t("pill.more", { count: f.hiddenRows })}</div> : null}
      </div>
    );
  }
  if (f.kind === "list" && !f.empty) {
    return (
      <div className="max-h-40 overflow-auto">
        <ul className="m-0 list-disc pl-4 text-sm text-foreground">{f.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        {f.hiddenRows > 0 ? <div className="text-[10px] text-muted-foreground">{t("pill.more", { count: f.hiddenRows })}</div> : null}
      </div>
    );
  }
  return <div className="text-sm font-semibold tabular-nums text-foreground">{f.text}</div>;
}

export function KqlPillDialog({ open, initial, tables, onClose, onSubmit }: KqlPillDialogProps) {
  const t = useTranslations("kql");
  const tf = useTranslations("query-flow");
  const [visualOpen, setVisualOpen] = useState(false);
  // The editor opens inside the content area; this dialog stays mounted (keeps its draft) but hidden meanwhile.
  const [editorShown, setEditorShown] = useState(false);
  const [script, setScript] = useState(initial?.script ?? "");
  const [mode, setMode] = useState<KqlPillMode>(initial?.mode ?? "value");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [labelTouched, setLabelTouched] = useState(Boolean(initial?.label));
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setScript(initial?.script ?? "");
    setMode(initial?.mode ?? "value");
    setLabel(initial?.label ?? "");
    setLabelTouched(Boolean(initial?.label));
    const id = setTimeout(() => areaRef.current?.focus(), 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const examples = useMemo(() => kqlGuideExamples(KQL_SYNTAX_GUIDE, 6), []);
  const pillSchema = useMemo(() => buildKqlSchema({ mode: "script", tables: (tables ?? []).map((tb) => ({ title: tb.title, columns: tb.columns })) }), [tables]);
  const syntaxError = useMemo(() => (script.trim() ? checkKqlPillSyntax(script) : null), [script]);
  const effectiveLabel = labelTouched ? label : defaultKqlPillLabel(script);
  const invalid = validateKqlPill(script, mode, effectiveLabel);
  const canSubmit = !invalid && !syntaxError;

  if (!open) return null;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ script, mode, label: effectiveLabel });
  };

  const modeLabel: Record<KqlPillMode, string> = {
    value: t("pill.modeValue"),
    list: t("pill.modeList"),
    table: t("pill.modeTable"),
    count: t("pill.modeCount"),
  };

  return (
    <Portal>
      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center p-3 ${editorShown ? "hidden" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
      >
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div role="dialog" aria-modal="true" className="relative flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4 text-foreground shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("pill.dialogTitle")}</h2>
            <button type="button" onClick={onClose} aria-label={t("pill.cancel")} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>{t("pill.script")}</span>
              <button type="button" onClick={() => setVisualOpen(true)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground hover:bg-muted">
                <Workflow className="h-3.5 w-3.5" aria-hidden />
                {tf("graph.visualEditor")}
              </button>
            </div>
            <KqlInput
              multiline
              rows={4}
              autoFocus
              ariaLabel={t("pill.script")}
              value={script}
              onChange={(next) => setScript(next.slice(0, KQL_PILL_MAX_SCRIPT + 200))}
              schema={pillSchema}
              error={syntaxError ? { message: syntaxError.message, position: syntaxError.position ?? 0 } : null}
              placeholder={t("pill.scriptPlaceholder")}
              className="text-xs"
            />
          </div>
          {syntaxError ? (
            <div className="-mt-1 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{syntaxError.message}{syntaxError.position !== undefined ? ` · ${t("pill.errorAt", { position: syntaxError.position })}` : ""}</span>
            </div>
          ) : invalid && invalid !== "empty-script" && VALIDATION_KEYS[invalid] ? (
            <div className="-mt-1 text-xs text-red-700 dark:text-red-300">{t(VALIDATION_KEYS[invalid], { max: invalid === "label-too-long" ? KQL_PILL_MAX_LABEL : KQL_PILL_MAX_SCRIPT })}</div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("pill.examples")}</span>
            <div className="flex flex-wrap gap-1">
              {KQL_PILL_STARTERS.map((s) => (
                <button key={s.script} type="button" onClick={() => { setScript(s.script); setMode(s.mode); }} className="max-w-full truncate rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground hover:bg-muted/70" title={s.script}>
                  {s.script}
                </button>
              ))}
              {examples.map((ex) => (
                <button key={ex} type="button" onClick={() => setScript(ex)} className="max-w-full truncate rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground" title={ex}>
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t("pill.mode")}</span>
              <div role="radiogroup" className="inline-flex overflow-hidden rounded-md border border-border">
                {KQL_PILL_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={`flex-1 px-2 py-1 text-xs ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
                  >
                    {modeLabel[m]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t("pill.label")}
              <input
                value={effectiveLabel}
                onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
                maxLength={KQL_PILL_MAX_LABEL + 20}
                placeholder={t("pill.labelPlaceholder")}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{t("pill.preview")}</span>
            <div className="min-h-[2rem] rounded-md border border-border bg-background p-2">
              <Preview script={script} mode={mode} tables={tables} enabled={Boolean(script.trim()) && !syntaxError} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-muted">{t("pill.cancel")}</button>
            <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {initial?.script ? t("pill.save") : t("pill.insert")}
            </button>
          </div>
        </div>
      </div>
      <QueryFlowDialog
        open={visualOpen}
        initialScript={script}
        tables={tables ?? []}
        onApply={({ script: compiled }) => { setScript(compiled.slice(0, KQL_PILL_MAX_SCRIPT + 200)); setVisualOpen(false); }}
        onClose={() => setVisualOpen(false)}
        onOpenChange={setEditorShown}
      />
    </Portal>
  );
}
