/** Pure helpers for the compact AI composer (AgentChatPanel). */

export const COMPOSER_LINE_HEIGHT_PX = 20;
export const COMPOSER_PAD_Y_PX = 16;
export const COMPOSER_MAX_LINES = 6;

/** Max editor height: `lines` text lines plus vertical padding. Past it the editor scrolls. */
export function composerMaxHeightPx(
  lines: number = COMPOSER_MAX_LINES,
  lineHeight: number = COMPOSER_LINE_HEIGHT_PX,
  padY: number = COMPOSER_PAD_Y_PX,
): number {
  const n = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : COMPOSER_MAX_LINES;
  return n * lineHeight + padY;
}

/** Height the editor should take for its content: grows from one line, capped at the max. */
export function composerHeightPx(
  contentHeight: number,
  lines: number = COMPOSER_MAX_LINES,
  lineHeight: number = COMPOSER_LINE_HEIGHT_PX,
  padY: number = COMPOSER_PAD_Y_PX,
): number {
  const min = lineHeight + padY;
  const max = composerMaxHeightPx(lines, lineHeight, padY);
  if (!Number.isFinite(contentHeight)) return min;
  return Math.min(max, Math.max(min, Math.round(contentHeight)));
}

/** The keyboard help line shows only while the editor has focus and there is text to send. */
export function shouldShowComposerHint(opts: { focused: boolean; text: string; busy?: boolean }): boolean {
  return opts.focused && !opts.busy && opts.text.trim().length > 0;
}
