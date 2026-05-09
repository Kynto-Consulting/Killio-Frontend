"use client";

import dynamic from "next/dynamic";

const TranscriptsWeb = dynamic(() => import("./page.web"));

export default function TranscriptsDispatcher() {
  return <TranscriptsWeb />;
}
