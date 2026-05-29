"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

const DocumentPageWeb = dynamic(() => import("./page.web"));
const DocumentPageMobile = dynamic(() => import("./page.mobile"));
const DocumentPageOffline = dynamic(() => import("./page.offline"));
const DocumentPageMobileOffline = dynamic(() => import("./page.mobile.offline"));

export default function DocumentPageDispatcher() {
  const platform = usePlatform();
  const { mode } = useLocalWorkspace();

  // Local workspace → offline variant (reads/writes the .kd file on disk).
  if (mode === "local") {
    return platform === "mobile" ? <DocumentPageMobileOffline /> : <DocumentPageOffline />;
  }
  if (platform === "mobile") {
    return <DocumentPageMobile />;
  }
  return <DocumentPageWeb />;
}
