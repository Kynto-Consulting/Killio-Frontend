"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const RoomsPageWeb = dynamic(() => import("./page.web"));
const RoomsPageMobile = dynamic(() => import("./page.mobile"));

export default function RoomsPageDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <RoomsPageMobile />;
  }
  return <RoomsPageWeb />;
}
