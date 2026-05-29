"use client";

import { useEffect, useState } from "react";

/** Reactive navigator.onLine. SSR-safe (defaults to true on the server). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const upd = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  return online;
}
