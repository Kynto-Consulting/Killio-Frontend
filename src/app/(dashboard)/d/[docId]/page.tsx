"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const DocumentPageWeb = dynamic(() => import("./page.web"));
const DocumentPageMobile = dynamic(() => import("./page.mobile"));

export default function DocumentPageDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <DocumentPageMobile />;
  }
  return <DocumentPageWeb />;
}
