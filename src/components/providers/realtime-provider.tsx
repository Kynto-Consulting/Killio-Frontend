"use client";

/**
 * PAR-01 / PAR-02 — RealtimeProvider
 *
 * Wraps the app with two realtime contexts:
 *
 *   1. `RealtimeContext`     — original channel-based IRealtimeProvider (PAR-01).
 *      Access via `useRealtime()`.  All existing hooks use this; nothing changed.
 *
 *   2. `RealtimeV2Context`   — new flat IRealtimeProviderV2 (PAR-02).
 *      Access via `useRealtimeProvider()`.  Switch between Ably and Pulse via
 *      NEXT_PUBLIC_REALTIME_PROVIDER env var ('ably' | 'pulse').
 *
 * To swap WebSocket vendors for the original context:
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
import type { IRealtimeProviderV2 } from "@/lib/realtime/realtime.interface";
import { createAblyProvider } from "@/lib/realtime/ably-provider";
import { AblyRealtimeProvider } from "@/lib/realtime/ably-realtime-provider";
import { PulseRealtimeProvider } from "@/lib/realtime/pulse-realtime-provider";
import { useSession } from "@/components/providers/session-provider";

// ─── Env switch ───────────────────────────────────────────────────────────────

const REALTIME_IMPL =
  process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? "ably";

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

// ─── V2 no-op ─────────────────────────────────────────────────────────────────

const NOOP_V2_PROVIDER: IRealtimeProviderV2 = {
  subscribe: () => () => {},
  subscribeAll: () => () => {},
  publish: async () => {},
  enterPresence: async () => {},
  leavePresence: async () => {},
  subscribePresence: () => () => {},
  getPresenceMembers: async () => [],
  disconnect: () => {},
};

const RealtimeV2Context =
  createContext<IRealtimeProviderV2>(NOOP_V2_PROVIDER);

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the active IRealtimeProvider (original channel-based API, PAR-01).
 * Must be called inside <RealtimeProvider>.
 */
export function useRealtime(): IRealtimeProvider {
  const ctx = useContext(RealtimeContext);
  // Always return a provider (could be NOOP) so callers don't need try/catch.
  return ctx;
}

/**
 * Returns the active IRealtimeProviderV2 (flat event API, PAR-02).
 * Backed by Ably or Pulse depending on NEXT_PUBLIC_REALTIME_PROVIDER.
 * Must be called inside <RealtimeProvider>.
 */
export function useRealtimeProvider(): IRealtimeProviderV2 {
  return useContext(RealtimeV2Context);
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

  // ── V1 (channel-based) provider ─────────────────────────────────────────────
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

  // ── V2 (flat-API) provider ───────────────────────────────────────────────────
  const apiUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  const prevV2TokenRef = useRef<string | null>(null);
  const providerV2Ref = useRef<IRealtimeProviderV2 | null>(null);

  const providerV2 = useMemo(() => {
    if (!accessToken) return null;
    if (providerV2Ref.current && prevV2TokenRef.current === accessToken) {
      return providerV2Ref.current;
    }
    providerV2Ref.current?.disconnect();
    const p: IRealtimeProviderV2 =
      REALTIME_IMPL === "pulse"
        ? new PulseRealtimeProvider(apiUrl, () => accessToken)
        : new AblyRealtimeProvider(accessToken, apiUrl);
    providerV2Ref.current = p;
    prevV2TokenRef.current = accessToken;
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    return () => {
      providerV2Ref.current?.disconnect();
      providerV2Ref.current = null;
      prevV2TokenRef.current = null;
    };
  }, []);

  const effectiveV2Provider = providerV2 ?? NOOP_V2_PROVIDER;

  return (
    <RealtimeContext.Provider value={effectiveProvider}>
      <RealtimeV2Context.Provider value={effectiveV2Provider}>
        {children}
      </RealtimeV2Context.Provider>
    </RealtimeContext.Provider>
  );
}
