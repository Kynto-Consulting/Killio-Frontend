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
import type { IRealtimeProvider } from "@/lib/realtime/types";
import { createAblyProvider } from "@/lib/realtime/ably-provider";
import { useSession } from "@/components/providers/session-provider";

// ─── Context ──────────────────────────────────────────────────────────────────

const RealtimeContext = createContext<IRealtimeProvider | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the active IRealtimeProvider.
 * Must be called inside <RealtimeProvider>.
 */
export function useRealtime(): IRealtimeProvider {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime() must be used inside <RealtimeProvider>");
  }
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

  // While there's no accessToken yet, render children without a provider
  // (hooks will be no-ops since they guard on the presence of the provider)
  return (
    <RealtimeContext.Provider value={provider}>
      {children}
    </RealtimeContext.Provider>
  );
}
