import { NextResponse } from "next/server";

/**
 * Always-latest Killio Vault APK redirect.
 *
 * Primary source: the Killio Vault GitHub repo's rolling release. CI (the
 * "Build Vault APK" workflow) publishes every build to the `vault-latest`
 * release tag with the APK attached, so this route always serves the freshest
 * build. The repo is PRIVATE, so we resolve the asset's signed download URL
 * server-side with a token (the GitHub asset API 302s to a short-lived S3 URL
 * which is itself public, so the redirect we hand the browser needs no auth).
 *
 * Fallbacks, in order: GitHub `vault-latest` → GitHub `releases/latest` → EAS
 * build artifact → static VAULT_APK_FALLBACK_URL.
 *
 * Configuration (env):
 *   - GITHUB_TOKEN / VAULT_GITHUB_TOKEN  PAT (or fine-grained token) with READ
 *       access to the private repo's contents + releases. REQUIRED for the
 *       GitHub path.
 *   - VAULT_GITHUB_REPO   owner/repo (default: Kynto-Consulting/Killio-Vault).
 *   - VAULT_RELEASE_TAG   rolling release tag (default: vault-latest).
 *   - EAS_ACCESS_TOKEN / EAS_PROJECT_ID   legacy EAS fallback (optional).
 *   - VAULT_APK_FALLBACK_URL   static last-resort URL (optional).
 */
const DEFAULT_REPO = "Kynto-Consulting/Killio-Vault";
const DEFAULT_RELEASE_TAG = "vault-latest";
const EAS_GRAPHQL = "https://api.expo.dev/graphql";
const DEFAULT_PROJECT_ID = "cf180796-0bbb-4bb0-89b7-f102e5c96345"; // killio-vault

interface GithubAsset {
  name: string;
  url: string; // API asset URL (used with Accept: octet-stream for private repos)
  browser_download_url: string;
}
interface GithubRelease {
  assets?: GithubAsset[];
}

function githubToken(): string | null {
  return process.env.VAULT_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? null;
}

/** Pick the first .apk asset from a release payload. */
function pickApkAsset(release: GithubRelease | null): GithubAsset | null {
  if (!release?.assets?.length) return null;
  return release.assets.find((a) => a.name.toLowerCase().endsWith(".apk")) ?? null;
}

/** Fetch a release by tag (or `releases/latest` when tag is null). */
async function fetchRelease(
  repo: string,
  token: string,
  tag: string | null,
): Promise<GithubRelease | null> {
  const path = tag
    ? `releases/tags/${encodeURIComponent(tag)}`
    : `releases/latest`;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "killio-vault-download",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

/**
 * Resolve a private-repo asset to its short-lived signed S3 URL. The GitHub
 * asset API, hit with Accept: application/octet-stream, 302s to a signed URL we
 * can hand the browser directly (the signed URL carries its own auth).
 */
async function resolveAssetSignedUrl(
  asset: GithubAsset,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(asset.url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/octet-stream",
        "User-Agent": "killio-vault-download",
      },
      redirect: "manual",
      cache: "no-store",
    });
    const location = res.headers.get("location");
    if (location) return location;
    // Public repo (or already-resolved) — the browser URL works directly.
    return asset.browser_download_url ?? null;
  } catch {
    return null;
  }
}

async function resolveGithubApkUrl(): Promise<string | null> {
  const token = githubToken();
  if (!token) return null;
  const repo = process.env.VAULT_GITHUB_REPO ?? DEFAULT_REPO;
  const tag = process.env.VAULT_RELEASE_TAG ?? DEFAULT_RELEASE_TAG;

  // Try the rolling tag first, then the semver `releases/latest`.
  const release =
    (await fetchRelease(repo, token, tag)) ??
    (await fetchRelease(repo, token, null));
  const asset = pickApkAsset(release);
  if (!asset) return null;
  return resolveAssetSignedUrl(asset, token);
}

// ── Legacy EAS fallback ─────────────────────────────────────────────────────
const LATEST_BUILD_QUERY = /* GraphQL */ `
  query LatestVaultBuild($appId: String!) {
    app {
      byId(appId: $appId) {
        builds(limit: 10, offset: 0, filter: { platform: ANDROID, status: FINISHED }) {
          id
          artifacts { applicationArchiveUrl }
        }
      }
    }
  }
`;
async function resolveEasApkUrl(): Promise<string | null> {
  const token = process.env.EAS_ACCESS_TOKEN;
  if (!token) return null;
  const appId = process.env.EAS_PROJECT_ID ?? DEFAULT_PROJECT_ID;
  try {
    const res = await fetch(EAS_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: LATEST_BUILD_QUERY, variables: { appId } }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { app?: { byId?: { builds?: Array<{ artifacts?: { applicationArchiveUrl?: string | null } | null }> } } };
    };
    const builds = json.data?.app?.byId?.builds ?? [];
    const latest = builds.find((b) => b.artifacts?.applicationArchiveUrl);
    return latest?.artifacts?.applicationArchiveUrl ?? null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const apkUrl =
    (await resolveGithubApkUrl()) ??
    (await resolveEasApkUrl()) ??
    process.env.VAULT_APK_FALLBACK_URL ??
    null;

  if (!apkUrl) {
    return new Response(
      "Killio Vault APK is not yet available. Try again in a few minutes.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const res = NextResponse.redirect(apkUrl, 302);
  // Edge-cache 5 min: signed GitHub URLs live longer than that, and CI builds
  // are far rarer, so this keeps clicks cheap without serving a stale link.
  res.headers.set("Cache-Control", "public, s-maxage=300, max-age=60");
  return res;
}
