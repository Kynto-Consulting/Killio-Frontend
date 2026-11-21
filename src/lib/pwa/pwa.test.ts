import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "../tenant/types.ts";
import { buildManifestIcons, buildWebManifest, hslTripletToHex, iconVariantSpec, iconVersion, isIconVariant, manifestColors } from "./manifest.ts";
import { isIosDevice, resolveInstallUiState, resolvePushUiState, type PushEnv } from "./support.ts";

const tenant = (over: Partial<PublicTenantConfig["brand"]> = {}, theme: Partial<PublicTenantConfig["theme"]> = {}): PublicTenantConfig => ({
  ...DEFAULT_TENANT_CONFIG,
  mode: "tenant",
  brand: { ...DEFAULT_TENANT_CONFIG.brand, name: "Laboratorios ACME", shortName: "ACME", tagline: "Todo el lab", ...over },
  theme: { ...DEFAULT_TENANT_CONFIG.theme, ...theme },
});

test("hslTripletToHex converts the tenant palette format", () => {
  assert.equal(hslTripletToHex("0 0% 100%"), "#ffffff");
  assert.equal(hslTripletToHex("0 0% 0%"), "#000000");
  assert.equal(hslTripletToHex("0 100% 50%"), "#ff0000");
  assert.equal(hslTripletToHex("220 60% 10%"), "#0a1429");
  assert.equal(hslTripletToHex("nope"), null);
  assert.equal(hslTripletToHex(undefined), null);
});

test("public mode is Killio's own manifest with static icons", () => {
  const m = buildWebManifest(DEFAULT_TENANT_CONFIG);
  assert.equal(m.short_name, "Killio");
  assert.ok(m.icons.every((i) => i.src.startsWith("/icon-") || i.src === "/apple-icon.png"));
  assert.equal(m.background_color, "#020408");
});

test("tenant manifest uses its name, colours and generated logo icons", () => {
  const t = tenant({ logoUrl: "/tenant/logo-roe.png" }, { defaultMode: "dark", dark: { background: "220 60% 10%" } });
  const m = buildWebManifest(t);
  assert.equal(m.name, "Laboratorios ACME");
  assert.equal(m.short_name, "ACME");
  assert.equal(m.description, "Todo el lab");
  assert.equal(m.background_color, "#0a1429");
  assert.deepEqual(m.icons.map((i) => i.purpose), ["any", "any", "maskable"]);
  assert.ok(m.icons.every((i) => i.src.startsWith("/pwa-icon/") && i.src.includes("?v=")));
});

test("tenant without a logo keeps Killio's static icons; favicon is the second choice", () => {
  assert.ok(buildManifestIcons(tenant()).every((i) => !i.src.startsWith("/pwa-icon/")));
  assert.ok(buildManifestIcons(tenant({ faviconUrl: "https://x.com/f.png" })).every((i) => i.src.startsWith("/pwa-icon/")));
});

test("icon version changes with the logo and is stable otherwise", () => {
  assert.equal(iconVersion("/a.png"), iconVersion("/a.png"));
  assert.notEqual(iconVersion("/a.png"), iconVersion("/b.png"));
});

test("light-first tenants use the light background; short_name is capped", () => {
  const t = tenant({ shortName: "A very long short name" }, { defaultMode: "light", light: { background: "0 0% 100%" }, dark: { background: "0 0% 0%" } });
  assert.equal(manifestColors(t).background, "#ffffff");
  assert.ok(buildWebManifest(t).short_name.length <= 12);
});

test("icon variants", () => {
  assert.ok(isIconVariant("maskable-512"));
  assert.ok(!isIconVariant("1024"));
  assert.deepEqual(iconVariantSpec("192"), { size: 192, maskable: false });
  assert.deepEqual(iconVariantSpec("maskable-512"), { size: 512, maskable: true });
});

const baseEnv: PushEnv = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130",
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  subscribed: false,
  serverConfigured: true,
};
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari/605.1.15";

test("push UI state machine", () => {
  assert.equal(resolvePushUiState(baseEnv), "off");
  assert.equal(resolvePushUiState({ ...baseEnv, permission: "granted", subscribed: true }), "on");
  assert.equal(resolvePushUiState({ ...baseEnv, permission: "granted", subscribed: false }), "off");
  assert.equal(resolvePushUiState({ ...baseEnv, permission: "denied" }), "denied");
  assert.equal(resolvePushUiState({ ...baseEnv, serverConfigured: false }), "not-configured");
  assert.equal(resolvePushUiState({ ...baseEnv, hasPushManager: false }), "unsupported");
});

test("iOS needs the app installed before push can work", () => {
  assert.equal(resolvePushUiState({ ...baseEnv, userAgent: IPHONE, hasPushManager: false }), "needs-install");
  assert.equal(resolvePushUiState({ ...baseEnv, userAgent: IPHONE, standalone: true }), "off");
  assert.ok(isIosDevice({ userAgent: "Macintosh; Intel Mac OS X", platform: "MacIntel", maxTouchPoints: 5 }));
  assert.ok(!isIosDevice({ userAgent: "Macintosh; Intel Mac OS X", platform: "MacIntel", maxTouchPoints: 0 }));
});

test("install UI state", () => {
  const base = { standalone: false, hasDeferredPrompt: false, userAgent: baseEnv.userAgent };
  assert.equal(resolveInstallUiState({ ...base, standalone: true }), "installed");
  assert.equal(resolveInstallUiState({ ...base, hasDeferredPrompt: true }), "prompt");
  assert.equal(resolveInstallUiState({ ...base, userAgent: IPHONE }), "ios-manual");
  assert.equal(resolveInstallUiState(base), "unavailable");
});

import { parsePushData, pickWindowToFocus, safeTargetPath, toNotification } from "./push-display.ts";

test("push becomes a notification with the tenant icon, falling back safely", () => {
  const n = toNotification({ title: "Asignado: X", body: "b", icon: "https://cdn.acme.com/l.png", url: "/b/1?card=2", tag: "t", appName: "ACME" });
  assert.equal(n.title, "Asignado: X");
  assert.equal(n.options.icon, "https://cdn.acme.com/l.png");
  assert.equal(n.options.badge, "https://cdn.acme.com/l.png");
  assert.equal(n.options.data.url, "/b/1?card=2");
  const bare = toNotification({ icon: "javascript:alert(1)", url: "https://evil.com", appName: "ACME" });
  assert.equal(bare.title, "ACME");
  assert.equal(bare.options.icon, "/icon-192.png");
  assert.equal(bare.options.data.url, "/");
  assert.equal(toNotification({}).title, "Killio");
});

test("parsePushData tolerates plain text and junk", () => {
  assert.deepEqual(parsePushData('{"title":"a"}'), { title: "a" });
  assert.deepEqual(parsePushData("hola"), { body: "hola" });
  assert.deepEqual(parsePushData(null), {});
  assert.equal(safeTargetPath("//evil.com"), "/");
});

test("a click reuses a window of the same origin only", () => {
  const wins = [{ url: "https://other.com/x" }, { url: "https://app.acme.com/b/1" }];
  assert.equal(pickWindowToFocus(wins, "https://app.acme.com"), wins[1]);
  assert.equal(pickWindowToFocus([{ url: "not a url" }], "https://app.acme.com"), undefined);
});

import { hexLuma, iconBackground } from "./manifest.ts";

test("icon background keeps the tenant colour unless the logo would vanish on it", () => {
  assert.equal(iconBackground("#0a1429", 0.95), "#0a1429"); // light logo on dark: fine
  assert.equal(iconBackground("#0a1429", 0.1), "#ffffff"); // dark logo on dark: use white
  assert.equal(iconBackground("#ffffff", 0.9), "#111111"); // white logo on white: use near-black
  assert.ok(hexLuma("#ffffff") > 0.99 && hexLuma("#000000") === 0);
});
