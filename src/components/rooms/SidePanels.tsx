"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Clock, Loader2, Pin, PinOff, Send, X, MessagesSquare, RefreshCw } from "lucide-react";
import { flashMessage } from "@/hooks/use-room-history-scroll";
import { usePinClock } from "@/hooks/use-pin-expiry";
import { canUnpinMessage, classifyPinError, formatPinCountdown, isPinActive, pinTimeLeft, sortPins, type PinCaps } from "@/lib/rooms/pins";
import { parseAiMarkup } from "@/lib/ai-markup";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { RoomMessage } from "@/lib/api/rooms";

type TFn = (key: string, params?: Record<string, string | number>) => string;

function PanelHeader({ title, onClose, closeLabel }: { title: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      <button type="button" onClick={onClose} aria-label={closeLabel} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

interface PinnedPanelProps {
  messages: RoomMessage[];
  isLoading?: boolean;
  /** The list could not be read (no permission to see pins, or a failure). */
  error?: "forbidden" | "failed" | null;
  /** Pin limit of the channel (null until the summary is known). */
  limit: number | null;
  currentUserId: string;
  caps: PinCaps;
  /** Display name of the person who pinned, when known. */
  nameOf: (userId: string) => string | null;
  onUnpin: (messageId: string) => Promise<void>;
  onChangeExpiry: (messageId: string) => void;
  onJump: (messageId: string) => void;
  onClose: () => void;
  t: TFn;
}

/** Pinned messages of the channel, newest pin first, with who pinned, when and a live "expires in" counter. */
export function PinnedPanel({ messages, isLoading, error: loadError, limit, currentUserId, caps, nameOf, onUnpin, onChangeExpiry, onJump, onClose, t }: PinnedPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = usePinClock(messages);
  const active = sortPins(messages.filter((m) => isPinActive(m, now)));

  const unpin = async (id: string) => {
    setBusyId(id);
    setError(null);
    try { await onUnpin(id); } catch (e) { setError(t(`pins.errors.${classifyPinError(e).kind === "forbidden" ? "forbidden" : "generic"}`)); } finally { setBusyId(null); }
  };

  const snippet = (m: RoomMessage) => (parseAiMarkup(m.content).visibleText || m.content).slice(0, 40);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      <PanelHeader title={t("pins.title")} onClose={onClose} closeLabel={t("members.close")} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!isLoading && !loadError && (
          <p className="mb-2 px-1 text-[11px] font-semibold text-muted-foreground" aria-label={limit ? t("pins.counterLabel", { count: active.length, limit }) : undefined}>
            {limit ? t("pins.counter", { count: active.length, limit }) : String(active.length)}
          </p>
        )}
        {isLoading && <div className="flex justify-center py-4" role="status" aria-label={t("pins.loading")}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden /></div>}
        {loadError && <p role="alert" className="mb-2 text-xs text-destructive">{loadError === "forbidden" ? t("pins.viewForbidden") : t("pins.loadFailed")}</p>}
        {!isLoading && !loadError && active.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted-foreground">
            <Pin className="h-6 w-6 opacity-50" aria-hidden />
            <p className="font-semibold text-foreground">{t("pins.emptyTitle")}</p>
            <p>{t("pins.emptyHint")}</p>
          </div>
        )}
        {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
        <ul className="space-y-2">
          {active.map((m) => {
            const left = pinTimeLeft(m, now);
            const pinner = m.pinnedBy ? (m.pinnedBy === currentUserId ? t("pins.pinnedByYou") : nameOf(m.pinnedBy) ? t("pins.pinnedBy", { name: nameOf(m.pinnedBy) as string }) : t("pins.pinnedByUnknown")) : t("pins.pinnedByUnknown");
            const mayUnpin = canUnpinMessage(m, currentUserId, caps);
            return (
              <li key={m.id} className="rounded-xl border-2 border-[var(--memphis-line)] bg-background p-2.5">
                <div className="mb-1 flex items-center gap-2">
                  <img src={getUserAvatarUrl(m.user?.avatarUrl, m.user?.email, 20)} alt="" className="h-5 w-5 rounded-full border border-border object-cover" />
                  <span className="truncate text-xs font-bold">{m.user?.displayName ?? t("ai.unknown")}</span>
                  <time className="ml-auto shrink-0 text-[10px] text-muted-foreground" dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleDateString()}</time>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-foreground/90">{parseAiMarkup(m.content).visibleText || m.content}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                  <span>{pinner}</span>
                  {m.pinnedAt && <><span aria-hidden>·</span><time dateTime={m.pinnedAt}>{new Date(m.pinnedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time></>}
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5 font-semibold text-foreground/80" title={m.pinExpiresAt ? new Date(m.pinExpiresAt).toLocaleString() : undefined}>
                    <Clock className="h-2.5 w-2.5" aria-hidden />
                    {left === null ? t("pins.noExpiry") : t("pins.expiresIn", { time: formatPinCountdown(left) })}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <button type="button" onClick={() => onJump(m.id)} className="rounded-md border border-border px-2 py-0.5 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("pins.jump")}</button>
                  {caps.canPin && (
                    <button type="button" onClick={() => onChangeExpiry(m.id)} aria-label={t("pins.changeLabel", { text: snippet(m) })} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
                      <Clock className="h-3 w-3" aria-hidden />{t("msg.changeExpiry")}
                    </button>
                  )}
                  {mayUnpin && (
                    <button type="button" onClick={() => void unpin(m.id)} disabled={busyId === m.id} aria-label={t("pins.unpinLabel", { text: snippet(m) })} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-50">
                      <PinOff className="h-3 w-3" aria-hidden />{t("msg.unpin")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

interface ThreadPanelProps {
  root: RoomMessage | undefined;
  replies: RoomMessage[];
  canReply: boolean;
  onSend: (content: string) => Promise<void>;
  renderMessage: (message: RoomMessage) => React.ReactNode;
  onClose: () => void;
  /** Pagination of the replies (use-room-thread-history.ts). Without it the panel shows what it is given. */
  paging?: ThreadPaging;
  /** A reply to scroll to and highlight once it is rendered (opened from a search result). */
  focusId?: string | null;
  t: TFn;
}

export interface ThreadPaging {
  hasBefore: boolean;
  hasAfter: boolean;
  loading: boolean;
  error: boolean;
  loadingBefore: boolean;
  loadingAfter: boolean;
  beforeError: boolean;
  afterError: boolean;
  onLoadBefore: () => void;
  onLoadAfter: () => void;
  onRetry: () => void;
}

function ThreadEdge({ edge, loading, error, onLoad, t }: { edge: "before" | "after"; loading: boolean; error: boolean; onLoad: () => void; t: TFn }) {
  const cls = "rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]";
  if (loading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />{edge === "before" ? t("history.loadingOlder") : t("history.loadingNewer")}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-1">
      {error && <p role="alert" className="mb-1 text-[11px] text-destructive">{edge === "before" ? t("history.olderFailed") : t("history.newerFailed")}</p>}
      <button type="button" onClick={onLoad} className={cls}>
        {error && <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />}
        {error ? t("errors.retry") : edge === "before" ? t("thread.loadOlder") : t("thread.loadNewer")}
      </button>
    </div>
  );
}

/** A simple thread: the original message, its replies, and a field to answer in the thread. */
export function ThreadPanel({ root, replies, canReply, onSend, renderMessage, onClose, paging, focusId, t }: ThreadPanelProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const keepFromBottom = useRef<number | null>(null);
  const topSentinel = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(content);
      setText("");
    } catch {
      setError(t("msg.errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const firstId = replies[0]?.id;
  const loadBefore = () => {
    const el = scrollerRef.current;
    if (el) keepFromBottom.current = el.scrollHeight - el.scrollTop;
    paging?.onLoadBefore();
  };
  // Older replies were added above: keep what the user was reading where it was.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && keepFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    }
  }, [firstId]);
  // Scrolling to the top loads the previous page.
  const canLoadBefore = Boolean(paging?.hasBefore && !paging.loadingBefore && !paging.beforeError && !paging.loading);
  useEffect(() => {
    const root = scrollerRef.current;
    const el = topSentinel.current;
    if (!root || !el || !canLoadBefore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadBefore(); }, { root, rootMargin: "120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadBefore, firstId]);
  // Opened on a reply (search result): bring it into view and highlight it.
  const focusedRef = useRef<string | null>(null);
  const focusPresent = Boolean(focusId && replies.some((r) => r.id === focusId));
  useEffect(() => {
    if (!focusId || !focusPresent || focusedRef.current === focusId) return;
    const el = document.getElementById(`msg-${focusId}`);
    if (!el) return;
    focusedRef.current = focusId;
    el.scrollIntoView({ block: "center" });
    flashMessage(el);
  }, [focusId, focusPresent]);
  useEffect(() => { focusedRef.current = null; }, [focusId]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      <PanelHeader title={t("thread.title")} onClose={onClose} closeLabel={t("members.close")} />
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!root ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("thread.rootMissing")}</p>
        ) : (
          <>
            <div className="border-b border-border pb-2">{renderMessage(root)}</div>
            <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <MessagesSquare className="mr-1 inline h-3 w-3" aria-hidden />{t("thread.replies", { count: replies.length })}
            </p>
            {paging?.loading && replies.length === 0 && (
              <div role="status" aria-label={t("chat.loading")} className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden /></div>
            )}
            {paging?.error && (
              <div role="alert" className="mx-2 my-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
                <span>{t("thread.loadFailed")}</span>
                <button type="button" onClick={paging.onRetry} className="rounded-md border border-destructive/40 px-2 py-0.5 font-semibold hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("errors.retry")}</button>
              </div>
            )}
            {paging?.hasBefore && (
              <>
                <div ref={topSentinel} aria-hidden className="h-px" />
                <ThreadEdge edge="before" loading={paging.loadingBefore} error={paging.beforeError} onLoad={loadBefore} t={t} />
              </>
            )}
            {replies.length === 0 && !paging?.loading && !paging?.error && <p className="px-2 py-3 text-xs text-muted-foreground">{t("thread.noReplies")}</p>}
            <div>{replies.map((r) => <div key={r.id}>{renderMessage(r)}</div>)}</div>
            {paging?.hasAfter && <ThreadEdge edge="after" loading={paging.loadingAfter} error={paging.afterError} onLoad={paging.onLoadAfter} t={t} />}
          </>
        )}
      </div>
      {root && (
        <div className="shrink-0 border-t-2 border-[var(--memphis-line)] p-2">
          {canReply ? (
            <>
              <div className="flex items-end gap-1.5">
                <label className="sr-only" htmlFor="thread-input">{t("thread.inputLabel")}</label>
                <textarea
                  id="thread-input"
                  value={text}
                  rows={2}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={t("thread.inputPlaceholder")}
                  disabled={busy}
                  className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]"
                />
                <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} aria-label={t("chat.send")} className="rounded-full bg-[hsl(var(--accent-ink))] p-2 text-[hsl(var(--accent-ink-fg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                </button>
              </div>
              {error && <p role="alert" className="mt-1 text-[11px] text-destructive">{error}</p>}
            </>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">{t("thread.readOnly")}</p>
          )}
        </div>
      )}
    </div>
  );
}
