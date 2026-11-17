// Online LaTeX extensions: `\usepackage{https://…/pkg.sty}` or `\input{/latex-packages/x.sty}`.
//
// SAFETY MODEL — the downloaded file is NEVER executed. latex-text.ts only lifts
// declarative definitions out of it (\newcommand, \def, \DeclareMathOperator,
// \DeclarePairedDelimiter, \newtheorem); every other line is discarded. On top of
// that: https only, host allowlist (or same-origin), size cap, timeout, text only.

export const ALLOWED_PACKAGE_HOSTS = [
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
];

const MAX_BYTES = 200_000;
const TIMEOUT_MS = 8000;

/** Resolves a package reference to an absolute URL, or null when it is not allowed. */
export function resolvePackageUrl(ref: string, origin?: string): string | null {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  try {
    const url = ref.startsWith("/") && !ref.startsWith("//") ? new URL(ref, base || "http://invalid.local") : new URL(ref);
    const sameOrigin = Boolean(base) && url.origin === base;
    if (sameOrigin) return url.pathname.startsWith("/latex-packages/") ? url.toString() : null;
    if (url.protocol !== "https:") return null;
    return ALLOWED_PACKAGE_HOSTS.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Promise<string | null>>();

export function fetchOnlinePackage(ref: string): Promise<string | null> {
  const url = resolvePackageUrl(ref);
  if (!url) return Promise.resolve(null);
  const hit = cache.get(url);
  if (hit) return hit;
  const job = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", redirect: "error" });
      if (!res.ok) return null;
      const type = res.headers.get("content-type") || "";
      if (/text\/html|image\/|video\/|audio\//i.test(type)) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return null;
      return new TextDecoder("utf-8").decode(buf);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(url, job);
  return job;
}
