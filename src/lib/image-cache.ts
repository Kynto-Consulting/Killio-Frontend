"use client";

// Global front-end image cache. Resolves any image source to a displayable URL
// and caches it so the same asset is never fetched/decoded twice:
//  - http(s)/data/blob URLs pass through (identity cache)
//  - "/uploads/..." → prefixed with the API base
//  - "asset:<name>" → read from a local-workspace dir into a blob objectURL
// Object URLs are pooled with an LRU cap and revoked on eviction. A second LRU
// caches decoded HTMLImageElements for direct canvas drawing.

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const MAX_URLS = 400;
const MAX_IMAGES = 300;

type UrlEntry = { url: string; objectUrl?: string; last: number; promise?: Promise<string> };
const urlCache = new Map<string, UrlEntry>();
const imgCache = new Map<string, HTMLImageElement>();

function touch<V>(map: Map<string, V>, key: string, value: V, max: number, onEvict?: (v: V) => void) {
  map.delete(key); map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const v = map.get(oldest)!; map.delete(oldest); onEvict?.(v);
  }
}

export function isAssetRef(src: string): boolean { return typeof src === "string" && src.startsWith("asset:"); }

/** Resolve non-asset sources synchronously (http/data/blob/uploads). */
export function resolveStaticUrl(src: string | null | undefined): string {
  if (!src) return "";
  if (isAssetRef(src)) return ""; // needs async dir resolution
  if (src.startsWith("/uploads/")) return `${API_BASE}${src}`;
  return src;
}

type DirReader = (name: string) => Promise<File | Blob | null>;

/**
 * Resolve any image source to a displayable URL (cached). For asset: refs a
 * `readAsset` reader (from the local workspace) must be supplied.
 */
export async function getImageUrl(src: string, readAsset?: DirReader): Promise<string> {
  if (!src) return "";
  const cached = urlCache.get(src);
  if (cached) { cached.last = Date.now(); urlCache.delete(src); urlCache.set(src, cached); if (cached.url) return cached.url; if (cached.promise) return cached.promise; }

  if (!isAssetRef(src)) {
    const url = resolveStaticUrl(src);
    touch(urlCache, src, { url, last: Date.now() }, MAX_URLS, (e) => { if (e.objectUrl) URL.revokeObjectURL(e.objectUrl); });
    return url;
  }

  if (!readAsset) return "";
  const name = src.slice("asset:".length);
  const promise = (async () => {
    const file = await readAsset(name);
    if (!file) return "";
    const objectUrl = URL.createObjectURL(file);
    const entry: UrlEntry = { url: objectUrl, objectUrl, last: Date.now() };
    touch(urlCache, src, entry, MAX_URLS, (e) => { if (e.objectUrl) URL.revokeObjectURL(e.objectUrl); });
    return objectUrl;
  })();
  touch(urlCache, src, { url: "", last: Date.now(), promise }, MAX_URLS);
  return promise;
}

/** Load (and cache) a decoded HTMLImageElement for a resolved URL — for canvas. */
export function getImageElement(url: string): HTMLImageElement | null {
  if (!url || typeof window === "undefined") return null;
  const hit = imgCache.get(url);
  if (hit) { imgCache.delete(url); imgCache.set(url, hit); return hit.complete && hit.naturalWidth > 0 ? hit : null; }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  touch(imgCache, url, img, MAX_IMAGES);
  return null; // not ready yet this frame; will be ready on a later draw
}

/** React hook: resolve an image source to a displayable URL (cached). */
export function useResolvedImage(src: string | null | undefined, readAsset?: DirReader): string {
  const [url, setUrl] = useState<string>(() => (src && !isAssetRef(src) ? resolveStaticUrl(src) : ""));
  useEffect(() => {
    let alive = true;
    if (!src) { setUrl(""); return; }
    getImageUrl(src, readAsset).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(""); });
    return () => { alive = false; };
  }, [src, readAsset]);
  return url;
}
