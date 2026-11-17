"use client";

import type { ComponentProps } from "react";
import { useTenant } from "@/components/providers/tenant-provider";
import { AgentChatPanel as AgentChatPanelImpl } from "./AgentChatPanel";

/** The AI assistant panel, hidden when the deployment has switched the AI module off. */
export function AgentChatPanel(props: ComponentProps<typeof AgentChatPanelImpl>) {
  const { features } = useTenant();
  if (!features.ai) return null;
  return <AgentChatPanelImpl {...props} />;
}
