"use client";

import { useMemo, useState } from "react";
import { BookOpen, Database, FileText, Layers, Plus, RefreshCw, Search, SquareKanban, Table2, Users } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { buildSourceCatalog, filterCatalog, type CatalogInput, type CatalogItem, type SourceGroupId } from "@/lib/query-flow/source-catalog";
import type { SourceData } from "@/lib/query-flow/types";
import type { PickPlan } from "@/lib/query-flow/hierarchy";
import { BoardsTree } from "./boards-tree";
import { BrickFolder } from "./brick-folder";
import { SqlConnectionsDialog } from "./sql-connections-dialog";

const ICONS: Record<SourceGroupId, typeof Database> = { document: Table2, queries: Layers, shared: Users, owner: FileText, sql: Database, builtin: Database };

export interface SourcesCatalogProps extends CatalogInput {
  /** Start a new query reading this source. */
  onUse: (source: SourceData, where?: { field: string; value: string }) => void;
  onRefresh: () => void;
  teamId: string | null;
  accessToken: string | null;
  /** Refresh counter: reloads the boards tree too. */
  nonce: number;
  /** Cards picked from the boards tree. */
  onPickCards: (plan: PickPlan) => void;
  onPickTags: (board: string) => void;
}

/** The Sources tab: every table, file, query and built-in source the current context can read, to add as a new query. */
export function SourcesCatalog({ onUse, onRefresh, teamId, accessToken, nonce, onPickCards, onPickTags, ...input }: SourcesCatalogProps) {
  const t = useTranslations("query-flow");
  const [query, setQuery] = useState("");
  const [sqlOpen, setSqlOpen] = useState(false);
  const groups = useMemo(() => buildSourceCatalog(input), [input.tables, input.files, input.queryTables, input.queries, input.currentQueryId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => filterCatalog(groups, query), [groups, query]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const meta = (it: CatalogItem) => [it.rows != null ? t("sources.rows", { count: it.rows }) : "", it.columns && it.columns.length ? t("sources.columns", { count: it.columns.length }) : "", it.detail].filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="sources-catalog">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        <BookOpen className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("sources.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("sources.count", { count: total })}</span>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("sources.search")} aria-label={t("sources.search")} className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-primary" />
        </div>
        {teamId && accessToken ? <button type="button" onClick={() => setSqlOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground hover:bg-muted"><Database className="h-3.5 w-3.5" aria-hidden />{t("sql.open")}</button> : null}
        <button type="button" onClick={onRefresh} title={t("sources.refresh")} aria-label={t("sources.refresh")} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {sqlOpen && teamId && accessToken ? <SqlConnectionsDialog teamId={teamId} accessToken={accessToken} onClose={() => setSqlOpen(false)} onChanged={onRefresh} /> : null}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {shown.length === 0 && query.trim() ? <p className="py-10 text-center text-sm text-muted-foreground">{t("sources.none")}</p> : null}
        <div className="grid gap-4">
          <BoardsTree teamId={teamId} accessToken={accessToken} query={query} nonce={nonce} onPick={onPickCards} onPickTags={onPickTags} />
          {shown.map((g) => {
            const isOwner = g.kind === "owner" || g.kind === "sql";
            const Icon = isOwner && g.ownerKind === "card" ? SquareKanban : ICONS[g.kind];
            const heading = isOwner ? g.kind === "sql" ? t("sources.sqlConnection", { title: g.title ?? "" }) : t(g.ownerKind === "card" ? "sources.ownerCard" : "sources.ownerDocument", { title: g.title ?? "" }) : t(`sources.groups.${g.kind}`);
            return (
              <section key={g.id} aria-label={heading}>
                <header className="mb-1.5 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <h3 className={isOwner ? "truncate text-xs font-semibold text-foreground" : "text-xs font-semibold uppercase tracking-wide text-muted-foreground"}>{heading}</h3>
                  {g.current ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{t("sources.current")}</span> : null}
                  <span className="text-[11px] text-muted-foreground">{g.items.length}</span>
                </header>
                <p className="mb-1.5 text-[11px] text-muted-foreground">{t(`sources.hints.${g.kind}`)}</p>
                <ul className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
                  {g.items.map((it) => it.expand === "bricks" && it.where ? (
                    <li key={it.id} className="col-span-full">
                      <BrickFolder document={it.where.value} teamId={teamId} accessToken={accessToken} nonce={nonce} onUse={onUse} />
                    </li>
                  ) : (
                    <li key={it.id}>
                      <button type="button" onClick={() => onUse(it.source, it.where)} title={t("sources.use")} className="group flex w-full items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{it.labelKey ? t(`sources.items.${it.labelKey}.name`) : it.name}</span>
                          {it.labelKey ? <span className="block text-[11px] leading-snug text-muted-foreground">{t(`sources.items.${it.labelKey}.about`)}</span> : null}
                          {meta(it) ? <span className="block truncate text-[11px] text-muted-foreground">{meta(it)}</span> : null}
                          {it.columns && it.columns.length ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/80">{it.columns.slice(0, 6).join(", ")}{it.columns.length > 6 ? "…" : ""}</span> : null}
                        </span>
                        <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
