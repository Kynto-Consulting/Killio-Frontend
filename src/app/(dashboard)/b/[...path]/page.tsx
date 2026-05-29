"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

const BoardPageWeb = dynamic(() => import("./page.web"));
const BoardPageMobile = dynamic(() => import("./page.mobile"));
const BoardPageOffline = dynamic(() => import("./page.offline"));
const BoardPageMobileOffline = dynamic(() => import("./page.mobile.offline"));

export default function BoardPageDispatcher() {
  const platform = usePlatform();
  const { mode } = useLocalWorkspace();

  if (mode === "local") {
    return platform === "mobile" ? <BoardPageMobileOffline /> : <BoardPageOffline />;
  }
  if (platform === "mobile") {
    return <BoardPageMobile />;
  }
  return <BoardPageWeb />;
}
