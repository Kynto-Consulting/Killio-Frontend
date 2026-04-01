"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const WebVariant = dynamic(() => import("./page.web"));
const MobileVariant = dynamic(() => import("./page.mobile"));

export default function WorkspacesPage() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <MobileVariant />;
  }
  return <WebVariant />;
}
