// Force-warm the service-worker cache for the app shell so the user can open
// the app cold + offline and still navigate every top-level route, even if
// they've never clicked that route online before.
//
// The SW (src/app/sw.ts) uses NetworkFirst with cache fallback for
// navigation requests; the only thing needed is that each URL gets hit ONCE
// while online so it lands in the `pages-cache`. We do that here, in the
// background, throttled, and skipped if recently done.

const STORAGE_KEY = "killio_warm_cache_v1";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 h

const SHELL_ROUTES = [
  "/", "/d", "/m", "/b", "/graph", "/rooms", "/teams", "/history",
  "/profile", "/preferences", "/offline",
];

// External assets the app uses at runtime that would 404 offline if never
// hit while online. Cached by the SW's gfonts-* / fonts-cache strategies.
const EXTERNAL_ASSETS = [
  "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap",
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
];

function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
}

function shouldRun(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts > TTL_MS;
  } catch { return true; }
}

function markDone() {
  try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* noop */ }
}

/** Fire-and-forget prefetch of every shell route. Cached by the service
 *  worker's navigation handler. Throttled to once per TTL_MS. */
export async function warmCache(routes: string[] = SHELL_ROUTES): Promise<void> {
  if (!isOnline()) return;
  if (!shouldRun()) return;
  // Stagger so we don't burst N parallel server-rendered page requests.
  for (const url of routes) {
    try {
      await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    } catch { /* network blip — try next on next call */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Cross-origin runtime assets (fonts). Use no-cors so the SW still caches
  // the opaque response — it can serve it offline as a stylesheet.
  for (const url of EXTERNAL_ASSETS) {
    try { await fetch(url, { mode: "no-cors", cache: "no-cache" }); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  markDone();
}

/** Force the avatar / profile-image URLs into the SW image-cache so they
 *  render offline. Safe to call repeatedly — CacheFirst dedupes. */
export async function warmImages(urls: Array<string | null | undefined>): Promise<void> {
  if (!isOnline()) return;
  for (const u of urls) {
    if (!u) continue;
    try { await fetch(u, { mode: "no-cors", cache: "no-cache" }); } catch { /* noop */ }
  }
}

/** Manually expire the warm-cache marker (used for "Refresh offline cache"
 *  buttons). */
export function resetWarmCache(): void {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
