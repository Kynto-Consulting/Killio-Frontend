import { getI18nText, normalizeLocale } from '@/i18n';

export const NATIVE_PRIORITY_TAG_KEY = 'tag.native.priority';
export const NATIVE_BUG_TAG_KEY = 'tag.native.bug';
export const NATIVE_FEATURE_TAG_KEY = 'tag.native.feature';
export const NATIVE_UX_TAG_KEY = 'tag.native.ux';
export const NATIVE_BLOCKED_TAG_KEY = 'tag.native.blocked';

export type NativeTagSuggestion = {
  key: string;
  color: string;
};

export const DEFAULT_NATIVE_TAG_SUGGESTIONS: NativeTagSuggestion[] = [
  { key: NATIVE_PRIORITY_TAG_KEY, color: '#e11d48' },
  { key: NATIVE_BUG_TAG_KEY, color: '#ef4444' },
  { key: NATIVE_FEATURE_TAG_KEY, color: '#22c55e' },
  { key: NATIVE_UX_TAG_KEY, color: '#3b82f6' },
  { key: NATIVE_BLOCKED_TAG_KEY, color: '#f59e0b' },
];

const NATIVE_TAG_I18N_KEY_BY_TAG: Record<string, string> = {
  [NATIVE_PRIORITY_TAG_KEY]: 'native.priority',
  [NATIVE_BUG_TAG_KEY]: 'native.bug',
  [NATIVE_FEATURE_TAG_KEY]: 'native.feature',
  [NATIVE_UX_TAG_KEY]: 'native.ux',
  [NATIVE_BLOCKED_TAG_KEY]: 'native.blocked',
};

export function isNativeTagKey(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith('tag.native.');
}

export function translateNativeTagName(tagName: string, locale?: string): string {
  if (!isNativeTagKey(tagName)) return tagName;

  const translationKey = NATIVE_TAG_I18N_KEY_BY_TAG[tagName];
  if (!translationKey) return tagName;

  const resolvedLocale = normalizeLocale(locale || getClientLocale());
  const translated = getI18nText(resolvedLocale, 'tags', translationKey);

  return translated || tagName;
}

export function getClientLocale(): string {
  if (typeof window === 'undefined') return 'en';

  const storedLocale = window.localStorage.getItem('killio_locale');
  if (storedLocale) return storedLocale;

  return navigator.language || 'en';
}
