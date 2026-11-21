"use client";

import { useEffect, useState } from "react";
import { clampTimerDelay, expirePins, nextPinExpiry, pinNow, pinTickInterval, pinTimeLeft, type PinFields } from "@/lib/rooms/pins";

/**
 * The server clears an expired pin lazily, so the client drops it by itself: one timer set for the earliest expiry of
 * `items` (on the server clock, see `syncServerClock`). `setItems` receives the list with that pin cleared.
 */
export function usePinExpiry<M extends PinFields>(items: readonly M[], setItems: (update: (prev: M[]) => M[]) => void): void {
  const [round, setRound] = useState(0);
  useEffect(() => {
    const now = pinNow();
    const next = nextPinExpiry(items, now);
    if (next === null) return;
    const timer = setTimeout(() => {
      setItems((prev) => expirePins(prev, pinNow()));
      setRound((n) => n + 1); // a long wait is taken in steps: arm the timer again
    }, clampTimerDelay(next - now + 50));
    return () => clearTimeout(timer);
  }, [items, round, setItems]);
}

/** Server-clock "now" that repaints on its own while any of `items` has a countdown running (every second near the end). */
export function usePinClock(items: readonly PinFields[], enabled = true): number {
  const [now, setNow] = useState(() => pinNow());
  useEffect(() => {
    if (!enabled) return;
    const lefts = items.map((m) => pinTimeLeft(m, pinNow())).filter((v): v is number => v !== null && v > 0);
    setNow(pinNow());
    if (lefts.length === 0) return;
    const id = setInterval(() => setNow(pinNow()), pinTickInterval(Math.min(...lefts)));
    return () => clearInterval(id);
  }, [items, enabled]);
  return now;
}
