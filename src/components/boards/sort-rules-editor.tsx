"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, X } from "lucide-react";

import { moveItem, parseTagGroupKey, SORT_KEYS, tagGroupKey, type SortRule, type TagGroup } from "@/lib/boards/sorting";

type T = (key: string, params?: Record<string, string | number>) => string;

export function sortKeyLabel(t: T, key: string, tagGroups: TagGroup[]): string {
  const gid = parseTagGroupKey(key);
  if (gid !== null) {
    const g = tagGroups.find((x) => x.id === gid);
    return t("sort.tagGroupOption", { name: g?.name ?? "?" });
  }
  return t(`sort.keys.${key}`);
}

const selectCls = "h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground";
const iconBtn = "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

/** Ordered multi-level sort rules. An empty list means manual (drag) order. */
export function SortRulesEditor({ rules, onChange, tagGroups, t }: { rules: SortRule[]; onChange: (rules: SortRule[]) => void; tagGroups: TagGroup[]; t: T }) {
  const keys = [...SORT_KEYS.filter((k) => k !== "manual"), ...tagGroups.map((g) => tagGroupKey(g.id))];
  const set = (i: number, patch: Partial<SortRule>) => onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rules.length === 0 ? <p className="text-xs text-muted-foreground">{t("sort.manualHint")}</p> : null}
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-5 text-center text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
          <select value={rule.key} onChange={(e) => set(i, { key: e.target.value })} className={selectCls} aria-label={t("sort.field")}>
            {keys.map((k) => (
              <option key={k} value={k} disabled={k !== rule.key && rules.some((r) => r.key === k)}>
                {sortKeyLabel(t, k, tagGroups)}
              </option>
            ))}
          </select>
          <button type="button" className={`${iconBtn} border border-border w-auto px-2 gap-1 text-xs`} onClick={() => set(i, { dir: rule.dir === "asc" ? "desc" : "asc" })} title={t("sort.toggleDirection")}>
            {rule.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            <span>{rule.dir === "asc" ? t("sort.asc") : t("sort.desc")}</span>
          </button>
          <button type="button" className={iconBtn} disabled={i === 0} onClick={() => onChange(moveItem(rules, i, i - 1))} aria-label={t("common.moveUp")}>
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" className={iconBtn} disabled={i === rules.length - 1} onClick={() => onChange(moveItem(rules, i, i + 1))} aria-label={t("common.moveDown")}>
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" className={iconBtn} onClick={() => onChange(rules.filter((_, idx) => idx !== i))} aria-label={t("common.remove")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={rules.length >= keys.length || rules.length >= 6}
          onClick={() => {
            const free = keys.find((k) => !rules.some((r) => r.key === k));
            if (free) onChange([...rules, { key: free, dir: "asc" }]);
          }}
          className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-border text-xs text-foreground hover:bg-muted disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("sort.addLevel")}
        </button>
        {rules.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground">
            {t("sort.resetManual")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
