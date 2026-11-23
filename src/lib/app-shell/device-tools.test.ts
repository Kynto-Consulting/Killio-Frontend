import assert from "node:assert/strict";
import test from "node:test";

import { deviceKind, deviceToolsFor, searchApps } from "./device-tools.ts";
import { LINK_TOOLS } from "./link-tools.ts";

test("platforms map to a kind of device", () => {
  for (const p of ["windows", "macos", "linux", "something-new"]) assert.equal(deviceKind(p), "desktop", p);
  for (const p of ["android", "ios"]) assert.equal(deviceKind(p), "mobile", p);
});

test("a desktop is not offered phone tools", () => {
  const tools = deviceToolsFor("windows", ["screenshot"]);
  for (const phoneOnly of ["call_number", "send_sms", "whatsapp_call", "share_text", "battery_status", "play_store_open", "uber_request"]) {
    assert.ok(!tools.includes(phoneOnly), phoneOnly);
  }
  assert.ok(tools.includes("vault_upload_screenshot"));
  assert.ok(tools.includes("open_browser"));
});

test("a phone gets phone tools, and the Play Store only on Android", () => {
  const android = deviceToolsFor("android", []);
  const ios = deviceToolsFor("ios", []);
  for (const tool of ["call_number", "send_sms", "share_text"]) {
    assert.ok(android.includes(tool), tool);
    assert.ok(ios.includes(tool), tool);
  }
  assert.ok(android.includes("play_store_open"));
  assert.ok(!ios.includes("play_store_open"));
});

test("the screenshot tool needs both a desktop and an app build that has the feature", () => {
  assert.ok(!deviceToolsFor("windows", []).includes("vault_upload_screenshot"));
  assert.ok(!deviceToolsFor("android", ["screenshot"]).includes("vault_upload_screenshot"));
});

test("every link tool is offered on at least one device, and nothing is offered twice", () => {
  const offered = new Set(["windows", "macos", "linux", "android", "ios"].flatMap((platform) => deviceToolsFor(platform, ["screenshot", "apps"])));
  for (const tool of Object.keys(LINK_TOOLS)) assert.ok(offered.has(tool), `${tool} is implemented but never offered`);
  for (const platform of ["windows", "android"]) {
    const list = deviceToolsFor(platform, ["screenshot"]);
    assert.equal(new Set(list).size, list.length, platform);
  }
});

test("each operating system gets its own tools and none of another's", () => {
  const has = (platform: string, tool: string) => deviceToolsFor(platform, ["screenshot", "apps"]).includes(tool);
  assert.ok(has("windows", "windows_open_settings"));
  assert.ok(has("macos", "macos_open_settings") && has("macos", "apple_run_shortcut"));
  assert.ok(has("ios", "apple_run_shortcut"));
  assert.ok(has("android", "vibrate"));
  for (const platform of ["macos", "linux", "android", "ios"]) assert.ok(!has(platform, "windows_open_settings"), platform);
  for (const platform of ["windows", "linux", "android", "ios"]) assert.ok(!has(platform, "macos_open_settings"), platform);
  for (const platform of ["windows", "linux", "android"]) assert.ok(!has(platform, "apple_run_shortcut"), platform);
  // Installed-app tools: every desktop, no phone (the app cannot list a phone's apps yet).
  for (const platform of ["windows", "macos", "linux"]) assert.ok(has(platform, "open_installed_app"), platform);
  for (const platform of ["android", "ios"]) assert.ok(!has(platform, "open_installed_app"), platform);
  assert.ok(!deviceToolsFor("windows", []).includes("open_installed_app"));
});

test("app search ignores case and accents and puts the closest name first", () => {
  const apps = ["Visual Studio Code", "Código Abierto", "Code", "Spotify"].map((label) => ({ label }));
  assert.deepEqual(searchApps(apps, "code").map((x) => x.label), ["Code", "Visual Studio Code"]);
  assert.deepEqual(searchApps(apps, "CODIGO").map((x) => x.label), ["Código Abierto"]);
  assert.deepEqual(searchApps(apps, "  "), []);
  assert.deepEqual(searchApps(apps, "zzz"), []);
});
