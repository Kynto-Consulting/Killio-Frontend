"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

function getCurrentBuildId(): string | null {
  if (typeof window === "undefined") return null;
  return (window as any).__NEXT_DATA__?.buildId ?? null;
}

async function isNewVersionAvailable(buildId: string): Promise<boolean> {
  try {
    const res = await fetch(`/_next/static/${buildId}/_buildManifest.js`, {
      cache: "no-store",
      method: "HEAD",
    });
    return res.status === 404;
  } catch {
    return false;
  }
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const buildId = getCurrentBuildId();
    if (!buildId) return;

    let active = true;

    const check = async () => {
      if (!active) return;
      const hasNew = await isNewVersionAvailable(buildId);
      if (active && hasNew) setUpdateAvailable(true);
    };

    const timer = setInterval(check, POLL_INTERVAL_MS);
    // First check after 1 min (not immediately)
    const initial = setTimeout(check, 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, []);

  return { updateAvailable };
}
