"use client";

import dynamic from "next/dynamic";
import { usePlatform } from "@/components/providers/platform-provider";
import { BoardChatDrawerProps } from "./board-chat-drawer.web";

const WebVariant = dynamic(() => import("./board-chat-drawer.web").then((m) => m.BoardChatDrawerWeb));
const MobileVariant = dynamic(() => import("./board-chat-drawer.mobile").then((m) => m.BoardChatDrawerMobile));

export function BoardChatDrawer(props: BoardChatDrawerProps) {
  const platform = usePlatform();

  if (platform === "mobile") {
    return <MobileVariant {...props} />;
  }

  return <WebVariant {...props} />;
}