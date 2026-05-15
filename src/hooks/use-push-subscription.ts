"use client";

/**
 * usePushSubscription
 *
 * Manages the full Web Push lifecycle:
 *   1. Requests Notification permission if not yet granted
 *   2. Registers a Service Worker push subscription using the server's VAPID public key
 *   3. POSTs the subscription to /push/subscribe (authenticated)
 *   4. Persists subscription endpoint in localStorage to skip re-registering on reload
 *   5. Deletes the subscription on unsubscribe / permission revoke
 *
 * Returns { permission, subscribe, unsubscribe, isSubscribed }
 */

import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const LS_KEY = "killio_push_endpoint";

// Baked in at build time — safe to expose to the browser
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;

export type PushPermission = "default" | "granted" | "denied";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

async function getVapidPublicKey(): Promise<string | null> {
  // Prefer build-time env var — avoids an extra network roundtrip
  if (VAPID_PUBLIC_KEY) return VAPID_PUBLIC_KEY;
  try {
    const res = await fetch(`${API_BASE}/push/vapid-public-key`);
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey ?? null;
  } catch {
    return null;
  }
}

async function registerSubscription(
  accessToken: string,
  subscription: PushSubscription
): Promise<boolean> {
  try {
    const json = subscription.toJSON();
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

async function unregisterSubscription(
  accessToken: string,
  endpoint: string
): Promise<void> {
  try {
    await fetch(`${API_BASE}/push/unsubscribe`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    // best-effort
  }
}

export function usePushSubscription(accessToken: string | null | undefined) {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const attemptedRef = useRef(false);

  // Sync Notification.permission on mount and when it changes
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission as PushPermission);
  }, []);

  // Auto-subscribe once permission is already granted and we have a token
  useEffect(() => {
    if (!accessToken) return;
    if (attemptedRef.current) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    attemptedRef.current = true;

    // If we already registered this endpoint this session, mark as subscribed
    const storedEndpoint = localStorage.getItem(LS_KEY);
    if (storedEndpoint) {
      setIsSubscribed(true);
      return;
    }

    // Otherwise silently subscribe in the background
    doSubscribe(accessToken).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const doSubscribe = useCallback(async (token: string): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) return false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const ok = await registerSubscription(token, sub);
      if (ok) {
        localStorage.setItem(LS_KEY, sub.endpoint);
        setIsSubscribed(true);
      }
      return ok;
    } catch {
      return false;
    }
  }, []);

  /** Request permission and subscribe if granted. Returns true on success. */
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!accessToken) return false;
    if (typeof window === "undefined" || !("Notification" in window)) return false;

    let perm = Notification.permission as PushPermission;
    if (perm === "default") {
      perm = (await Notification.requestPermission()) as PushPermission;
      setPermission(perm);
    }
    if (perm !== "granted") return false;

    return doSubscribe(accessToken);
  }, [accessToken, doSubscribe]);

  /** Remove the push subscription from the server and unregister the SW subscription. */
  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!accessToken) return;
    const storedEndpoint = localStorage.getItem(LS_KEY);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    } catch {/* ignore */}

    if (storedEndpoint) {
      await unregisterSubscription(accessToken, storedEndpoint);
      localStorage.removeItem(LS_KEY);
    }
    setIsSubscribed(false);
  }, [accessToken]);

  return { permission, isSubscribed, subscribe, unsubscribe };
}
