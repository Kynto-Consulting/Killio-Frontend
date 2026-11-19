/**
 * Which ribbon groups collapse into a single dropdown when the window is narrow, and the small scroll maths of the ribbon
 * (chevron buttons, fade edges, wheel to sideways). Pure, so it can be tested without a browser.
 */

export const ITEM_WIDTH = 68;
export const GROUP_PADDING = 18;
export const COLLAPSED_WIDTH = 86;

export interface FitGroup {
  id: string;
  /** Number of buttons in the group. */
  items: number;
  /** The group with the highest number collapses first. */
  collapse: number;
}

export const groupFullWidth = (items: number): number => items * ITEM_WIDTH + GROUP_PADDING;

export interface Fit { collapsed: string[]; /** Still too wide after collapsing everything that can collapse: the ribbon scrolls. */ overflow: boolean; total: number }

/**
 * Collapses groups (highest `collapse` first, ties by position from the right) until the groups fit `available` pixels.
 * A group with a single button gains nothing from collapsing and is left alone. `measured` can override the estimated widths.
 */
export function fitGroups(groups: FitGroup[], available: number, measured: Record<string, number> = {}): Fit {
  const full = (g: FitGroup) => measured[g.id] ?? groupFullWidth(g.items);
  const collapsed = new Set<string>();
  const widthOf = (g: FitGroup) => (collapsed.has(g.id) ? COLLAPSED_WIDTH : full(g));
  let total = groups.reduce((sum, g) => sum + widthOf(g), 0);
  while (total > available) {
    const candidates = groups
      .map((g, index) => ({ g, index }))
      .filter(({ g }) => !collapsed.has(g.id) && g.items > 1 && full(g) > COLLAPSED_WIDTH);
    if (candidates.length === 0) return { collapsed: [...collapsed], overflow: true, total };
    candidates.sort((a, b) => b.g.collapse - a.g.collapse || b.index - a.index);
    const pick = candidates[0].g;
    total -= full(pick) - COLLAPSED_WIDTH;
    collapsed.add(pick.id);
  }
  return { collapsed: [...collapsed], overflow: false, total };
}

/** Which chevrons / fades are shown for a scroll container. */
export function scrollState(scrollLeft: number, clientWidth: number, scrollWidth: number): { canLeft: boolean; canRight: boolean } {
  return { canLeft: scrollLeft > 2, canRight: scrollLeft + clientWidth < scrollWidth - 2 };
}

/** Sideways distance for a wheel / trackpad event: a vertical wheel scrolls the ribbon sideways, a horizontal gesture is kept. */
export const wheelToSideways = (deltaX: number, deltaY: number): number => (Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY);

/** New scrollLeft after a chevron click (a bit less than a page, clamped). */
export function pageScroll(scrollLeft: number, clientWidth: number, scrollWidth: number, direction: -1 | 1): number {
  const next = scrollLeft + direction * Math.max(80, Math.round(clientWidth * 0.7));
  return Math.max(0, Math.min(Math.max(0, scrollWidth - clientWidth), next));
}
