"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const RoomDetailWeb = dynamic(() => import("./page.web"));
const RoomDetailMobile = dynamic(() => import("./page.mobile"));

export default function RoomDetailDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <RoomDetailMobile />;
  }
  return <RoomDetailWeb />;
}
