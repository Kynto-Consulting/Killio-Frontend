/**
 * The public part of the white-label configuration served by the backend at
 * GET /tenant/config. Keep in sync with Killio-Backend/src/modules/tenant/tenant-config.ts.
 */
export type TenantMode = "public" | "tenant";

export type FeatureKey = "marketplace" | "vault" | "rooms" | "scripts" | "integrations" | "ai" | "publicSharing";

export type PublicTenantConfig = {
  mode: TenantMode;
  defaultLocale: "es" | "en" | null;
  features: Record<FeatureKey, boolean>;
  permissions: { membersCanInvite: boolean; allowedInviteRoles: Array<"admin" | "member" | "viewer" | "guest">; allowTeamCreation: boolean };
  poweredBy: { show: boolean; position: "bottom-right" | "bottom-left" };
  brand: {
    name: string;
    shortName: string;
    tagline: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    websiteUrl: string | null;
    supportEmail: string | null;
    replaceNameInText: boolean;
  };
  theme: {
    defaultMode: "light" | "dark" | "system";
    radius: string | null;
    fontFamily: string | null;
    fonts: Array<{ weight: number; url: string }>;
    /** CSS variable name (without "--") -> "H S% L%". */
    light: Record<string, string>;
    dark: Record<string, string>;
    /** Any other CSS variable, per colour mode. */
    vars: { light: Record<string, string>; dark: Record<string, string> };
    /** Extra stylesheet written by the tenant (validated by the backend and again here). */
    customCss: string;
  };
  /** UI text overrides: locale -> "namespace.key" -> text. */
  texts: Record<string, Record<string, string>>;
  landing: {
    mode: "killio" | "tenant" | "login";
    headline: string;
    subheadline: string;
    primaryCtaLabel: string;
    heroImageUrl: string | null;
    secondaryCta: { label: string; url: string } | null;
    navLinks: Array<{ label: string; url: string }>;
    features: Array<{ title: string; description: string }>;
    footerText: string;
    legalLinks: Array<{ label: string; url: string }>;
  };
  auth: { loginMode: "password" | "otp" | "password_or_otp"; signupEnabled: boolean; restricted: boolean };
  billing: { enabled: boolean; plan: "free" | "pro" | "max" | "enterprise" | null };
};

/** What the app looks like with no tenant config: exactly killio.dev. */
export const DEFAULT_TENANT_CONFIG: PublicTenantConfig = {
  mode: "public",
  defaultLocale: null,
  features: { marketplace: true, vault: true, rooms: true, scripts: true, integrations: true, ai: true, publicSharing: true },
  permissions: { membersCanInvite: true, allowedInviteRoles: ["admin", "member", "viewer", "guest"], allowTeamCreation: true },
  poweredBy: { show: false, position: "bottom-right" },
  brand: {
    name: "Killio",
    shortName: "Killio",
    tagline: "",
    logoUrl: null,
    faviconUrl: null,
    websiteUrl: null,
    supportEmail: null,
    replaceNameInText: false,
  },
  theme: { defaultMode: "dark", radius: null, fontFamily: null, fonts: [], light: {}, dark: {}, vars: { light: {}, dark: {} }, customCss: "" },
  texts: {},
  landing: {
    mode: "killio",
    headline: "",
    subheadline: "",
    primaryCtaLabel: "",
    heroImageUrl: null,
    secondaryCta: null,
    navLinks: [],
    features: [],
    footerText: "",
    legalLinks: [],
  },
  auth: { loginMode: "password", signupEnabled: true, restricted: false },
  billing: { enabled: true, plan: null },
};
