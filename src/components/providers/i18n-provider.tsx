"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { DEFAULT_LOCALE, getLocaleMessages, Locale, LocaleMessages, Namespace, NamespaceDictionary, normalizeLocale } from "@/i18n";

const LOCALE_STORAGE_KEY = "killio_locale";
const LOCALE_BY_USER_STORAGE_KEY = "killio_locale_by_user";

type LocaleByUser = Record<string, Locale>;

type TranslateParams = Record<string, string | number>;

type I18nContextType = {
  locale: Locale;
  setLocale: (value: Locale) => void;
  messages: LocaleMessages;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function readLocaleByUser(): LocaleByUser {
  try {
    const raw = localStorage.getItem(LOCALE_BY_USER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const map = parsed as Record<string, string>;
    return Object.entries(map).reduce<LocaleByUser>((acc, [userId, locale]) => {
      acc[userId] = normalizeLocale(locale);
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeLocaleByUser(value: LocaleByUser) {
  localStorage.setItem(LOCALE_BY_USER_STORAGE_KEY, JSON.stringify(value));
}

function getValueByPath(dictionary: NamespaceDictionary, key: string): string | undefined {
  const parts = key.split(".");
  let current: string | NamespaceDictionary | string[] | undefined = dictionary;
  for (const part of parts) {
    if (!current) return undefined;
    if (typeof current === "string") return undefined;

    if (Array.isArray(current)) {
      const idx = Number.parseInt(part, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= current.length) return undefined;
      current = current[idx];
      continue;
    }

    if (!(part in current)) return undefined;
    current = current[part] as string | NamespaceDictionary | string[];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(input: string, params?: TranslateParams): string {
  if (!params) return input;
  return input.replace(/{{\s*(\w+)\s*}}/g, (_match, token: string) => {
    const value = params[token];
    return value === undefined ? "" : String(value);
  });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const globalLocale = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    const byUser = readLocaleByUser();
    const userLocale = user?.id ? byUser[user.id] : undefined;
    setLocaleState(userLocale ?? globalLocale);
  }, [user?.id]);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);

    if (user?.id) {
      const byUser = readLocaleByUser();
      byUser[user.id] = locale;
      writeLocaleByUser(byUser);
    }
  }, [locale, user?.id]);

  const setLocale = useCallback((value: Locale) => {
    setLocaleState(normalizeLocale(value));
  }, []);

  const messages = useMemo(() => getLocaleMessages(locale), [locale]);

  const contextValue = useMemo<I18nContextType>(() => ({
    locale,
    setLocale,
    messages,
  }), [locale, setLocale, messages]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslations(namespace: Namespace) {
  const { messages } = useI18n();

  return useCallback((key: string, params?: TranslateParams) => {
    const fromNamespace = getValueByPath(messages[namespace], key);
    if (fromNamespace) return interpolate(fromNamespace, params);

    const fromCommon = getValueByPath(messages.common, key);
    if (fromCommon) return interpolate(fromCommon, params);

    return key;
  }, [messages, namespace]);
}
