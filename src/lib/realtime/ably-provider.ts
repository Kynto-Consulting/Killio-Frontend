/**
 * PAR-01 — Ably implementation of IRealtimeProvider
 *
 * Wraps the Ably SDK behind the IRealtimeProvider / IRealtimeChannel interfaces.
 * To swap to a different WebSocket vendor, implement the same interfaces and
 * pass the new factory to <RealtimeProvider>.
 */

import Ably from "ably";
import type {
  IRealtimeProvider,
  IRealtimeChannel,
  MessageListener,
  PresenceMember,
  PresenceMemberData,
  PresenceAction,
  PresenceListener,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Internal Ably channel adapter ───────────────────────────────────────────

class AblyChannel implements IRealtimeChannel {
  private readonly _ch: Ably.RealtimeChannel;
  private readonly listenerMap = new Map<Function, Function>();

  constructor(ch: Ably.RealtimeChannel) {
    this._ch = ch;
  }

  subscribe(eventName: string, listener: MessageListener): void {
    const wrapped = (msg: Ably.Message) =>
      listener({ name: msg.name ?? eventName, data: msg.data, clientId: msg.clientId ?? undefined });
    this.listenerMap.set(listener, wrapped);
    this._ch.subscribe(eventName, wrapped as any);
  }

  subscribeAll(listener: MessageListener): void {
    const wrapped = (msg: Ably.Message) =>
      listener({ name: msg.name ?? "", data: msg.data, clientId: msg.clientId ?? undefined });
    this.listenerMap.set(listener, wrapped);
    this._ch.subscribe(wrapped as any);
  }

  unsubscribe(eventName: string, listener: MessageListener): void {
    const wrapped = this.listenerMap.get(listener);
    if (wrapped) {
      try { this._ch.unsubscribe(eventName, wrapped as any); } catch {}
      this.listenerMap.delete(listener);
    }
  }

  unsubscribeAll(listener: MessageListener): void {
    const wrapped = this.listenerMap.get(listener);
    if (wrapped) {
      try { this._ch.unsubscribe(wrapped as any); } catch {}
      this.listenerMap.delete(listener);
    } else {
      try { this._ch.unsubscribe(); } catch {}
    }
  }

  async publish(eventName: string, data: unknown): Promise<void> {
    await this._ch.publish(eventName, data);
  }

  readonly presence = {
    enter: async (data: PresenceMemberData): Promise<void> => {
      await this._ch.presence.enter(data);
    },
    leave: async (): Promise<void> => {
      await this._ch.presence.leave();
    },
    update: async (data: PresenceMemberData): Promise<void> => {
      await this._ch.presence.update(data);
    },
    get: async (): Promise<PresenceMember[]> => {
      const members = await this._ch.presence.get();
      return members.map((m: any) => ({
        clientId: m.clientId,
        data: m.data as PresenceMemberData,
      }));
    },
    subscribe: (
      action: PresenceAction | PresenceAction[],
      listener: PresenceListener
    ): void => {
      const actions = Array.isArray(action) ? action : [action];
      actions.forEach((a) => {
        this._ch.presence.subscribe(a, (member: any) => {
          listener({
            clientId: member.clientId,
            data: member.data as PresenceMemberData,
          });
        });
      });
    },
    unsubscribe: (
      action?: PresenceAction | PresenceAction[],
      _listener?: PresenceListener
    ): void => {
      try {
        if (!action) {
          this._ch.presence.unsubscribe();
        } else {
          const actions = Array.isArray(action) ? action : [action];
          actions.forEach((a) => this._ch.presence.unsubscribe(a));
        }
      } catch {}
    },
  };
}

// ─── Ably provider factory ────────────────────────────────────────────────────

class AblyProvider implements IRealtimeProvider {
  private readonly _client: Ably.Realtime;
  private readonly _channels = new Map<string, AblyChannel>();

  constructor(accessToken: string) {
    this._client = new Ably.Realtime({
      authCallback: async (_data, callback) => {
        try {
          const res = await fetch(`${API}/ably/auth`, {
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
      console.error("[Realtime] Ably connection failed");
    });
  }

  getChannel(name: string): IRealtimeChannel {
    const cached = this._channels.get(name);
    if (cached) return cached;

    const ch = new AblyChannel(this._client.channels.get(name));
    this._channels.set(name, ch);
    return ch;
  }

  disconnect(): void {
    this._channels.clear();
    this._client.close();
  }
}

// ─── Singleton with token-aware re-creation ───────────────────────────────────

let _provider: AblyProvider | null = null;
let _providerToken: string | null = null;

/**
 * Returns the shared AblyProvider instance. Re-creates it if the access token changed.
 * This maintains the same singleton behaviour as the old `getAblyClient()`.
 */
export function createAblyProvider(accessToken: string): IRealtimeProvider {
  if (_provider && _providerToken === accessToken) return _provider;

  _provider?.disconnect();
  _providerToken = accessToken;
  _provider = new AblyProvider(accessToken);
  return _provider;
}
