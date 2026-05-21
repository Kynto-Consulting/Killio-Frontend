"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const BoardsPageWeb = dynamic(() => import("./page.web"));
const BoardsPageMobile = dynamic(() => import("./page.mobile"));

export default function BoardsPageDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <BoardsPageMobile />;
  }
  return <BoardsPageWeb />;
}
