"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ArrowUpDown, ChevronDown, ChevronRight, Filter, Layers, RotateCcw } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { REST_SECTION_ID, splitIntoCategories, type ListViewConfig } from "@/lib/boards/categories";
import { toKqlCard, type BoardListLike } from "@/lib/boards/kql-cards";
import { describeSort, type SortRule, type TagGroup } from "@/lib/boards/sorting";
import type { KqlContext } from "@/lib/query/kql";
import { sortKeyLabel } from "./sort-rules-editor";

/**
 * The cards of one list, optionally split into collapsible category sections. Categories are VISUAL: every card keeps
 * its list, `cards` order is the (sorted) order of the list, and one SortableContext covers all visible sections so
 * drag-and-drop keeps working. Cards of a collapsed section (or of a hidden "rest") are not rendered, hence not sortable.
 */
export function ListCardsView({
  cards,
  list,
  boardName,
  config,
  ctx,
  renderCard,
  hint,
  hintBeforeCardId,
  hintAtEnd,
}: {
  cards: any[];
  list: BoardListLike;
  boardName?: string | null;
  config: ListViewConfig;
  ctx: KqlContext;
  renderCard: (card: any) => ReactNode;
  hint: ReactNode;
  hintBeforeCardId?: string | null;
  hintAtEnd?: boolean;
}) {
  const t = useTranslations("board-filters");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const categories = config.categories ?? [];
  const showRest = config.showRest !== false;

  const sections = useMemo(() => {
    if (!categories.length) return null;
    const byId = new Map(cards.map((c) => [c.id as string, c]));
    const split = splitIntoCategories(cards.map((c) => toKqlCard(c, list, boardName, { priorityAsTag: true })), categories, ctx, { restLabel: config.restLabel?.trim() || t("categories.rest") });
    return split.map((s) => ({ ...s, items: s.cards.map((k) => byId.get(k.id)).filter(Boolean) as any[] }));
  }, [cards, categories, ctx, list, boardName, config.restLabel, t]);

  const renderItems = (items: any[]) =>
    items.map((card) => (
      <div key={card.id} className="flex flex-col gap-2">
        {hintBeforeCardId === card.id ? hint : null}
        {renderCard(card)}
      </div>
    ));

  if (!sections) {
    return (
      <>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {renderItems(cards)}
        </SortableContext>
        {hintAtEnd ? hint : null}
      </>
    );
  }

  const visible = sections.filter((s) => (s.kind === "rest" ? showRest : true));
  const visibleIds = visible.filter((s) => !collapsed.has(s.id)).flatMap((s) => s.items.map((c) => c.id as string));
  const rest = sections.find((s) => s.id === REST_SECTION_ID);
  const hiddenRest = !showRest && rest ? rest.items.length : 0;
  const toggle = (id: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
        {visible.map((s) => {
          const isCollapsed = collapsed.has(s.id);
          // Hide empty "rest" noise, but keep empty named categories so the structure stays visible.
          if (s.kind === "rest" && s.items.length === 0) return null;
          return (
            <Fragment key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-semibold text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                style={s.color ? { borderLeft: `3px solid ${s.color}`, paddingLeft: 6 } : undefined}
              >
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="truncate">{s.name || t("categories.untitled")}</span>
                <span className="ml-auto rounded-full bg-background/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{s.items.length}</span>
              </button>
              {!isCollapsed ? (s.items.length ? renderItems(s.items) : <p className="px-2 pb-1 text-[11px] text-muted-foreground">{t("categories.emptySection")}</p>) : null}
            </Fragment>
          );
        })}
      </SortableContext>
      {hiddenRest > 0 ? <p className="px-2 text-[11px] text-muted-foreground">{t("categories.restHidden", { count: hiddenRest })}</p> : null}
      {hintAtEnd ? hint : null}
    </>
  );
}

/** Small row under the list title: what is active on this list (filter, categories, sort) and a way back to manual order. */
export function ListViewIndicators({
  config,
  boardSortActive,
  effectiveSort,
  tagGroups,
  filterError,
  onResetSort,
  onOpenTab,
}: {
  config: ListViewConfig;
  boardSortActive: boolean;
  effectiveSort: SortRule[];
  tagGroups: TagGroup[];
  filterError?: string | null;
  onResetSort?: () => void;
  onOpenTab?: (tab: "filter" | "sort" | "categories") => void;
}) {
  const t = useTranslations("board-filters");
  const hasFilter = !!config.filter?.trim();
  const catCount = config.categories?.length ?? 0;
  if (!hasFilter && !catCount && !effectiveSort.length) return null;
  const pill = "inline-flex max-w-full items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20";
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 pb-1.5">
      {hasFilter ? (
        <button type="button" className={`${pill} ${filterError ? "!bg-red-500/10 !text-red-700 dark:!text-red-300" : ""}`} title={filterError ? `${t("listView.filterInvalid")}: ${filterError}` : config.filter} onClick={() => onOpenTab?.("filter")}>
          <Filter className="h-3 w-3 shrink-0" />
          <span className="truncate">{filterError ? t("listView.filterInvalid") : t("listView.filterActive")}</span>
        </button>
      ) : null}
      {catCount ? (
        <button type="button" className={pill} title={config.categories?.map((c) => c.name).join(" · ")} onClick={() => onOpenTab?.("categories")}>
          <Layers className="h-3 w-3 shrink-0" />
          <span>{t("categories.badge", { count: catCount })}</span>
        </button>
      ) : null}
      {effectiveSort.length ? (
        <span className={pill} title={t("sort.dragNote")}>
          <button type="button" className="inline-flex min-w-0 items-center gap-1" onClick={() => onOpenTab?.("sort")}>
            <ArrowUpDown className="h-3 w-3 shrink-0" />
            <span className="truncate">{describeSort(effectiveSort, (k) => sortKeyLabel(t, k, tagGroups))}{boardSortActive ? ` (${t("sort.fromBoard")})` : ""}</span>
          </button>
          {onResetSort ? (
            <button type="button" onClick={onResetSort} className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" aria-label={t("sort.resetManual")}>
              <RotateCcw className="h-3 w-3" />
              {t("sort.resetShort")}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
