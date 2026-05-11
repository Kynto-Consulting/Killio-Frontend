"use client";

import { useEffect, useRef, useCallback } from "react";
import { getAblyClient } from "@/lib/ably";

interface NotificationOptions {
  roomId: string | null | undefined;
  roomName?: string;
  currentUserId?: string | null;
  accessToken: string | null | undefined;
}

// ── Ring tone via Web Audio API ───────────────────────────────────────────────

let ringCtx: AudioContext | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;

function startRing() {
  if (typeof window === "undefined") return;
  try {
    ringCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    let count = 0;
    const play = () => {
      if (!ringCtx || count > 30) {
        stopRing();
        return;
      }
      const osc = ringCtx.createOscillator();
      const gain = ringCtx.createGain();
      osc.connect(gain);
      gain.connect(ringCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ringCtx.currentTime);
      osc.frequency.setValueAtTime(660, ringCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ringCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ringCtx.currentTime + 0.4);
      osc.start(ringCtx.currentTime);
      osc.stop(ringCtx.currentTime + 0.4);
      count++;
    };
    play();
    ringInterval = setInterval(play, 1200);
  } catch {}
}

export function stopRing() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (ringCtx) {
    ringCtx.close().catch(() => {});
    ringCtx = null;
  }
}

// ── Browser notification permission ──────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function showBrowserNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      requireInteraction: false,
    });
    setTimeout(() => n.close(), 5000);
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRoomNotifications({
  roomId,
  roomName,
  currentUserId,
  accessToken,
}: NotificationOptions) {
  const isRinging = useRef(false);

  // Request notification permission once
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  // Subscribe to Ably for notifications
  useEffect(() => {
    if (!roomId || !accessToken) return;

    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`room:${roomId}`);

    const onMessage = (msg: any) => {
      const payload = msg.data;
      // Only notify when tab is hidden and message is from someone else
      if (!document.hidden) return;
      if (payload.userId === currentUserId) return;
      const sender = payload.user?.displayName ?? "Someone";
      const rawContent = typeof payload.content === "string" ? payload.content : "";
      const preview = payload.preview || rawContent
        .replace(/<pre_think>[\s\S]*?<\/pre_think>/gi, "")
        .replace(/<plan>[\s\S]*?<\/plan>/gi, "")
        .replace(/<tool_call\s+[\s\S]*?\/>/gi, "")
        .trim()
        .slice(0, 100);
      showBrowserNotification(
        `${sender} in ${roomName ?? "Rooms"}`,
        preview,
        `msg-${payload.id}`
      );
    };

    const onCallStarted = (msg: any) => {
      const payload = msg.data;
      if (payload.initiatorUserId === currentUserId) return;
      // Ring tone
      if (!isRinging.current) {
        isRinging.current = true;
        startRing();
      }
      showBrowserNotification(
        `Incoming call in ${roomName ?? "Rooms"}`,
        "Someone started a call",
        `call-${payload.callId}`
      );
    };

    channel.subscribe("room.message", onMessage);
    channel.subscribe("room.call.started", onCallStarted);

    return () => {
      channel.unsubscribe("room.message", onMessage);
      channel.unsubscribe("room.call.started", onCallStarted);
    };
  }, [roomId, accessToken, currentUserId, roomName]);

  const stopRingCallback = useCallback(() => {
    isRinging.current = false;
    stopRing();
  }, []);

  return { stopRing: stopRingCallback };
}
