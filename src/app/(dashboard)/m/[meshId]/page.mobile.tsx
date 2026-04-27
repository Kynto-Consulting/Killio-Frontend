"use client";

import dynamic from "next/dynamic";

const MeshDesktopParity = dynamic<{ mobileMode?: boolean }>(() => import("./page.web"));

export default function MeshMobilePage() {
  return (
    <div className="h-full w-full touch-manipulation">
      <MeshDesktopParity mobileMode />
    </div>
  );
}
