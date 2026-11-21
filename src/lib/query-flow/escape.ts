/**
 * When may Escape close the editor? Only when nothing inside it used the key: a completion list, a menu, a dialog, a native
 * select, a text box. A counter of open popups backs this up for the ones that live in a portal.
 */

let openPopups = 0;
/** Call from a popup (menu, dialog, dropdown) while it is open; returns the cleanup. */
export function registerPopup(): () => void {
  openPopups += 1;
  let done = false;
  return () => { if (!done) { done = true; openPopups = Math.max(0, openPopups - 1); } };
}
export const popupCount = (): number => openPopups;
export function resetPopups(): void { openPopups = 0; }

export interface EscapeContext {
  defaultPrevented: boolean;
  /** tagName of the event target, upper case. */
  targetTag: string;
  isContentEditable: boolean;
  /** The target is inside (or is) an element with one of these roles: menu, listbox, dialog, combobox, option. */
  insideFloating: boolean;
  /** aria-expanded="true" on the target. */
  expanded: boolean;
  popups: number;
  dirty: boolean;
}
export type EscapeDecision = 'ignore' | 'confirm' | 'close';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function escapeDecision(ctx: EscapeContext): EscapeDecision {
  if (ctx.defaultPrevented) return 'ignore';
  if (TYPING_TAGS.has(ctx.targetTag.toUpperCase()) || ctx.isContentEditable) return 'ignore';
  if (ctx.insideFloating || ctx.expanded || ctx.popups > 0) return 'ignore';
  return ctx.dirty ? 'confirm' : 'close';
}

/** Reads the context out of a keyboard event (DOM only; the decision itself is pure). */
export function escapeContext(e: { defaultPrevented: boolean; target: EventTarget | null }, dirty: boolean): EscapeContext {
  const el = e.target as HTMLElement | null;
  return {
    defaultPrevented: e.defaultPrevented,
    targetTag: el?.tagName ?? '',
    isContentEditable: !!el?.isContentEditable,
    insideFloating: !!el?.closest?.('[role=menu],[role=listbox],[role=dialog],[role=combobox],[role=option]'),
    expanded: el?.getAttribute?.('aria-expanded') === 'true',
    popups: openPopups,
    dirty,
  };
}
