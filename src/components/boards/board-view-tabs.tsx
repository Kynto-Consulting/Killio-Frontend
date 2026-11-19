"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChartGantt, FolderKanban, LayoutDashboard, List, MoreHorizontal, Plus, SquareKanban } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { ADDABLE_TAB_TYPES, EXPERIMENTAL_TAB_TYPES, isBuiltinTab, MAX_TAB_NAME, tabDisplayName, type BoardTab, type BoardTabType } from "@/lib/boards/board-tabs";

const ICONS: Record<BoardTabType, typeof List> = { kanban: SquareKanban, gantt: ChartGantt, list: List, calendar: CalendarDays, summary: LayoutDashboard, projects: FolderKanban };

interface BoardViewTabsProps {
  tabs: BoardTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (type: BoardTabType) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (tab: BoardTab) => void;
  /** Adding, renaming and deleting change the board's shared views: only people who can edit the board. */
  canManage: boolean;
}

/**
 * The pill group that switches the board view: one pill per tab, plus a "+" pill that adds a view. Extra tabs are renamed
 * (double click, F2 or the context menu) and deleted (context menu); the built-in Kanban and Gantt tabs are fixed.
 */
export function BoardViewTabs({ tabs, activeId, onSelect, onAdd, onRename, onDelete, canManage }: BoardViewTabsProps) {
  const t = useTranslations("board-detail");
  const labels: Record<BoardTabType, string> = { kanban: t("header.kanbanView"), gantt: t("header.ganttView"), list: t("header.listView"), calendar: t("header.calendarView"), summary: t("header.summaryView"), projects: t("header.projectsView") };
  const [addOpen, setAddOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ tab: BoardTab; x: number; y: number } | null>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [addPos, setAddPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!addOpen && !menu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addOpen && addRef.current && !addRef.current.contains(target) && !addMenuRef.current?.contains(target)) setAddOpen(false);
      if (menu && menuRef.current && !menuRef.current.contains(target)) setMenu(null);
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAddOpen(false);
      setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [addOpen, menu]);

  const startRename = (tab: BoardTab) => {
    if (!canManage || isBuiltinTab(tab)) return;
    setMenu(null);
    setDraft(tabDisplayName(tab, labels));
    setRenamingId(tab.id);
  };
  const commitRename = () => {
    if (renamingId) {
      const tab = tabs.find((x) => x.id === renamingId);
      if (tab && draft.trim() && draft.trim() !== tabDisplayName(tab, labels)) onRename(renamingId, draft);
    }
    setRenamingId(null);
  };

  const pill = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, tab: BoardTab) => {
    if (e.key === "F2") {
      e.preventDefault();
      startRename(tab);
    }
  };

  return (
    <div role="tablist" aria-label={t("viewTabs.addTitle")} className="flex items-center rounded-full border border-border/70 bg-background/60 p-1 shadow-sm backdrop-blur-sm">
      {tabs.map((tab) => {
        const Icon = ICONS[tab.type];
        const active = tab.id === activeId;
        if (renamingId === tab.id) {
          return (
            <input
              key={tab.id}
              autoFocus
              value={draft}
              maxLength={MAX_TAB_NAME}
              aria-label={t("viewTabs.nameLabel")}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenamingId(null);
              }}
              className="h-7 w-32 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          );
        }
        const manageable = canManage && !isBuiltinTab(tab);
        return (
          <Fragment key={tab.id}>
          <button
            type="button"
            role="tab"
            aria-selected={active}
            title={isBuiltinTab(tab) || !canManage ? undefined : t("viewTabs.rename")}
            onClick={() => onSelect(tab.id)}
            onDoubleClick={() => startRename(tab)}
            onKeyDown={(e) => onTabKey(e, tab)}
            onContextMenu={(e) => {
              if (!canManage || isBuiltinTab(tab)) return;
              e.preventDefault();
              setAddOpen(false);
              setMenu({ tab, x: e.clientX, y: e.clientY });
            }}
            className={pill(active)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="max-w-[10rem] truncate">{tabDisplayName(tab, labels)}</span>
          </button>
          {manageable && active ? (
            <button
              type="button"
              aria-label={t("viewTabs.menuLabel")}
              title={t("viewTabs.menuLabel")}
              aria-haspopup="menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setAddOpen(false);
                setMenu({ tab, x: Math.max(8, Math.min(r.left, window.innerWidth - 184)), y: r.bottom + 6 });
              }}
              className="-ml-1.5 mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          </Fragment>
        );
      })}

      {canManage ? (
        <div className="relative" ref={addRef}>
          <button
            type="button"
            aria-label={t("viewTabs.add")}
            title={t("viewTabs.add")}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            onClick={() => {
              setMenu(null);
              const rect = addRef.current?.getBoundingClientRect();
              if (rect) setAddPos({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)), top: rect.bottom + 8 });
              setAddOpen((o) => !o);
            }}
            className={`${pill(addOpen)} px-2`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
          {addOpen && addPos && typeof document !== "undefined" ? createPortal(
            <div ref={addMenuRef} role="menu" className="fixed z-[200] w-56 rounded-lg border border-border bg-card p-1 shadow-lg" style={{ left: addPos.left, top: addPos.top }}>
              {ADDABLE_TAB_TYPES.map((type) => {
                const Icon = ICONS[type];
                const experimental = EXPERIMENTAL_TAB_TYPES.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddOpen(false);
                      onAdd(type);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{labels[type]}</span>
                    {experimental ? <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t("viewTabs.inDevelopment")}</span> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          ) : null}
        </div>
      ) : null}

      {menu && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} role="menu" className="fixed z-[200] w-44 rounded-lg border border-border bg-card p-1 shadow-lg" style={{ left: menu.x, top: menu.y }}>
          <button type="button" role="menuitem" onClick={() => startRename(menu.tab)} className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted">
            {t("viewTabs.rename")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const tab = menu.tab;
              setMenu(null);
              onDelete(tab);
            }}
            className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10"
          >
            {t("viewTabs.delete")}
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
