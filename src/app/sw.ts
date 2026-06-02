import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
  BackgroundSyncPlugin,
  ExpirationPlugin,
  Strategy,
  type StrategyHandler,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: typeof globalThis & WorkerGlobalScope;

// Only PUBLIC routes here. Auth-gated routes (everything under (dashboard))
// can't be precached at SW install — the server would respond with a redirect
// to /login (no session yet) and we'd cache the redirect instead of the page.
// Those routes are populated by `cacheOnNavigation` (next.config) on the
// user's first online visit + by warmCache() in the dashboard layout, both
// of which run with the session cookie attached.
const SHELL_PRECACHE = [
  "/", "/offline", "/login",
].map((url) => ({ url, revision: null as string | null }));

// Maps a deep path to its parent shell route. The shell is what the dashboard
// layout renders for that section; once the shell HTML is in pages-cache-v4,
// every child route can boot offline through it (local-workspace data comes
// from IndexedDB / FileSystemDirectoryHandle on the client).
function shellFor(pathname: string): string | null {
  if (pathname.startsWith("/d/")) return "/d";
  if (pathname.startsWith("/b/")) return "/b";
  if (pathname.startsWith("/m/")) return "/m";
  if (pathname.startsWith("/graph/")) return "/graph";
  if (pathname.startsWith("/rooms/")) return "/rooms";
  if (pathname.startsWith("/marketplace/")) return "/marketplace";
  if (pathname.startsWith("/teams/")) return "/teams";
  if (pathname.startsWith("/metrics/")) return "/metrics";
  if (pathname.startsWith("/history/")) return "/history";
  if (pathname.startsWith("/integrations/")) return "/integrations";
  if (pathname.startsWith("/public-board/")) return "/";
  if (pathname.startsWith("/public-document/")) return "/";
  if (pathname.startsWith("/public-mesh/")) return "/";
  return null;
}

class NavigationWithShellFallback extends Strategy {
  protected async _handle(request: Request, handler: StrategyHandler): Promise<Response | undefined> {
    // 1. Network with 8s timeout.
    const networkPromise = handler.fetch(request);
    const timeoutPromise = new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("network-timeout")), 8000)
    );
    try {
      const response = await Promise.race([networkPromise, timeoutPromise]);
      // cacheWillUpdate plugins gate whether it actually gets stored.
      handler.waitUntil(handler.cachePut(request, response.clone()));
      return response;
    } catch { /* fall through to cache */ }

    // 2. Exact cache match for this URL.
    const exact = await handler.cacheMatch(request);
    if (exact) return exact;

    // 3. Parent shell route from same cache (e.g. /d/<id> → /d, even
    //    multi-segment local paths like /d/ws/sub/file.kd).
    const url = new URL(request.url);
    const shell = shellFor(url.pathname);
    if (shell) {
      const shellReq = new Request(new URL(shell, url.origin).toString(), { method: "GET" });
      const shellHit = await handler.cacheMatch(shellReq);
      if (shellHit) return shellHit;
    }

    // 4. Root "/" shell — precached at install, always present. The dashboard
    //    layout it renders hydrates the local workspace from IndexedDB and the
    //    Next.js client router patches the URL so deep dynamic paths
    //    (/d/<ws>/<sub>/<file>.kd, /b/<id>, /m/<id>) load via cached bundles.
    const rootHit = await caches.match("/");
    if (rootHit) return rootHit;

    // 5. Precached /offline.
    const offline = await caches.match("/offline");
    if (offline) return offline;

    return Response.error();
  }
}

const serwist = new Serwist({
  precacheEntries: [...(self.__SW_MANIFEST ?? []), ...SHELL_PRECACHE],
  skipWaiting: true,
  clientsClaim: true,
  // navigationPreload causes a "preload request was cancelled before
  // 'preloadResponse' settled" warning when Serwist's runtime caching
  // matches a navigation before the preload promise is consumed. Turn it
  // off — NetworkFirst handles the fetch directly and works the same.
  navigationPreload: false,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
  runtimeCaching: [
    // API GET requests - Network first, cache fallback
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "api-cache-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          }),
          // Post requests (edits) will be synced via background sync queue
          new BackgroundSyncPlugin("api-sync-queue", {
            maxRetentionTime: 24 * 60, // Retry for up to 24 Hours
          }),
        ],
      }),
    },
    // Page navigation with smart offline fallback chain.
    //
    // Cascade per request:
    //   1. Try network (8s timeout). Cache the response only if it's a real
    //      200 text/html (no redirects, no error pages) — those were what
    //      poisoned the previous cache and made every later nav serve /offline.
    //   2. On network fail, look up the exact URL in pages-cache-v4.
    //   3. On exact miss, fall back to the parent SHELL route's cached HTML
    //      (e.g. /d/<id> → /d, /b/<id> → /b, /m/<id> → /m). The shell hydrates
    //      client-side and renders the local-workspace data from IndexedDB —
    //      so /d/<localId>, /b/<localId>, /m/<localId> all work offline
    //      without ever being visited online first.
    //   4. Final fallback: precached /offline.
    {
      matcher: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
      handler: new NavigationWithShellFallback({
        cacheName: "pages-cache-v4",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
          {
            cacheWillUpdate: async ({ response }: { response: Response }) => {
              if (!response) return null;
              if (response.redirected) return null;
              if (response.status !== 200) return null;
              const ct = response.headers.get("content-type") ?? "";
              if (!ct.includes("text/html")) return null;
              return response;
            },
          },
          new BackgroundSyncPlugin("offline-queue", {
            maxRetentionTime: 48 * 60,
          }),
        ],
      }),
    },
    // Images - Cache first, network fallback
    {
      matcher: ({ request, url }) =>
        request.destination === "image" ||
        url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|avif)$/i),
      handler: new CacheFirst({
        cacheName: "images-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          }),
        ],
      }),
    },
    // Google Fonts CSS — small, refreshed weekly.
    {
      matcher: ({ url }) => url.origin === "https://fonts.googleapis.com",
      handler: new StaleWhileRevalidate({
        cacheName: "gfonts-css",
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // Google Fonts woff2 files — long-lived, immutable.
    {
      matcher: ({ url }) => url.origin === "https://fonts.gstatic.com",
      handler: new CacheFirst({
        cacheName: "gfonts-files",
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    // Any cross-origin font file by extension as a safety net.
    {
      matcher: ({ request, url }) => request.destination === "font" || /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "fonts-cache",
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// One-shot cleanup of legacy cache names. Old "pages-cache" / "api-cache"
// entries are abandoned by the new versioned names above — delete them on
// activate so they don't sit there forever taking quota and (more importantly
// once SW deletes them, the browser memory cache stops hitting them either).
const LEGACY_CACHES = new Set(["pages-cache", "api-cache", "pages-cache-v2", "pages-cache-v3"]);
// Honor the page's SKIP_WAITING postMessage so a fresh deploy can flip
// over instantly instead of waiting for every tab to close.
self.addEventListener("message", (event: any) => {
  if (event?.data?.type === "SKIP_WAITING") {
    (self as any).skipWaiting();
  }
});

self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Delete every previous serwist-precache (chunk hashes from old
      // deploys) so the new SW doesn't keep serving 404'd JS/CSS to
      // stale HTML.
      await Promise.all(keys
        .filter((k) => LEGACY_CACHES.has(k) || /^serwist-precache-v\d+/.test(k))
        .map((k) => caches.delete(k)),
      );
      // Tell every open client to (re-)warm the cache now that this SW is
      // controlling — picks up new shell routes without waiting for the 6h
      // TTL or the next mount of the dashboard layout.
      const clients = await (self as any).clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: "killio:warm-cache" });
    })()
  );
});

// Push notification handler
self.addEventListener("push", (event: any) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; tag?: string; url?: string } = {};
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }

  const title = payload.title ?? "Killio";
  const options: NotificationOptions = {
    body: payload.body ?? "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url ?? "/rooms" },
  };
  event.waitUntil((self as any).registration.showNotification(title, options));
});

// Notification click — focus or open the app
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/rooms";
  event.waitUntil(
    (self as any).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients: any[]) => {
        const existing = clients.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return (self as any).clients.openWindow(url);
      })
  );
});