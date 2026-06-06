"use client";

// Shared platform-aware wrapper for the 4 Scripts sub-routes
// (/integrations, /scripts, /integrations/table, /integrations/env).
// Each route renders this with a forced `activeTab`, which the shared
// IntegrationsPageView reads instead of internal tab state — making the
// sidebar sub-items real routes rather than portaled tabs.

import { usePlatform } from "@/components/providers/platform-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { IntegrationsMobilePage } from "./page.mobile";
import { IntegrationsPageView, type Tab } from "./page.web";

export function IntegrationsRouteView({ activeTab }: { activeTab: Tab }) {
  const platform = usePlatform();
  return (
    <OfflineRouteFallback view="integrations">
      {platform === "mobile" ? (
        <IntegrationsMobilePage />
      ) : (
        <IntegrationsPageView activeTab={activeTab} />
      )}
    </OfflineRouteFallback>
  );
}
