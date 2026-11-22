import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PANELS_STORAGE_KEY, TOPBAR_MEDIUM_MIN, TOPBAR_WIDE_MIN, configAfterSelection, defaultPanels, menuItems, primaryActions, readPanels, shortcutAction, topbarLayout, topbarLevel, workbenchTabs, writePanels,
} from "./workbench.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};

const FULL = { list: true, run: true, preview: true, fullscreen: true, panelToggles: true, tabs: true, save: true, rename: true };

test("width -> level, using the width of the bar (thresholds are inclusive at the lower edge)", () => {
  assert.equal(topbarLevel(1920), "wide");
  assert.equal(topbarLevel(TOPBAR_WIDE_MIN), "wide");
  assert.equal(topbarLevel(TOPBAR_WIDE_MIN - 1), "medium");
  assert.equal(topbarLevel(894), "medium", "the 894px panel of a 1536px window with the sidebar open");
  assert.equal(topbarLevel(TOPBAR_MEDIUM_MIN), "medium");
  assert.equal(topbarLevel(TOPBAR_MEDIUM_MIN - 1), "narrow");
  assert.equal(topbarLevel(320), "narrow");
  assert.equal(topbarLevel(0), "wide", "unknown / not measured yet");
  assert.equal(topbarLevel(null), "wide");
  assert.equal(topbarLevel(Number.NaN), "wide");
});

test("review window sizes (1280/1440/1536/1920) with the sidebar and the script list open or folded", () => {
  // MODEL, not a measurement: panel = window - sidebar (256 open / 64 folded) - script list (340 when open) - 48 of paddings.
  const panel = (win: number, sidebarOpen: boolean, listOpen: boolean) => win - (sidebarOpen ? 256 : 64) - (listOpen ? 340 : 0) - 48;
  assert.equal(panel(1536, true, true), 892, "close to the 894px reported on killio.dev");
  const expected: Array<[number, boolean, boolean, string]> = [
    [1280, true, true, "narrow"], [1280, false, true, "medium"], [1280, false, false, "wide"], [1280, true, false, "medium"],
    [1440, true, true, "medium"], [1440, false, true, "medium"], [1440, false, false, "wide"], [1440, true, false, "wide"],
    [1536, true, true, "medium"], [1536, false, true, "medium"], [1536, false, false, "wide"], [1536, true, false, "wide"],
    [1920, true, true, "wide"], [1920, false, true, "wide"], [1920, false, false, "wide"], [1920, true, false, "wide"],
  ];
  for (const [win, sidebar, list, level] of expected) assert.equal(topbarLevel(panel(win, sidebar, list)), level, `${win}px sidebar=${sidebar} list=${list}`);
});

test("wide: everything inline with labels", () => {
  const l = topbarLayout("wide", FULL);
  assert.deepEqual(l.inline, ["list", "rename", "active", "tabs", "panelToggles", "run", "preview", "fullscreen", "save", "menu"]);
  assert.deepEqual(l.menu, []);
  assert.deepEqual(l.labels, { active: true, run: true, preview: true, save: true });
  assert.equal(l.compactTabs, false);
});

test("medium: icons without labels for Preview / Fullscreen / Run, Save keeps its label", () => {
  const l = topbarLayout("medium", FULL);
  assert.ok(l.inline.includes("preview") && l.inline.includes("fullscreen") && l.inline.includes("run"));
  assert.deepEqual(l.labels, { active: false, run: false, preview: false, save: true });
  assert.deepEqual(l.menu, []);
  assert.equal(l.compactTabs, true);
});

test("narrow: Preview, Fullscreen, Run, panel toggles and rename go to the menu; Save, Active and the menu stay", () => {
  const l = topbarLayout("narrow", FULL);
  assert.deepEqual(l.inline, ["list", "active", "tabs", "save", "menu"]);
  assert.deepEqual(l.menu.sort(), ["config", "fullscreen", "palette", "preview", "rename", "run"].sort());
  assert.equal(l.labels.save, false, "icon-only Save, still visible");
});

test("Save, the Active switch and the menu are inline at EVERY level (they are never clipped or moved)", () => {
  for (const level of ["wide", "medium", "narrow"] as const) {
    for (const tabOffers of [FULL, { ...FULL, run: false, preview: false, fullscreen: false, panelToggles: false }]) {
      const l = topbarLayout(level, tabOffers);
      for (const must of ["save", "active", "menu"] as const) assert.ok(l.inline.includes(must), `${must} at ${level}`);
    }
  }
});

test("controls a tab does not offer never appear", () => {
  const runs = topbarLayout("wide", { ...FULL, run: false, preview: false, fullscreen: false, panelToggles: false, save: false });
  assert.ok(!runs.inline.includes("save") && !runs.inline.includes("preview") && !runs.inline.includes("panelToggles"));
  assert.ok(runs.inline.includes("active") && runs.inline.includes("menu"));
});

test("a locked script keeps the bar (state + menu) without any editing control", () => {
  const l = topbarLayout("narrow", { list: true, run: false, preview: false, fullscreen: false, panelToggles: false, tabs: false, save: false, rename: false });
  assert.deepEqual(l.inline, ["list", "active", "menu"]);
});

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
