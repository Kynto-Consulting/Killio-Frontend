"use client";

import { useParams } from "next/navigation";

import { usePlatform } from "@/components/providers/platform-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { MarketplaceDetailView } from "./page.web";

export default function MarketplacePackDetailPage() {
  const platform = usePlatform();
  const params = useParams<{ packId: string }>();
  const packId = Array.isArray(params?.packId) ? params.packId[0] : params?.packId;
  if (!packId) return null;
  return (
    <OfflineRouteFallback view="marketplace">
      <MarketplaceDetailView packId={decodeURIComponent(packId)} compact={platform === "mobile"} />
    </OfflineRouteFallback>
  );
}
