"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const RoomsPageWeb = dynamic(() => import("./page.web"));

export default function RoomsPageDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground text-sm">
        Rooms not available on mobile yet.
      </div>
    );
  }
  return <RoomsPageWeb />;
}
