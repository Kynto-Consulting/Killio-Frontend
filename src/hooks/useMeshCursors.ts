import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { IRealtimeChannel } from "@/lib/realtime/types";

export type RemoteCursor = {
  clientId: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
  tool: string;
  updatedAt: number;
};

const CURSOR_COLORS = [
  "#22d3ee", "#a78bfa", "#f472b6", "#fb923c", "#4ade80",
  "#fbbf24", "#60a5fa", "#e879f9", "#34d399", "#f87171",
];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length];
}

const THROTTLE_MS = 40;
const EXPIRY_MS = 6000;

export function useMeshCursors(
  meshId: string | null | undefined,
  userId: string | null | undefined,
  displayName: string,
  accessToken: string | null | undefined,
  toolMode: string,
) {
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());

  const channelRef = useRef<IRealtimeChannel | null>(null);
  const lastPublishRef = useRef(0);
  const toolModeRef = useRef(toolMode);
  const displayNameRef = useRef(displayName);
  toolModeRef.current = toolMode;
  displayNameRef.current = displayName;

  const realtime = useRealtime();

  useEffect(() => {
    if (!meshId || !userId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.mesh(meshId));
    channelRef.current = channel;

    // Purge stale cursors every 2s
    const cleanupId = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((c, k) => {
          if (now - c.updatedAt > EXPIRY_MS) { next.delete(k); changed = true; }
        });
        return changed ? next : prev;
      });
    }, 2000);

    const onCursorMove = (msg: { name: string; data: unknown; clientId?: string }) => {
      const d = msg.data as any;
      if (!d) return;
      const clientId: string = msg.clientId ?? d.clientId ?? "";
      if (!clientId || clientId === userId) return;
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(clientId, {
          clientId,
          displayName: d.displayName ?? clientId.slice(0, 10),
          color: colorForId(clientId),
          x: typeof d.x === "number" ? d.x : 0,
          y: typeof d.y === "number" ? d.y : 0,
          tool: typeof d.tool === "string" ? d.tool : "select",
          updatedAt: Date.now(),
        });
        return next;
      });
    };

    channel.subscribe("mesh.cursor.move", onCursorMove);

    return () => {
      clearInterval(cleanupId);
      try { channel.unsubscribe("mesh.cursor.move", onCursorMove); } catch {}
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshId, userId, realtime]);

  const publishCursor = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastPublishRef.current < THROTTLE_MS) return;
    lastPublishRef.current = now;
    const ch = channelRef.current;
    if (!ch) return;
    ch.publish("mesh.cursor.move", {
      x,
      y,
      tool: toolModeRef.current,
      displayName: displayNameRef.current,
    }).catch(() => {});
  }, []);

  return { cursors: Array.from(cursors.values()), publishCursor };
}
