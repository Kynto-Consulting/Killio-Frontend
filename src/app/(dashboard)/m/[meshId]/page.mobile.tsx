"use client";

import dynamic from "next/dynamic";

const MeshMobileBoard = dynamic(() => import("./page.web"), { ssr: false });

export default function MeshMobilePage() {
  return (
    <div className="h-full w-full touch-manipulation">
      <MeshMobileBoard mobileMode />
    </div>
  );
}
