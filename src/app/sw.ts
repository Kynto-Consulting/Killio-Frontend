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

// App-shell routes that must work on a cold offline launch (start_url + the
// dashboard sections). Revision: null means SWR-style — the SW updates them
// in the background whenever the user is online.
const SHELL_PRECACHE = [
  "/", "/offline", "/d", "/m", "/b", "/graph", "/rooms",
  "/teams", "/history", "/profile", "/preferences", "/login",
].map((url) => ({ url, revision: null as string | null }));

const serwist = new Serwist({
  precacheEntries: [...(self.__SW_MANIFEST ?? []), ...SHELL_PRECACHE],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
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
        cacheName: "api-cache",
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
    // Page navigation with offline fallback
    {
      matcher: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          }),
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