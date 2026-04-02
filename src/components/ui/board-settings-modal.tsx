"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import type { BoardSettingsModalProps } from "./board-settings-modal.web";

const WebVariant = dynamic(() => import("./board-settings-modal.web").then((m) => m.BoardSettingsModalWeb));
const MobileVariant = dynamic(() => import("./board-settings-modal.mobile").then((m) => m.BoardSettingsModalMobile));

export function BoardSettingsModal(props: BoardSettingsModalProps) {
  const platform = usePlatform();

  if (platform === "mobile") {
    return <MobileVariant {...props} />;
  }

  return <WebVariant {...props} />;
}
