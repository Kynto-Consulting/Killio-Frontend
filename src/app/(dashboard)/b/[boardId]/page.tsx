"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const BoardPageWeb = dynamic(() => import("./page.web"));
const BoardPageMobile = dynamic(() => import("./page.mobile"));

export default function BoardPageDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <BoardPageMobile />;
  }
  return <BoardPageWeb />;
}
