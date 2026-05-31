"use client";

import { usePlatform } from "@/components/providers/platform-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { MetricsMobilePage } from "./page.mobile";
import { MetricsWebPage } from "./page.web";

export default function MetricsPage() {
  const platform = usePlatform();
  return (
    <OfflineRouteFallback view="metrics">
      {platform === "mobile" ? <MetricsMobilePage /> : <MetricsWebPage />}
    </OfflineRouteFallback>
  );
}