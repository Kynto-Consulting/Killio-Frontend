// Pure logic of the script editor chrome (the single top bar): which actions it offers, and how the collapsible panels are remembered.
// No React / DOM: tested with node:test (workbench.test.ts).

export type WorkbenchTab = "blocks" | "text" | "runs";
export type MenuActionId = "duplicate" | "lock" | "unlock" | "copyWebhook" | "authorship" | "delete";
export type PrimaryActionId = "save" | "preview" | "fullscreen" | "run";

export interface WorkbenchContext {
  tab: WorkbenchTab;
  /** The code of the script is locked: nobody opens graph, text or runs. */
  locked: boolean;
  lockSource?: "owner" | "pack" | null;
  /** Webhook scripts expose a URL. */
  hasWebhook: boolean;
  /** The script has an original author / pack origin / fork source to show. */
  hasAuthorship: boolean;
  /** A manual trigger exists in the graph. */
  canRunManually: boolean;
  /** Team + token are known (needed by preview). */
  canPreview: boolean;
}

/** Tabs of the segmented control. A locked script shows none: its code is not reachable from any editor. */
export function workbenchTabs(ctx: Pick<WorkbenchContext, "locked">): WorkbenchTab[] {
  return ctx.locked ? [] : ["blocks", "text", "runs"];
}

/** Primary buttons of the bar (after the title / state / tabs). */
export function primaryActions(ctx: Pick<WorkbenchContext, "tab" | "locked" | "canRunManually" | "canPreview">): PrimaryActionId[] {
  if (ctx.locked) return [];
  if (ctx.tab === "runs") return [];
  if (ctx.tab === "text") return ["save"];
  const out: PrimaryActionId[] = [];
  if (ctx.canRunManually) out.push("run");
  if (ctx.canPreview) out.push("preview");
  out.push("fullscreen", "save");
  return out;
}

export interface MenuItem {
  id: MenuActionId;
  destructive?: boolean;
  /** Visual divider before the item. */
  divider?: boolean;
}

/**
 * Items of the "…" menu, in order. Mirrors the server rules shown by scriptLockUi (duplicate is never offered while locked, a pack lock
 * is never unlocked); the server still decides everything.
 */
export function menuItems(ctx: Pick<WorkbenchContext, "locked" | "lockSource" | "hasWebhook" | "hasAuthorship">): MenuItem[] {
  const items: MenuItem[] = [];
  if (!ctx.locked) items.push({ id: "duplicate" });
  if (!ctx.locked) items.push({ id: "lock" });
  else if (ctx.lockSource !== "pack") items.push({ id: "unlock" });
  if (ctx.hasWebhook && !ctx.locked) items.push({ id: "copyWebhook", divider: items.length > 0 });
  if (ctx.hasAuthorship) items.push({ id: "authorship", divider: items.length > 0 });
  items.push({ id: "delete", destructive: true, divider: true });
  return items;
}

// ─── collapsible panels ─────────────────────────────────────────────────────

export type PanelId = "list" | "palette" | "config";
export type PanelState = Record<PanelId, boolean>;

export const PANELS_STORAGE_KEY = "killio.scripts.panels.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Defaults: everything open on wide screens; the two canvas panels (bottom sheets) and the list start closed on narrow ones. */
export function defaultPanels(narrow: boolean): PanelState {
  return narrow ? { list: false, palette: false, config: false } : { list: true, palette: true, config: true };
}

/** Reads the remembered state; any failure (no storage, blocked, bad JSON) gives the defaults. Unknown / non-boolean values are ignored. */
export function readPanels(storage: StorageLike | null | undefined, narrow: boolean): PanelState {
  const base = defaultPanels(narrow);
  try {
    const raw = storage?.getItem(PANELS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
    const key = narrow ? "narrow" : "wide";
    const bucket = (parsed[key] ?? {}) as Record<string, unknown>;
    const out = { ...base };
    for (const id of ["list", "palette", "config"] as PanelId[]) if (typeof bucket[id] === "boolean") out[id] = bucket[id] as boolean;
    return out;
  } catch {
    return base;
  }
}

/**
 * Remembers panels of the current screen class (narrow and wide are stored apart so a phone does not change the desktop layout).
 * `patch` is MERGED with what is stored, so the list (page) and the palette/config (canvas) never overwrite each other.
 */
export function writePanels(storage: StorageLike | null | undefined, narrow: boolean, patch: Partial<PanelState>): void {
  try {
    if (!storage) return;
    let all: Record<string, unknown> = {};
    try {
      const raw = storage.getItem(PANELS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) all = parsed as Record<string, unknown>;
    } catch {
      all = {};
    }
    const key = narrow ? "narrow" : "wide";
    const prev = all[key];
    all[key] = { ...(prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {}), ...patch };
    storage.setItem(PANELS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable: the layout still works, it is just not remembered */
  }
}

/** The node-config panel opens by itself when a node gets selected (a different one, not on deselect). Returns the next `config` value. */
export function configAfterSelection(prevSelected: string | null, nextSelected: string | null, configOpen: boolean): boolean {
  if (nextSelected && nextSelected !== prevSelected) return true;
  return configOpen;
}

/** Keyboard shortcut → action for the bar. Ctrl/Cmd+S saves (when it has a save), Escape leaves fullscreen. */
export function shortcutAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean }, state: { fullscreen: boolean; canSave: boolean }): "save" | "exitFullscreen" | null {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && state.canSave) return "save";
  if (e.key === "Escape" && state.fullscreen) return "exitFullscreen";
  return null;
}
