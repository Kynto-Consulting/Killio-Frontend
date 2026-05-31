"use client";

import { usePlatform } from "@/components/providers/platform-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { MarketplaceMobilePage } from "./page.mobile";
import { MarketplacePageView } from "./page.web";

export default function MarketplacePage() {
  const platform = usePlatform();
  return (
    <OfflineRouteFallback view="marketplace">
      {platform === "mobile" ? <MarketplaceMobilePage /> : <MarketplacePageView />}
    </OfflineRouteFallback>
  );
}
