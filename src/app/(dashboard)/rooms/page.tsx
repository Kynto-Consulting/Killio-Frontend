"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";

const RoomsPageWeb = dynamic(() => import("./page.web"));
const RoomsPageMobile = dynamic(() => import("./page.mobile"));

export default function RoomsPageDispatcher() {
  const platform = usePlatform();
  return (
    <OfflineRouteFallback view="rooms">
      {platform === "mobile" ? <RoomsPageMobile /> : <RoomsPageWeb />}
    </OfflineRouteFallback>
  );
}
