/**
 * Layout state of the editor (pane sizes, collapsed panes, profiling toggles): defaults, clamping and the (de)serialisation
 * used with localStorage. Pure, so the splitter maths can be unit tested without a browser.
 */

export type PaneKey = 'leftWidth' | 'rightWidth' | 'diagramHeight' | 'profileHeight';

export const PANE_LIMITS: Record<PaneKey, { min: number; max: number; def: number }> = {
  leftWidth: { min: 140, max: 360, def: 200 },
  rightWidth: { min: 240, max: 520, def: 300 },
  diagramHeight: { min: 120, max: 560, def: 260 },
  profileHeight: { min: 90, max: 360, def: 170 },
};

export interface UiState {
  sizes: Record<PaneKey, number>;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  diagramOpen: boolean;
  formulaBar: boolean;
  showQuality: boolean;
  showDistribution: boolean;
  showProfile: boolean;
  wholeProfile: boolean;
  monospaced: boolean;
  showWhitespace: boolean;
  /** Compact ribbon: only the tab names; a click on a tab opens its groups as a flyout. */
  ribbonCompact: boolean;
}

export const UI_STORAGE_KEY = 'killio.queryFlow.ui.v1';

export const DEFAULT_UI_STATE: UiState = {
  sizes: { leftWidth: PANE_LIMITS.leftWidth.def, rightWidth: PANE_LIMITS.rightWidth.def, diagramHeight: PANE_LIMITS.diagramHeight.def, profileHeight: PANE_LIMITS.profileHeight.def },
  leftCollapsed: false,
  rightCollapsed: false,
  diagramOpen: false,
  formulaBar: true,
  showQuality: true,
  showDistribution: true,
  showProfile: true,
  wholeProfile: false,
  monospaced: false,
  showWhitespace: false,
  ribbonCompact: false,
};

/** Keeps a size inside its limits (and inside the room that is really available, when known). */
export function clampSize(key: PaneKey, value: number, available?: number): number {
  const { min, max } = PANE_LIMITS[key];
  const cap = available !== undefined && Number.isFinite(available) ? Math.max(min, Math.min(max, available)) : max;
  if (!Number.isFinite(value)) return PANE_LIMITS[key].def;
  return Math.round(Math.max(min, Math.min(cap, value)));
}

/**
 * New size while a splitter is dragged. `grow` is +1 when moving the pointer right / down makes the pane bigger (a pane on
 * the left or top of its handle) and -1 when it makes it smaller (a pane on the right or bottom).
 */
export function resizeFromDrag(key: PaneKey, startSize: number, pointerDelta: number, grow: 1 | -1, available?: number): number {
  return clampSize(key, startSize + pointerDelta * grow, available);
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Reads what `serializeUiState` wrote; anything missing or malformed falls back to the defaults. Never throws. */
export function parseUiState(raw: string | null | undefined): UiState {
  if (!raw) return DEFAULT_UI_STATE;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== 'object' || data === null) return DEFAULT_UI_STATE;
    const sizes = (typeof data.sizes === 'object' && data.sizes !== null ? data.sizes : {}) as Record<string, unknown>;
    const d = DEFAULT_UI_STATE;
    const size = (key: PaneKey) => (typeof sizes[key] === 'number' ? clampSize(key, sizes[key] as number) : d.sizes[key]);
    return {
      sizes: { leftWidth: size('leftWidth'), rightWidth: size('rightWidth'), diagramHeight: size('diagramHeight'), profileHeight: size('profileHeight') },
      leftCollapsed: bool(data.leftCollapsed, d.leftCollapsed),
      rightCollapsed: bool(data.rightCollapsed, d.rightCollapsed),
      diagramOpen: bool(data.diagramOpen, d.diagramOpen),
      formulaBar: bool(data.formulaBar, d.formulaBar),
      showQuality: bool(data.showQuality, d.showQuality),
      showDistribution: bool(data.showDistribution, d.showDistribution),
      showProfile: bool(data.showProfile, d.showProfile),
      wholeProfile: bool(data.wholeProfile, d.wholeProfile),
      monospaced: bool(data.monospaced, d.monospaced),
      showWhitespace: bool(data.showWhitespace, d.showWhitespace),
      ribbonCompact: bool(data.ribbonCompact, d.ribbonCompact),
    };
  } catch {
    return DEFAULT_UI_STATE;
  }
}

export const serializeUiState = (state: UiState): string => JSON.stringify(state);

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** localStorage access guarded with try / catch (private windows, blocked storage). */
export function loadUiState(storage: StorageLike | null | undefined): UiState {
  try {
    return parseUiState(storage ? storage.getItem(UI_STORAGE_KEY) : null);
  } catch {
    return DEFAULT_UI_STATE;
  }
}
export function saveUiState(storage: StorageLike | null | undefined, state: UiState): void {
  try {
    storage?.setItem(UI_STORAGE_KEY, serializeUiState(state));
  } catch {
    /* storage unavailable: the layout just is not remembered */
  }
}

/** Where the editor is drawn: inside the app's workspace slot when the page has one, full screen otherwise. */
export type MountMode = 'slot' | 'fixed';
export const pickMountMode = (slotAvailable: boolean): MountMode => (slotAvailable ? 'slot' : 'fixed');

/** "14:05" for the status bar ("PREVIEW DOWNLOADED AT"). */
export function clockText(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}
