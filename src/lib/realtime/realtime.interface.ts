/**
 * PAR-02 — Vendor-agnostic realtime provider interface (flat API)
 *
 * A second, simpler abstraction layer on top of the existing IRealtimeProvider /
 * IRealtimeChannel interfaces. Implementations: AblyRealtimeProvider (wraps the
 * existing Ably adapter) and PulseRealtimeProvider (plain WebSocket, no extra deps).
 *
 * Switch at runtime via NEXT_PUBLIC_REALTIME_PROVIDER env var ('ably' | 'pulse').
 */

export interface PresenceEvent {
  event: "join" | "leave" | "update" | "sync";
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface PresenceMember {
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface IRealtimeProviderV2 {
  /**
   * Subscribe to a specific named event on a channel.
   * Returns an unsubscribe function.
   */
  subscribe(
    channelName: string,
    eventName: string,
    callback: (data: unknown) => void
  ): () => void;

  /**
   * Subscribe to ALL events on a channel (wildcard).
   * Returns an unsubscribe function.
   */
  subscribeAll(
    channelName: string,
    callback: (eventName: string, data: unknown) => void
  ): () => void;

  /**
   * Publish an event to a channel (client-side publish).
   */
  publish(channelName: string, eventName: string, data: unknown): Promise<void>;

  /**
   * Enter presence on a channel with optional metadata.
   */
  enterPresence(
    channelName: string,
    data?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Leave presence on a channel.
   */
  leavePresence(channelName: string): Promise<void>;

  /**
   * Subscribe to presence events (join/leave/update/sync) on a channel.
   * Returns an unsubscribe function.
   */
  subscribePresence(
    channelName: string,
    callback: (event: PresenceEvent) => void
  ): () => void;

  /**
   * Get current presence members on a channel.
   */
  getPresenceMembers(channelName: string): Promise<PresenceMember[]>;

  /**
   * Disconnect all connections managed by this provider.
   */
  disconnect(): void;
}
