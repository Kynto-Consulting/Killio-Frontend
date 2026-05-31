import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { 
  Serwist, 
  NetworkFirst, 
  StaleWhileRevalidate, 
  CacheFirst,
  BackgroundSyncPlugin,
  ExpirationPlugin
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
    // Page navigation with offline fallback. v3: bumped cacheName because the
    // previous "pages-cache" got poisoned with the offline-fallback HTML stored
    // under real route URLs (e.g. /d, /d/<id>) during the broken deploy window
    // — every later navigation served that stale HTML. New cache name forces a
    // clean slate; the activate handler below deletes the orphaned old caches.
    {
      matcher: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages-cache-v3",
        networkTimeoutSeconds: 8,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          }),
          // Never cache redirects (e.g. middleware → /login) or non-OK pages
          // — those are what poisoned the previous cache.
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
            maxRetentionTime: 48 * 60, // 48 hours
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
const LEGACY_CACHES = new Set(["pages-cache", "api-cache", "pages-cache-v2"]);
self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => LEGACY_CACHES.has(k)).map((k) => caches.delete(k)));
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