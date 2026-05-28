import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { IRealtimeChannel } from "@/lib/realtime/types";

export type BrickLock = {
  brickId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  action: "drag" | "resize" | "edit";
  lockedAt: number;
};

const LOCK_TTL_MS = 5000;

export function useMeshLocks(
  meshId: string | null | undefined,
  userId: string | null | undefined,
  displayName: string,
  avatarUrl: string | undefined,
  accessToken?: string | null | undefined,
) {
  const [locks, setLocks] = useState<Map<string, BrickLock>>(new Map());

  const channelRef = useRef<IRealtimeChannel | null>(null);
  const displayNameRef = useRef(displayName);
  const avatarUrlRef = useRef(avatarUrl);
  displayNameRef.current = displayName;
  avatarUrlRef.current = avatarUrl;

  const realtime = useRealtime();

  useEffect(() => {
    if (!meshId || !userId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.mesh(meshId));
    channelRef.current = channel;

    // Purge expired locks every second
    const cleanupId = setInterval(() => {
      const now = Date.now();
      setLocks((prev) => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((lock, brickId) => {
          if (now - lock.lockedAt > LOCK_TTL_MS) { next.delete(brickId); changed = true; }
        });
        return changed ? next : prev;
      });
    }, 1000);

    const onBrickLocked = (msg: { name: string; data: unknown; clientId?: string }) => {
      if (!msg.data || typeof msg.data !== "object") return;
      const d = msg.data as Record<string, unknown>;
      if (!d.brickId) return;
      const clientId: string = msg.clientId ?? d.userId ?? "";
      if (!clientId || clientId === userId) return;
      setLocks((prev) => {
        const next = new Map(prev);
        next.set(d.brickId, {
          brickId: d.brickId,
          userId: clientId,
          displayName: d.displayName ?? clientId.slice(0, 10),
          avatarUrl: d.avatarUrl,
          action: d.action ?? "drag",
          lockedAt: Date.now(),
        });
        return next;
      });
    };

    const onBrickUnlocked = (msg: { name: string; data: unknown; clientId?: string }) => {
      if (!msg.data || typeof msg.data !== "object") return;
      const d = msg.data as Record<string, unknown>;
      if (!d.brickId) return;
      const clientId: string = msg.clientId ?? d.userId ?? "";
      if (!clientId || clientId === userId) return;
      setLocks((prev) => {
        const next = new Map(prev);
        next.delete(d.brickId);
        return next;
      });
    };

    channel.subscribe("mesh.brick.locked", onBrickLocked);
    channel.subscribe("mesh.brick.unlocked", onBrickUnlocked);

    return () => {
      clearInterval(cleanupId);
      try { channel.unsubscribe("mesh.brick.locked", onBrickLocked); } catch {}
      try { channel.unsubscribe("mesh.brick.unlocked", onBrickUnlocked); } catch {}
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshId, userId, realtime]);

  const publishLock = useCallback((brickId: string, action: BrickLock["action"]) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.publish("mesh.brick.locked", {
      brickId,
      displayName: displayNameRef.current,
      avatarUrl: avatarUrlRef.current,
      action,
    }).catch(() => {});
  }, []);

  const publishUnlock = useCallback((brickId: string) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.publish("mesh.brick.unlocked", { brickId }).catch(() => {});
  }, []);

  return { locks, publishLock, publishUnlock };
}
