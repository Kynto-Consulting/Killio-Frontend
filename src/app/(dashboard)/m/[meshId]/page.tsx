"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const MeshWebVariant = dynamic(() => import("./page.web"));
const MeshMobileVariant = dynamic(() => import("./page.mobile"));

export default function MeshBoardPageDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <MeshMobileVariant />;
  }
  return <MeshWebVariant />;
}
