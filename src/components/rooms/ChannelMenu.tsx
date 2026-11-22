"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, AtSign, Bell, BellOff, Bookmark, Bot, Captions, Check, CheckCheck, ChevronRight, ExternalLink, Link2, Pin, Settings, Trash2, Users } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { buildChannelMenu, channelUrl, stepIndex, type ChannelMenuItem, type ChannelMenuItemId, type NotifPref } from "@/lib/rooms/channel-menu";

/** The header actions a small screen hides, with what each one does. Given only when the menu opens from the small header. */
export interface ChannelMenuExtras {
  members?: { count?: number; run: () => void } | false;
  pins: { count: number; run: () => void };
  bookmarks?: { run: () => void };
  copilot: { run: () => void };
  transcripts?: { run: () => void };
  linked?: { run: () => void };
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** The room facts the menu needs (a sidebar row or the open room). */
export interface ChannelMenuRoom {
  id: string;
  name: string;
  type: string;
  linkedEntityType?: string | null;
  unread?: boolean;
}

/** What the page lets the menu do: permissions per channel and the existing backend calls. */
export interface ChannelMenuHandlers {
  canManage: (room: ChannelMenuRoom) => boolean;
  canDelete: (room: ChannelMenuRoom) => boolean;
  isAiRoom?: (room: ChannelMenuRoom) => boolean;
  loadPref: (roomId: string) => Promise<NotifPref | null>;
  setPref: (room: ChannelMenuRoom, pref: NotifPref) => Promise<void>;
  markRead: (room: ChannelMenuRoom) => Promise<void>;
  openSettings: (room: ChannelMenuRoom) => void;
  deleteRoom: (room: ChannelMenuRoom) => Promise<void>;
  /** A short message for the user (copied, failed...). */
  notify: (message: string) => void;
}

export interface MenuAnchor {
  /** Where the menu opens: a point (right click) or the rectangle of the "..." button. */
  x: number;
  y: number;
  rect?: { left: number; right: number; top: number; bottom: number };
}

const LABEL: Record<ChannelMenuItemId, string> = {
  "h:members": "header.members",
  "h:pins": "header.pins",
  "h:bookmarks": "header.bookmarks",
  "h:copilot": "header.copilot",
  "h:transcripts": "header.transcripts",
  "h:linked": "header.linkedTo",
  markRead: "channelMenu.markRead",
  notifications: "channelMenu.notifications",
  "notif:all": "channelMenu.notifAll",
  "notif:mentions": "channelMenu.notifMentions",
  "notif:none": "channelMenu.notifNone",
  settings: "channelMenu.settings",
  copyLink: "channelMenu.copyLink",
  delete: "channelMenu.delete",
};

const ICON: Partial<Record<ChannelMenuItemId, React.ComponentType<{ className?: string }>>> = {
  "h:members": Users,
  "h:pins": Pin,
  "h:bookmarks": Bookmark,
  "h:copilot": Bot,
  "h:transcripts": Captions,
  "h:linked": ExternalLink,
  markRead: CheckCheck,
  notifications: Bell,
  "notif:all": Bell,
  "notif:mentions": AtSign,
  "notif:none": BellOff,
  settings: Settings,
  copyLink: Link2,
  delete: Trash2,
};

const MENU_WIDTH = 248;
const rowCls =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-3 text-left text-sm outline-none transition-colors focus-visible:bg-muted hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5 sm:text-[13px] motion-reduce:transition-none";

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return phone;
}

interface MenuViewProps {
  room: ChannelMenuRoom;
  anchor: MenuAnchor;
  items: ChannelMenuItem[][];
  onClose: () => void;
  onRun: (id: ChannelMenuItemId) => void;
  confirmDelete: boolean;
  t: TFn;
}

function MenuView({ room, anchor, items, onClose, onRun, confirmDelete, t }: MenuViewProps) {
  const phone = useIsPhone();
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"root" | "notifications">("root");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const titleId = useId();

  // Popover position: next to the button (or at the cursor), kept inside the viewport.
  useLayoutEffect(() => {
    if (phone) return;
    const el = panelRef.current;
    const h = el?.offsetHeight ?? 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const baseLeft = anchor.rect ? anchor.rect.right + 6 : anchor.x;
    const baseTop = anchor.rect ? anchor.rect.top : anchor.y;
    let left = baseLeft + MENU_WIDTH > vw - 8 ? (anchor.rect ? anchor.rect.left - MENU_WIDTH - 6 : vw - MENU_WIDTH - 8) : baseLeft;
    left = Math.max(8, left);
    const top = Math.max(8, Math.min(baseTop, vh - h - 8));
    setPos({ left, top });
  }, [phone, anchor, view]);

  const entries = (): HTMLElement[] => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)') ?? []);

  // Focus goes into the menu when it opens and each time the view changes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => (entries()[0] ?? panelRef.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [view]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = entries();
    const current = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      list[stepIndex(current, e.key === "ArrowDown" ? 1 : -1, list.length)]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      list[e.key === "Home" ? 0 : list.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (view === "notifications") setView("root");
      else onClose();
    } else if (e.key === "ArrowLeft" && view === "notifications") {
      e.preventDefault();
      setView("root");
    } else if (e.key === "ArrowRight" && view === "root" && (document.activeElement as HTMLElement | null)?.dataset.submenu) {
      e.preventDefault();
      setView("notifications");
    } else if (e.key === "Tab") {
      e.preventDefault(); // the menu is a small modal list: Tab does not leave it
      list[stepIndex(current, e.shiftKey ? -1 : 1, list.length)]?.focus();
    }
  };

  const label = (it: { id: ChannelMenuItemId; count?: number }) => {
    if (it.id === "h:members") return it.count !== undefined ? t("header.membersCount", { count: it.count }) : t("header.members");
    if (it.id === "h:pins") return (it.count ?? 0) > 0 ? t("header.pinsCount", { count: it.count ?? 0 }) : t("header.pins");
    return t(LABEL[it.id]);
  };
  const notif = items.flat().find((i) => i.id === "notifications");

  const renderItem = (it: ChannelMenuItem) => {
    const Icon = ICON[it.id];
    if (it.submenu) {
      return (
        <button key={it.id} type="button" role="menuitem" aria-haspopup="menu" data-submenu="1" className={rowCls} onClick={() => setView("notifications")}>
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
          <span className="flex-1">{label(it)}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      );
    }
    const text = it.id === "delete" && confirmDelete ? t("channelMenu.deleteConfirm") : label(it);
    return (
      <button
        key={it.id}
        type="button"
        role="menuitem"
        disabled={it.disabled}
        className={`${rowCls} ${it.destructive ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10" : ""}`}
        onClick={() => onRun(it.id)}
      >
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${it.destructive ? "" : "text-muted-foreground"}`} aria-hidden />}
        <span className="flex-1">{text}</span>
      </button>
    );
  };

  const body =
    view === "notifications" && notif ? (
      <div role="group" aria-label={label({ id: "notifications" })}>
        <button type="button" role="menuitem" className={`${rowCls} text-muted-foreground`} onClick={() => setView("root")}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">{t("channelMenu.back")}</span>
        </button>
        <div className="my-1 h-px bg-border/50" role="separator" />
        {(notif.children ?? []).map((c) => {
          const Icon = ICON[c.id];
          return (
            <button key={c.id} type="button" role="menuitemradio" aria-checked={Boolean(c.checked)} className={rowCls} onClick={() => onRun(c.id)}>
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="flex-1">
                {label(c)}
                {c.id === "notif:none" && <span className="block text-[11px] font-normal text-muted-foreground">{t("channelMenu.notifNoneHint")}</span>}
              </span>
              {c.checked && <Check className="h-4 w-4 shrink-0" aria-hidden />}
            </button>
          );
        })}
      </div>
    ) : (
      items.map((section, i) => (
        <div key={i} role="group" className={i > 0 ? "mt-1 border-t border-border/50 pt-1" : undefined}>
          {section.map(renderItem)}
        </div>
      ))
    );

  const panelCls = phone
    ? "fixed inset-x-0 bottom-0 z-[281] max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-border/50 bg-popover p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-2xl"
    : "fixed z-[281] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-border/50 bg-popover p-1.5 text-popover-foreground shadow-xl";

  return (
    <Portal>
      <div className="fixed inset-0 z-[280]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
        {phone && <div className="absolute inset-0 bg-black/40" aria-hidden />}
        <div
          ref={panelRef}
          role="menu"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`${panelCls} focus:outline-none`}
          style={phone ? undefined : { left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, width: MENU_WIDTH, visibility: pos ? "visible" : "hidden" }}
        >
          <p id={titleId} className="truncate px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">#{room.name}</p>
          {body}
        </div>
      </div>
    </Portal>
  );
}

/**
 * The "..." menu of a channel (sidebar row, context menu, header). One instance owns the open state, loads the user's
 * notification preference when it opens and runs the actions through the page handlers.
 */
export function useChannelMenu(handlers: ChannelMenuHandlers | undefined, t: TFn) {
  const [open, setOpen] = useState<{ room: ChannelMenuRoom; anchor: MenuAnchor; extras?: ChannelMenuExtras } | null>(null);
  const [pref, setPref] = useState<NotifPref | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const close = useCallback(() => {
    setOpen(null);
    setConfirmDelete(false);
    const el = opener.current;
    opener.current = null;
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus());
  }, []);

  const show = useCallback((room: ChannelMenuRoom, anchor: MenuAnchor, extras?: ChannelMenuExtras) => {
    if (!handlersRef.current) return;
    opener.current = document.activeElement as HTMLElement | null;
    setPref(null);
    setConfirmDelete(false);
    setOpen({ room, anchor, extras });
  }, []);

  const roomId = open?.room.id;
  useEffect(() => {
    if (!roomId || !handlersRef.current) return;
    let cancelled = false;
    handlersRef.current.loadPref(roomId).then((p) => { if (!cancelled) setPref(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [roomId]);

  const run = useCallback(async (id: ChannelMenuItemId) => {
    const h = handlersRef.current;
    const room = open?.room;
    if (!h || !room) return;
    if (id.startsWith("h:")) {
      const x = open?.extras;
      close();
      if (!x) return;
      if (id === "h:members" && x.members) x.members.run();
      else if (id === "h:pins") x.pins.run();
      else if (id === "h:bookmarks") x.bookmarks?.run();
      else if (id === "h:copilot") x.copilot.run();
      else if (id === "h:transcripts") x.transcripts?.run();
      else if (id === "h:linked") x.linked?.run();
      return;
    }
    if (id === "delete") {
      if (!confirmDelete) { setConfirmDelete(true); return; }
      close();
      try { await h.deleteRoom(room); } catch { h.notify(t("channelMenu.deleteFailed")); }
      return;
    }
    if (id.startsWith("notif:")) {
      const next = id.slice(6) as NotifPref;
      setPref(next);
      try { await h.setPref(room, next); } catch { h.notify(t("channelMenu.prefFailed")); setPref(null); }
      close();
      return;
    }
    close();
    if (id === "markRead") {
      try { await h.markRead(room); } catch { h.notify(t("channelMenu.readFailed")); }
    } else if (id === "settings") {
      h.openSettings(room);
    } else if (id === "copyLink") {
      try {
        await navigator.clipboard.writeText(channelUrl(window.location.origin, room.id));
        h.notify(t("channelMenu.linkCopied"));
      } catch {
        h.notify(t("channelMenu.copyFailed"));
      }
    }
  }, [open, confirmDelete, close, t]);

  const element = open && handlers ? (
    <MenuView
      room={open.room}
      anchor={open.anchor}
      items={buildChannelMenu({
        roomType: open.room.type,
        linkedEntity: Boolean(open.room.linkedEntityType),
        isAiRoom: handlers.isAiRoom?.(open.room),
        unread: Boolean(open.room.unread),
        notifPref: pref,
        canManage: handlers.canManage(open.room),
        canDelete: handlers.canDelete(open.room),
        headerActions: open.extras
          ? { members: open.extras.members ? { count: open.extras.members.count } : false, pins: { count: open.extras.pins.count }, bookmarks: Boolean(open.extras.bookmarks), copilot: true, transcripts: Boolean(open.extras.transcripts), linked: Boolean(open.extras.linked) }
          : undefined,
      })}
      onClose={close}
      onRun={(id) => void run(id)}
      confirmDelete={confirmDelete}
      t={t}
    />
  ) : null;

  return { show, close, isOpen: Boolean(open), openRoomId: open?.room.id ?? null, element };
}
