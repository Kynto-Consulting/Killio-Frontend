"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ProfileHover } from "@/components/ui/profile-hover";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Columns3, MessageSquare, Plus, Search, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { initials, nameHue } from "@/lib/boards/gantt-layout";
import type { ListTabConfig } from "@/lib/boards/board-tabs";
import {
  buildRows,
  deriveTagGroupColumns,
  filterRowsByText,
  flattenItems,
  groupRows,
  isSortableKey,
  nextSort,
  sortRows,
  stripGroupPrefix,
  toggleHiddenColumn,
  toggleableColumnIds,
  visibleColumnIds,
  visibleRange,
  type ListGroup,
  type ListItem,
  type ListRow,
  type ListViewList,
  type TagGroupColumn,
} from "@/lib/boards/list-view";
import type { TagGroup } from "@/lib/boards/sorting";
import type { KqlUser } from "@/lib/query/kql";

const ROW_H = 40;
const WIDTHS: Record<string, number> = { state: 180, assignees: 112, due: 120, comments: 104 };
const TAG_COL_W = 176;
const TITLE_MIN = 300;

interface BoardListViewProps {
  /** Lists after the board's KQL / category / per-list filters and sorts (the same source Kanban renders). */
  lists: ListViewList[];
  tagGroups: TagGroup[];
  users?: KqlUser[];
  boardName?: string | null;
  locale: string;
  config: ListTabConfig;
  onConfigChange: (patch: Partial<ListTabConfig>) => void;
  canEdit: boolean;
  onOpenCard: (card: any, listId: string, listName: string) => void;
  onCreateCard: (listId: string, listName: string) => void;
  onMoveCard: (cardId: string, fromListId: string, toListId: string) => void | Promise<void>;
}

function Avatar({ assignee }: { assignee: any }) {
  const name = assignee?.name || assignee?.displayName || assignee?.email || "";
  return (
    <ProfileHover name={name} email={assignee?.email} avatarUrl={assignee?.avatar_url || assignee?.avatarUrl}>
      <AvatarFace assignee={assignee} />
    </ProfileHover>
  );
}

function AvatarFace({ assignee }: { assignee: any }) {
  const name = assignee?.name || assignee?.displayName || assignee?.email || "";
  const url = assignee?.avatar_url || assignee?.avatarUrl;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={getUserAvatarUrl(url, assignee?.email, 24)} alt={name} className="h-6 w-6 shrink-0 rounded-full border border-border object-cover" />;
  }
  return (
    <span title={name || undefined} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-white" style={{ backgroundColor: `hsl(${nameHue(name)} 55% 42%)` }}>
      {initials(name)}
    </span>
  );
}

function TagChip({ name, color, title }: { name: string; color?: string | null; title?: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-foreground">
      {color ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color.startsWith("#") ? color : `#${color}` }} /> : null}
      <span className="truncate">{name}</span>
    </span>
  );
}

interface RowProps {
  row: ListRow;
  index: number;
  top: number;
  active: boolean;
  columns: string[];
  tagColumns: Map<string, TagGroupColumn>;
  grid: string;
  lists: ListViewList[];
  canEdit: boolean;
  dateFmt: Intl.DateTimeFormat;
  nowMs: number;
  onOpen: (row: ListRow) => void;
  onMove: (row: ListRow, toListId: string) => void;
  stateLabel: (title: string) => string;
  commentsLabel: string;
}

const Row = memo(function Row({ row, index, top, active, columns, tagColumns, grid, lists, canEdit, dateFmt, nowMs, onOpen, onMove, stateLabel, commentsLabel }: RowProps) {
  const card = row.card;
  const due = card.dueAt ? new Date(card.dueAt) : null;
  const dueValid = due && !Number.isNaN(due.getTime());
  const done = card.status === "done" || !!card.completedAt;
  const overdue = !!dueValid && !done && due!.getTime() < nowMs;
  const assignees: any[] = card.assignees ?? [];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(row);
    }
  };
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      data-item-index={index}
      tabIndex={active ? 0 : -1}
      onClick={() => onOpen(row)}
      onKeyDown={onKey}
      className="absolute inset-x-0 grid cursor-pointer items-center gap-x-3 border-b border-border/60 bg-card px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      style={{ top, height: ROW_H, gridTemplateColumns: grid }}
    >
      <div role="gridcell" className="min-w-0 truncate font-medium" title={card.title}>
        {card.title}
      </div>
      {columns.map((id) => {
        if (id === "state") {
          return (
            <div role="gridcell" key={id} className="min-w-0" onClick={(e) => e.stopPropagation()}>
              <select
                value={row.listId}
                disabled={!canEdit}
                aria-label={stateLabel(card.title)}
                onChange={(e) => onMove(row, e.target.value)}
                className="h-7 w-full min-w-0 cursor-pointer truncate rounded-md border border-border bg-card px-1.5 text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-80"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (id === "assignees") {
          return (
            <div role="gridcell" key={id} className="flex min-w-0 items-center -space-x-1.5">
              {assignees.slice(0, 3).map((a, i) => (
                <Avatar key={a?.id ?? a?.userId ?? i} assignee={a} />
              ))}
              {assignees.length > 3 ? <span className="ml-2 text-[11px] font-medium text-muted-foreground">+{assignees.length - 3}</span> : null}
            </div>
          );
        }
        if (id === "due") {
          return (
            <div role="gridcell" key={id} className={`truncate text-xs ${overdue ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
              {dueValid ? dateFmt.format(due!) : ""}
            </div>
          );
        }
        if (id === "comments") {
          const n = card.commentsCount ?? 0;
          return (
            <div role="gridcell" key={id} className="flex items-center gap-1 text-xs text-muted-foreground" title={n > 0 ? commentsLabel : undefined}>
              {n > 0 ? (
                <>
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  <span>{n}</span>
                </>
              ) : null}
            </div>
          );
        }
        const col = tagColumns.get(id);
        if (!col) return <div role="gridcell" key={id} />;
        const names = row.tagsByGroup[col.groupId] ?? [];
        return (
          <div role="gridcell" key={id} className="flex min-w-0 items-center gap-1 overflow-hidden">
            {names.slice(0, 3).map((n) => (
              <TagChip key={n} name={stripGroupPrefix(n, col.name)} title={n} color={card.tags?.find((t: any) => t?.name === n)?.color} />
            ))}
            {names.length > 3 ? <span className="text-[11px] text-muted-foreground">+{names.length - 3}</span> : null}
          </div>
        );
      })}
    </div>
  );
});

/**
 * The board as a dense table (tracker style): one row per card, state / tag-group / assignee / due / comments columns,
 * header sorting, optional grouping by state with collapsible groups, text search and a windowed body (fixed row
 * height) so 200+ cards stay light. The cards come already filtered by the board, never re-filtered here.
 */
export function BoardListView({ lists, tagGroups, users, boardName, locale, config, onConfigChange, canEdit, onOpenCard, onCreateCard, onMoveCard }: BoardListViewProps) {
  const t = useTranslations("board-detail");
  const groupByState = config.groupByState !== false;
  const sort = config.sort && isSortableKey(config.sort.key) ? config.sort : null;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const [nowMs] = useState(() => Date.now());

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }), [locale]);
  const tagColumnList = useMemo(() => deriveTagGroupColumns(lists, tagGroups), [lists, tagGroups]);
  const tagColumns = useMemo(() => new Map(tagColumnList.map((c) => [c.id, c])), [tagColumnList]);
  const columns = useMemo(() => visibleColumnIds(tagColumnList, config.hiddenColumns), [tagColumnList, config.hiddenColumns]);

  const allRows = useMemo(() => buildRows(lists, tagGroups), [lists, tagGroups]);
  const rows = useMemo(() => sortRows(filterRowsByText(allRows, query), sort, { users, tagGroups }, boardName), [allRows, query, sort, users, tagGroups, boardName]);
  const groups = useMemo(() => groupRows(rows, lists, groupByState), [rows, lists, groupByState]);
  const items = useMemo(() => flattenItems(groups, collapsed, { canAdd: canEdit }), [groups, collapsed, canEdit]);

  const columnLabel = useCallback(
    (id: string): string => {
      switch (id) {
        case "title": return t("listView.columnTitle");
        case "state": return t("listView.columnState");
        case "assignees": return t("listView.columnAssignees");
        case "due": return t("listView.columnDue");
        case "comments": return t("listView.columnComments");
        default: return tagColumns.get(id)?.name ?? id;
      }
    },
    [t, tagColumns],
  );

  const grid = useMemo(
    () => [`minmax(${TITLE_MIN}px, 1fr)`, ...columns.map((id) => `${WIDTHS[id] ?? TAG_COL_W}px`)].join(" "),
    [columns],
  );
  const minWidth = TITLE_MIN + columns.reduce((sum, id) => sum + (WIDTHS[id] ?? TAG_COL_W), 0) + columns.length * 12 + 24;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!columnsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) setColumnsOpen(false);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setColumnsOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [columnsOpen]);

  const lastIndex = Math.max(0, items.length - 1);
  const safeActive = Math.min(activeIndex, lastIndex);
  const { start, end } = visibleRange(items.length, scrollTop, viewportH - ROW_H, ROW_H);

  // After a keyboard move the target may not be rendered yet: scroll it into the window, then focus it.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-item-index="${target}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
    }
  });

  const moveActive = (next: number) => {
    const el = scrollerRef.current;
    const clamped = Math.max(0, Math.min(lastIndex, next));
    setActiveIndex(clamped);
    pendingFocus.current = clamped;
    if (el) {
      const top = clamped * ROW_H;
      const visibleTop = el.scrollTop;
      const visibleHeight = el.clientHeight - ROW_H; // sticky header
      if (top < visibleTop) el.scrollTop = top;
      else if (top + ROW_H > visibleTop + visibleHeight) el.scrollTop = top + ROW_H - visibleHeight;
      setScrollTop(el.scrollTop);
    }
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "SELECT" || tag === "INPUT" || (tag === "BUTTON" && !(e.target as HTMLElement).dataset.itemIndex)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(safeActive + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(safeActive - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); moveActive(safeActive + Math.floor(viewportH / ROW_H) - 1); }
    else if (e.key === "PageUp") { e.preventDefault(); moveActive(safeActive - Math.floor(viewportH / ROW_H) + 1); }
    else if (e.key === "Home") { e.preventDefault(); moveActive(0); }
    else if (e.key === "End") { e.preventDefault(); moveActive(lastIndex); }
  };

  const toggleGroup = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openRow = useCallback((row: ListRow) => onOpenCard(row.card, row.listId, row.listTitle), [onOpenCard]);
  const moveRow = useCallback(
    (row: ListRow, toListId: string) => {
      if (toListId !== row.listId) void onMoveCard(row.id, row.listId, toListId);
    },
    [onMoveCard],
  );
  const stateLabel = useCallback((title: string) => t("listView.stateFor", { title }), [t]);
  const commentsLabel = t("listView.columnComments");

  const headerCell = (id: string) => {
    const sortKey = id === "state" ? "list" : id;
    const active = sort?.key === sortKey;
    const label = columnLabel(id);
    return (
      <div role="columnheader" key={id} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"} className="min-w-0">
          <button
            type="button"
            onClick={() => onConfigChange({ sort: nextSort(sort, sortKey) })}
            title={t("listView.sortBy", { column: label })}
            className={`inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary ${active ? "text-foreground" : "text-muted-foreground"}`}
          >
            <span className="truncate">{label}</span>
            {active ? (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden /> : <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />) : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden />}
          </button>
      </div>
    );
  };

  const total = lists.reduce((s, l) => s + ((l as any).totalCount ?? l.cards.length), 0);
  const shown = rows.length;
  const hasCards = allRows.length > 0;

  const renderItem = (item: ListItem, index: number) => {
    const top = index * ROW_H;
    if (item.kind === "row") {
      return (
        <Row
          key={`r:${item.row.id}`}
          row={item.row}
          index={index}
          top={top}
          active={index === safeActive}
          columns={columns}
          tagColumns={tagColumns}
          grid={grid}
          lists={lists}
          canEdit={canEdit}
          dateFmt={dateFmt}
          nowMs={nowMs}
          onOpen={openRow}
          onMove={moveRow}
          stateLabel={stateLabel}
          commentsLabel={commentsLabel}
        />
      );
    }
    if (item.kind === "group") return <GroupHeader key={`g:${item.group.id}`} group={item.group} index={index} top={top} active={index === safeActive} open={!collapsed.has(item.group.id)} onToggle={toggleGroup} t={t} />;
    return (
      <div key={`a:${item.group.id}`} role="row" aria-rowindex={index + 2} className="absolute inset-x-0 flex items-center border-b border-border/60 bg-card px-3" style={{ top, height: ROW_H }}>
        <button
          type="button"
          data-item-index={index}
          tabIndex={index === safeActive ? 0 : -1}
          onClick={() => onCreateCard(item.group.listId!, item.group.title)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("listView.newCard")}
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="board-list-view">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="relative w-64 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("listView.search")}
            aria-label={t("listView.searchLabel")}
            className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-7 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t("listView.clearSearch")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={groupByState}
          onClick={() => onConfigChange({ groupByState: !groupByState })}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${groupByState ? "bg-primary" : "bg-muted-foreground/40"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-card transition-all ${groupByState ? "left-3.5" : "left-0.5"}`} />
          </span>
          {t("listView.groupByState")}
        </button>

        <div className="relative" ref={columnsRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={columnsOpen}
            onClick={() => setColumnsOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden />
            {t("listView.columns")}
          </button>
          {columnsOpen ? (
            <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-border bg-card p-1 shadow-lg">
              {toggleableColumnIds(tagColumnList).map((id) => {
                const on = columns.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => onConfigChange({ hiddenColumns: toggleHiddenColumn(config.hiddenColumns, id) })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <span aria-hidden className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate">{columnLabel(id)}</span>
                  </button>
                );
              })}
              <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">{t("listView.columnsHint")}</p>
            </div>
          ) : null}
        </div>

        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {shown === total ? t("listView.countAll", { total }) : t("listView.count", { shown, total })}
        </span>
      </div>

      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onGridKey}
        role="grid"
        aria-label={t("listView.title")}
        aria-rowcount={items.length + 1}
        className="min-h-0 flex-1 overflow-auto"
      >
        <div style={{ minWidth }}>
          <div role="row" aria-rowindex={1} className="sticky top-0 z-10 grid items-center gap-x-3 border-b border-border bg-card px-3" style={{ height: ROW_H, gridTemplateColumns: grid }}>
            {headerCell("title")}
            {columns.map(headerCell)}
          </div>
          {items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">{hasCards ? t("listView.empty") : t("listView.emptyBoard")}</p>
          ) : (
            <div className="relative" style={{ height: items.length * ROW_H }}>
              {items.slice(start, end).map((item, i) => renderItem(item, start + i))}
              {items.length > 0 && (safeActive < start || safeActive >= end) ? renderItem(items[safeActive], safeActive) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ group, index, top, active, open, onToggle, t }: { group: ListGroup; index: number; top: number; active: boolean; open: boolean; onToggle: (id: string) => void; t: (key: string, params?: Record<string, string | number>) => string }) {
  return (
    <div role="row" aria-rowindex={index + 2} className="absolute inset-x-0 flex items-center border-b border-border bg-muted/50" style={{ top, height: ROW_H }}>
      <button
        type="button"
        data-item-index={index}
        tabIndex={active ? 0 : -1}
        aria-expanded={open}
        title={open ? t("listView.collapse") : t("listView.expand")}
        onClick={() => onToggle(group.id)}
        className="sticky left-0 flex h-full items-center gap-2 px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
        <span className="truncate">{group.title}</span>
        <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{group.rows.length}</span>
      </button>
    </div>
  );
}
