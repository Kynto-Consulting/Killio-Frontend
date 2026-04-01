"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { SortableBrickProps } from "./sortable-brick.web";

const WebVariant = dynamic(() => import("./sortable-brick.web").then((m) => m.SortableBrickWeb));
const MobileVariant = dynamic(() => import("./sortable-brick.mobile").then((m) => m.SortableBrickMobile));

export function SortableBrick(props: SortableBrickProps) {
  const platform = usePlatform();

  if (platform === "mobile") {
    return <MobileVariant {...props} />;
  }

  return <WebVariant {...props} />;
}
