/**
 * PAR-02 — Ably implementation of IRealtimeProviderV2
 *
 * Wraps the existing AblyProvider (ably-provider.ts) behind the flat
 * IRealtimeProviderV2 interface so callers never import the Ably SDK directly.
 *
 * Presence mapping:
 *   Ably presence "enter"  → PresenceEvent { event: "join",    userId: clientId }
 *   Ably presence "leave"  → PresenceEvent { event: "leave",   userId: clientId }
 *   Ably presence "update" → PresenceEvent { event: "update",  userId: clientId }
 *   (no native "sync" in Ably — initial get() is used instead)
 */

import Ably from "ably";
import type { IRealtimeProviderV2, PresenceEvent, PresenceMember } from "./realtime.interface";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Map Ably presence action strings to our union
const ABLY_ACTION_MAP: Record<string, PresenceEvent["event"] | undefined> = {
  enter: "join",
  leave: "leave",
  update: "update",
  present: "sync",
};

export class AblyRealtimeProvider implements IRealtimeProviderV2 {
  private readonly _client: Ably.Realtime;

  constructor(accessToken: string, _apiUrl?: string) {
    const apiBase = _apiUrl ?? API;
    this._client = new Ably.Realtime({
      authCallback: async (_data, callback) => {
        try {
          const res = await fetch(`${apiBase}/ably/auth`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error(`Ably auth failed: ${res.status}`);
          const tokenRequest = await res.json();
          callback(null, tokenRequest);
        } catch (err) {
          callback((err as Error).message, null);
        }
      },
      autoConnect: true,
    });

    this._client.connection.on("failed", () => {
      console.error("[AblyRealtimeProvider] connection failed");
    });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  subscribe(
    channelName: string,
    eventName: string,
    callback: (data: unknown) => void
  ): () => void {
    const ch = this._client.channels.get(channelName);
    const wrapped = (msg: Ably.Message) => callback(msg.data);
    ch.subscribe(eventName, wrapped);
    return () => {
      try {
        ch.unsubscribe(eventName, wrapped);
      } catch {}
    };
  }

  subscribeAll(
    channelName: string,
    callback: (eventName: string, data: unknown) => void
  ): () => void {
    const ch = this._client.channels.get(channelName);
    const wrapped = (msg: Ably.Message) => callback(msg.name ?? "", msg.data);
    ch.subscribe(wrapped);
    return () => {
      try {
        ch.unsubscribe(wrapped);
      } catch {}
    };
  }

  async publish(
    channelName: string,
    eventName: string,
    data: unknown
  ): Promise<void> {
    await this._client.channels.get(channelName).publish(eventName, data);
  }

  // ── Presence ───────────────────────────────────────────────────────────────

  async enterPresence(
    channelName: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this._client.channels.get(channelName).presence.enter(data as any);
  }

  async leavePresence(channelName: string): Promise<void> {
    await this._client.channels.get(channelName).presence.leave();
  }

  subscribePresence(
    channelName: string,
    callback: (event: PresenceEvent) => void
  ): () => void {
    const ch = this._client.channels.get(channelName);
    const handler = (member: Ably.PresenceMessage) => {
      const action = member.action ?? "";
      const mapped = ABLY_ACTION_MAP[action];
      if (!mapped) return;
      callback({
        event: mapped,
        userId: member.clientId ?? "",
        metadata: member.data as Record<string, unknown> | undefined,
      });
    };
    // Subscribe to all presence events
    (["enter", "leave", "update", "present"] as Ably.PresenceAction[]).forEach(
      (a) => ch.presence.subscribe(a, handler)
    );
    return () => {
      try {
        ch.presence.unsubscribe(handler as any);
      } catch {}
    };
  }

  async getPresenceMembers(channelName: string): Promise<PresenceMember[]> {
    const members = await this._client.channels.get(channelName).presence.get();
    return members.map((m: any) => ({
      userId: m.clientId as string,
      metadata: m.data as Record<string, unknown> | undefined,
    }));
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  disconnect(): void {
    this._client.close();
  }
}
