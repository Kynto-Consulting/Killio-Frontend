"use client";

import { useState } from "react";
import { Braces, ChevronLeft, ChevronRight, EyeOff, Hash, Plus, Table2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import type { FlowFunction, FlowParam, FlowQuery } from "@/lib/query-flow/types";
import { cn } from "@/lib/utils";
import { IconButton } from "./fields";

/**
 * Power Query's left pane: "Queries [n]" with a type icon per query, a collapse chevron, the "Parameters" and "Functions" folders
 * and a right-click menu (Rename / Duplicate / Reference / Enable load / Delete). The "+" opens the New Source menu.
 */
export function QueriesPane({
  queries,
  params,
  functions,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onAdd,
  onRename,
  onContextMenu,
  onOpenParams,
  onOpenFunctions,
  renamingId,
  onRenamingDone,
}: {
  queries: FlowQuery[];
  params: FlowParam[];
  functions: FlowFunction[];
  activeId: string;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd: (x: number, y: number) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onOpenParams: () => void;
  onOpenFunctions: () => void;
  renamingId: string | null;
  onRenamingDone: () => void;
}) {
  const t = useTranslations("query-flow");
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  if (renamingId !== seen) {
    setSeen(renamingId);
    const q = queries.find((x) => x.id === renamingId);
    if (q) setDraft(q.name);
  }
  if (collapsed) {
    return (
      <div className="flex w-7 shrink-0 flex-col items-center border-r border-border bg-card/60 py-1">
        <IconButton label={t("queries.expand")} onClick={onToggle}><ChevronRight className="h-4 w-4" /></IconButton>
        <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">{t("queries.title")} [{queries.length}]</span>
      </div>
    );
  }
  const folder = (label: string, count: number, onOpen: () => void, icon: React.ReactNode, names: string[]) => (
    <div className="mt-2">
      <button type="button" onClick={onOpen} title={label} className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted hover:text-foreground">
        {icon}
        <span className="min-w-0 flex-1 truncate">{label} [{count}]</span>
      </button>
      <ul>{names.map((n) => <li key={n} className="truncate px-5 py-0.5 font-mono text-[11px] text-foreground" title={n}>{n}</li>)}</ul>
    </div>
  );
  return (
    <section aria-label={t("queries.title")} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("queries.title")} [{queries.length}]</h3>
        <span className="flex">
          <IconButton label={t("queries.add")} aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onAdd(r.left, r.bottom + 2); }}><Plus className="h-4 w-4" /></IconButton>
          <IconButton label={t("queries.collapse")} onClick={onToggle}><ChevronLeft className="h-4 w-4" /></IconButton>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        <ul className="space-y-0.5">
          {queries.map((q) => (
            <li key={q.id} onContextMenu={(e) => { e.preventDefault(); onSelect(q.id); onContextMenu(q.id, e.clientX, e.clientY); }} className={cn("flex items-center gap-1 rounded-md px-1.5 py-1 text-xs", q.id === activeId ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted", q.load === false && "opacity-70")}>
              <span title={t("queries.typeTable")} className="shrink-0 text-muted-foreground"><Table2 className="h-3.5 w-3.5" aria-label={t("queries.typeTable")} /></span>
              {renamingId === q.id ? (
                <input
                  autoFocus
                  value={draft}
                  aria-label={t("queries.rename")}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { onRename(q.id, draft); onRenamingDone(); }}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { onRename(q.id, draft); onRenamingDone(); } if (e.key === "Escape") onRenamingDone(); }}
                  className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs text-foreground"
                />
              ) : (
                <button type="button" className="min-w-0 flex-1 truncate text-left font-medium text-foreground" onClick={() => onSelect(q.id)} onDoubleClick={() => onContextMenu(q.id, -1, -1)} aria-current={q.id === activeId ? "true" : undefined} title={q.name}>
                  {q.name}
                </button>
              )}
              {q.load === false ? <span title={t("queries.loadOff")}><EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label={t("queries.loadOff")} /></span> : null}
            </li>
          ))}
        </ul>
        {folder(t("params.title"), params.length, onOpenParams, <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden />, params.map((p) => `$${p.name}`))}
        {folder(t("functions.title"), functions.length, onOpenFunctions, <Braces className="h-3.5 w-3.5 shrink-0" aria-hidden />, functions.map((f) => `${f.name}(${f.args.join(", ")})`))}
      </div>
    </section>
  );
}
