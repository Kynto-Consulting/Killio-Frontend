/**
 * Pure helpers for the Killio App download page and its `/download/app` route:
 * which release asset belongs to which platform, what the page may know about a
 * release, and which system a visitor is on. No network and no env access here,
 * so it runs under `node --test`.
 */

export const APP_PLATFORMS = [
  "windows",
  "windows-msi",
  "macos",
  "linux-appimage",
  "linux-deb",
  "linux-rpm",
  "android",
] as const;

export type AppPlatform = (typeof APP_PLATFORMS)[number];

export function isAppPlatform(value: unknown): value is AppPlatform {
  return typeof value === "string" && (APP_PLATFORMS as readonly string[]).includes(value);
}

/** File name ending of each platform's asset (compared without case). */
const ASSET_SUFFIX: Record<AppPlatform, string> = {
  windows: "-setup.exe",
  "windows-msi": ".msi",
  macos: ".dmg",
  "linux-appimage": ".AppImage",
  "linux-deb": ".deb",
  "linux-rpm": ".rpm",
  android: ".apk",
};

/** When a release carries several builds of one format, the one most visitors need. */
const PREFERRED: Record<AppPlatform, RegExp> = {
  windows: /x64|x86_64|amd64/i,
  "windows-msi": /x64|x86_64|amd64/i,
  macos: /universal/i,
  "linux-appimage": /x64|x86_64|amd64/i,
  "linux-deb": /x64|x86_64|amd64/i,
  "linux-rpm": /x64|x86_64|amd64/i,
  android: /universal/i,
};

export interface AppReleaseAsset {
  name: string;
  /** GitHub API asset URL (needs the token; never sent to the browser). */
  url: string;
}

export interface AppRelease {
  version: string | null;
  publishedAt: string | null;
  assets: AppReleaseAsset[];
}

export interface AppReleaseInfo {
  version: string | null;
  publishedAt: string | null;
  assets: Record<AppPlatform, boolean>;
}

// Only well-known pre-release words count, so a file name's tail ("1.2.3-setup.exe",
// "1.2.3-1.x86_64.rpm") is never taken for part of the version.
const SEMVER = /\d+\.\d+\.\d+(?:-(?:alpha|beta|rc|preview|dev)(?:\.\d+)*)?/i;

function semverIn(text: unknown): string | null {
  if (typeof text !== "string") return null;
  return text.match(SEMVER)?.[0] ?? null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/**
 * Reads a GitHub release payload. Returns null when it is not a release with
 * assets. The version comes from the tag when the tag is a version, otherwise
 * (rolling tag such as `app-latest`) from the release name or the asset names.
 */
export function parseRelease(payload: unknown): AppRelease | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.assets)) return null;

  const assets: AppReleaseAsset[] = [];
  let newest: string | null = null;
  for (const entry of raw.assets) {
    if (!entry || typeof entry !== "object") continue;
    const asset = entry as Record<string, unknown>;
    if (typeof asset.name !== "string" || typeof asset.url !== "string") continue;
    if (!asset.url.startsWith("https://api.github.com/")) continue;
    assets.push({ name: asset.name, url: asset.url });
    const updated = isoDate(asset.updated_at);
    if (updated && (!newest || updated > newest)) newest = updated;
  }
  if (!assets.length) return null;

  const version =
    semverIn(raw.tag_name) ??
    semverIn(raw.name) ??
    assets.map((a) => semverIn(a.name)).find((v) => v !== null) ??
    null;

  // A rolling release keeps its first publication date; the assets say when it was last built.
  return { version, publishedAt: newest ?? isoDate(raw.published_at), assets };
}

export function pickAsset(release: AppRelease | null, platform: AppPlatform): AppReleaseAsset | null {
  if (!release) return null;
  const suffix = ASSET_SUFFIX[platform].toLowerCase();
  const matches = release.assets.filter((a) => a.name.toLowerCase().endsWith(suffix));
  if (!matches.length) return null;
  return matches.find((a) => PREFERRED[platform].test(a.name)) ?? matches[0];
}

/** What the download page is allowed to know: no URLs, no file names. */
export function releaseInfo(release: AppRelease): AppReleaseInfo {
  const assets = {} as Record<AppPlatform, boolean>;
  for (const platform of APP_PLATFORMS) assets[platform] = pickAsset(release, platform) !== null;
  return { version: release.version, publishedAt: release.publishedAt, assets };
}

export type VisitorSystem = "windows" | "macos" | "linux" | "android" | "ios";

/**
 * The visitor's operating system, to offer the right installer first.
 * (This is about the visitor's system, not about detecting Killio App: that is
 * `isKillioApp()`.) iPadOS presents itself as a Mac, hence the touch check.
 */
export function detectSystem(userAgent: string, maxTouchPoints = 0): VisitorSystem | null {
  const ua = userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return maxTouchPoints > 1 ? "ios" : "macos";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return null;
}

/** `owner/repo`, or null when the configured value is not one. */
export function safeRepo(value: string | undefined | null): string | null {
  const repo = (value ?? "").trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : null;
}
