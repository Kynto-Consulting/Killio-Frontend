import assert from "node:assert/strict";
import test from "node:test";

import { APP_PLATFORMS, detectSystem, isAppPlatform, parseRelease, pickAsset, releaseInfo, safeRepo } from "./release.ts";

const api = (id: number) => `https://api.github.com/repos/o/r/releases/assets/${id}`;
const asset = (name: string, id: number, updated_at?: string) => ({ name, url: api(id), browser_download_url: `https://github.com/o/r/releases/download/x/${name}`, updated_at });

const FULL = {
  tag_name: "app-latest",
  name: "Killio App (latest build)",
  published_at: "2026-11-01T10:00:00Z",
  assets: [
    asset("Killio.App_1.4.2_x64-setup.exe", 1, "2026-11-20T08:00:00Z"),
    asset("Killio.App_1.4.2_x64-setup.exe.sig", 2),
    asset("Killio.App_1.4.2_x64_en-US.msi", 3, "2026-11-21T09:30:00Z"),
    asset("Killio.App_1.4.2_aarch64.dmg", 4),
    asset("Killio.App_1.4.2_universal.dmg", 5),
    asset("killio-app_1.4.2_amd64.AppImage", 6),
    asset("killio-app_1.4.2_amd64.AppImage.tar.gz", 7),
    asset("killio-app_1.4.2_arm64.deb", 8),
    asset("killio-app_1.4.2_amd64.deb", 9),
    asset("killio-app-1.4.2-1.x86_64.rpm", 10),
    asset("killio-app-1.4.2-arm64-v8a.apk", 11),
    asset("killio-app-1.4.2-universal.apk", 12),
  ],
};

test("every platform resolves to its own asset, preferring the common build", () => {
  const release = parseRelease(FULL);
  assert.ok(release);
  const picked = Object.fromEntries(APP_PLATFORMS.map((p) => [p, pickAsset(release, p)?.url]));
  assert.deepEqual(picked, {
    windows: api(1),
    "windows-msi": api(3),
    macos: api(5),
    "linux-appimage": api(6),
    "linux-deb": api(9),
    "linux-rpm": api(10),
    android: api(12),
  });
});

test("signatures and archives never pass for an installer", () => {
  const release = parseRelease({ assets: [asset("a-setup.exe.sig", 1), asset("a.AppImage.tar.gz", 2), asset("setup.exe.txt", 3)] });
  assert.ok(release);
  for (const p of APP_PLATFORMS) assert.equal(pickAsset(release, p), null, p);
  assert.equal(pickAsset(null, "windows"), null);
});

test("a plain .exe that is not the installer is not offered as Windows", () => {
  const release = parseRelease({ assets: [asset("killio-app.exe", 1)] });
  assert.equal(pickAsset(release, "windows"), null);
});

test("matching ignores case and falls back to the only build there is", () => {
  const release = parseRelease({ assets: [asset("Killio_1.0.0_aarch64.appimage", 1), asset("KILLIO.APK", 2)] });
  assert.equal(pickAsset(release, "linux-appimage")?.url, api(1));
  assert.equal(pickAsset(release, "android")?.url, api(2));
});

test("version: the tag when it is one, else the release name, else the file names", () => {
  assert.equal(parseRelease({ ...FULL, tag_name: "v2.0.1" })?.version, "2.0.1");
  assert.equal(parseRelease({ ...FULL, name: "Killio App 1.5.0-beta.1" })?.version, "1.5.0-beta.1");
  assert.equal(parseRelease(FULL)?.version, "1.4.2");
  assert.equal(parseRelease({ tag_name: "app-latest", assets: [asset("killio-app-1.4.2-setup.exe", 1)] })?.version, "1.4.2");
  assert.equal(parseRelease({ tag_name: "app-latest", assets: [asset("killio-app-1.4.2-1.x86_64.rpm", 1)] })?.version, "1.4.2");
  assert.equal(parseRelease({ tag_name: "app-latest", assets: [asset("killio.apk", 1)] })?.version, null);
});

test("date: the newest asset wins over the date the rolling release was first published", () => {
  assert.equal(parseRelease(FULL)?.publishedAt, "2026-11-21T09:30:00.000Z");
  assert.equal(parseRelease({ published_at: "2026-11-01T10:00:00Z", assets: [asset("a.apk", 1)] })?.publishedAt, "2026-11-01T10:00:00.000Z");
  assert.equal(parseRelease({ published_at: "not a date", assets: [asset("a.apk", 1)] })?.publishedAt, null);
});

test("payloads that are not a usable release are refused", () => {
  for (const bad of [null, undefined, "x", 3, {}, { assets: "no" }, { assets: [] }, { message: "Not Found" }, { assets: [{ name: "a.apk" }, null, 4] }]) {
    assert.equal(parseRelease(bad), null, JSON.stringify(bad));
  }
  // An asset whose URL is not the GitHub API is dropped: the token is only ever sent there.
  assert.equal(parseRelease({ assets: [{ name: "a.apk", url: "https://evil.example/a.apk" }] }), null);
});

test("the page gets availability only: no URLs and no file names", () => {
  const info = releaseInfo(parseRelease({ tag_name: "v1.0.0", assets: [asset("a-setup.exe", 1), asset("a.apk", 2)] })!);
  assert.deepEqual(info, {
    version: "1.0.0",
    publishedAt: null,
    assets: { windows: true, "windows-msi": false, macos: false, "linux-appimage": false, "linux-deb": false, "linux-rpm": false, android: true },
  });
  assert.ok(!JSON.stringify(info).includes("github"));
});

test("platform parameter accepts only the known names", () => {
  for (const p of APP_PLATFORMS) assert.ok(isAppPlatform(p));
  for (const bad of ["", "ios", "Windows", "linux", null, undefined, 1, ["windows"]]) assert.equal(isAppPlatform(bad), false, String(bad));
});

test("visitor system from the user agent", () => {
  assert.equal(detectSystem("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"), "windows");
  assert.equal(detectSystem("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15"), "macos");
  assert.equal(detectSystem("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"), "linux");
  // Android says "Linux" too, and must not be offered a desktop package.
  assert.equal(detectSystem("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"), "android");
  assert.equal(detectSystem("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), "ios");
  // iPadOS reports a Mac; only the touch screen tells them apart.
  assert.equal(detectSystem("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15", 5), "ios");
  assert.equal(detectSystem(""), null);
  assert.equal(detectSystem("curl/8.4.0"), null);
});

test("repo setting must look like owner/repo", () => {
  assert.equal(safeRepo("Kynto-Consulting/Killio-App"), "Kynto-Consulting/Killio-App");
  for (const bad of [undefined, null, "", "repo", "a/b/c", "a/b?x=1", "../a/b", "a b/c"]) assert.equal(safeRepo(bad), null, String(bad));
});
