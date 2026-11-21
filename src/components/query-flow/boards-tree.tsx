"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, SquareKanban } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { runKqlQuery } from "@/lib/api/groups";
import { HIERARCHY_SCRIPT, boardIds, buildHierarchy, checkState, listIds, planSelection, toggleIds, type CardRow, type CheckState, type PickPlan, type Selection } from "@/lib/query-flow/hierarchy";

function Check({ state, onChange, label }: { state: CheckState; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state === "all"}
      ref={(el) => { if (el) el.indeterminate = state === "some"; }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]"
    />
  );
}

export interface BoardsTreeProps {
  teamId: string | null;
  accessToken: string | null;
  query: string;
  nonce: number;
  /** Start a query from the selection (a scope, or the cards picked one by one). */
  onPick: (plan: PickPlan) => void;
  /** Tags of one board (and its lists). */
  onPickTags: (board: string) => void;
}

/** Boards > lists > cards with checkboxes at every level: tick what you want (whole board, whole list, single cards) and use it. */
export function BoardsTree({ teamId, accessToken, query, nonce, onPick, onPickTags }: BoardsTreeProps) {
  const t = useTranslations("query-flow");
  const [rows, setRows] = useState<CardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<Selection>(new Set());

  useEffect(() => {
    if (!teamId || !accessToken) { setRows([]); return; }
    let cancelled = false;
    setFailed(false);
    runKqlQuery(teamId, HIERARCHY_SCRIPT, accessToken)
      .then((res) => {
        if (cancelled) return;
        const result = (res.outputs[res.outputs.length - 1] as unknown as { result: { columns: Array<{ key: string }>; rows: Array<{ cells: string[] }> } } | undefined)?.result;
        const idx = (k: string) => result?.columns.findIndex((c) => c.key === k) ?? -1;
        const [b, l, i, ti] = [idx("board"), idx("list"), idx("id"), idx("title")];
        setRows(b < 0 || i < 0 ? [] : (result?.rows ?? []).map((r) => ({ board: r.cells[b] ?? "", list: l < 0 ? "" : r.cells[l] ?? "", id: r.cells[i] ?? "", title: ti < 0 ? "" : r.cells[ti] ?? "" })));
      })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [teamId, accessToken, nonce]);

  const tree = useMemo(() => buildHierarchy(rows ?? []), [rows]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = useMemo(() => {
    if (!words.length) return tree;
    return tree
      .map((b) => ({ ...b, lists: b.lists.map((l) => ({ ...l, cards: l.cards.filter((c) => words.every((w) => `${b.name} ${l.name} ${c.title}`.toLowerCase().includes(w))) })).filter((l) => l.cards.length > 0) }))
      .filter((b) => b.lists.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, query]);

  const plan = useMemo(() => planSelection(tree, sel), [tree, sel]);
  const isOpen = (key: string) => (words.length > 0 ? true : !!open[key]);
  const flip = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));

  if (rows === null) return <p className="text-xs text-muted-foreground">{t("sources.loading")}</p>;
  if (failed) return <p className="text-xs text-destructive">{t("sources.boardsFailed")}</p>;
  if (tree.length === 0) return <p className="text-xs text-muted-foreground">{t("sources.boardsEmpty")}</p>;
  if (visible.length === 0) return null;

  return (
    <section aria-label={t("sources.boardsTitle")}>
      <header className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <SquareKanban className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sources.boardsTitle")}</h3>
        <span className="text-[11px] text-muted-foreground">{t("sources.boardsHint")}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {sel.size > 0 ? <button type="button" onClick={() => setSel(new Set())} className="text-[11px] text-muted-foreground underline hover:text-foreground">{t("sources.clearSelection")}</button> : null}
          <button
            type="button"
            disabled={!plan}
            onClick={() => plan && onPick(plan)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {plan ? t("sources.useSelected", { count: plan.count }) : t("sources.pickSome")}
          </button>
        </div>
      </header>
      <ul className="rounded-lg border border-border bg-card text-sm" role="tree">
        {visible.map((b) => {
          const bKey = `b:${b.name}`;
          const full = tree.find((x) => x.name === b.name) ?? b;
          return (
            <li key={bKey} role="treeitem" aria-expanded={isOpen(bKey)} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/50">
                <button type="button" onClick={() => flip(bKey)} aria-label={b.name} className="text-muted-foreground">{isOpen(bKey) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                <Check state={checkState(boardIds(full), sel)} onChange={() => setSel((s) => toggleIds(s, boardIds(full)))} label={b.name} />
                <button type="button" onClick={() => flip(bKey)} className="min-w-0 flex-1 truncate text-left font-medium text-foreground">{b.name}</button>
                <span className="text-[11px] text-muted-foreground">{t("sources.cardsCount", { count: boardIds(full).length })}</span>
              </div>
              {isOpen(bKey) ? (
                <ul role="group" className="pb-1 pl-5">
                  <li className="px-2 py-1">
                    <button type="button" onClick={() => onPickTags(b.name)} title={t("sources.items.boardTags.about")} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-muted">{t("sources.items.boardTags.name")}</button>
                  </li>
                  {b.lists.map((l) => {
                    const lKey = `${bKey}/l:${l.name}`;
                    const fullList = full.lists.find((x) => x.name === l.name) ?? l;
                    return (
                      <li key={lKey} role="treeitem" aria-expanded={isOpen(lKey)}>
                        <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-muted/50">
                          <button type="button" onClick={() => flip(lKey)} aria-label={l.name} className="text-muted-foreground">{isOpen(lKey) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                          <Check state={checkState(listIds(fullList), sel)} onChange={() => setSel((s) => toggleIds(s, listIds(fullList)))} label={l.name} />
                          <button type="button" onClick={() => flip(lKey)} className="min-w-0 flex-1 truncate text-left text-foreground">{l.name}</button>
                          <span className="text-[11px] text-muted-foreground">{fullList.cards.length}</span>
                        </div>
                        {isOpen(lKey) ? (
                          <ul role="group" className="pl-7">
                            {l.cards.map((c) => (
                              <li key={c.id} role="treeitem" className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/50">
                                <Check state={sel.has(c.id) ? "all" : "none"} onChange={() => setSel((s) => toggleIds(s, [c.id]))} label={c.title} />
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{c.title || "—"}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
