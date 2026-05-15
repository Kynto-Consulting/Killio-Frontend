"use client";

/**
 * PAR-01 — RealtimeProvider
 *
 * Wraps the app with a vendor-agnostic realtime context.
 * All hooks access channels via `useRealtime().getChannel(realtimeChannel.*)`.
 *
 * To swap WebSocket vendors:
 *   1. Implement IRealtimeProvider in a new file (e.g. pusher-provider.ts)
 *   2. Pass a factory to <RealtimeProvider factory={createPusherProvider} />
 *   3. Zero hook/component changes needed
 */

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type {
  IRealtimeProvider,
  IRealtimeChannel,
  PresenceMemberData,
  MessageListener,
  PresenceListener,
  PresenceAction,
} from "@/lib/realtime/types";
import { createAblyProvider } from "@/lib/realtime/ably-provider";
import { useSession } from "@/components/providers/session-provider";

// ─── No-op provider (safe fallback) ───────────────────────────────────────────

const noopChannel: IRealtimeChannel = {
  subscribe: (_eventName: string, _listener: MessageListener) => {},
  subscribeAll: (_listener: MessageListener) => {},
  unsubscribe: (_eventName: string, _listener: MessageListener) => {},
  unsubscribeAll: (_listener: MessageListener) => {},
  publish: async (_eventName: string, _data: unknown) => {},
  presence: {
    enter: async (_data: PresenceMemberData) => {},
    leave: async () => {},
    update: async (_data: PresenceMemberData) => {},
    get: async () => [] as any,
    subscribe: (_action: PresenceAction | PresenceAction[], _listener: PresenceListener) => {},
    unsubscribe: (_action?: PresenceAction | PresenceAction[], _listener?: PresenceListener) => {},
  },
};

const NOOP_PROVIDER: IRealtimeProvider = {
  getChannel: (_name: string) => noopChannel,
  disconnect: () => {},
};

// ─── Context ──────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<IRealtimeProvider>(NOOP_PROVIDER);

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the active IRealtimeProvider.
 * Must be called inside <RealtimeProvider>.
 */
export function useRealtime(): IRealtimeProvider {
  const ctx = useContext(RealtimeContext);
  // Always return a provider (could be NOOP) so callers don't need try/catch.
  return ctx;
}

// ─── Provider component ───────────────────────────────────────────────────────

interface RealtimeProviderProps {
  children: React.ReactNode;
  /**
   * Optional factory override — defaults to createAblyProvider.
   * Supply a different factory to swap the WebSocket vendor at the app level.
   */
  factory?: (accessToken: string) => IRealtimeProvider;
}

export function RealtimeProvider({
  children,
  factory = createAblyProvider,
}: RealtimeProviderProps) {
  const { accessToken } = useSession();
  const prevTokenRef = useRef<string | null>(null);
  const providerRef = useRef<IRealtimeProvider | null>(null);

  // Rebuild provider when the access token changes
  const provider = useMemo(() => {
    if (!accessToken) return null;
    if (providerRef.current && prevTokenRef.current === accessToken) {
      return providerRef.current;
    }
    // Disconnect old provider before creating a new one
    providerRef.current?.disconnect();
    const p = factory(accessToken);
    providerRef.current = p;
    prevTokenRef.current = accessToken;
    return p;
  }, [accessToken, factory]);

  // Disconnect on unmount
  useEffect(() => {
    return () => {
      providerRef.current?.disconnect();
      providerRef.current = null;
      prevTokenRef.current = null;
    };
  }, []);

  // Provide a NOOP provider while accessToken is not available so callers
  // can safely call `useRealtime()` without guarding.
  const effectiveProvider = provider ?? NOOP_PROVIDER;

  return (
    <RealtimeContext.Provider value={effectiveProvider}>
      {children}
    </RealtimeContext.Provider>
  );
}
