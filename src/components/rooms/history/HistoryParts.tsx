"use client";

import { ArrowDown, ChevronsDown, Loader2, RefreshCw } from "lucide-react";
import type { ViewRequest } from "@/hooks/use-room-history";
import { UNREAD_DIVIDER_ID } from "@/hooks/use-room-history-scroll";
import { formatNewCount } from "@/lib/rooms/history";

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Everything the message list needs from `useRoomChat().history`, in one prop. */
export interface RoomHistoryView {
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  olderError: boolean;
  newerError: boolean;
  jumping: boolean;
  /** Live messages that arrived while the window was away from the present. */
  pendingNew: number;
  view: ViewRequest;
  /** The "New messages" divider goes before this message. */
  unreadAnchorId: string | null;
  unreadCount: number;
  unreadMentions: number;
  unreadCapped: boolean;
  /** When the first unread message was sent. */
  unreadSince: string | null;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  onGoToLatest: () => void;
  onReadUpTo: (messageId: string) => void;
  onMarkAllRead: () => void;
  onJumpToUnread: () => void;
}

const btn = "rounded-md px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] motion-reduce:transition-none";

function sinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

/** Sticky strip at the top of the list: how many messages are new and the two ways out. */
export function UnreadBanner({ h, t }: { h: RoomHistoryView; t: TFn }) {
  const count = `${h.unreadCount}${h.unreadCapped ? "+" : ""}`;
  const since = sinceLabel(h.unreadSince);
  return (
    <div role="region" aria-label={t("history.unreadRegion")} className="sticky top-0 z-10 -mx-1 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-rose-500/40 bg-rose-50 px-2.5 py-1 text-xs text-rose-900 shadow-sm dark:bg-rose-950 dark:text-rose-100">
      <span className="min-w-0 flex-1 font-semibold">
        {since ? t("history.unreadSince", { count, since }) : t("history.unreadCount", { count })}
        {h.unreadMentions > 0 && <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-px text-[10px] font-bold text-white">{t("history.unreadMentions", { count: h.unreadMentions })}</span>}
      </span>
      <button type="button" onClick={h.onJumpToUnread} className={`${btn} hover:bg-rose-500/15`}>{t("history.jumpToUnread")}</button>
      <button type="button" onClick={h.onMarkAllRead} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>{t("history.markRead")}</button>
    </div>
  );
}

export function UnreadDivider({ t }: { t: TFn }) {
  return (
    <div id={UNREAD_DIVIDER_ID} role="separator" aria-label={t("history.newMessages")} className="flex items-center gap-2 py-2">
      <div className="h-px flex-1 bg-rose-500/60" />
      <span className="rounded-full bg-rose-600 px-2 py-px text-[10px] font-bold uppercase tracking-wider text-white">{t("history.newMessages")}</span>
      <div className="h-px flex-1 bg-rose-500/60" />
    </div>
  );
}

/** Top or bottom edge of the window: a spinner while loading, an error with retry, or a plain button to load more. */
export function EdgeStatus({ edge, loading, error, onLoad, t }: { edge: "top" | "bottom"; loading: boolean; error: boolean; onLoad: () => void; t: TFn }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        <span>{edge === "top" ? t("history.loadingOlder") : t("history.loadingNewer")}</span>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mx-auto my-2 flex max-w-sm items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
        <span>{edge === "top" ? t("history.olderFailed") : t("history.newerFailed")}</span>
        <button type="button" onClick={onLoad} className={`${btn} inline-flex items-center gap-1 border border-destructive/40 hover:bg-destructive/10`}>
          <RefreshCw className="h-3 w-3" aria-hidden />{t("errors.retry")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-center py-1">
      <button type="button" onClick={onLoad} className={`${btn} text-muted-foreground hover:bg-muted hover:text-foreground`}>
        {edge === "top" ? t("history.loadOlder") : t("history.loadNewer")}
      </button>
    </div>
  );
}

export function StartOfConversation({ t }: { t: TFn }) {
  return <p className="py-3 text-center text-[11px] text-muted-foreground">{t("history.start")}</p>;
}

/** Floating button: back to the present, with the number of messages that arrived meanwhile. */
export function JumpToLatestButton({ count, busy, onClick, t }: { count: number; busy: boolean; onClick: () => void; t: TFn }) {
  const label = count > 0 ? t("history.newBelow", { count: formatNewCount(count) }) : t("history.toLatest");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className="absolute bottom-3 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--memphis-line)] bg-card px-3 py-1.5 text-xs font-bold shadow-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-60 motion-reduce:transition-none"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : count > 0 ? <ChevronsDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />}
      <span>{label}</span>
    </button>
  );
}
