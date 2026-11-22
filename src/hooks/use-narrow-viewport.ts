"use client";

import { useSyncExternalStore } from "react";

/** Below Tailwind's `lg`: the rooms side panels become overlays and the channel list a drawer. */
const QUERY = "(max-width: 1023px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** True when the viewport is narrower than 1024px (false on the server, so the first paint is the desktop layout). */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
