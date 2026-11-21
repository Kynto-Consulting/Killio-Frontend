"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HistoryApiError, searchMessages, type SearchResponse, type SearchResult, type SearchScope, type SearchSort } from "@/lib/rooms/history-api";

export type SearchFailure =
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "too_long" }
  | { kind: "forbidden" }
  | { kind: "invalid_cursor" }
  | { kind: "failed" };

export function classifySearchError(e: unknown): SearchFailure {
  if (e instanceof HistoryApiError) {
    if (e.status === 429 || e.code === "rate_limited") return { kind: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil(e.retryAfterSeconds ?? 10)) };
    if (e.code === "q_too_long") return { kind: "too_long" };
    if (e.code === "invalid_cursor") return { kind: "invalid_cursor" };
    if (e.status === 403) return { kind: "forbidden" };
  }
  return { kind: "failed" };
}

interface Options {
  accessToken: string | null | undefined;
  scope: SearchScope;
  /** Room id (scope room) or team id (scope team). */
  id: string | null | undefined;
}

/**
 * Runs the message search: one request at a time (a new search aborts the previous one and an old answer never
 * overwrites a newer one), pages appended with the cursor, and a rate-limit countdown when the server says 429.
 */
export function useRoomSearch({ accessToken, scope, id }: Options) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [meta, setMeta] = useState<SearchResponse | null>(null);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailure, setMoreFailure] = useState<SearchFailure | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const last = useRef<{ q: string; sort: SearchSort } | null>(null);
  const cursor = useRef<string | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds: number) => {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    setCooldown(seconds);
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    abort.current?.abort();
    abort.current = null;
  }, []);

  const clear = useCallback(() => {
    cancel();
    last.current = null;
    cursor.current = null;
    setStatus("idle");
    setResults([]);
    setMeta(null);
    setFailure(null);
    setMoreFailure(null);
    setLoadingMore(false);
  }, [cancel]);

  /** A new search (first page). */
  const run = useCallback(
    async (q: string, sort: SearchSort) => {
      if (!accessToken || !id || !q.trim()) return;
      cancel();
      const gen = generation.current;
      const ctrl = new AbortController();
      abort.current = ctrl;
      last.current = { q, sort };
      cursor.current = null;
      setStatus("loading");
      setFailure(null);
      setMoreFailure(null);
      setLoadingMore(false);
      try {
        const res = await searchMessages({ scope, id, q, sort, limit: 25 }, accessToken, { signal: ctrl.signal });
        if (generation.current !== gen) return;
        setResults(res.results);
        setMeta(res);
        cursor.current = res.nextCursor;
        setStatus("ready");
      } catch (e) {
        if (generation.current !== gen || (e as { name?: string })?.name === "AbortError") return;
        const f = classifySearchError(e);
        if (f.kind === "rate_limited") startCooldown(f.retryAfterSeconds);
        setFailure(f);
        setStatus("error");
      }
    },
    [accessToken, id, scope, cancel, startCooldown],
  );

  /** The next page of the current search. */
  const loadMore = useCallback(async () => {
    const cur = last.current;
    if (!accessToken || !id || !cur || !cursor.current || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    setMoreFailure(null);
    try {
      const res = await searchMessages({ scope, id, q: cur.q, sort: cur.sort, limit: 25, cursor: cursor.current }, accessToken);
      if (generation.current !== gen) return;
      setResults((prev) => {
        const seen = new Set(prev.map((r) => r.messageId));
        return [...prev, ...res.results.filter((r) => !seen.has(r.messageId))];
      });
      setMeta((m) => (m ? { ...m, hasMore: res.hasMore, nextCursor: res.nextCursor, warnings: m.warnings } : res));
      cursor.current = res.nextCursor;
    } catch (e) {
      if (generation.current !== gen) return;
      const f = classifySearchError(e);
      if (f.kind === "rate_limited") startCooldown(f.retryAfterSeconds);
      setMoreFailure(f);
    } finally {
      if (generation.current === gen) setLoadingMore(false);
    }
  }, [accessToken, id, scope, loadingMore, startCooldown]);

  // A different scope or target makes the old results meaningless.
  useEffect(() => {
    clear();
  }, [scope, id, clear]);
  useEffect(() => () => {
    cancel();
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
  }, [cancel]);

  return { status, results, meta, failure, loadingMore, moreFailure, cooldown, hasMore: Boolean(meta?.hasMore), run, loadMore, clear, cancel };
}
