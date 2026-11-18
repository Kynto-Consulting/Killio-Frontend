"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpDown, Bookmark, Check, ChevronDown, Filter, Layers, Pencil, Trash2, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import type { FilterIssue } from "@/lib/boards/apply-filters";
import { appendCondition, buildExpression, parseQuickFromExpression, type QuickFilters } from "@/lib/boards/quick-filters";
import { describeSort, normalizeSortRules, type SortRule, type TagGroup } from "@/lib/boards/sorting";
import type { SavedView } from "@/lib/boards/view-storage";
import { SortRulesEditor, sortKeyLabel } from "./sort-rules-editor";
import type { AvailableTag } from "./tag-groups-modal";

/** Examples shown as chips. They are KQL, not translated (the language keywords work in Spanish as well). */
const EXAMPLES = [
  "done and assignee = me",
  "overdue",
  "due in next 7d",
  "due between 2026-03-01 and 2026-03-31",
  "title ~ /^bug/",
  "tag = #urgent",
  'list = "En QA" and not done',
];

const chipBase = "h-7 px-2.5 inline-flex items-center gap-1 rounded-full border text-xs font-medium transition-colors whitespace-nowrap";
const chipOff = "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground";
const chipOn = "border-accent/40 bg-accent/10 text-accent";

function Popover({ label, active, icon, children, align = "left" }: { label: string; active?: boolean; icon?: ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${chipBase} ${active || open ? chipOn : chipOff}`} aria-expanded={open}>
        {icon}
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open ? (
        <div className={`absolute top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 text-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>{children}</div>
      ) : null}
    </div>
  );
}

const inputCls = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";

export interface BoardFilterBarProps {
  expression: string;
  onExpressionChange: (expression: string) => void;
  error: FilterIssue | null;
  total: number;
  shown: number;
  tags: AvailableTag[];
  groups: Array<{ id: string; name: string }>;
  savedViews: SavedView[];
  onSaveView: (name: string, expression: string) => void;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
  boardSort: SortRule[];
  onBoardSortChange: (rules: SortRule[]) => void;
  tagGroups: TagGroup[];
  onOpenTagGroups: () => void;
  /** Phones: one column, bigger touch targets. */
  compact?: boolean;
}

/**
 * Filter bar of a board: one KQL expression (the source of truth, validated live) plus quick filters that write into it.
 * Quick-filter chips light up only when the text is exactly what they would have written; custom KQL is never rewritten
 * (a chip then appends its condition with `and`).
 */
export function BoardFilterBar(props: BoardFilterBarProps) {
  const { expression, onExpressionChange, error, total, shown, tags, groups, savedViews, boardSort, tagGroups } = props;
  const t = useTranslations("board-filters");
  const quick = useMemo(() => parseQuickFromExpression(expression), [expression]);
  const isCustom = quick === null;
  const active = expression.trim().length > 0;
  const [showExamples, setShowExamples] = useState(false);

  /** Merge a change into the quick state, or append it when the text is custom KQL. */
  const apply = (patch: Partial<QuickFilters>) => {
    if (quick) onExpressionChange(buildExpression({ ...quick, ...patch }));
    else {
      const term = buildExpression(patch);
      if (term) onExpressionChange(appendCondition(expression, term));
    }
  };
  const q: QuickFilters = quick ?? {};
  const chip = (label: string, on: boolean, patch: Partial<QuickFilters>, off: Partial<QuickFilters>) => (
    <button key={label} type="button" onClick={() => apply(on ? off : patch)} className={`${chipBase} ${on ? chipOn : chipOff}`} aria-pressed={on}>
      {on ? <Check className="h-3 w-3" /> : null}
      {label}
    </button>
  );

  const sortRules = normalizeSortRules(boardSort);
  const [viewName, setViewName] = useState("");
  const [editingView, setEditingView] = useState<{ id: string; name: string } | null>(null);
  const [dateDraft, setDateDraft] = useState<{ field: "due" | "created"; from: string; to: string }>({ field: "due", from: "", to: "" });
  const [textDraft, setTextDraft] = useState<{ text: string; regex: boolean }>({ text: "", regex: false });
  useEffect(() => {
    if (!quick) return;
    setDateDraft({ field: quick.dateField ?? "due", from: quick.dateFrom ?? "", to: quick.dateTo ?? "" });
    setTextDraft({ text: quick.text ?? "", regex: !!quick.regex });
  }, [quick]);

  const caret = error && expression.length <= 160 ? `${" ".repeat(Math.min(error.position, expression.length))}^` : null;

  return (
    <div className="border-b border-border bg-card/60 px-3 py-2 sm:px-6 space-y-2" data-testid="board-filter-bar">
      <div className={`flex gap-2 ${props.compact ? "flex-col" : "items-center"}`}>
        <div className="relative flex-1 min-w-0">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={expression}
            onChange={(e) => onExpressionChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={t("bar.placeholder")}
            aria-label={t("bar.label")}
            aria-invalid={!!error}
            className={`w-full rounded-md border bg-background pl-8 pr-8 font-mono text-sm text-foreground placeholder:text-muted-foreground ${props.compact ? "h-10" : "h-8"} ${error ? "border-red-500" : "border-border"}`}
          />
          {active ? (
            <button type="button" onClick={() => onExpressionChange("")} className="absolute right-1.5 top-1/2 h-6 w-6 -translate-y-1/2 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("bar.clear")} title={t("bar.clear")}>
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {active || shown !== total ? (
            <span className={`text-xs tabular-nums ${error ? "text-muted-foreground" : "text-foreground font-medium"}`} aria-live="polite">
              {t("bar.count", { shown, total })}
            </span>
          ) : (
            <span className="text-xs tabular-nums text-muted-foreground">{t("bar.total", { total })}</span>
          )}
          {active ? (
            <button type="button" onClick={() => onExpressionChange("")} className="h-7 px-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {t("bar.clearFilters")}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
          <div>
            {t("bar.invalid", { message: error.message, position: error.position + 1 })} <span className="text-muted-foreground">{t("bar.invalidKept")}</span>
          </div>
          {caret ? (
            <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-tight text-foreground">{expression}{"\n"}<span className="text-red-600 dark:text-red-400">{caret}</span></pre>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {chip(t("quick.mine"), !!q.mine, { mine: true, unassigned: false }, { mine: false })}
        {chip(t("quick.unassigned"), !!q.unassigned, { unassigned: true, mine: false }, { unassigned: false })}
        {chip(t("quick.overdue"), !!q.overdue, { overdue: true }, { overdue: false })}
        {chip(t("quick.dueThisWeek"), !!q.dueThisWeek, { dueThisWeek: true }, { dueThisWeek: false })}
        {chip(t("quick.open"), q.status === "open", { status: "open" }, { status: null })}
        {chip(t("quick.done"), q.status === "done", { status: "done" }, { status: null })}

        <Popover label={q.group ? t("quick.groupNamed", { name: q.group.name }) : t("quick.group")} active={!!q.group}>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {groups.length === 0 ? <p className="text-xs text-muted-foreground">{t("quick.noGroups")}</p> : null}
            {q.group ? (
              <button type="button" className="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted" onClick={() => apply({ group: null })}>{t("quick.anyGroup")}</button>
            ) : null}
            {groups.map((g) => (
              <button key={g.id} type="button" onClick={() => apply({ group: { id: g.id, name: g.name } })} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${q.group?.id === g.id ? "text-accent" : "text-foreground"}`}>
                <span className="truncate">{g.name}</span>
                {q.group?.id === g.id ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            ))}
          </div>
        </Popover>

        <Popover label={q.tags?.length ? t("quick.tagsCount", { count: q.tags.length }) : t("quick.tags")} active={!!q.tags?.length}>
          <div className="space-y-0.5 max-h-60 overflow-y-auto">
            {tags.length === 0 ? <p className="text-xs text-muted-foreground">{t("quick.noTags")}</p> : null}
            {tags.map((tag) => {
              const on = !!q.tags?.some((x) => x === tag.name);
              return (
                <label key={tag.name} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={on}
                    onChange={() => apply({ tags: on ? (q.tags ?? []).filter((x) => x !== tag.name) : [...(q.tags ?? []), tag.name] })}
                  />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ background: tag.color ?? "transparent" }} />
                  <span className="truncate">{tag.name}</span>
                </label>
              );
            })}
          </div>
          {q.tags?.length ? <button type="button" className="mt-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => apply({ tags: [] })}>{t("quick.clearTags")}</button> : null}
        </Popover>

        <Popover label={q.dateFrom || q.dateTo ? t("quick.dateActive") : t("quick.dates")} active={!!(q.dateFrom || q.dateTo)}>
          <div className="space-y-2 text-xs">
            <select className={inputCls} value={dateDraft.field} onChange={(e) => setDateDraft({ ...dateDraft, field: e.target.value as "due" | "created" })} aria-label={t("quick.dateField")}>
              <option value="due">{t("quick.dueDate")}</option>
              <option value="created">{t("quick.createdDate")}</option>
            </select>
            <label className="flex items-center gap-2 text-muted-foreground">
              <span className="w-10">{t("quick.from")}</span>
              <input type="date" className={inputCls} value={dateDraft.from} onChange={(e) => setDateDraft({ ...dateDraft, from: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-muted-foreground">
              <span className="w-10">{t("quick.to")}</span>
              <input type="date" className={inputCls} value={dateDraft.to} onChange={(e) => setDateDraft({ ...dateDraft, to: e.target.value })} />
            </label>
            <div className="flex gap-2">
              <button type="button" className="h-7 rounded-md bg-accent px-3 text-xs font-medium text-white hover:opacity-90" onClick={() => apply({ dateField: dateDraft.field, dateFrom: dateDraft.from || null, dateTo: dateDraft.to || null })}>{t("quick.apply")}</button>
              <button type="button" className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => apply({ dateFrom: null, dateTo: null })}>{t("quick.clearDates")}</button>
            </div>
          </div>
        </Popover>

        <Popover label={q.text ? t("quick.textActive") : t("quick.text")} active={!!q.text}>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); apply({ text: textDraft.text, regex: textDraft.regex }); }}>
            <input className={`${inputCls} ${textDraft.regex ? "font-mono" : ""}`} value={textDraft.text} onChange={(e) => setTextDraft({ ...textDraft, text: e.target.value })} placeholder={textDraft.regex ? t("quick.regexPlaceholder") : t("quick.textPlaceholder")} />
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" className="rounded border-border" checked={textDraft.regex} onChange={(e) => setTextDraft({ ...textDraft, regex: e.target.checked })} />
              {t("quick.regex")}
            </label>
            <div className="flex gap-2">
              <button type="submit" className="h-7 rounded-md bg-accent px-3 text-xs font-medium text-white hover:opacity-90">{t("quick.apply")}</button>
              <button type="button" className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => apply({ text: "" })}>{t("quick.clearText")}</button>
            </div>
          </form>
        </Popover>

        <span className="mx-1 hidden h-5 w-px bg-border sm:inline-block" />

        <Popover label={sortRules.length ? t("sort.active") : t("sort.title")} active={sortRules.length > 0} icon={<ArrowUpDown className="h-3 w-3" />} align="right">
          <p className="mb-2 text-xs font-semibold text-foreground">{t("sort.boardTitle")}</p>
          <SortRulesEditor rules={boardSort} onChange={props.onBoardSortChange} tagGroups={tagGroups} t={t} />
          {sortRules.length ? <p className="mt-2 text-[11px] text-muted-foreground">{t("sort.dragNote")}</p> : null}
          <button type="button" onClick={props.onOpenTagGroups} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            <Layers className="h-3.5 w-3.5" />
            {t("tagGroups.open")}
          </button>
        </Popover>

        <Popover label={t("views.title")} active={savedViews.some((v) => v.expression === expression && expression.trim() !== "")} icon={<Bookmark className="h-3 w-3" />} align="right">
          <div className="space-y-2">
            {savedViews.length === 0 ? <p className="text-xs text-muted-foreground">{t("views.empty")}</p> : null}
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {savedViews.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  {editingView?.id === v.id ? (
                    <form className="flex flex-1 gap-1" onSubmit={(e) => { e.preventDefault(); props.onRenameView(v.id, editingView.name); setEditingView(null); }}>
                      <input autoFocus className={inputCls} value={editingView.name} onChange={(e) => setEditingView({ id: v.id, name: e.target.value })} maxLength={120} />
                      <button type="submit" className="h-8 w-8 inline-flex items-center justify-center rounded-md text-accent hover:bg-muted" aria-label={t("views.save")}><Check className="h-4 w-4" /></button>
                    </form>
                  ) : (
                    <>
                      <button type="button" onClick={() => onExpressionChange(v.expression)} className="min-w-0 flex-1 rounded px-2 py-1.5 text-left hover:bg-muted" title={v.expression}>
                        <span className="block truncate text-sm text-foreground">{v.name}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">{v.expression || t("views.noFilter")}</span>
                      </button>
                      <button type="button" onClick={() => setEditingView({ id: v.id, name: v.name })} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("views.rename")}><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => { if (window.confirm(t("views.deleteConfirm", { name: v.name }))) props.onDeleteView(v.id); }} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-red-600 dark:text-red-400 hover:bg-red-500/10" aria-label={t("views.delete")}><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <form className="flex gap-1 border-t border-border pt-2" onSubmit={(e) => { e.preventDefault(); if (!viewName.trim()) return; props.onSaveView(viewName, expression); setViewName(""); }}>
              <input className={inputCls} value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder={t("views.namePlaceholder")} maxLength={120} />
              <button type="submit" disabled={!viewName.trim()} className="h-8 rounded-md bg-accent px-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">{t("views.saveCurrent")}</button>
            </form>
          </div>
        </Popover>

        <button type="button" onClick={() => setShowExamples((s) => !s)} className={`${chipBase} ${showExamples ? chipOn : chipOff}`} aria-expanded={showExamples}>
          {t("bar.examples")}
        </button>
      </div>

      {sortRules.length ? (
        <p className="text-[11px] text-muted-foreground">{t("sort.boardActive", { sort: describeSort(sortRules, (k) => sortKeyLabel(t, k, tagGroups)) })}</p>
      ) : null}

      {isCustom && active ? <p className="text-[11px] text-muted-foreground">{t("bar.customHint")}</p> : null}

      {showExamples ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => onExpressionChange(ex)} className="h-6 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground hover:bg-muted">
              {ex}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
