"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  IntegrationScopeKind,
  IntegrationUI,
  integrationsForScope,
} from "@/lib/integrations/integration-catalog";
import { getConfiguredIntegrations } from "@/lib/api/integrations";
import { resolveLucide } from "@/lib/lucide-icon-registry";
import { Clock3, Loader2, Puzzle } from "lucide-react";
import { GithubIntegrationPanel } from "@/components/scripts/GithubIntegrationPanel";
import { WhatsappIntegrationPanel } from "@/components/scripts/WhatsappIntegrationPanel";
import { SlackWebhookIntegrationPanel } from "@/components/scripts/SlackWebhookIntegrationPanel";
import { NotionIntegrationPanel } from "@/components/scripts/NotionIntegrationPanel";
import { TrelloIntegrationPanel } from "@/components/scripts/TrelloIntegrationPanel";
import { GoogleDriveIntegrationPanel } from "@/components/scripts/GoogleDriveIntegrationPanel";
import { OneDriveIntegrationPanel } from "@/components/scripts/OneDriveIntegrationPanel";
import { StripeIntegrationPanel } from "@/components/scripts/StripeIntegrationPanel";
import { PaypalIntegrationPanel } from "@/components/scripts/PaypalIntegrationPanel";
import { MercadopagoIntegrationPanel } from "@/components/scripts/MercadopagoIntegrationPanel";

/**
 * Connect-panel registry: maps a catalog entry's `panel` id → its component.
 * Every panel takes the same { teamId, accessToken } contract, so a personal
 * scope simply passes the user's PERSONAL team id. Adding a connectable app =
 * one catalog entry + one line here.
 */
type PanelProps = { teamId: string; accessToken: string };
const PANEL_REGISTRY: Record<string, React.ComponentType<PanelProps>> = {
  github: GithubIntegrationPanel,
  google_drive: GoogleDriveIntegrationPanel,
  onedrive: OneDriveIntegrationPanel,
  notion: NotionIntegrationPanel,
  trello: TrelloIntegrationPanel,
  slack: SlackWebhookIntegrationPanel,
  whatsapp: WhatsappIntegrationPanel,
  stripe: StripeIntegrationPanel,
  paypal: PaypalIntegrationPanel,
  mercadopago: MercadopagoIntegrationPanel,
};

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.22)",
        marginBottom: 12,
      }}
    >
      {label}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
      {children}
    </div>
  );
}

function ComingSoonCard({
  integ,
  name,
  description,
  badge,
}: {
  integ: IntegrationUI;
  name: string;
  description: string;
  badge: string;
}) {
  const Icon = resolveLucide(integ.icon) || Puzzle;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 20,
        opacity: 0.65,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              flexShrink: 0,
              color: integ.color,
            }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{name}</span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 999,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {badge}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.55, marginBottom: 14, flex: 1 }}>
        {description}
      </p>
      <button
        type="button"
        disabled
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 30,
          padding: "0 12px",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          cursor: "not-allowed",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.035)",
          color: "rgba(255,255,255,0.4)",
          alignSelf: "flex-start",
        }}
      >
        <Clock3 className="h-3.5 w-3.5" />
        {badge}
      </button>
    </div>
  );
}

/**
 * Renders the integrations catalog for a scope (team or personal). The SAME
 * grid serves both surfaces — the team page passes the active team, the user's
 * personal integrations modal passes the personal team id. Modular + i18n:
 * which apps appear, their grouping and copy all come from the catalog.
 */
export function IntegrationCatalogGrid({
  scope,
  teamId,
  accessToken,
  extraComingSoon,
}: {
  scope: IntegrationScopeKind;
  teamId: string;
  accessToken: string;
  /** Optional extra card(s) appended to the "coming soon" grid (e.g. a card with a custom action). */
  extraComingSoon?: React.ReactNode;
}) {
  const t = useTranslations("integrations");

  // Backend tells us which providers have working credentials/config. We render
  // connect cards ONLY for those — never advertise an integration the backend
  // can't complete. `null` = still loading; on error we fall back to showing all.
  const [configured, setConfigured] = useState<Set<string> | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getConfiguredIntegrations(accessToken)
      .then((r) => { if (alive) { setConfigured(new Set(r.providers)); setLoaded(true); } })
      .catch(() => { if (alive) { setConfigured(null); setLoaded(true); } });
    return () => { alive = false; };
  }, [accessToken]);

  const isConfigured = (p: string) => (configured ? configured.has(p) : true);

  const all = integrationsForScope(scope);
  const connectable = all.filter(
    (i) => !i.comingSoon && i.panel && PANEL_REGISTRY[i.panel] && isConfigured(i.provider),
  );
  const coming = all.filter((i) => i.comingSoon || !i.panel || !PANEL_REGISTRY[i.panel!]);
  const hasComing = coming.length > 0 || !!extraComingSoon;

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "rgba(255,255,255,0.4)" }} />
      </div>
    );
  }

  const appName = (i: IntegrationUI) =>
    t(`integrations.catalog.apps.${i.i18nKey ?? i.id}.name`, { fallback: i.name });
  const appDesc = (i: IntegrationUI) =>
    t(`integrations.catalog.apps.${i.i18nKey ?? i.id}.description`, { fallback: "" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {connectable.length > 0 && (
        <div>
          <SectionHeader label={t("stats.available")} />
          <Grid>
            {connectable.map((i) => {
              const Panel = PANEL_REGISTRY[i.panel!];
              return <Panel key={i.id} teamId={teamId} accessToken={accessToken} />;
            })}
          </Grid>
        </div>
      )}

      {hasComing && (
        <div>
          <SectionHeader label={t("stats.comingSoon")} />
          <Grid>
            {coming.map((i) => (
              <ComingSoonCard
                key={i.id}
                integ={i}
                name={appName(i)}
                description={appDesc(i)}
                badge={t("integrations.catalog.comingSoon")}
              />
            ))}
            {extraComingSoon}
          </Grid>
        </div>
      )}
    </div>
  );
}
