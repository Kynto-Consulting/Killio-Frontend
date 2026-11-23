import { NextRequest, NextResponse } from "next/server";
import {
  isAppPlatform,
  parseRelease,
  pickAsset,
  releaseInfo,
  safeRepo,
  type AppRelease,
  type AppReleaseAsset,
} from "@/lib/app-download/release";

/**
 * Killio App downloads.
 *
 *   GET /download/app?platform=windows|windows-msi|macos|linux-appimage|linux-deb|linux-rpm|android
 *       302 to that installer in the latest release.
 *   GET /download/app?info=1
 *       JSON { version, publishedAt, assets: { <platform>: boolean } } for the /download page.
 *
 * The Killio App repo is PRIVATE, so the release is read server-side with a
 * token. The GitHub asset API, asked for `application/octet-stream`, answers
 * with a redirect to a short-lived signed URL that needs no auth: that URL is
 * what the browser gets. The token and GitHub's answers never leave this route.
 *
 * Configuration (env):
 *   - KILLIO_APP_GITHUB_TOKEN / VAULT_GITHUB_TOKEN / GITHUB_TOKEN  first one set;
 *       needs read access to the repo's contents (releases). REQUIRED.
 *   - KILLIO_APP_GITHUB_REPO   owner/repo (default: Kynto-Consulting/Killio-App).
 *   - KILLIO_APP_RELEASE_TAG   rolling release tag (default: app-latest); when
 *       that release does not exist, `releases/latest` is used.
 */
export const dynamic = "force-dynamic";

const DEFAULT_REPO = "Kynto-Consulting/Killio-App";
const DEFAULT_RELEASE_TAG = "app-latest";
const USER_AGENT = "killio-app-download";

function githubToken(): string | null {
  return (
    process.env.KILLIO_APP_GITHUB_TOKEN ||
    process.env.VAULT_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    null
  );
}

/** With a token for a private repository; without one GitHub answers only if the repository is public. */
function auth(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchRelease(repo: string, token: string | null, tag: string | null): Promise<AppRelease | null> {
  const path = tag ? `releases/tags/${encodeURIComponent(tag)}` : "releases/latest";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
        ...auth(token),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseRelease(await res.json());
  } catch {
    return null;
  }
}

async function latestRelease(token: string | null): Promise<AppRelease | null> {
  const repo = safeRepo(process.env.KILLIO_APP_GITHUB_REPO || DEFAULT_REPO);
  if (!repo) return null;
  const tag = process.env.KILLIO_APP_RELEASE_TAG || DEFAULT_RELEASE_TAG;
  return (await fetchRelease(repo, token, tag)) ?? (await fetchRelease(repo, token, null));
}

/** The asset's short-lived signed URL, or null. */
async function signedUrl(asset: AppReleaseAsset, token: string | null): Promise<string | null> {
  try {
    const res = await fetch(asset.url, {
      headers: {
        ...auth(token),
        Accept: "application/octet-stream",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
      cache: "no-store",
    });
    const location = res.headers.get("location");
    // Only ever hand out a plain https link; anything else is treated as "not available".
    if (!location || !location.startsWith("https://")) return null;
    return location;
  } catch {
    return null;
  }
}

function plain(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const UNAVAILABLE = "Killio App downloads are not available right now. Try again in a few minutes.";

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const wantsInfo = params.get("info") === "1";
  const platform = params.get("platform");

  if (!wantsInfo && !isAppPlatform(platform)) {
    return plain("Unknown platform.", 400);
  }

  // No token is fine for a public repository; for a private one GitHub answers 404 and this is "unavailable".
  const token = githubToken();

  const release = await latestRelease(token);
  if (!release) return plain(UNAVAILABLE, 503);

  if (wantsInfo) {
    // Brief edge cache: the page asks on every visit and builds are rare.
    return NextResponse.json(releaseInfo(release), {
      headers: { "Cache-Control": "public, s-maxage=120, max-age=60" },
    });
  }

  const asset = isAppPlatform(platform) ? pickAsset(release, platform) : null;
  const url = asset ? await signedUrl(asset, token) : null;
  if (!url) return plain(UNAVAILABLE, 503);

  const res = NextResponse.redirect(url, 302);
  // The signed link expires within minutes, so it must not be cached anywhere.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
