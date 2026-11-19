"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTeamGroups } from "@/hooks/use-team-groups";
import { useDroppable } from "@dnd-kit/core";
import { Plus, MoreHorizontal, Archive, Trash2, Filter, Layers, ArrowUpDown, Users, Check, ChevronsLeft, ChevronsRight } from "lucide-react";
import { toast } from "@/lib/toast";
import { KanbanCard } from "./kanban-card";
import { CardDetailModal } from "./card-detail-modal";
import { useTranslations } from "@/components/providers/i18n-provider";
import { archiveList, deleteList } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { ListCardsView, ListViewTrigger } from "@/components/boards/list-cards-view";
import { ListViewModal, type ListViewTab } from "@/components/boards/list-view-modal";
import type { ListViewConfig } from "@/lib/boards/categories";
import type { SortRule, TagGroup } from "@/lib/boards/sorting";
import type { KqlContext } from "@/lib/query/kql";

interface ListData {
  id: string;
  title: string;
  /** The cards shown (after the board filter, the list filter and the sort). */
  cards: any[];
  /** Every card of the list, when a filter hides some. */
  allCards?: any[];
  totalCount?: number;
  systemKey?: string | null;
  assignedGroupId?: string | null;
}

export function ListColumnWeb({
  list,
  boardName,
  boardId,
  teamId,
  isDropTarget,
  dropHintIndex,
  draggingCardId,
  canEdit = true,
  canComment = true,
  teamDocs = [],
  teamBoards = [],
  accentColor,
  viewConfig,
  onViewConfigChange,
  kqlContext,
  tagGroups,
  effectiveSort,
  sortFromBoard = false,
  onResetBoardSort,
  filterError,
  onAssignGroup,
}: {
  list: ListData;
  boardName?: string;
  boardId: string;
  teamId?: string;
  isDropTarget?: boolean;
  dropHintIndex?: number | null;
  draggingCardId?: string | null;
  canEdit?: boolean;
  canComment?: boolean;
  teamDocs?: any[];
  teamBoards?: any[];
  accentColor?: string;
  /** Per-list view settings (filter, categories, sort). */
  viewConfig?: ListViewConfig;
  onViewConfigChange?: (config: ListViewConfig) => void;
  kqlContext?: KqlContext;
  tagGroups?: TagGroup[];
  /** The sort in effect on this list (its own or the board's). Empty = manual order. */
  effectiveSort?: SortRule[];
  sortFromBoard?: boolean;
  onResetBoardSort?: () => void;
  filterError?: string | null;
  /** Assigns a group to the list (null clears it). The page updates its state and calls the API. */
  onAssignGroup?: (listId: string, groupId: string | null) => void | Promise<void>;
}) {
  const t = useTranslations("board-detail");
  const tf = useTranslations("board-filters");
  const tg = useTranslations("groups");
  const { groups: teamGroups } = useTeamGroups(teamId);
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const assignedGroup = list.assignedGroupId ? teamGroups.find((g) => g.id === list.assignedGroupId) ?? null : null;
  const canAssignGroup = !!onAssignGroup && !!teamId && canEdit;
  const assignGroup = (groupId: string | null) => {
    setIsGroupPickerOpen(false);
    setIsMenuOpen(false);
    if (groupId !== (list.assignedGroupId ?? null)) void onAssignGroup?.(list.id, groupId);
  };
  const { setNodeRef } = useDroppable({ id: list.id });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [viewTab, setViewTab] = useState<ListViewTab | null>(null);
  const { accessToken } = useSession();
  const isGuest = !canEdit;
  const config = viewConfig ?? {};
  const ctx = kqlContext ?? {};
  const groupsForSort = tagGroups ?? [];
  const sort = effectiveSort ?? [];
  const isSorted = sort.length > 0;
  const total = list.totalCount ?? list.cards.length;

  // A list can be minimised to a thin strip; the choice is remembered per board in this browser.
  const collapseKey = `killio:list-collapsed:${boardId}`;
  const [collapsed, setCollapsedState] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseKey);
      setCollapsedState(!!raw && (JSON.parse(raw) as string[]).includes(list.id));
    } catch { /* storage unavailable */ }
  }, [collapseKey, list.id]);
  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    try {
      const current = new Set<string>(JSON.parse(localStorage.getItem(collapseKey) || "[]"));
      if (next) current.add(list.id); else current.delete(list.id);
      localStorage.setItem(collapseKey, JSON.stringify([...current]));
    } catch { /* storage unavailable */ }
  };

  const handleArchive = async () => {
    setIsMenuOpen(false);
    try {
      await archiveList(boardId, list.id, true, accessToken ?? undefined);
      toast(t("list.archivedSuccess") ?? "List archived", "success");
    } catch (err) {
      toast(t("list.archiveError") ?? "Failed to archive list", "error");
    }
  };

  const handleDelete = async () => {
    setIsMenuOpen(false);
    if (!window.confirm(t("list.deleteConfirm") ?? "Are you sure you want to delete this list? All cards will be lost.")) return;
    try {
      await deleteList(boardId, list.id, accessToken ?? undefined);
      toast(t("list.deletedSuccess") ?? "List deleted", "success");
    } catch (err) {
      toast(t("list.deleteError") ?? "Failed to delete list", "error");
    }
  };
  const containerStyle: CSSProperties = isDropTarget
    ? {
      backgroundColor: "transparent",
      borderColor: "var(--board-accent, rgba(56,189,248,0.9))",
      boxShadow: "0 0 0 2px var(--board-ghost, rgba(56,189,248,0.16))",
    }
    : {

    };

  const dropHint = (
    <div
      className="h-20 rounded-lg border-2 border-dashed flex items-center justify-center"
      style={{
        borderColor: "var(--board-accent, rgba(56,189,248,0.9))",
        backgroundColor: "var(--board-ghost, rgba(56,189,248,0.16))",
        boxShadow: "0 0 0 4px var(--board-ghost, rgba(56,189,248,0.12))",
      }}
    >
      <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--board-accent, #38bdf8)" }}>{t("drag.dropHere")}</span>
    </div>
  );
  const hintCard = isDropTarget && dropHintIndex != null && dropHintIndex < list.cards.length ? list.cards[dropHintIndex] : null;
  const hintBeforeCardId = hintCard && draggingCardId !== hintCard.id ? hintCard.id : null;
  const hintAtEnd = !!isDropTarget && dropHintIndex === list.cards.length;

  const menuItem = "w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-muted-foreground hover:text-foreground";
  const openTab = (tab: ListViewTab) => { setIsMenuOpen(false); setViewTab(tab); };
  const resetSort = () => {
    if (config.sort && config.sort.length) onViewConfigChange?.({ ...config, sort: undefined });
    else onResetBoardSort?.();
  };

  if (collapsed) {
    const listActive = !!config.filter?.trim() || (config.categories?.length ?? 0) > 0 || isSorted;
    return (
      <div
        ref={setNodeRef}
        data-list-column
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed(false)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCollapsed(false); } }}
        title={tf("listMenu.expand")}
        aria-label={tf("listMenu.expand")}
        className="relative w-11 shrink-0 self-start flex flex-col items-center gap-2 rounded-xl py-2 shadow-sm cursor-pointer hover:brightness-95 transition"
        style={{ backgroundColor: "var(--board-list, #f1f2f4)", color: "var(--board-text, inherit)", ...(accentColor ? { borderTop: `3px solid ${accentColor}` } : {}) }}
      >
        <ChevronsRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium tabular-nums text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded-full">{total !== list.cards.length ? `${list.cards.length}/${total}` : list.cards.length}</span>
        <h3 className="font-semibold text-sm max-h-52 truncate [writing-mode:vertical-rl] rotate-180">{list.title}</h3>
        {listActive ? <Filter className="h-3.5 w-3.5 text-accent" /> : null}
      </div>
    );
  }

  return (
    <>
    <div
      ref={setNodeRef}
      data-list-column
      className="w-[280px] shrink-0 flex flex-col rounded-xl cursor-default max-h-full transition-all border-none shadow-sm"
      style={{ backgroundColor: "var(--board-list, #f1f2f4)", color: "var(--board-text, inherit)", ...containerStyle }}
    >
      <div
        className="px-3 h-11 shrink-0 flex items-center justify-between group rounded-t-xl"
        style={accentColor ? { borderTop: `3px solid ${accentColor}` } : undefined}
      >
        <div className="flex items-center gap-2">
          {accentColor && (
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accentColor }} />
          )}
          <h3 className="font-semibold text-sm">{list.title}</h3>
          {assignedGroup && (
            <span
              className="inline-flex items-center gap-1 max-w-[96px] rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
              title={tg("listGroup.badgeTooltip", { name: assignedGroup.name, count: assignedGroup.memberCount })}
            >
              <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/60" style={assignedGroup.color ? { backgroundColor: assignedGroup.color } : undefined} />
              <span className="truncate">@{assignedGroup.slug}</span>
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1 relative">
          {!isGuest ? (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="h-6 w-6 rounded hover:bg-accent/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={t("list.addCard")}
              title={t("list.addCard")}
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="h-6 w-6 rounded hover:bg-accent/10 hidden group-hover:flex focus:flex items-center justify-center text-muted-foreground transition-opacity"
            aria-label={tf("listMenu.collapse")}
            title={tf("listMenu.collapse")}
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setIsGroupPickerOpen(false); setIsMenuOpen(!isMenuOpen); }}
            className="h-6 w-6 rounded hover:bg-accent/10 hidden group-hover:flex focus:flex items-center justify-center text-muted-foreground transition-opacity"
            aria-label={tf("listMenu.open")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-8 w-52 bg-background border border-border rounded-md shadow-lg py-1 z-10 text-sm">
              {!isGuest && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }}
                    className={menuItem}>
                    <Plus className="w-3.5 h-3.5" />
                    {t("list.addCardMenu")}
                  </button>
                  <div className="my-1 border-t border-border" />
                </>
              )}
              <button onClick={(e) => { e.stopPropagation(); openTab("filter"); }} className={menuItem}>
                <Filter className="w-3.5 h-3.5" />
                {tf("listMenu.filter")}
              </button>
              <button onClick={(e) => { e.stopPropagation(); openTab("sort"); }} className={menuItem}>
                <ArrowUpDown className="w-3.5 h-3.5" />
                {tf("listMenu.sort")}
              </button>
              <button onClick={(e) => { e.stopPropagation(); openTab("categories"); }} className={menuItem}>
                <Layers className="w-3.5 h-3.5" />
                {tf("listMenu.categories")}
              </button>
              {canAssignGroup && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setIsGroupPickerOpen((v) => !v); }} className={menuItem}>
                    <Users className="w-3.5 h-3.5" />
                    {assignedGroup ? tg("listGroup.menuAssigned", { name: assignedGroup.name }) : tg("listGroup.menu")}
                  </button>
                  {isGroupPickerOpen && (
                    <div className="mx-1 mb-1 max-h-48 overflow-y-auto rounded-md border border-border bg-muted/40 py-1" role="listbox" aria-label={tg("listGroup.title")}>
                      <button onClick={(e) => { e.stopPropagation(); assignGroup(null); }} className={menuItem} role="option" aria-selected={!list.assignedGroupId}>
                        <span className="w-3.5 h-3.5 flex items-center justify-center">{!list.assignedGroupId && <Check className="w-3.5 h-3.5" />}</span>
                        {tg("listGroup.none")}
                      </button>
                      {teamGroups.map((g) => (
                        <button key={g.id} onClick={(e) => { e.stopPropagation(); assignGroup(g.id); }} className={menuItem} role="option" aria-selected={list.assignedGroupId === g.id}>
                          <span className="w-3.5 h-3.5 flex items-center justify-center">{list.assignedGroupId === g.id && <Check className="w-3.5 h-3.5" />}</span>
                          <span className="truncate">{g.name} <span className="opacity-70">@{g.slug}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {!isGuest && (
                <>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleArchive(); }}
                    className={menuItem}>
                    <Archive className="w-3.5 h-3.5" />
                    {t("list.archiveList")}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-red-500 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                    {t("list.deleteList") ?? "Delete List"}
                  </button>
                </>
              )}
            </div>
          )}
          <ListViewTrigger
            config={config}
            boardSortActive={isSorted && !(config.sort && config.sort.length)}
            effectiveSort={sort}
            tagGroups={groupsForSort}
            filterError={filterError}
            onResetSort={isSorted ? resetSort : undefined}
            onOpenTab={setViewTab}
          />
          <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full ml-1 tabular-nums" title={total !== list.cards.length ? tf("bar.count", { shown: list.cards.length, total }) : undefined}>
            {total !== list.cards.length ? `${list.cards.length}/${total}` : list.cards.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2 flex flex-col gap-2">
        <ListCardsView
          cards={list.cards}
          list={{ id: list.id, title: list.title, systemKey: list.systemKey, assignedGroupId: list.assignedGroupId }}
          boardName={boardName}
          config={config}
          ctx={ctx}
          hint={dropHint}
          hintBeforeCardId={hintBeforeCardId}
          hintAtEnd={hintAtEnd}
          renderCard={(card) => (
            <KanbanCard
              card={card}
              listId={list.id}
              listName={list.title}
              boardName={boardName || ""}
              boardId={boardId}
              teamId={teamId}
              canEdit={canEdit}
              canComment={canComment}
              teamDocs={teamDocs}
              teamBoards={teamBoards}
            />
          )}
        />

        {list.cards.length === 0 && total > 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{tf("listView.allHidden", { count: total })}</p>
        ) : null}

        {!isGuest && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center text-left py-2 px-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground dark:text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors group text-sm font-medium mt-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("list.addCard")}
          </button>
        )}
      </div>
    </div>

    <CardDetailModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      listId={list.id}
      listName={list.title}
      boardName={boardName || ""}
      boardId={boardId}
      teamId={teamId}
      teamDocs={teamDocs}
      teamBoards={teamBoards}
    />

    <ListViewModal
      open={viewTab !== null}
      onClose={() => setViewTab(null)}
      initialTab={viewTab ?? "filter"}
      list={{ id: list.id, title: list.title, systemKey: list.systemKey, assignedGroupId: list.assignedGroupId }}
      boardName={boardName}
      cards={list.allCards ?? list.cards}
      config={config}
      onSave={(next) => onViewConfigChange?.(next)}
      ctx={ctx}
      tagGroups={groupsForSort}
    />
    </>
  );
}
