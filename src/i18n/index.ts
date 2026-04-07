import enCommon from "@/i18n/locales/en/common.json";
import esCommon from "@/i18n/locales/es/common.json";
import enAuth from "@/i18n/locales/en/auth.json";
import esAuth from "@/i18n/locales/es/auth.json";
import enDashboard from "@/i18n/locales/en/dashboard.json";
import esDashboard from "@/i18n/locales/es/dashboard.json";
import enPreferences from "@/i18n/locales/en/preferences.json";
import esPreferences from "@/i18n/locales/es/preferences.json";
import enProfile from "@/i18n/locales/en/profile.json";
import esProfile from "@/i18n/locales/es/profile.json";
import enWorkspace from "@/i18n/locales/en/workspace.json";
import esWorkspace from "@/i18n/locales/es/workspace.json";
import enTags from "@/i18n/locales/en/tags.json";
import esTags from "@/i18n/locales/es/tags.json";
import enBoards from "@/i18n/locales/en/boards.json";
import esBoards from "@/i18n/locales/es/boards.json";
import enDocuments from "@/i18n/locales/en/documents.json";
import esDocuments from "@/i18n/locales/es/documents.json";
import enTeams from "@/i18n/locales/en/teams.json";
import esTeams from "@/i18n/locales/es/teams.json";
import enAcceptInvite from "@/i18n/locales/en/accept-invite.json";
import esAcceptInvite from "@/i18n/locales/es/accept-invite.json";
import enModals from "@/i18n/locales/en/modals.json";
import esModals from "@/i18n/locales/es/modals.json";
import enHistory from "@/i18n/locales/en/history.json";
import esHistory from "@/i18n/locales/es/history.json";
import enBoardDetail from "@/i18n/locales/en/board-detail.json";
import esBoardDetail from "@/i18n/locales/es/board-detail.json";
import enDocumentDetail from "@/i18n/locales/en/document-detail.json";
import esDocumentDetail from "@/i18n/locales/es/document-detail.json";
import enNotifications from "@/i18n/locales/en/notifications.json";
import esNotifications from "@/i18n/locales/es/notifications.json";
import enLanding from "@/i18n/locales/en/landing.json";
import esLanding from "@/i18n/locales/es/landing.json";
import enLegal from "@/i18n/locales/en/legal.json";
import esLegal from "@/i18n/locales/es/legal.json";
import enIntegrations from "@/i18n/locales/en/integrations.json";
import esIntegrations from "@/i18n/locales/es/integrations.json";

export const SUPPORTED_LOCALES = ["en", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const NAMESPACES = [
  "common", "auth", "dashboard", "preferences", "profile", "workspace",
  "tags", "boards", "documents", "teams", "accept-invite", "modals",
  "history", "board-detail", "document-detail", "notifications",
  "landing", "legal", "integrations",
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export interface NamespaceDictionary {
  [key: string]: string | NamespaceDictionary | string[];
}

export type LocaleMessages = Record<Namespace, NamespaceDictionary>;

const dictionaries: Record<Locale, LocaleMessages> = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    preferences: enPreferences,
    profile: enProfile,
    workspace: enWorkspace,
    tags: enTags,
    boards: enBoards,
    documents: enDocuments,
    teams: enTeams,
    "accept-invite": enAcceptInvite,
    modals: enModals,
    history: enHistory,
    "board-detail": enBoardDetail,
    "document-detail": enDocumentDetail,
    notifications: enNotifications,
    landing: enLanding,
    legal: enLegal,
    integrations: enIntegrations,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    dashboard: esDashboard,
    preferences: esPreferences,
    profile: esProfile,
    workspace: esWorkspace,
    tags: esTags,
    boards: esBoards,
    documents: esDocuments,
    teams: esTeams,
    "accept-invite": esAcceptInvite,
    modals: esModals,
    history: esHistory,
    "board-detail": esBoardDetail,
    "document-detail": esDocumentDetail,
    notifications: esNotifications,
    landing: esLanding,
    legal: esLegal,
    integrations: esIntegrations,
  },
};

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

export function normalizeLocale(value?: string | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  const lowered = value.toLowerCase();
  const base = lowered.split("-")[0];
  if (SUPPORTED_LOCALES.includes(base as Locale)) {
    return base as Locale;
  }
  return DEFAULT_LOCALE;
}

export function getLocaleMessages(locale: Locale): LocaleMessages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export function getI18nText(locale: Locale, namespace: Namespace, key: string): string | undefined {
  const messages = getLocaleMessages(locale);
  return getValueByPath(messages[namespace], key);
}