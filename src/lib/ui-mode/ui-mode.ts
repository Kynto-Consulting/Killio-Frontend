/**
 * Interface mode of Killio: "reduced" (boards, cards, documents and the team) or "full" (everything).
 * The mode only decides what is SHOWN: routes, sidebar entries, board view tabs and palette commands. It never deletes
 * or moves data, so switching back and forth is free. Pure (no React, no path aliases) so it runs under `node --test`.
 */
export type UiMode = "reduced" | "full";
export type UiModeSource = "user" | "team" | "default";

export const UI_MODES: readonly UiMode[] = ["reduced", "full"];

export function isUiMode(v: unknown): v is UiMode {
  return v === "reduced" || v === "full";
}

/** User choice > team default > full. Same rule as the server. */
export function resolveUiMode(userMode: UiMode | null | undefined, teamDefault: UiMode | null | undefined): { mode: UiMode; source: UiModeSource } {
  if (userMode) return { mode: userMode, source: "user" };
  if (teamDefault) return { mode: teamDefault, source: "team" };
  return { mode: "full", source: "default" };
}

/**
 * Dashboard areas the reduced mode hides. Decided from the real sidebar (layout.web.tsx `navigation`):
 * kept = home, teams, boards, documents; hidden = statistics, marketplace, scripts/integrations group, meshes, graph,
 * rooms, activity history. Each entry is a path prefix.
 */
export const REDUCED_HIDDEN_PREFIXES: readonly string[] = [
  "/vault",
  "/metrics",
  "/estadisticas",
  "/marketplace",
  "/integrations",
  "/scripts",
  "/m",
  "/graph",
  "/rooms",
  "/history",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPathVisibleInMode(pathname: string, mode: UiMode): boolean {
  if (mode === "full") return true;
  return !REDUCED_HIDDEN_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** Board view tab types the reduced mode offers. Gantt, Summary and Projects are hidden (the data stays). */
export const REDUCED_TAB_TYPES: readonly string[] = ["kanban", "list", "calendar"];

export function isTabTypeVisible(type: string, mode: UiMode): boolean {
  return mode === "full" || REDUCED_TAB_TYPES.includes(type);
}

/** Tabs to show; the stored list is never modified. */
export function visibleTabs<T extends { type: string }>(tabs: readonly T[], mode: UiMode): T[] {
  return tabs.filter((t) => isTabTypeVisible(t.type, mode));
}

/** The active tab if it is visible, else the first visible one (kanban is always there), else the first tab. */
export function pickActiveTab<T extends { id: string; type: string }>(tabs: readonly T[], activeId: string, mode: UiMode): T {
  const shown = visibleTabs(tabs, mode);
  return shown.find((t) => t.id === activeId) ?? shown[0] ?? tabs[0];
}

/** Types the "+" menu may offer. */
export function visibleAddableTypes<T extends string>(types: readonly T[], mode: UiMode): T[] {
  return types.filter((t) => isTabTypeVisible(t, mode));
}

/** Command-palette command ids hidden in reduced mode: activity history and the transaction commands. */
const REDUCED_HIDDEN_COMMANDS: readonly string[] = ["global.history", "tx.begin", "tx.commit", "tx.rollback", "tx.status"];

export function isPaletteCommandVisible(commandId: string, mode: UiMode): boolean {
  return mode === "full" || !REDUCED_HIDDEN_COMMANDS.includes(commandId);
}

/** Free-text palette entries (value strings of the static items) hidden in reduced mode. */
export function isPaletteItemVisible(value: string, mode: UiMode): boolean {
  return mode === "full" || value !== "history";
}

const REDUCED_HIDDEN_SUGGESTIONS: readonly string[] = ["history", "transaction", "begin", "commit", "rollback", "status"];

/** Autocomplete suggestions (literal keywords of the command grammar) hidden in reduced mode. */
export function isPaletteSuggestionVisible(value: string, mode: UiMode): boolean {
  return mode === "full" || !REDUCED_HIDDEN_SUGGESTIONS.includes(value.trim().toLowerCase());
}
