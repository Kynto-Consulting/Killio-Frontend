"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { threadRootOf, type MessageStatus, type RoomMessage } from "@/lib/api/rooms";
import { rangeAfterPage, type ReplyRange } from "@/lib/rooms/history";
import { fetchMessagesPage } from "@/lib/rooms/history-api";

function prepare(m: RoomMessage): RoomMessage {
  const root = threadRootOf(m as RoomMessage & { thread_root_id?: string });
  const withRoot = root && !m.threadRootId ? { ...m, threadRootId: root } : m;
  return withRoot.status ? withRoot : { ...withRoot, status: "sent" as MessageStatus };
}

interface Options {
  roomId: string | null | undefined;
  /** Root of the open thread (null: no thread open). */
  rootId: string | null;
  accessToken: string | null | undefined;
  /** Opens the thread on this reply (a search result): the page around it is loaded instead of the latest one. */
  focusId?: string | null;
  /** Adds the replies to the room's message list. */
  mergeMessages: (messages: RoomMessage[]) => void;
}

/**
 * Pages of a thread with the same scheme as the room: the latest replies first, older ones on demand (`before`), and,
 * when the thread is opened on a reply that is far away, the page around it plus newer ones (`after`).
 * `range` is what the panel shows (see `windowReplies`) so replies loaded earlier never leave a gap.
 */
export function useThreadHistory({ roomId, rootId, accessToken, focusId, mergeMessages }: Options) {
  const [range, setRange] = useState<ReplyRange | null>(null);
  const [hasBefore, setHasBefore] = useState(false);
  const [hasAfter, setHasAfter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const [loadingAfter, setLoadingAfter] = useState(false);
  const [beforeError, setBeforeError] = useState(false);
  const [afterError, setAfterError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const oldest = useRef<{ id: string; createdAt: string } | null>(null);
  const newest = useRef<{ id: string; createdAt: string } | null>(null);
  const generation = useRef(0);
  const rangeRef = useRef<ReplyRange | null>(null);
  rangeRef.current = range;
  const busy = useRef({ before: false, after: false });
  const mergeRef = useRef(mergeMessages);
  mergeRef.current = mergeMessages;
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  useEffect(() => {
    const gen = ++generation.current;
    setRange(null);
    setHasBefore(false);
    setHasAfter(false);
    setError(false);
    setBeforeError(false);
    setAfterError(false);
    oldest.current = null;
    newest.current = null;
    busy.current = { before: false, after: false };
    if (!rootId || !roomId || !accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMessagesPage<RoomMessage>(roomId, accessToken, focusId ? { around: focusId, threadRootId: rootId } : { threadRootId: rootId }, { normalize: prepare })
      .catch((e) => {
        // an old server cannot do `around`: show the latest replies instead
        if (focusId && (e as { code?: string })?.code === "unsupported") return fetchMessagesPage<RoomMessage>(roomId, accessToken, { threadRootId: rootId }, { normalize: prepare });
        throw e;
      })
      .then((page) => {
        if (generation.current !== gen) return;
        mergeRef.current(page.messages);
        oldest.current = page.messages[0] ? { id: page.messages[0].id, createdAt: page.messages[0].createdAt } : null;
        const last = page.messages[page.messages.length - 1];
        newest.current = last ? { id: last.id, createdAt: last.createdAt } : null;
        setHasBefore(page.hasMoreBefore);
        setHasAfter(page.hasMoreAfter);
        setRange(rangeAfterPage(null, page, "replace"));
      })
      .catch((e) => {
        if (generation.current !== gen) return;
        console.error(e);
        setError(true);
      })
      .finally(() => { if (generation.current === gen) setLoading(false); });
    return () => { generation.current += 1; };
  }, [rootId, roomId, accessToken, focusId, attempt]);

  const loadBefore = useCallback(async () => {
    const token = tokenRef.current;
    const cursor = oldest.current;
    if (!rootId || !roomId || !token || !cursor || busy.current.before) return;
    const gen = generation.current;
    busy.current.before = true;
    setLoadingBefore(true);
    setBeforeError(false);
    try {
      const page = await fetchMessagesPage<RoomMessage>(roomId, token, { before: cursor.id, beforeAt: cursor.createdAt, threadRootId: rootId }, { normalize: prepare });
      if (generation.current !== gen) return;
      mergeRef.current(page.messages);
      if (page.messages[0]) oldest.current = { id: page.messages[0].id, createdAt: page.messages[0].createdAt };
      setHasBefore(page.hasMoreBefore);
      setRange((r) => rangeAfterPage(r ?? rangeRef.current, page, "before"));
    } catch (e) {
      console.error(e);
      if (generation.current === gen) setBeforeError(true);
    } finally {
      busy.current.before = false;
      if (generation.current === gen) setLoadingBefore(false);
    }
  }, [rootId, roomId]);

  const loadAfter = useCallback(async () => {
    const token = tokenRef.current;
    const cursor = newest.current;
    if (!rootId || !roomId || !token || !cursor || busy.current.after) return;
    const gen = generation.current;
    busy.current.after = true;
    setLoadingAfter(true);
    setAfterError(false);
    try {
      const page = await fetchMessagesPage<RoomMessage>(roomId, token, { after: cursor.id, threadRootId: rootId }, { normalize: prepare });
      if (generation.current !== gen) return;
      mergeRef.current(page.messages);
      const last = page.messages[page.messages.length - 1];
      if (last) newest.current = { id: last.id, createdAt: last.createdAt };
      setHasAfter(page.hasMoreAfter);
      setRange((r) => rangeAfterPage(r ?? rangeRef.current, page, "after"));
    } catch (e) {
      console.error(e);
      if (generation.current === gen) setAfterError(true);
    } finally {
      busy.current.after = false;
      if (generation.current === gen) setLoadingAfter(false);
    }
  }, [rootId, roomId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { range, hasBefore, hasAfter, loading, error, loadingBefore, loadingAfter, beforeError, afterError, loadBefore, loadAfter, retry };
}
