"use client";

import dynamic from "next/dynamic";

import { useSession } from "@/components/providers/session-provider";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";

// AgentChatPanel is heavy (markdown, asset rendering) — load it client-side only.
const AgentChatPanel = dynamic(
  () => import("@/components/agent/AgentChatPanel").then((m) => m.AgentChatPanel),
  { ssr: false },
);

/**
 * /rooms/vault — talk to Killio directly as a chatbot/AI.
 *
 * The VAULT room group doubles as a route: instead of a channel list it opens a
 * full-page Killio assistant (mirrors the Vault app's assistant home), so the
 * user can use Killio as a direct AI without picking a doc/board/card first.
 */
export default function RoomsVaultPage() {
  const { activeTeamId } = useSession();

  return (
    <OfflineRouteFallback view="rooms">
      <div className="flex h-full min-h-0 w-full flex-col">
        {activeTeamId ? (
          <AgentChatPanel teamId={activeTeamId} className="flex-1 min-h-0" />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">…</div>
        )}
      </div>
    </OfflineRouteFallback>
  );
}
