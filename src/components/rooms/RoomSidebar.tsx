"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowUp, BellOff, ChevronDown, ChevronRight, FileText, FolderPlus, GripVertical, Hash, Layout, List, Megaphone,
  MoreHorizontal, Network, Pencil, Plus, Search, Sparkles, StickyNote, Trash2, X, MessageSquare,
} from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { DmPeer } from "@/hooks/use-room-directory";
import type { Room, RoomGroup } from "@/lib/api/rooms";
import {
  buildSidebarModel, categoryOrder, dmDisplayName, isSectionCollapsed, moveCategory, reorderCategory,
  type LayoutRoom,
} from "@/lib/rooms/channel-layout";
import { moveChannel, sameLayout, shiftChannel, toLayoutItems, type ChannelSection, type LayoutItem } from "@/lib/rooms/channel-order";
import { Emoji } from "@/components/emoji";
import { useChannelMenu, type ChannelMenuHandlers, type ChannelMenuRoom, type MenuAnchor } from "./ChannelMenu";

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** A room plus the counters the sidebar shows (see useRoomUnread). */
export type SidebarRoom = Room & { unreadCount?: number; mentionCount?: number; muted?: boolean };

export interface SidebarMemberOption {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

interface RoomSidebarProps {
  rooms: SidebarRoom[];
  groups: RoomGroup[];
  activeRoomId: string | null;
  isLoading: boolean;
  /** The room list could not be loaded. */
  hasError?: boolean;
  onRetry?: () => void;
  canCreate: boolean;
  /** Rename / reorder / delete categories and edit their permissions. */
  canManage?: boolean;
  /** Real titles of documents and boards by `type:id`, so a document chat is not shown as `doc-4f2a1b`. */
  entityTitles?: Record<string, string>;
  peers?: Record<string, DmPeer | null>;
  selfNames?: Array<string | null | undefined>;
  members?: SidebarMemberOption[];
  currentUserId?: string;
  /** Kept for older callers; rows are links, so selecting needs no handler. */
  onSelectRoom?: (roomId: string) => void;
  onCreateRoom: (groupId?: string) => void;
  onCreateGroup?: () => void;
  onEditGroup?: (group: RoomGroup) => void;
  onDeleteGroup?: (group: RoomGroup) => void;
  onReorderGroups?: (orderedIds: string[]) => void;
  /** Channels reordered or moved to another category (drag, Alt+Up / Alt+Down): the full layout, in display order. */
  onReorderChannels?: (items: LayoutItem[]) => void;
  onOpenDirectMessage?: (userId: string) => void;
  onClose?: () => void;
  /** The "..." menu of each channel row (and the right click / long press). Without it rows have no menu. */
  channelMenu?: ChannelMenuHandlers;
  /** Soft navigation: select a channel without remounting the page (the row stays a real link for new tabs). */
  onNavigate?: (roomId: string) => void;
  /** The pointer / focus rests on a channel: the page may prefetch it (debounced there). */
  onPrefetch?: (roomId: string) => void;
  onPrefetchCancel?: (roomId: string) => void;
  t: TFn;
}

const COLLAPSE_KEY = "killio:rooms:collapsed";

const ENTITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  board: Layout,
  mesh: Network,
  list: List,
  card: StickyNote,
};

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Badges({ unread, mentions, t }: { unread: number; mentions: number; t: TFn }) {
  if (mentions > 0) {
    return (
      <span className="ml-auto shrink-0 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-4 text-white" aria-label={t("sidebar.mentionsCount", { count: mentions })}>
        @{mentions > 99 ? "99+" : mentions}
      </span>
    );
  }
  if (unread > 0) {
    return <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-foreground" aria-label={t("sidebar.unreadMessages", { count: unread })} />;
  }
  return null;
}

interface RoomItemProps {
  room: SidebarRoom;
  title: string;
  isActive: boolean;
  peer?: DmPeer | null;
  onMenu?: (room: SidebarRoom, anchor: MenuAnchor) => void;
  onNavigate?: (roomId: string) => void;
  onPrefetch?: (roomId: string) => void;
  onPrefetchCancel?: (roomId: string) => void;
  menuOpenFor?: string | null;
  t: TFn;
}

const LONG_PRESS_MS = 500;

function RoomItem({ room, title, isActive, peer, onMenu, onNavigate, onPrefetch, onPrefetchCancel, menuOpenFor, t }: RoomItemProps) {
  const unread = room.muted ? 0 : room.unreadCount ?? 0;
  const mentions = room.mentionCount ?? 0; // a mention still shows in a silenced room
  const Icon = room.type === "dm" ? MessageSquare : room.linkedEntityType ? ENTITY_ICON[room.linkedEntityType] ?? Hash : room.channelType === "announcement" ? Megaphone : Hash;
  const bold = unread > 0 || mentions > 0;
  const linkRef = useRef<HTMLAnchorElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const menuOpen = menuOpenFor === room.id;

  const clearPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const anchorFromLink = (): MenuAnchor => {
    const r = linkRef.current?.getBoundingClientRect();
    return r ? { x: r.right, y: r.top, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } } : { x: 0, y: 0 };
  };

  return (
    <div className="group/row relative">
      <Link
        ref={linkRef}
        href={`/rooms/${room.id}`}
        data-room-link={room.id}
        aria-current={isActive ? "page" : undefined}
        title={room.description ? `${title} · ${room.description}` : title}
        onClick={(e) => {
          if (longPressed.current) { e.preventDefault(); longPressed.current = false; return; }
          if (onNavigate && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); onNavigate(room.id); }
        }}
        onMouseEnter={onPrefetch ? () => onPrefetch(room.id) : undefined}
        onMouseLeave={onPrefetchCancel ? () => onPrefetchCancel(room.id) : undefined}
        onFocus={onPrefetch ? () => onPrefetch(room.id) : undefined}
        onBlur={onPrefetchCancel ? () => onPrefetchCancel(room.id) : undefined}
        onContextMenu={onMenu ? (e) => {
          e.preventDefault();
          // from the keyboard (menu key / Shift+F10) the browser reports 0,0: anchor to the row instead
          onMenu(room, e.clientX === 0 && e.clientY === 0 ? anchorFromLink() : { x: e.clientX, y: e.clientY });
        } : undefined}
        onPointerDown={onMenu ? (e) => {
          if (e.pointerType !== "touch") return;
          clearPress();
          const point = { x: e.clientX, y: e.clientY };
          pressTimer.current = setTimeout(() => { longPressed.current = true; onMenu(room, point); }, LONG_PRESS_MS);
        } : undefined}
        onPointerUp={clearPress}
        onPointerMove={clearPress}
        onPointerCancel={clearPress}
        className={`flex min-h-[44px] lg:min-h-[30px] items-center gap-2 rounded-lg py-2 pl-2 text-sm lg:py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none ${onMenu ? "pr-9" : "pr-2"} ${
          isActive ? "bg-muted font-semibold text-foreground" : bold ? "font-semibold text-foreground hover:bg-muted/60" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        } ${room.muted && !isActive ? "opacity-55" : ""}`}
      >
        {room.type === "dm" && peer ? (
          <img src={getUserAvatarUrl(peer.avatarUrl, peer.email, 20)} alt="" className="h-5 w-5 shrink-0 rounded-full border border-border object-cover" />
        ) : room.emoji && room.type === "channel" ? (
          <span className="w-4 shrink-0 text-center text-xs" aria-hidden><Emoji value={room.emoji} size={14} label="" /></span>
        ) : (
          <Icon className="h-4 w-4 shrink-0 opacity-70" />
        )}
        <span className="truncate">{title}</span>
        {room.muted && <BellOff className="h-3 w-3 shrink-0 opacity-70" aria-label={t("sidebar.muted")} />}
        <Badges unread={unread} mentions={mentions} t={t} />
      </Link>
      {onMenu && (
        <button
          type="button"
          tabIndex={-1}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("channelMenu.open", { name: title })}
          title={t("channelMenu.open", { name: title })}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(room, { x: r.right, y: r.top, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
          }}
          className={`absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 lg:h-6 lg:w-6 motion-reduce:transition-none ${isActive || menuOpen ? "opacity-100" : "opacity-0"}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

interface SectionHeaderProps {
  id: string;
  label: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  unread?: number;
  mentions?: number;
  count?: number;
  actions?: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  t: TFn;
}

function SectionHeader({ id, label, collapsed, onToggle, unread = 0, mentions = 0, count, actions, onKeyDown, dragProps, t }: SectionHeaderProps) {
  return (
    <div className="group/header flex items-center gap-1 px-1 py-0.5" {...dragProps}>
      <button
        type="button"
        onClick={onToggle}
        onKeyDown={onKeyDown}
        aria-expanded={!collapsed}
        aria-controls={id}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-2 text-[11px] lg:py-1 font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden /> : <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
        {typeof count === "number" && <span className="ml-1 text-[10px] font-semibold tabular-nums opacity-60">{count}</span>}
        {collapsed && <Badges unread={unread} mentions={mentions} t={t} />}
      </button>
      <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:group-hover/header:opacity-100 md:focus-within:opacity-100">{actions}</div>
    </div>
  );
}

const iconButton =
  "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none";

function CategoryMenu({ group, index, total, onMove, onEdit, onDelete, t }: {
  group: RoomGroup; index: number; total: number;
  onMove: (dir: -1 | 1) => void; onEdit: () => void; onDelete: () => void; t: TFn;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirm(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setConfirm(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const item = "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm lg:py-1.5 lg:text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-40";

  return (
    <div ref={ref} className="relative">
      <button type="button" className={iconButton} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={t("category.menu", { name: group.name })} title={t("category.menu", { name: group.name })} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onEdit(); }}><Pencil className="h-3.5 w-3.5" aria-hidden />{t("category.edit")}</button>
          <button role="menuitem" className={item} disabled={index === 0} onClick={() => { onMove(-1); setOpen(false); }}><ArrowUp className="h-3.5 w-3.5" aria-hidden />{t("category.moveUp")}</button>
          <button role="menuitem" className={item} disabled={index === total - 1} onClick={() => { onMove(1); setOpen(false); }}><ArrowDown className="h-3.5 w-3.5" aria-hidden />{t("category.moveDown")}</button>
          <button
            role="menuitem"
            className={`${item} text-destructive`}
            onClick={() => { if (!confirm) { setConfirm(true); return; } setOpen(false); setConfirm(false); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />{confirm ? t("category.confirmDelete") : t("category.delete")}
          </button>
        </div>
      )}
    </div>
  );
}

function NewDirectMessage({ members, currentUserId, onPick, t }: { members: SidebarMemberOption[]; currentUserId?: string; onPick: (userId: string) => void; t: TFn }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const list = useMemo(() => {
    const q = norm(query.trim());
    return members.filter((m) => m.id !== currentUserId && (!q || norm(m.name).includes(q) || norm(m.email ?? "").includes(q))).slice(0, 30);
  }, [members, currentUserId, query]);

  return (
    <div ref={ref} className="relative">
      <button type="button" className={iconButton} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={t("sidebar.createDM")} title={t("sidebar.createDM")} onClick={() => setOpen((v) => !v)}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={t("sidebar.createDM")} className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-popover p-2 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("sidebar.dmSearch")}
            aria-label={t("sidebar.dmSearch")}
            className="mb-1 w-full rounded-lg border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <ul className="max-h-56 overflow-y-auto">
            {list.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">{t("sidebar.dmNobody")}</li>}
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => { setOpen(false); setQuery(""); onPick(m.id); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                  <img src={getUserAvatarUrl(m.avatarUrl ?? undefined, m.email, 20)} alt="" className="h-5 w-5 rounded-full border border-border object-cover" />
                  <span className="truncate">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RoomSidebar({
  rooms, groups, activeRoomId, isLoading, hasError, onRetry, canCreate, canManage: canManageProp, entityTitles = {}, peers = {}, selfNames = [], members = [],
  currentUserId, onCreateRoom, onCreateGroup, onEditGroup, onDeleteGroup, onReorderGroups, onReorderChannels, onOpenDirectMessage, onClose, channelMenu, onNavigate, onPrefetch, onPrefetchCancel, t,
}: RoomSidebarProps) {
  // Callers that do not tell the difference (older pages) get the old rule: whoever can create channels manages categories.
  const canManage = canManageProp ?? canCreate;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [dragRoomId, setDragRoomId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // `room:<id>` or `cat:<id|none>`

  useEffect(() => { setCollapsed(loadCollapsed()); }, []);

  const toggle = useCallback((key: string, defaultCollapsed = false) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !isSectionCollapsed(prev, key, defaultCollapsed) };
      try { window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* storage blocked: not remembered */ }
      return next;
    });
  }, []);

  const q = norm(filter.trim());
  const entityTitle = useCallback(
    (r: SidebarRoom) => (r.linkedEntityType && r.linkedEntityId ? entityTitles[`${r.linkedEntityType}:${r.linkedEntityId}`] : undefined) ?? r.name,
    [entityTitles],
  );
  const dmTitle = useCallback((r: SidebarRoom) => dmDisplayName(r, selfNames, peers[r.id]?.name), [selfNames, peers]);
  const titleOf = useCallback((r: SidebarRoom) => (r.type === "dm" ? dmTitle(r) : r.linkedEntityType || r.type === "thread" ? entityTitle(r) : r.name), [dmTitle, entityTitle]);

  const cm = useChannelMenu(channelMenu, t);
  const soft = onNavigate ? (roomId: string) => { onNavigate(roomId); onClose?.(); } : undefined;
  const openMenu = channelMenu ? (r: SidebarRoom, anchor: MenuAnchor) => {
    const info: ChannelMenuRoom = { id: r.id, name: titleOf(r), type: r.type, linkedEntityType: r.linkedEntityType ?? null, unread: (r.unreadCount ?? 0) > 0 || (r.mentionCount ?? 0) > 0 };
    cm.show(info, anchor);
  } : undefined;
  const rowProps = { onMenu: openMenu, onNavigate: soft, onPrefetch, onPrefetchCancel, menuOpenFor: cm.openRoomId } as const;

  const visible = useMemo(
    () => (q ? rooms.filter((r) => norm(titleOf(r)).includes(q)) : rooms).map((r) => ({ ...r, position: r.sortOrder ?? null })),
    [rooms, q, titleOf],
  );
  const model = useMemo(() => buildSidebarModel<SidebarRoom>(visible as (SidebarRoom & LayoutRoom)[], groups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, sortOrder: g.sortOrder }))), [visible, groups]);
  const order = useMemo(() => categoryOrder(groups.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sortOrder }))), [groups]);

  const commitOrder = useCallback((next: string[], movedId: string, movedName: string) => {
    if (next.join("|") === order.join("|")) return;
    onReorderGroups?.(next);
    setAnnounce(t("category.moved", { name: movedName, position: next.indexOf(movedId) + 1 }));
  }, [onReorderGroups, order, t]);

  const move = (group: RoomGroup, dir: -1 | 1) => {
    const next = moveCategory(order, group.id, dir);
    onReorderGroups?.(next);
    setAnnounce(t("category.moved", { name: group.name, position: next.indexOf(group.id) + 1 }));
  };

  const sections: ChannelSection[] = useMemo(
    () => model.categories.map((c) => ({ categoryId: c.category?.id ?? null, roomIds: c.rooms.map((r) => r.id) })),
    [model],
  );
  const channelsDraggable = Boolean(canManage && onReorderChannels && !q);

  const commitLayout = useCallback((next: ChannelSection[], roomId: string) => {
    if (sameLayout(next, sections)) return;
    onReorderChannels?.(toLayoutItems(next));
    const section = next.find((s) => s.roomIds.includes(roomId));
    const name = rooms.find((r) => r.id === roomId)?.name ?? "";
    const catName = section?.categoryId ? groups.find((g) => g.id === section.categoryId)?.name ?? "" : t("sidebar.channels");
    setAnnounce(t("sidebar.channelMoved", { name, category: catName, position: (section?.roomIds.indexOf(roomId) ?? 0) + 1 }));
    // The row may change parent (another category): keep the keyboard focus on it.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-room-link="${roomId}"]`)?.focus());
  }, [sections, onReorderChannels, rooms, groups, t]);

  const dropChannel = (targetCategoryId: string | null, beforeRoomId?: string) => {
    if (dragRoomId) commitLayout(moveChannel(sections, dragRoomId, targetCategoryId, beforeRoomId), dragRoomId);
    setDragRoomId(null); setDropTarget(null);
  };

  // An entity type with no translation (script, folder, ...) falls under "Other" instead of showing a key.
  const typeLabel = (entityType: string) => {
    const key = `sidebar.entityType.${entityType}`;
    const label = t(key);
    return label === key ? t("sidebar.entityType.other") : label;
  };

  const hasAnyRoom = rooms.length > 0;
  const filtering = q.length > 0;
  const nothingMatches = filtering && model.categories.every((c) => c.rooms.length === 0) && model.entityGroups.length === 0 && model.directMessages.length === 0;

  return (
    <aside className="flex h-full w-72 max-w-full shrink-0 flex-col overflow-hidden border-r border-border/50 bg-card lg:w-60" aria-label={t("title")}>
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-border px-3 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("title")}</h2>
        <div className="flex items-center gap-0.5">
          {canCreate && (
            <button type="button" onClick={() => onCreateRoom()} className={iconButton} aria-label={t("sidebar.createChannel")} title={t("sidebar.createChannel")}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {canManage && onCreateGroup && (
            <button type="button" onClick={onCreateGroup} className={iconButton} aria-label={t("sidebar.createGroup")} title={t("sidebar.createGroup")}>
              <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className={`${iconButton} md:hidden`} aria-label={t("sidebar.close")}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {hasAnyRoom && (
        <div className="shrink-0 px-2 pt-2">
          <label className="relative block">
            <span className="sr-only">{t("sidebar.filter")}</span>
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("sidebar.filter")}
              className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-2 text-sm lg:py-1 lg:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2" aria-label={t("sidebar.channels")}>
        <div className="sr-only" role="status" aria-live="polite">{announce}</div>

        {isLoading ? (
          <div className="space-y-2 px-1 py-2" role="status" aria-label={t("sidebar.loading")}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-6 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" style={{ width: `${60 + ((i * 13) % 35)}%` }} />)}
          </div>
        ) : hasError ? (
          <div role="alert" className="m-1 rounded-xl border border-border p-3 text-center text-xs">
            <p className="mb-2 text-muted-foreground">{t("sidebar.loadError")}</p>
            {onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("errors.retry")}</button>}
          </div>
        ) : (
          <>
            {!hasAnyRoom && (
              <div className="m-1 rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{t("emptyState.title")}</p>
                <p className="mt-1">{canCreate ? t("sidebar.emptyCanCreate") : t("sidebar.emptyNoCreate")}</p>
              </div>
            )}
            {nothingMatches && <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("sidebar.noMatches")}</p>}

            {/* Channels, by category */}
            {model.categories.map((section) => {
              if (filtering && section.rooms.length === 0) return null;
              const group = section.category;
              const key = group ? `cat:${group.id}` : "cat:none";
              const isCollapsed = !filtering && isSectionCollapsed(collapsed, key);
              const realGroup = group ? groups.find((g) => g.id === group.id) : undefined;
              const orderIndex = group ? order.indexOf(group.id) : -1;
              const isVault = (group?.name ?? "").trim().toLowerCase() === "vault";
              const listId = `section-${key}`;
              const draggable = Boolean(canManage && group && onReorderGroups && !filtering);

              return (
                <section
                  key={key}
                  className={`mb-1 rounded-lg ${(dragOver === group?.id && dragId !== group?.id) || (dragRoomId && dropTarget === `cat:${group?.id ?? "none"}`) ? "ring-2 ring-primary" : ""}`}
                  onDragOverCapture={channelsDraggable ? (e) => { if (dragRoomId && !(e.target as HTMLElement).closest("[data-room-row]")) { e.preventDefault(); setDropTarget(`cat:${group?.id ?? "none"}`); } } : undefined}
                  onDropCapture={channelsDraggable ? (e) => { if (dragRoomId && !(e.target as HTMLElement).closest("[data-room-row]")) { e.preventDefault(); dropChannel(group?.id ?? null); } } : undefined}
                  onDragOver={draggable ? (e) => { if (dragId) { e.preventDefault(); setDragOver(group!.id); } } : undefined}
                  onDragLeave={draggable ? () => setDragOver((cur) => (cur === group?.id ? null : cur)) : undefined}
                  onDrop={draggable ? (e) => {
                    e.preventDefault();
                    if (dragId && group && dragId !== group.id) commitOrder(reorderCategory(order, dragId, group.id), dragId, groups.find((g) => g.id === dragId)?.name ?? "");
                    setDragId(null); setDragOver(null);
                  } : undefined}
                >
                  <SectionHeader
                    id={listId}
                    t={t}
                    collapsed={isCollapsed}
                    onToggle={() => toggle(key)}
                    label={group ? `${group.emoji ? `${group.emoji} ` : ""}${group.name}` : t("sidebar.channels")}
                    unread={section.unread}
                    mentions={section.mentions}
                    onKeyDown={draggable ? (e) => {
                      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && realGroup) {
                        e.preventDefault();
                        move(realGroup, e.key === "ArrowUp" ? -1 : 1);
                      }
                    } : undefined}
                    dragProps={draggable ? {
                      draggable: true,
                      onDragStart: (e) => { setDragId(group!.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", group!.id); },
                      onDragEnd: () => { setDragId(null); setDragOver(null); },
                    } : undefined}
                    actions={
                      <>
                        {draggable && <span className="hidden h-6 w-4 cursor-grab items-center justify-center text-muted-foreground md:flex" aria-hidden><GripVertical className="h-3 w-3" /></span>}
                        {isVault && (
                          <Link href="/rooms/vault" className={`${iconButton} text-cyan-500 hover:text-cyan-400`} aria-label={t("sidebar.openKillioChat")} title={t("sidebar.openKillioChat")}>
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        )}
                        {canCreate && (
                          <button type="button" onClick={() => onCreateRoom(group?.id)} className={iconButton} aria-label={t("sidebar.createChannelIn", { name: group?.name ?? t("sidebar.channels") })} title={t("sidebar.createChannel")}>
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                        {canManage && realGroup && onEditGroup && onDeleteGroup && (
                          <CategoryMenu group={realGroup} index={orderIndex} total={order.length} onMove={(d) => move(realGroup, d)} onEdit={() => onEditGroup(realGroup)} onDelete={() => onDeleteGroup(realGroup)} t={t} />
                        )}
                      </>
                    }
                  />
                  {!isCollapsed && (
                    <ul id={listId} className="space-y-px pl-1">
                      {section.rooms.length === 0 ? (
                        <li className="px-2 py-1 text-xs italic text-muted-foreground/70">{t("sidebar.noChannels")}</li>
                      ) : section.rooms.map((r) => (
                        <li
                          key={r.id}
                          data-room-row
                          className={`rounded-lg ${dragRoomId === r.id ? "opacity-40" : ""} ${dragRoomId && dragRoomId !== r.id && dropTarget === `room:${r.id}` ? "border-t-2 border-primary" : ""}`}
                          draggable={channelsDraggable}
                          onDragStart={channelsDraggable ? (e) => { setDragRoomId(r.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.id); } : undefined}
                          onDragEnd={channelsDraggable ? () => { setDragRoomId(null); setDropTarget(null); } : undefined}
                          onDragOver={channelsDraggable ? (e) => { if (dragRoomId) { e.preventDefault(); e.stopPropagation(); setDropTarget(`room:${r.id}`); } } : undefined}
                          onDrop={channelsDraggable ? (e) => { if (dragRoomId) { e.preventDefault(); e.stopPropagation(); dropChannel(group?.id ?? null, r.id); } } : undefined}
                          onKeyDown={channelsDraggable ? (e) => {
                            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                              e.preventDefault();
                              commitLayout(shiftChannel(sections, r.id, e.key === "ArrowUp" ? -1 : 1), r.id);
                            }
                          } : undefined}
                        >
                          <RoomItem room={r} title={r.name} isActive={r.id === activeRoomId} {...rowProps} t={t} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}

            {/* Documents and boards: their own section, collapsed by default */}
            {model.entityGroups.length > 0 && (() => {
              const key = "entities";
              const isCollapsed = !filtering && isSectionCollapsed(collapsed, key, true);
              const total = model.entityGroups.reduce((n, g) => n + g.rooms.length, 0);
              const unread = model.entityGroups.reduce((n, g) => n + g.unread, 0);
              const mentions = model.entityGroups.reduce((n, g) => n + g.mentions, 0);
              return (
                <section className="mb-1 mt-3 border-t border-border pt-2">
                  <SectionHeader id="section-entities" t={t} collapsed={isCollapsed} onToggle={() => toggle(key, true)} label={t("sidebar.entityRooms")} count={total} unread={unread} mentions={mentions} />
                  {!isCollapsed && (
                    <div id="section-entities" className="pl-1">
                      {model.entityGroups.map((g) => {
                        const Icon = ENTITY_ICON[g.entityType] ?? Hash;
                        return (
                          <div key={g.entityType} className="mb-1">
                            <div className="flex items-center gap-1.5 px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                              <Icon className="h-3 w-3" aria-hidden />{typeLabel(g.entityType)}
                            </div>
                            <ul className="space-y-px">
                              {g.rooms.map((r) => <li key={r.id}><RoomItem room={r} title={entityTitle(r)} isActive={r.id === activeRoomId} {...rowProps} t={t} /></li>)}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })()}

            {/* Direct messages */}
            {(model.directMessages.length > 0 || (onOpenDirectMessage && members.length > 1 && !filtering)) && (
              <section className="mb-1 mt-3 border-t border-border pt-2">
                <SectionHeader
                  id="section-dms"
                  t={t}
                  collapsed={!filtering && isSectionCollapsed(collapsed, "dms")}
                  onToggle={() => toggle("dms")}
                  label={t("sidebar.directMessages")}
                  unread={model.directMessages.reduce((n, r) => n + (r.muted ? 0 : r.unreadCount ?? 0), 0)}
                  mentions={model.directMessages.reduce((n, r) => n + (r.mentionCount ?? 0), 0)}
                  actions={onOpenDirectMessage && members.length > 1 ? <NewDirectMessage members={members} currentUserId={currentUserId} onPick={onOpenDirectMessage} t={t} /> : undefined}
                />
                {(filtering || !isSectionCollapsed(collapsed, "dms")) && (
                  <ul id="section-dms" className="space-y-px pl-1">
                    {model.directMessages.length === 0 && <li className="px-2 py-1 text-xs italic text-muted-foreground/70">{t("sidebar.noDMs")}</li>}
                    {model.directMessages.map((r) => <li key={r.id}><RoomItem room={r} title={dmTitle(r)} peer={peers[r.id]} isActive={r.id === activeRoomId} {...rowProps} t={t} /></li>)}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </nav>
      {cm.element}
    </aside>
  );
}
