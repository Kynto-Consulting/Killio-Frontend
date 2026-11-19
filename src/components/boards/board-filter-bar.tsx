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
import { ViewSyncBadge } from "./view-sync-badge";

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

function Popover({ label, active, icon, children, align = "left", width = "w-72", badge }: { label: string; active?: boolean; icon?: ReactNode; children: ReactNode; align?: "left" | "right"; width?: string; badge?: number }) {
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
        {badge ? <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">{badge}</span> : null}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open ? (
        <div className={`absolute top-full z-[60] mt-1 ${width} max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background p-3 text-foreground shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>{children}</div>
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
  const activeCount =
    (q.mine ? 1 : 0) + (q.unassigned ? 1 : 0) + (q.overdue ? 1 : 0) + (q.dueThisWeek ? 1 : 0) + (q.status ? 1 : 0) + (q.group ? 1 : 0) +
    (q.tags?.length ? 1 : 0) + (q.dateFrom || q.dateTo ? 1 : 0) + (q.text ? 1 : 0) + (isCustom && active ? 1 : 0);
  const section = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <div className="border-b border-border bg-card/60 px-3 py-1.5 sm:px-6" data-testid="board-filter-bar">
      <div className={`flex items-center gap-1.5 ${props.compact ? "flex-wrap" : ""}`}>
        <div className={`relative min-w-0 ${props.compact ? "w-full" : "w-52 focus-within:w-80 transition-[width] duration-150"}`}>
          <Filter className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={expression}
            onChange={(e) => onExpressionChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={t("bar.placeholder")}
            aria-label={t("bar.label")}
            aria-invalid={!!error}
            title={t("bar.label")}
            className={`w-full rounded-md border bg-background pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground ${isCustom && active ? "font-mono" : ""} ${props.compact ? "h-10" : "h-7"} ${error ? "border-red-500" : "border-border"}`}
          />
          {active ? (
            <button type="button" onClick={() => onExpressionChange("")} className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("bar.clear")} title={t("bar.clear")}>
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <Popover label={t("bar.filters")} active={activeCount > 0} badge={activeCount} icon={<Filter className="h-3 w-3" />} width="w-[22rem]">
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-0.5">
            <div className="space-y-1.5">
              <p className={section}>{t("bar.quickSection")}</p>
              <div className="flex flex-wrap gap-1.5">
                {chip(t("quick.mine"), !!q.mine, { mine: true, unassigned: false }, { mine: false })}
                {chip(t("quick.unassigned"), !!q.unassigned, { unassigned: true, mine: false }, { unassigned: false })}
                {chip(t("quick.overdue"), !!q.overdue, { overdue: true }, { overdue: false })}
                {chip(t("quick.dueThisWeek"), !!q.dueThisWeek, { dueThisWeek: true }, { dueThisWeek: false })}
                {chip(t("quick.open"), q.status === "open", { status: "open" }, { status: null })}
                {chip(t("quick.done"), q.status === "done", { status: "done" }, { status: null })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className={section}>{t("quick.group")}</p>
              {groups.length === 0 ? <p className="text-xs text-muted-foreground">{t("quick.noGroups")}</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => chip(g.name, q.group?.id === g.id, { group: { id: g.id, name: g.name } }, { group: null }))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <p className={section}>{t("quick.tags")}</p>
              {tags.length === 0 ? <p className="text-xs text-muted-foreground">{t("quick.noTags")}</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const on = !!q.tags?.some((x) => x === tag.name);
                    return (
                      <button key={tag.name} type="button" aria-pressed={on} onClick={() => apply({ tags: on ? (q.tags ?? []).filter((x) => x !== tag.name) : [...(q.tags ?? []), tag.name] })} className={`${chipBase} ${on ? chipOn : chipOff}`}>
                        <span className="h-2 w-2 shrink-0 rounded-full border border-border" style={{ background: tag.color ?? "transparent" }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <p className={section}>{t("quick.dates")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <select className={`${inputCls} col-span-2`} value={dateDraft.field} onChange={(e) => setDateDraft({ ...dateDraft, field: e.target.value as "due" | "created" })} aria-label={t("quick.dateField")}>
                  <option value="due">{t("quick.dueDate")}</option>
                  <option value="created">{t("quick.createdDate")}</option>
                </select>
                <input type="date" aria-label={t("quick.from")} className={`${inputCls} min-w-0`} value={dateDraft.from} onChange={(e) => setDateDraft({ ...dateDraft, from: e.target.value })} />
                <input type="date" aria-label={t("quick.to")} className={`${inputCls} min-w-0`} value={dateDraft.to} onChange={(e) => setDateDraft({ ...dateDraft, to: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90" onClick={() => apply({ dateField: dateDraft.field, dateFrom: dateDraft.from || null, dateTo: dateDraft.to || null })}>{t("quick.apply")}</button>
                {q.dateFrom || q.dateTo ? <button type="button" className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => apply({ dateFrom: null, dateTo: null })}>{t("quick.clearDates")}</button> : null}
              </div>
            </div>

            <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); apply({ text: textDraft.text, regex: textDraft.regex }); }}>
              <p className={section}>{t("quick.text")}</p>
              <div className="flex gap-1.5">
                <input className={`${inputCls} ${textDraft.regex ? "font-mono" : ""}`} value={textDraft.text} onChange={(e) => setTextDraft({ ...textDraft, text: e.target.value })} placeholder={textDraft.regex ? t("quick.regexPlaceholder") : t("quick.textPlaceholder")} />
                <button type="submit" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">{t("quick.apply")}</button>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" className="rounded border-border" checked={textDraft.regex} onChange={(e) => setTextDraft({ ...textDraft, regex: e.target.checked })} />
                {t("quick.regex")}
              </label>
            </form>

            <details>
              <summary className="cursor-pointer text-xs font-medium text-accent">{t("bar.examples")}</summary>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => onExpressionChange(ex)} className="h-6 rounded-md border border-border bg-background px-2 font-mono text-[11px] text-foreground hover:bg-muted">{ex}</button>
                ))}
              </div>
              {isCustom && active ? <p className="mt-1.5 text-[11px] text-muted-foreground">{t("bar.customHint")}</p> : null}
            </details>

            {active ? <button type="button" onClick={() => onExpressionChange("")} className="text-xs font-medium text-muted-foreground hover:text-foreground">{t("bar.clearFilters")}</button> : null}
          </div>
        </Popover>

        <Popover label={t("sort.title")} active={sortRules.length > 0} icon={<ArrowUpDown className="h-3 w-3" />} align="right">
          <p className="mb-2 text-xs font-semibold text-foreground">{t("sort.boardTitle")}</p>
          <SortRulesEditor rules={boardSort} onChange={props.onBoardSortChange} tagGroups={tagGroups} t={t} />
          {sortRules.length ? <p className="mt-2 text-[11px] text-muted-foreground">{t("sort.boardActive", { sort: describeSort(sortRules, (k) => sortKeyLabel(t, k, tagGroups)) })} · {t("sort.dragNote")}</p> : null}
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
              <button type="submit" disabled={!viewName.trim()} className="h-8 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">{t("views.saveCurrent")}</button>
            </form>
          </div>
        </Popover>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ViewSyncBadge />
          <span className={`text-xs tabular-nums ${active && !error ? "text-foreground font-medium" : "text-muted-foreground"}`} aria-live="polite">
            {active || shown !== total ? t("bar.count", { shown, total }) : t("bar.total", { total })}
          </span>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-300">
          <div>
            {t("bar.invalid", { message: error.message, position: error.position + 1 })} <span className="text-muted-foreground">{t("bar.invalidKept")}</span>
          </div>
          {caret ? (
            <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-tight text-foreground">{expression}{"\n"}<span className="text-red-600 dark:text-red-400">{caret}</span></pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
