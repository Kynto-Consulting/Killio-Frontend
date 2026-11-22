import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PANELS_STORAGE_KEY, configAfterSelection, defaultPanels, menuItems, primaryActions, readPanels, shortcutAction, workbenchTabs, writePanels,
} from "./workbench.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};

test("a locked script shows no tabs and no primary actions", () => {
  assert.deepEqual(workbenchTabs({ locked: true }), []);
  assert.deepEqual(workbenchTabs({ locked: false }), ["blocks", "text", "runs"]);
  assert.deepEqual(primaryActions({ tab: "blocks", locked: true, canRunManually: true, canPreview: true }), []);
});

test("primary actions depend on the tab", () => {
  const base = { locked: false, canRunManually: false, canPreview: true };
  assert.deepEqual(primaryActions({ ...base, tab: "blocks" }), ["preview", "fullscreen", "save"]);
  assert.deepEqual(primaryActions({ ...base, tab: "blocks", canRunManually: true }), ["run", "preview", "fullscreen", "save"]);
  assert.deepEqual(primaryActions({ ...base, tab: "blocks", canPreview: false }), ["fullscreen", "save"]);
  assert.deepEqual(primaryActions({ ...base, tab: "text" }), ["save"]);
  assert.deepEqual(primaryActions({ ...base, tab: "runs" }), []);
});

test("menu: duplicate/lock only when unlocked, unlock never for a pack lock, delete always last and destructive", () => {
  const open = menuItems({ locked: false, hasWebhook: true, hasAuthorship: true }).map((i) => i.id);
  assert.deepEqual(open, ["duplicate", "lock", "copyWebhook", "authorship", "delete"]);
  const owner = menuItems({ locked: true, lockSource: "owner", hasWebhook: true, hasAuthorship: false }).map((i) => i.id);
  assert.deepEqual(owner, ["unlock", "delete"]);
  const pack = menuItems({ locked: true, lockSource: "pack", hasWebhook: false, hasAuthorship: true }).map((i) => i.id);
  assert.deepEqual(pack, ["authorship", "delete"]);
  const last = menuItems({ locked: false, hasWebhook: false, hasAuthorship: false }).at(-1)!;
  assert.equal(last.id, "delete");
  assert.equal(last.destructive, true);
  assert.equal(menuItems({ locked: false, hasWebhook: false, hasAuthorship: false })[0].divider, undefined);
});

test("webhook URL is never offered for a locked script", () => {
  assert.ok(!menuItems({ locked: true, lockSource: "owner", hasWebhook: true, hasAuthorship: false }).some((i) => i.id === "copyWebhook"));
});

test("panel defaults differ for narrow screens", () => {
  assert.deepEqual(defaultPanels(false), { list: true, palette: true, config: true });
  assert.deepEqual(defaultPanels(true), { list: false, palette: false, config: false });
});

test("panel state round-trips, per screen class", () => {
  const s = mem();
  writePanels(s, false, { list: false, palette: true, config: false });
  writePanels(s, true, { list: true, palette: true, config: true });
  assert.deepEqual(readPanels(s, false), { list: false, palette: true, config: false });
  assert.deepEqual(readPanels(s, true), { list: true, palette: true, config: true });
});

test("writers of different panels never overwrite each other (list from the page, palette/config from the canvas)", () => {
  const s = mem();
  writePanels(s, false, { list: false });
  writePanels(s, false, { palette: false });
  writePanels(s, false, { config: false });
  assert.deepEqual(readPanels(s, false), { list: false, palette: false, config: false });
  writePanels(s, false, { palette: true });
  assert.deepEqual(readPanels(s, false), { list: false, palette: true, config: false });
  assert.deepEqual(readPanels(s, true), defaultPanels(true), "the other screen class is untouched");
});

test("panel state survives broken or unavailable storage", () => {
  const bad = mem();
  bad.raw.set(PANELS_STORAGE_KEY, "{not json");
  assert.deepEqual(readPanels(bad, false), defaultPanels(false));
  bad.raw.set(PANELS_STORAGE_KEY, JSON.stringify({ wide: { list: "yes", palette: false } }));
  assert.deepEqual(readPanels(bad, false), { list: true, palette: false, config: true });
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readPanels(throwing, true), defaultPanels(true));
  assert.doesNotThrow(() => writePanels(throwing, true, defaultPanels(true)));
  assert.deepEqual(readPanels(null, false), defaultPanels(false));
  assert.doesNotThrow(() => writePanels(undefined, false, defaultPanels(false)));
  const corrupt = mem();
  corrupt.raw.set(PANELS_STORAGE_KEY, "[1,2]");
  writePanels(corrupt, false, { list: false, palette: false, config: false });
  assert.deepEqual(readPanels(corrupt, false), { list: false, palette: false, config: false });
});

test("config panel opens when a different node is selected, stays as it was otherwise", () => {
  assert.equal(configAfterSelection(null, "n1", false), true);
  assert.equal(configAfterSelection("n1", "n2", false), true);
  assert.equal(configAfterSelection("n1", "n1", false), false);
  assert.equal(configAfterSelection("n1", null, false), false);
  assert.equal(configAfterSelection("n1", null, true), true);
});

test("shortcuts: Ctrl/Cmd+S saves only when it can, Escape leaves fullscreen only when in it", () => {
  assert.equal(shortcutAction({ key: "s", ctrlKey: true }, { fullscreen: false, canSave: true }), "save");
  assert.equal(shortcutAction({ key: "S", metaKey: true }, { fullscreen: false, canSave: true }), "save");
  assert.equal(shortcutAction({ key: "s", ctrlKey: true }, { fullscreen: false, canSave: false }), null);
  assert.equal(shortcutAction({ key: "Escape" }, { fullscreen: true, canSave: true }), "exitFullscreen");
  assert.equal(shortcutAction({ key: "Escape" }, { fullscreen: false, canSave: true }), null);
  assert.equal(shortcutAction({ key: "s" }, { fullscreen: false, canSave: true }), null);
});
