"use client";

import { usePlatform } from "@/components/providers/platform-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { IntegrationsMobilePage } from "./page.mobile";
import { IntegrationsPageView } from "./page.web";

export default function IntegrationsPage() {
  const platform = usePlatform();
  return (
    <OfflineRouteFallback view="integrations">
      {platform === "mobile" ? <IntegrationsMobilePage /> : <IntegrationsPageView />}
    </OfflineRouteFallback>
  );
}
