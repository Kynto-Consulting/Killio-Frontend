"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { validateExpression } from "@/lib/boards/apply-filters";
import { REST_SECTION_ID, isListViewConfigEmpty, splitIntoCategories, type BoardCategory, type ListViewConfig } from "@/lib/boards/categories";
import { toKqlCard, type BoardListLike } from "@/lib/boards/kql-cards";
import { categoriesFromTagGroup, moveItem, type TagGroup } from "@/lib/boards/sorting";
import { filterCards, type KqlCard, type KqlContext } from "@/lib/query/kql";
import { ModalShell } from "./modal-shell";
import { SortRulesEditor } from "./sort-rules-editor";

export type ListViewTab = "filter" | "sort" | "categories";

const SWATCHES = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];
const inputCls = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";
const iconBtn = "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`);

/**
 * Editor of the per-list view: a KQL filter for this list only, sort rules, and categories (named KQL conditions that
 * split the list into collapsible sections). Works on a draft; nothing is stored until "Save".
 */
export function ListViewModal({
  open,
  onClose,
  initialTab,
  list,
  boardName,
  cards,
  config,
  onSave,
  ctx,
  tagGroups,
}: {
  open: boolean;
  onClose: () => void;
  initialTab: ListViewTab;
  list: BoardListLike;
  boardName?: string | null;
  /** Every card of the list (before any filter). */
  cards: any[];
  config: ListViewConfig;
  onSave: (config: ListViewConfig) => void;
  ctx: KqlContext;
  tagGroups: TagGroup[];
}) {
  const t = useTranslations("board-filters");
  const [tab, setTab] = useState<ListViewTab>(initialTab);
  const [draft, setDraft] = useState<ListViewConfig>(config);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setDraft(config);
    }
    // Reset the draft only when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const kql = useMemo<KqlCard[]>(() => cards.map((c) => toKqlCard(c, list, boardName, { priorityAsTag: true })), [cards, list, boardName]);
  const filterIssue = useMemo(() => validateExpression(draft.filter ?? ""), [draft.filter]);
  const filtered = useMemo(() => {
    if (!draft.filter?.trim() || filterIssue) return kql;
    try { return filterCards(draft.filter, kql, ctx); } catch { return kql; }
  }, [draft.filter, filterIssue, kql, ctx]);

  const categories = draft.categories ?? [];
  const sections = useMemo(() => splitIntoCategories(filtered, categories, ctx), [filtered, categories, ctx]);
  const setCats = (next: BoardCategory[]) => setDraft((d) => ({ ...d, categories: next }));
  const setCat = (id: string, patch: Partial<BoardCategory>) => setCats(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const hasErrors = sections.some((s) => s.kind === "category" && s.error && s.error !== "empty");

  const tabBtn = (id: ListViewTab, label: string) => (
    <button key={id} type="button" onClick={() => setTab(id)} className={`h-8 rounded-md px-3 text-sm font-medium ${tab === id ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
      {label}
    </button>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={t("listView.title", { name: list.title })}
      wide
      footer={
        <>
          <button type="button" onClick={() => setDraft({})} disabled={isListViewConfigEmpty(draft)} className="mr-auto h-8 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40">
            {t("listView.clearAll")}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted">{t("common.cancel")}</button>
          <button
            type="button"
            disabled={!!filterIssue}
            onClick={() => {
              const cats = (draft.categories ?? [])
                .filter((c) => c.expr.trim() || c.name.trim())
                .map((c) => ({ ...c, name: c.name.trim() || c.expr.trim() || t("categories.untitled") }));
              onSave({ ...draft, categories: cats.length ? cats : undefined });
              onClose();
            }}
            className="h-8 rounded-md bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {t("common.save")}
          </button>
        </>
      }
    >
      <div className="mb-4 flex gap-1">
        {tabBtn("filter", t("listView.tabFilter"))}
        {tabBtn("sort", t("listView.tabSort"))}
        {tabBtn("categories", t("listView.tabCategories"))}
      </div>

      {tab === "filter" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("listView.filterIntro")}</p>
          <input
            className={`${inputCls} font-mono ${filterIssue ? "border-red-500" : ""}`}
            value={draft.filter ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, filter: e.target.value }))}
            placeholder={t("listView.filterPlaceholder")}
            spellCheck={false}
          />
          {filterIssue ? (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">{t("bar.invalid", { message: filterIssue.message, position: filterIssue.position + 1 })}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("listView.matches", { shown: filtered.length, total: kql.length })}</p>
          )}
        </div>
      ) : null}

      {tab === "sort" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("listView.sortIntro")}</p>
          <SortRulesEditor rules={draft.sort ?? []} onChange={(sort) => setDraft((d) => ({ ...d, sort }))} tagGroups={tagGroups} t={t} />
          <p className="text-[11px] text-muted-foreground">{t("sort.dragNote")}</p>
        </div>
      ) : null}

      {tab === "categories" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("categories.intro")}</p>
          <ul className="space-y-2">
            {categories.map((cat, i) => {
              const section = sections.find((s) => s.id === cat.id);
              const err = section?.error && section.error !== "empty" ? section.error : null;
              return (
                <li key={cat.id} className="rounded-lg border border-border bg-background p-2 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: cat.color ?? "transparent" }} />
                    <input className={inputCls} value={cat.name} onChange={(e) => setCat(cat.id, { name: e.target.value })} placeholder={t("categories.namePlaceholder")} maxLength={80} aria-label={t("categories.name")} />
                    <span className="w-14 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{t("categories.count", { count: section?.cards.length ?? 0 })}</span>
                    <button type="button" className={iconBtn} disabled={i === 0} onClick={() => setCats(moveItem(categories, i, i - 1))} aria-label={t("common.moveUp")}><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" className={iconBtn} disabled={i === categories.length - 1} onClick={() => setCats(moveItem(categories, i, i + 1))} aria-label={t("common.moveDown")}><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" className={`${iconBtn} text-red-600 dark:text-red-400`} onClick={() => setCats(categories.filter((c) => c.id !== cat.id))} aria-label={t("common.remove")}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <input className={`${inputCls} font-mono ${err ? "border-red-500" : ""}`} value={cat.expr} onChange={(e) => setCat(cat.id, { expr: e.target.value })} placeholder={t("categories.exprPlaceholder")} spellCheck={false} aria-label={t("categories.condition")} />
                  {err ? <p role="alert" className="text-xs text-red-700 dark:text-red-300">{err}</p> : null}
                  <div className="flex items-center gap-1">
                    {SWATCHES.map((c) => (
                      <button key={c} type="button" onClick={() => setCat(cat.id, { color: cat.color === c ? undefined : c })} className={`h-5 w-5 rounded-full border ${cat.color === c ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "border-border"}`} style={{ background: c }} aria-label={c} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCats([...categories, { id: newId(), name: "", expr: "" }])} disabled={categories.length >= 30} className="h-8 inline-flex items-center gap-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted disabled:opacity-40">
              <Plus className="h-4 w-4" />
              {t("categories.add")}
            </button>
            {tagGroups.length ? (
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value=""
                onChange={(e) => {
                  const g = tagGroups.find((x) => x.id === e.target.value);
                  if (g) setCats(categoriesFromTagGroup(g).map((c) => ({ ...c, id: newId() })));
                  e.target.value = "";
                }}
                aria-label={t("categories.fromTagGroup")}
              >
                <option value="">{t("categories.fromTagGroup")}</option>
                {tagGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            ) : null}
          </div>
          {hasErrors ? <p className="text-xs text-red-700 dark:text-red-300">{t("categories.errorsHint")}</p> : null}

          <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-2">
            <div className="flex items-center gap-2">
              <input className={inputCls} value={draft.restLabel ?? ""} onChange={(e) => setDraft((d) => ({ ...d, restLabel: e.target.value }))} placeholder={t("categories.restPlaceholder")} maxLength={80} aria-label={t("categories.restName")} />
              <span className="w-14 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{t("categories.count", { count: sections.find((s) => s.id === REST_SECTION_ID)?.cards.length ?? 0 })}</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="rounded border-border" checked={draft.showRest !== false} onChange={(e) => setDraft((d) => ({ ...d, showRest: e.target.checked ? undefined : false }))} />
              {t("categories.showRest")}
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("categories.visualNote")}</p>
        </div>
      ) : null}
    </ModalShell>
  );
}
