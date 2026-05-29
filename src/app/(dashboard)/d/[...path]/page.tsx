"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

const DocumentPageWeb = dynamic(() => import("./page.web"));
const DocumentPageMobile = dynamic(() => import("./page.mobile"));

export default function DocumentPageDispatcher() {
  const platform = usePlatform();
  const { mode } = useLocalWorkspace();

  // Local workspace reuses the real document editor (page.web self-branches its
  // persistence to the .kd file) so every brick type behaves 1:1 with cloud.
  if (mode === "local") return <DocumentPageWeb />;
  if (platform === "mobile") return <DocumentPageMobile />;
  return <DocumentPageWeb />;
}
