/**
 * Integration library (frontend / UI side). Mirrors the backend catalog but
 * carries the presentation bits: icon, colour, the reference kinds an app
 * contributes to the @-picker and how its pill renders, PLUS the metadata the
 * integrations UI renders from (category, scope, connect panel, i18n keys).
 *
 * This file is the SINGLE SOURCE the integrations grid renders from — adding an
 * app = adding one entry here (+ a connect panel component if it's connectable).
 *
 * Keep `id`/`provider`/`scopes`/`refKinds.kind` in sync with the backend
 * Killio-Backend/src/modules/integrations/library/integration-catalog.ts.
 */

export type IntegrationScopeKind = "team" | "personal";

export type IntegrationCategory =
  | "dev"
  | "storage"
  | "productivity"
  | "communication"
  | "automation"
  | "payments"
  | "calendar";

export interface IntegrationRefKind {
  kind: string; // e.g. "file", "event", "page"
  label: string;
}

export interface IntegrationUI {
  id: string;
  name: string; // fallback display name (i18n key takes precedence in the UI)
  provider: string; // credential provider_type
  scopes: IntegrationScopeKind[];
  /** lucide icon name (resolved via the lucide registry) or an emoji fallback. */
  icon: string;
  /** tailwind-ish accent colour for the pill / chip. */
  color: string;
  refKinds: IntegrationRefKind[];
  // ── UI metadata (optional → older callers keep working) ───────────────────
  /** Grouping in the integrations grid. */
  category?: IntegrationCategory;
  /** i18n key suffix → `integrations.catalog.apps.<i18nKey>.{name,description}`. */
  i18nKey?: string;
  /** Connect-panel registry id (see integration-catalog-grid). Absent → coming soon. */
  panel?: string;
  /** Render as a non-connectable "coming soon" card. */
  comingSoon?: boolean;
}

export const INTEGRATION_CATALOG: IntegrationUI[] = [
  {
    id: "github",
    name: "GitHub",
    provider: "github",
    scopes: ["team", "personal"],
    icon: "github",
    color: "#8b949e",
    category: "dev",
    i18nKey: "github",
    panel: "github",
    refKinds: [
      { kind: "repo", label: "Repository" },
      { kind: "issue", label: "Issue" },
    ],
  },
  {
    id: "google_drive",
    name: "Google Drive",
    provider: "google_drive",
    scopes: ["team", "personal"],
    icon: "hard-drive",
    color: "#1a73e8",
    category: "storage",
    i18nKey: "googleDrive",
    panel: "google_drive",
    refKinds: [{ kind: "file", label: "File" }],
  },
  {
    id: "onedrive",
    name: "OneDrive",
    provider: "onedrive",
    scopes: ["team", "personal"],
    icon: "cloud",
    color: "#0364b8",
    category: "storage",
    i18nKey: "onedrive",
    panel: "onedrive",
    refKinds: [{ kind: "file", label: "File" }],
  },
  {
    id: "notion",
    name: "Notion",
    provider: "notion",
    scopes: ["team", "personal"],
    icon: "file-text",
    color: "#cfcfcf",
    category: "productivity",
    i18nKey: "notion",
    panel: "notion",
    refKinds: [{ kind: "page", label: "Page" }],
  },
  {
    id: "trello",
    name: "Trello",
    provider: "trello",
    scopes: ["team", "personal"],
    icon: "trello",
    color: "#0079bf",
    category: "productivity",
    i18nKey: "trello",
    panel: "trello",
    refKinds: [{ kind: "card", label: "Card" }],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    provider: "google_calendar",
    scopes: ["team", "personal"],
    icon: "calendar",
    color: "#4285f4",
    category: "calendar",
    i18nKey: "googleCalendar",
    comingSoon: true,
    refKinds: [{ kind: "event", label: "Event" }],
  },
  {
    id: "slack",
    name: "Slack",
    provider: "slack_webhook",
    scopes: ["team"],
    icon: "slack",
    color: "#4a154b",
    category: "communication",
    i18nKey: "slack",
    panel: "slack",
    refKinds: [],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    provider: "whatsapp",
    scopes: ["team"],
    icon: "message-circle",
    color: "#25d366",
    category: "communication",
    i18nKey: "whatsapp",
    panel: "whatsapp",
    refKinds: [],
  },
  {
    id: "n8n",
    name: "n8n",
    provider: "n8n",
    scopes: ["team", "personal"],
    icon: "workflow",
    color: "#ea4b71",
    category: "automation",
    i18nKey: "n8n",
    comingSoon: true,
    refKinds: [],
  },
  {
    id: "stripe",
    name: "Stripe",
    provider: "stripe",
    scopes: ["team"],
    icon: "credit-card",
    color: "#635bff",
    category: "payments",
    i18nKey: "stripe",
    panel: "stripe",
    refKinds: [],
  },
  {
    id: "paypal",
    name: "PayPal",
    provider: "paypal",
    scopes: ["team"],
    icon: "wallet",
    color: "#003087",
    category: "payments",
    i18nKey: "paypal",
    panel: "paypal",
    refKinds: [],
  },
  {
    id: "mercadopago",
    name: "Mercado Pago",
    provider: "mercadopago",
    scopes: ["team"],
    icon: "circle-dollar-sign",
    color: "#00b1ea",
    category: "payments",
    i18nKey: "mercadopago",
    panel: "mercadopago",
    refKinds: [],
  },
  {
    id: "jira",
    name: "Jira",
    provider: "jira",
    scopes: ["team"],
    icon: "square-kanban",
    color: "#0052cc",
    category: "productivity",
    i18nKey: "jira",
    comingSoon: true,
    refKinds: [],
  },
];

const BY_PROVIDER = new Map(INTEGRATION_CATALOG.map((i) => [i.provider, i]));
const BY_ID = new Map(INTEGRATION_CATALOG.map((i) => [i.id, i]));

export function getIntegration(idOrProvider: string): IntegrationUI | undefined {
  return BY_ID.get(idOrProvider) ?? BY_PROVIDER.get(idOrProvider);
}

/** UI entries for the providers the agent reported as connected in this context. */
export function integrationsForProviders(providers: string[]): IntegrationUI[] {
  const seen = new Set<string>();
  const out: IntegrationUI[] = [];
  for (const p of providers) {
    const ui = BY_PROVIDER.get(p);
    if (ui && !seen.has(ui.id)) {
      seen.add(ui.id);
      out.push(ui);
    }
  }
  return out;
}

/** Catalog entries available in a given scope (for the team / personal grids). */
export function integrationsForScope(scope: IntegrationScopeKind): IntegrationUI[] {
  return INTEGRATION_CATALOG.filter((i) => i.scopes.includes(scope));
}

/**
 * Extension reference token format used in markdown / brick content:
 *   @[ext:<provider>:<kind>:<externalId>:<label>]
 * Parsed by the ref-pill renderer + serialized by the picker.
 */
export interface ExtensionRef {
  provider: string;
  kind: string;
  externalId: string;
  label: string;
}

export function buildExtensionToken(ref: ExtensionRef): string {
  const safe = (s: string) => String(s).replace(/[:\]]/g, " ").trim();
  return `@[ext:${safe(ref.provider)}:${safe(ref.kind)}:${safe(ref.externalId)}:${safe(ref.label)}]`;
}

const EXT_RE = /@\[ext:([^:\]]+):([^:\]]+):([^:\]]+):([^\]]*)\]/;
export function parseExtensionToken(token: string): ExtensionRef | null {
  const m = token.match(EXT_RE);
  if (!m) return null;
  return { provider: m[1], kind: m[2], externalId: m[3], label: m[4] };
}
export const EXTENSION_TOKEN_RE = /@\[ext:[^:\]]+:[^:\]]+:[^:\]]+:[^\]]*\]/g;
