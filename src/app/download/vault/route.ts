import { NextResponse } from "next/server";

/**
 * Always-latest Killio Vault APK redirect.
 *
 * Queries the EAS GraphQL API for the most recent FINISHED Android build on
 * the killio-vault project and 302-redirects to its signed artifact URL. The
 * landing page links to this stable URL so visitors don't need to know EAS
 * build ids.
 *
 * Configuration (env, all optional but recommended in prod):
 *   - EAS_PROJECT_ID    UUID of the EAS project (default: killio-vault).
 *   - EAS_ACCESS_TOKEN  Personal access token; required because the EAS GraphQL
 *                       endpoint rejects anonymous queries.
 *   - VAULT_APK_FALLBACK_URL  Static URL used if the EAS query fails.
 */
const EAS_GRAPHQL = "https://api.expo.dev/graphql";
const DEFAULT_PROJECT_ID = "cf180796-0bbb-4bb0-89b7-f102e5c96345"; // killio-vault

const LATEST_BUILD_QUERY = /* GraphQL */ `
  query LatestVaultBuild($appId: String!) {
    app {
      byId(appId: $appId) {
        builds(
          limit: 10
          offset: 0
          filter: { platform: ANDROID, status: FINISHED }
        ) {
          id
          status
          platform
          artifacts {
            applicationArchiveUrl
          }
          completedAt
        }
      }
    }
  }
`;

interface EasBuild {
  id: string;
  status: string;
  platform: string;
  artifacts: { applicationArchiveUrl: string | null } | null;
  completedAt: string | null;
}

async function resolveLatestApkUrl(): Promise<string | null> {
  const token = process.env.EAS_ACCESS_TOKEN;
  if (!token) return null;
  const appId = process.env.EAS_PROJECT_ID ?? DEFAULT_PROJECT_ID;

  try {
    const res = await fetch(EAS_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: LATEST_BUILD_QUERY,
        variables: { appId },
      }),
      // Keep this fresh — a 60s edge cache is plenty since builds are rare
      // and the route itself is cached with `s-maxage` below.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { app?: { byId?: { builds?: EasBuild[] } } };
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
    (await resolveLatestApkUrl()) ?? process.env.VAULT_APK_FALLBACK_URL ?? null;

  if (!apkUrl) {
    return new Response(
      "Killio Vault APK is not yet available. Try again in a few minutes.",
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const res = NextResponse.redirect(apkUrl, 302);
  // Edge cache for 5 minutes so we don't hammer EAS GraphQL on every click —
  // CI builds take much longer than that anyway.
  res.headers.set("Cache-Control", "public, s-maxage=300, max-age=60");
  return res;
}
