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

const NATIVE_TAG_TRANSLATIONS: Record<string, Record<string, string>> = {
  'tag.native.priority': {
    es: 'Prioridad',
    en: 'Priority',
    pt: 'Prioridade',
    fr: 'Priorite',
    de: 'Prioritat',
    it: 'Priorita',
  },
  'tag.native.bug': {
    es: 'Bug',
    en: 'Bug',
    pt: 'Bug',
    fr: 'Bug',
    de: 'Bug',
    it: 'Bug',
  },
  'tag.native.feature': {
    es: 'Feature',
    en: 'Feature',
    pt: 'Feature',
    fr: 'Feature',
    de: 'Feature',
    it: 'Feature',
  },
  'tag.native.ux': {
    es: 'UX',
    en: 'UX',
    pt: 'UX',
    fr: 'UX',
    de: 'UX',
    it: 'UX',
  },
  'tag.native.blocked': {
    es: 'Bloqueado',
    en: 'Blocked',
    pt: 'Bloqueado',
    fr: 'Bloque',
    de: 'Blockiert',
    it: 'Bloccato',
  },
};

export function isNativeTagKey(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith('tag.native.');
}

export function translateNativeTagName(tagName: string, locale?: string): string {
  if (!isNativeTagKey(tagName)) return tagName;

  const translations = NATIVE_TAG_TRANSLATIONS[tagName];
  if (!translations) return tagName;

  const normalizedLocale = (locale || '').toLowerCase();
  const languageCode = normalizedLocale.split('-')[0];

  return translations[normalizedLocale] || translations[languageCode] || translations.en || tagName;
}

export function getClientLocale(): string {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language || 'en';
}
