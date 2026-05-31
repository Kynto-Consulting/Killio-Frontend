"use client";

import { usePlatform } from "@/components/providers/platform-provider";
import WebVariant from "./page.web";
import MobileVariant from "./page.mobile";

export default function WorkspacesPage() {
  const platform = usePlatform();
  if (platform === "mobile") return <MobileVariant />;
  return <WebVariant />;
}
