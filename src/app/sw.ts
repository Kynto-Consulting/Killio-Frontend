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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
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
        url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp)$/i),
      handler: new CacheFirst({
        cacheName: "images-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();