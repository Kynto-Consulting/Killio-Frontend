"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import { threadRootOf, type RoomMessage, type MessageStatus } from "@/lib/api/rooms";
import {
  PAGE_SIZE, createDebounced, emptyHistory, historyReducer, isLocalMessage, shouldMarkRead, unreadDividerId,
  type HistoryAction, type HistoryPage, type HistoryState, type ReadState,
} from "@/lib/rooms/history";
import { HistoryApiError, fetchMessagesPage, fetchReadState, isLegacyBackend, putReadState } from "@/lib/rooms/history-api";

/** Where the list should scroll after a window change. `token` makes the same target repeatable. */
export type ViewTarget =
  | { kind: "bottom" }
  | { kind: "divider" }
  | { kind: "message"; id: string; highlight: boolean };
export interface ViewRequest {
  token: number;
  target: ViewTarget;
}

export type JumpResult = "ok" | "thread" | "unsupported" | "failed";
export interface JumpOutcome {
  result: JumpResult;
  /** With `thread`: the message is a thread reply, open this thread. */
  threadRootId?: string;
}

const MARK_DEBOUNCE_MS = 700;

function prepare(m: RoomMessage): RoomMessage {
  const root = threadRootOf(m as RoomMessage & { thread_root_id?: string });
  const withRoot = root && !m.threadRootId ? { ...m, threadRootId: root } : m;
  return withRoot.status ? withRoot : { ...withRoot, status: "sent" as MessageStatus };
}

interface Options {
  roomId: string | null | undefined;
  accessToken: string | null | undefined;
  userId?: string | null;
  /** Messages besides local placeholders that a trim must keep (the replies of the open thread). */
  protect?: (m: RoomMessage) => boolean;
}

/**
 * Paginated window over the messages of a room (the backend contract is in history-api.ts, the pure rules in
 * history.ts). It owns `messages` for `useRoomChat`, which keeps every other change (edits, reactions, optimistic sends)
 * through `setMessages`, and adds: first load at the latest message or the first unread, older / newer pages, jumps to
 * a message, going back to the latest messages, and the read pointer (debounced PUT).
 */
export function useRoomHistory({ roomId, accessToken, userId, protect }: Options) {
  const realtime = useRealtime();
  const [hist, setHist] = useState<HistoryState<RoomMessage>>(() => emptyHistory<RoomMessage>());
  const histRef = useRef(hist);
  histRef.current = hist;
  const protectRef = useRef(protect);
  protectRef.current = protect;
  const rules = useMemo(() => ({ protect: (m: RoomMessage) => isLocalMessage(m) || Boolean(protectRef.current?.(m)) }), []);

  const dispatch = useCallback((action: HistoryAction<RoomMessage>) => setHist((s) => historyReducer(s, action, rules)), [rules]);
  /** Same signature as a React setter of the message list: every existing `setMessages` call keeps working. */
  const setMessages = useCallback(
    (u: RoomMessage[] | ((prev: RoomMessage[]) => RoomMessage[])) => dispatch({ type: "map", fn: (prev) => (typeof u === "function" ? u(prev) : u) }),
    [dispatch],
  );
  /** A live message: applied with `update`, or only counted when the window does not touch the present. */
  const receiveLive = useCallback(
    (update: (prev: RoomMessage[]) => RoomMessage[], messageId: string) =>
      setHist((h) => {
        if (h.hasMoreAfter && !h.messages.some((m) => m.id === messageId) && !h.messages.some((m) => isLocalMessage(m))) return { ...h, pendingNew: h.pendingNew + 1 };
        return { ...h, messages: update(h.messages) };
      }),
    [],
  );

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<"forbidden" | "failed" | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [newerError, setNewerError] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [readState, setReadState] = useState<ReadState | null>(null);
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null);
  const [view, setView] = useState<ViewRequest>({ token: 0, target: { kind: "bottom" } });
  const request = useCallback((target: ViewTarget) => setView((v) => ({ token: v.token + 1, target })), []);

  const markedRef = useRef<string | null>(null);
  const readStateRef = useRef<ReadState | null>(null);
  readStateRef.current = readState;
  const unreadAnchorRef = useRef<string | null>(null);
  unreadAnchorRef.current = unreadAnchorId;
  const generation = useRef(0);
  const busyOlder = useRef(false);
  const busyNewer = useRef(false);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  // ── first load ──
  useEffect(() => {
    if (!roomId || !accessToken) return;
    const gen = ++generation.current;
    const alive = () => generation.current === gen;
    setStatus("loading");
    setLoadError(null);
    setOlderError(false);
    setNewerError(false);
    setUnreadAnchorId(null);
    setReadState(null);
    markedRef.current = null;
    busyOlder.current = false;
    busyNewer.current = false;
    (async () => {
      const [pageRes, readRes] = await Promise.allSettled([
        fetchMessagesPage<RoomMessage>(roomId, accessToken, {}, { normalize: prepare }),
        fetchReadState(roomId, accessToken),
      ]);
      if (!alive()) return;
      if (pageRes.status === "rejected") {
        console.error(pageRes.reason);
        setLoadError((pageRes.reason as { status?: number })?.status === 403 ? "forbidden" : "failed");
        setStatus("error");
        return;
      }
      let page: HistoryPage<RoomMessage> = pageRes.value;
      const rs = readRes.status === "fulfilled" ? readRes.value : null;
      let anchor: string | null = null;
      if (rs && rs.unreadCount > 0) {
        if (rs.firstUnreadMessageId && page.messages.some((m) => m.id === rs.firstUnreadMessageId)) anchor = rs.firstUnreadMessageId;
        else if (rs.firstUnreadMessageId && !page.legacy) {
          try {
            const around = await fetchMessagesPage<RoomMessage>(roomId, accessToken, { around: rs.firstUnreadMessageId }, { normalize: prepare });
            if (!alive()) return;
            page = around;
            anchor = rs.firstUnreadMessageId;
          } catch {
            // the latest page is shown; the banner still offers the jump
          }
        } else anchor = unreadDividerId(page.messages, rs, userId);
      }
      markedRef.current = rs?.lastReadMessageId ?? null;
      setHist(() => historyReducer(emptyHistory<RoomMessage>(), { type: "replace", page }, rules));
      setReadState(rs);
      setUnreadAnchorId(anchor);
      setStatus("ready");
      request(anchor ? { kind: "divider" } : { kind: "bottom" });
    })();
    return () => {
      generation.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, accessToken, loadAttempt]);
  const reload = useCallback(() => setLoadAttempt((n) => n + 1), []);

  // ── older / newer pages ──
  const loadOlder = useCallback(async () => {
    const token = tokenRef.current;
    const h = histRef.current;
    if (!roomId || !token || busyOlder.current || !h.hasMoreBefore) return;
    const first = h.messages.find((m) => !isLocalMessage(m) && !m.threadRootId) ?? h.messages.find((m) => !isLocalMessage(m));
    if (!first) return;
    const gen = generation.current;
    busyOlder.current = true;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const page = await fetchMessagesPage<RoomMessage>(roomId, token, { before: first.id, beforeAt: first.createdAt }, { normalize: prepare });
      if (generation.current !== gen) return;
      dispatch({ type: "prepend", page });
    } catch (e) {
      console.error(e);
      if (generation.current === gen) setOlderError(true);
    } finally {
      busyOlder.current = false;
      if (generation.current === gen) setLoadingOlder(false);
    }
  }, [roomId, dispatch]);

  const loadNewer = useCallback(async () => {
    const token = tokenRef.current;
    const h = histRef.current;
    if (!roomId || !token || busyNewer.current || !h.hasMoreAfter) return;
    const last = [...h.messages].reverse().find((m) => !isLocalMessage(m));
    if (!last) return;
    const gen = generation.current;
    busyNewer.current = true;
    setLoadingNewer(true);
    setNewerError(false);
    try {
      const page = await fetchMessagesPage<RoomMessage>(roomId, token, { after: last.id }, { normalize: prepare });
      if (generation.current !== gen) return;
      dispatch({ type: "append", page });
    } catch (e) {
      console.error(e);
      if (generation.current === gen) setNewerError(true);
    } finally {
      busyNewer.current = false;
      if (generation.current === gen) setLoadingNewer(false);
    }
  }, [roomId, dispatch]);

  // ── jumps ──
  /** Back to the latest messages (fresh page), keeping the placeholders of messages being sent. */
  const goToLatest = useCallback(async (): Promise<boolean> => {
    const token = tokenRef.current;
    if (!roomId || !token) return false;
    const gen = generation.current;
    setJumping(true);
    try {
      const page = await fetchMessagesPage<RoomMessage>(roomId, token, {}, { normalize: prepare });
      if (generation.current !== gen) return false;
      dispatch({ type: "replace", page, keepLocal: true });
      setOlderError(false);
      setNewerError(false);
      request({ kind: "bottom" });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    } finally {
      if (generation.current === gen) setJumping(false);
    }
  }, [roomId, dispatch, request]);

  /**
   * Shows a message: scrolls to it when it is loaded, otherwise loads the window around it. A thread reply answers
   * `message_in_thread`: the outcome carries the thread root so the caller can open the thread.
   */
  const jumpTo = useCallback(
    async (messageId: string, opts: { highlight?: boolean; target?: "message" | "divider" } = {}): Promise<JumpOutcome> => {
      const token = tokenRef.current;
      if (!roomId || !token) return { result: "failed" };
      const highlight = opts.highlight !== false;
      const show = (): ViewTarget => (opts.target === "divider" ? { kind: "divider" } : { kind: "message", id: messageId, highlight });
      const loaded = histRef.current.messages.find((m) => m.id === messageId);
      if (loaded) {
        if (loaded.threadRootId && histRef.current.messages.some((m) => m.id === loaded.threadRootId)) return { result: "thread", threadRootId: loaded.threadRootId };
        request(show());
        return { result: "ok" };
      }
      const gen = generation.current;
      setJumping(true);
      try {
        const page = await fetchMessagesPage<RoomMessage>(roomId, token, { around: messageId }, { normalize: prepare });
        if (generation.current !== gen) return { result: "failed" };
        const target = page.messages.find((m) => m.id === messageId);
        if (!target) return { result: "failed" };
        dispatch({ type: "replace", page, keepLocal: true });
        setOlderError(false);
        setNewerError(false);
        request(show());
        return { result: "ok" };
      } catch (e) {
        if (e instanceof HistoryApiError) {
          if (e.threadRootId) return { result: "thread", threadRootId: e.threadRootId };
          if (e.code === "unsupported") return { result: "unsupported" };
        }
        console.error(e);
        return { result: "failed" };
      } finally {
        if (generation.current === gen) setJumping(false);
      }
    },
    [roomId, dispatch, request],
  );

  // ── read pointer ──
  const sendRead = useCallback(
    async (messageId: string) => {
      const token = tokenRef.current;
      if (!roomId || !token) return;
      try {
        const next = await putReadState(roomId, token, { messageId });
        markedRef.current = messageId;
        if (next) setReadState(next);
      } catch (e) {
        // not fatal: the next scroll tries again
        console.error(e);
      }
    },
    [roomId],
  );
  const debounced = useMemo(() => createDebounced((id: string) => void sendRead(id), MARK_DEBOUNCE_MS), [sendRead]);
  useEffect(() => () => debounced.cancel(), [debounced, roomId]);

  /** The user has seen everything up to `messageId`: reported (debounced) only when it is newer than the last report. */
  const markReadUpTo = useCallback(
    (messageId: string | null) => {
      const h = histRef.current;
      if (!messageId || !shouldMarkRead(h.messages, markedRef.current, messageId)) return;
      markedRef.current = messageId;
      debounced.call(messageId);
    },
    [debounced],
  );

  /** "Mark as read": goes to the latest messages when needed and reports the newest one at once. */
  const markAllRead = useCallback(async () => {
    debounced.cancel();
    if (histRef.current.hasMoreAfter) await goToLatest();
    const last = [...histRef.current.messages].reverse().find((m) => !isLocalMessage(m));
    setUnreadAnchorId(null);
    setReadState((s) => (s ? { ...s, unreadCount: 0, unreadMentions: 0, unreadCapped: false } : s));
    if (last) {
      markedRef.current = last.id;
      await sendRead(last.id);
    }
  }, [debounced, goToLatest, sendRead]);

  const dismissUnread = useCallback(() => setUnreadAnchorId(null), []);

  /** "Jump to unread": the divider goes before the first unread message, which is loaded around when it is far. */
  const jumpToUnread = useCallback(async () => {
    const id = readStateRef.current?.firstUnreadMessageId ?? unreadAnchorRef.current;
    if (!id) return;
    const out = await jumpTo(id, { highlight: false, target: "divider" });
    if (out.result === "ok") setUnreadAnchorId(id);
  }, [jumpTo]);

  // Another device of the same user read the room: refresh the pointer (only the counters change here).
  useEffect(() => {
    if (!roomId || !realtime) return;
    const channel = realtime.getChannel(realtimeChannel.room(roomId));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpto = (msg: { data: unknown }) => {
      const d = (msg.data ?? {}) as { userId?: string; messageId?: string };
      if (!userId || d.userId !== userId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const token = tokenRef.current;
        if (!token) return;
        fetchReadState(roomId, token).then((s) => { if (s) setReadState(s); }).catch(() => {});
      }, 500);
    };
    channel.subscribe("room.message.read.upto", onUpto);
    return () => {
      if (timer) clearTimeout(timer);
      try { channel.unsubscribe("room.message.read.upto", onUpto); } catch {}
    };
  }, [roomId, realtime, userId]);

  return {
    messages: hist.messages,
    setMessages,
    receiveLive,
    hasMoreBefore: hist.hasMoreBefore,
    hasMoreAfter: hist.hasMoreAfter,
    pendingNew: hist.pendingNew,
    status,
    isLoading: status === "loading",
    loadError,
    reload,
    loadingOlder,
    loadingNewer,
    olderError,
    newerError,
    jumping,
    loadOlder,
    loadNewer,
    goToLatest,
    jumpTo,
    readState,
    unreadAnchorId,
    markReadUpTo,
    markAllRead,
    dismissUnread,
    jumpToUnread,
    view,
    requestView: request,
    legacy: isLegacyBackend(),
    pageSize: PAGE_SIZE,
  };
}
