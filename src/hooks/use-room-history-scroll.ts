"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ViewRequest } from "@/hooks/use-room-history";

const BOTTOM_THRESHOLD = 80;
const SETTLE_MS = 1500;
const HIGHLIGHT_MS = 2000;
const GIVE_UP_MS = 2500;
const READ_THROTTLE_MS = 150;
export const UNREAD_DIVIDER_ID = "room-unread-divider";

/** Pulses a message for two seconds (the existing `animate-pulse-accent` class) and puts the keyboard focus on it. */
export function flashMessage(el: HTMLElement, focus = true): void {
  el.classList.add("animate-pulse-accent");
  window.setTimeout(() => el.classList.remove("animate-pulse-accent"), HIGHLIGHT_MS);
  if (focus) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus({ preventScroll: true }); } catch { /* not focusable here */ }
  }
}

interface Options {
  scrollRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Ids of the messages the list renders, in order. */
  ids: readonly string[];
  view: ViewRequest | undefined;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  olderError: boolean;
  newerError: boolean;
  onLoadOlder: () => void;
  onLoadNewer: () => void;
  /** The newest message the user has on screen (for the read pointer). */
  onReadUpTo?: (messageId: string) => void;
  /** Where the list is scrolled (reported only once the position requested for the current room was applied). */
  onScrollPosition?: (top: number, atPresent: boolean) => void;
  reducedMotion: boolean;
}

/**
 * Scroll mechanics of the paginated list:
 *  - keeps the position EXACT when messages are added or dropped above the viewport (the first message on screen stays
 *    where it was, measured, so it also works where the browser does no scroll anchoring);
 *  - obeys the view requests of the history hook (bottom, first unread, a message), retrying until the target is rendered
 *    and following layout changes (images, embeds) for a moment, unless the user scrolls;
 *  - loads the previous / next page when a sentinel gets near the viewport (only after the first position was applied);
 *  - tells whether the user is at the present (bottom and no newer page missing) and reports the newest visible message.
 */
export function useRoomHistoryScroll(o: Options) {
  const { scrollRef, contentRef, enabled } = o;
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [positioned, setPositioned] = useState(false);
  const topSentinel = useRef<HTMLDivElement | null>(null);
  const bottomSentinel = useRef<HTMLDivElement | null>(null);

  const idSet = useRef<Set<string>>(new Set());
  idSet.current = new Set(o.ids);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const handled = useRef(0);
  const prevNewest = useRef<string | undefined>(undefined);
  const settle = useRef<{ until: number; apply: () => void } | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRead = useRef(0);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMoreAfterRef = useRef(o.hasMoreAfter);
  hasMoreAfterRef.current = o.hasMoreAfter;
  const optsRef = useRef(o);
  optsRef.current = o;

  const messageEls = useCallback((): HTMLElement[] => {
    const root = scrollRef.current;
    if (!root) return [];
    const out: HTMLElement[] = [];
    root.querySelectorAll<HTMLElement>('[id^="msg-"]').forEach((el) => {
      if (idSet.current.has(el.id.slice(4))) out.push(el);
    });
    return out;
  }, [scrollRef]);

  const captureAnchor = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    for (const el of messageEls()) {
      const r = el.getBoundingClientRect();
      if (r.bottom > box.top + 1) {
        anchor.current = { id: el.id, top: r.top - box.top };
        return;
      }
    }
    anchor.current = null;
  }, [scrollRef, messageEls]);

  const reportRead = useCallback(() => {
    const cb = optsRef.current.onReadUpTo;
    const root = scrollRef.current;
    if (!cb || !root || document.visibilityState !== "visible") return;
    const box = root.getBoundingClientRect();
    const els = messageEls();
    for (let i = els.length - 1; i >= 0; i -= 1) {
      const r = els[i]!.getBoundingClientRect();
      if (r.top < box.bottom - 8 && r.bottom > box.top) {
        cb(els[i]!.id.slice(4));
        return;
      }
    }
  }, [scrollRef, messageEls]);

  const stopSettling = useCallback(() => {
    settle.current = null;
  }, []);

  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const near = root.scrollHeight - root.scrollTop - root.clientHeight < BOTTOM_THRESHOLD;
    const present = near && !hasMoreAfterRef.current;
    atBottomRef.current = present;
    setAtBottom((prev) => (prev === present ? prev : present));
    const cur = optsRef.current;
    if (cur.view && cur.view.token === handled.current) cur.onScrollPosition?.(root.scrollTop, present);
    captureAnchor();
    const now = Date.now();
    if (now - lastRead.current >= READ_THROTTLE_MS) {
      lastRead.current = now;
      reportRead();
    } else if (!readTimer.current) {
      readTimer.current = setTimeout(() => {
        readTimer.current = null;
        lastRead.current = Date.now();
        reportRead();
      }, READ_THROTTLE_MS);
    }
  }, [scrollRef, captureAnchor, reportRead]);

  // The user takes over: stop following layout changes.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !enabled) return;
    const stop = () => stopSettling();
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    events.forEach((e) => root.addEventListener(e, stop, { passive: true }));
    return () => events.forEach((e) => root.removeEventListener(e, stop));
  }, [scrollRef, enabled, stopSettling]);

  // Follow layout changes while a target is settling.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || !enabled || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const s = settle.current;
      if (!s) return;
      if (Date.now() > s.until) { settle.current = null; return; }
      s.apply();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [contentRef, enabled]);

  const placeAt = useCallback(
    (req: ViewRequest): boolean => {
      const root = scrollRef.current;
      if (!root) return false;
      const box = root.getBoundingClientRect();
      const target = req.target;
      if (target.kind === "scroll") {
        root.scrollTop = target.top;
        return true;
      }
      if (target.kind === "bottom") {
        const apply = () => { root.scrollTop = root.scrollHeight; };
        apply();
        settle.current = { until: Date.now() + SETTLE_MS, apply };
        return true;
      }
      if (target.kind === "divider") {
        const el = root.querySelector<HTMLElement>(`#${UNREAD_DIVIDER_ID}`);
        if (!el) return false;
        const apply = () => {
          const d = root.querySelector<HTMLElement>(`#${UNREAD_DIVIDER_ID}`);
          if (d) root.scrollTop += d.getBoundingClientRect().top - box.top - 56;
        };
        apply();
        settle.current = { until: Date.now() + SETTLE_MS, apply };
        return true;
      }
      const el = document.getElementById(`msg-${target.id}`);
      if (!el || !root.contains(el)) return false;
      const apply = () => {
        const m = document.getElementById(`msg-${target.id}`);
        if (!m) return;
        const r = m.getBoundingClientRect();
        root.scrollTop += r.top - box.top - (root.clientHeight - r.height) / 2;
      };
      apply();
      settle.current = { until: Date.now() + SETTLE_MS, apply };
      if (target.highlight) flashMessage(el);
      return true;
    },
    [scrollRef],
  );

  const idsKey = o.ids.length === 0 ? "" : `${o.ids[0]}|${o.ids[o.ids.length - 1]}|${o.ids.length}`;

  // After every change of the rendered messages: follow a pending view request, else keep the position.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || !enabled) return;
    const req = o.view;
    if (req && req.token !== handled.current) {
      if (placeAt(req)) {
        handled.current = req.token;
        prevNewest.current = o.ids[o.ids.length - 1];
        if (giveUp.current) clearTimeout(giveUp.current);
        giveUp.current = null;
        setPositioned(true);
        captureAnchor();
        onScroll();
        return;
      }
      if (!giveUp.current) {
        const token = req.token;
        giveUp.current = setTimeout(() => {
          giveUp.current = null;
          if (handled.current < token) {
            handled.current = token;
            setPositioned(true);
          }
        }, GIVE_UP_MS);
      }
      return;
    }
    // keep the position: the first message on screen stays where it was (a new message at the present is followed instead)
    const a = anchor.current;
    const newest = o.ids[o.ids.length - 1];
    const appended = prevNewest.current !== undefined && prevNewest.current !== newest;
    prevNewest.current = newest;
    if (a && !(appended && atBottomRef.current && !hasMoreAfterRef.current)) {
      const el = document.getElementById(a.id);
      if (el && root.contains(el)) {
        const delta = el.getBoundingClientRect().top - root.getBoundingClientRect().top - a.top;
        if (Math.abs(delta) > 1) root.scrollTop += delta;
      }
    }
    captureAnchor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, o.view?.token, enabled]);

  // A new message while the user is at the present: stay at the bottom.
  const lastId = o.ids[o.ids.length - 1];
  useEffect(() => {
    if (!enabled || !positioned || !lastId) return;
    if (atBottomRef.current && !hasMoreAfterRef.current) {
      const root = scrollRef.current;
      if (!root) return;
      root.scrollTo({ top: root.scrollHeight, behavior: optsRef.current.reducedMotion ? "auto" : "smooth" });
      lastRead.current = 0;
      reportRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, enabled, positioned]);

  // Sentinels: load the previous / next page near the viewport.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !enabled || !positioned || typeof IntersectionObserver === "undefined") return;
    const watch = (el: HTMLElement | null, can: boolean, load: () => void) => {
      if (!el || !can) return null;
      const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) load(); }, { root, rootMargin: "320px 0px 320px 0px" });
      io.observe(el);
      return io;
    };
    const up = watch(topSentinel.current, o.hasMoreBefore && !o.loadingOlder && !o.olderError, () => optsRef.current.onLoadOlder());
    const down = watch(bottomSentinel.current, o.hasMoreAfter && !o.loadingNewer && !o.newerError, () => optsRef.current.onLoadNewer());
    return () => { up?.disconnect(); down?.disconnect(); };
  }, [scrollRef, enabled, positioned, o.hasMoreBefore, o.hasMoreAfter, o.loadingOlder, o.loadingNewer, o.olderError, o.newerError, idsKey]);

  // The user is at the present and sees the newest message (also when it just arrived).
  useEffect(() => {
    if (!enabled || !positioned) return;
    const t = setTimeout(reportRead, 0);
    return () => clearTimeout(t);
  }, [enabled, positioned, idsKey, reportRead]);

  // Back to the tab: report again.
  useEffect(() => {
    if (!enabled) return;
    const on = () => { if (document.visibilityState === "visible") reportRead(); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [enabled, reportRead]);

  useEffect(() => () => {
    if (giveUp.current) clearTimeout(giveUp.current);
    if (readTimer.current) clearTimeout(readTimer.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    root.scrollTo({ top: root.scrollHeight, behavior: optsRef.current.reducedMotion ? "auto" : "smooth" });
  }, [scrollRef]);

  return { atBottom, onScroll, scrollToBottom, topSentinel, bottomSentinel, positioned };
}
