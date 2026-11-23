"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
import { API_BASE_URL } from "@/lib/api/client";
import { killioApp } from "@/lib/app-shell";
import { realtimeChannel } from "@/lib/realtime/channels";

const HEARTBEAT_MS = 60_000;

/** One id per installed app, shared with active listening (same storage key). */
function appDeviceId(): string {
  try {
    const key = "killio_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `app-${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "app-unknown-device";
  }
}

/**
 * Notifications inside Killio App. While the app is open and signed in it tells the server so (a
 * heartbeat); the server then sends this person's notifications here, on their own realtime channel,
 * instead of web push to the browser on the same kind of device, and the app shows them as system
 * notifications. A computer with both the browser's notifications and the app shows one, not two.
 * Renders nothing; does nothing on the web.
 */
export function AppNotificationsHost() {
  const { accessToken, user } = useSession();
  const realtime = useRealtime();
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    const bridge = killioApp();
    if (!bridge?.notify) return;
    let cancelled = false;
    bridge.info().then((info) => { if (!cancelled && info.features.includes("notifications")) setPlatform(info.platform); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Heartbeat: "this person has Killio App open here".
  useEffect(() => {
    if (!platform || !accessToken) return;
    const deviceId = appDeviceId();
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const beat = () => {
      void fetch(`${API_BASE_URL}/push/app-presence`, { method: "POST", headers, body: JSON.stringify({ deviceId, platform }) }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      // Signed out or the page is going away: give notifications back to the browser at once.
      void fetch(`${API_BASE_URL}/push/app-presence`, { method: "DELETE", headers, body: JSON.stringify({ deviceId }), keepalive: true }).catch(() => {});
    };
  }, [platform, accessToken]);

  // What the server routes through the app arrives on the person's own channel.
  useEffect(() => {
    const userId = user?.id;
    if (!platform || !userId || !realtime) return;
    const channel = realtime.getChannel(realtimeChannel.user(userId));
    const onNotify = (message: { name: string; data: unknown }) => {
      const data = (message.data ?? {}) as { title?: unknown; body?: unknown };
      if (typeof data.title !== "string" || !data.title.trim()) return;
      void killioApp()?.notify?.({ title: data.title, body: typeof data.body === "string" ? data.body : undefined }).catch(() => {});
    };
    channel.subscribe("push.notify", onNotify);
    return () => { try { channel.unsubscribe("push.notify", onNotify); } catch { /* channel already closed */ } };
  }, [platform, user?.id, realtime]);

  return null;
}
