"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

const BoardPageWeb = dynamic(() => import("./page.web"));
const BoardPageMobile = dynamic(() => import("./page.mobile"));

export default function BoardPageDispatcher() {
  const platform = usePlatform();
  const { mode } = useLocalWorkspace();

  // Local workspace reuses the real kanban editor (page.web self-branches its
  // persistence to the .kb file) so the board behaves 1:1 with cloud.
  if (mode === "local") return <BoardPageWeb />;
  if (platform === "mobile") return <BoardPageMobile />;
  return <BoardPageWeb />;
}
