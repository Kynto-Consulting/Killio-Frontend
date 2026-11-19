import { useEffect, type RefObject } from "react";

/** Nearest ancestor that scrolls (the app shell scrolls inside a <main>, not the window). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll" || o === "overlay") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Calls `onLoadMore` while the sentinel is within `margin` px of the visible area of its scroll container.
 * It checks on scroll and resize, and again after every page (`pageKey`), so a sentinel that is still in view after
 * a page loads keeps loading. It retries until the element exists, because the sentinel can mount after the effect runs.
 */
export function useLoadMoreSentinel(ref: RefObject<HTMLElement | null>, enabled: boolean, onLoadMore: () => void, pageKey: unknown, margin = 600): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let container: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const near = (): boolean => {
      const el = ref.current;
      if (!el) return false;
      const bottom = (container ? container.getBoundingClientRect().bottom : window.innerHeight) + margin;
      return el.getBoundingClientRect().top <= bottom;
    };
    const check = () => {
      if (stopped) return;
      if (near()) onLoadMore();
    };
    const attach = (tries: number) => {
      if (stopped) return;
      const el = ref.current;
      if (!el) {
        if (tries < 40) timer = setTimeout(() => attach(tries + 1), 100);
        return;
      }
      container = scrollParent(el);
      (container ?? window).addEventListener("scroll", check, { passive: true });
      window.addEventListener("resize", check);
      // after layout: a short page may already show the sentinel
      timer = setTimeout(check, 60);
    };
    attach(0);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      (container ?? window).removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pageKey, margin]);
}
