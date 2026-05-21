"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";

const TranscriptsWeb = dynamic(() => import("./page.web"));
const TranscriptsMobile = dynamic(() => import("./page.mobile"));

export default function TranscriptsDispatcher() {
  const platform = usePlatform();
  if (platform === "mobile") {
    return <TranscriptsMobile />;
  }
  return <TranscriptsWeb />;
}
