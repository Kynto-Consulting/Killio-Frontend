/**
 * V1 adapter — wraps PulseRealtimeProvider behind IRealtimeProvider so all
 * existing hooks (useRealtime / getChannel) work unchanged with pulse.
 */

import type {
  IRealtimeProvider,
  IRealtimeChannel,
  MessageListener,
  PresenceMember,
  PresenceMemberData,
  PresenceAction,
  PresenceListener,
} from "./types";
import type { PresenceEvent } from "./realtime.interface";
import { PulseRealtimeProvider } from "./pulse-realtime-provider";

// ─── Channel adapter ─────────────────────────────────────────────────────────

class PulseV1Channel implements IRealtimeChannel {
  /** unsub fn keyed by original listener reference */
  private readonly subs = new Map<MessageListener, () => void>();
  private readonly allSubs = new Map<MessageListener, () => void>();
  private presenceUnsub: (() => void) | null = null;
  private readonly presenceListeners = new Map<
    PresenceListener,
    () => void
  >();
  private presenceData: PresenceMemberData | null = null;

  constructor(
    private readonly channelName: string,
    private readonly v2: PulseRealtimeProvider
  ) {}

  subscribe(eventName: string, listener: MessageListener): void {
    if (this.subs.has(listener)) return;
    const unsub = this.v2.subscribe(this.channelName, eventName, (data) => {
      listener({ name: eventName, data });
    });
    this.subs.set(listener, unsub);
  }

  subscribeAll(listener: MessageListener): void {
    if (this.allSubs.has(listener)) return;
    const unsub = this.v2.subscribeAll(
      this.channelName,
      (name, data) => listener({ name, data })
    );
    this.allSubs.set(listener, unsub);
  }

  unsubscribe(eventName: string, listener: MessageListener): void {
    const unsub = this.subs.get(listener);
    if (unsub) { unsub(); this.subs.delete(listener); }
  }

  unsubscribeAll(listener: MessageListener): void {
    const unsub = this.allSubs.get(listener);
    if (unsub) { unsub(); this.allSubs.delete(listener); }
  }

  async publish(eventName: string, data: unknown): Promise<void> {
    await this.v2.publish(this.channelName, eventName, data);
  }

  readonly presence = {
    enter: async (data: PresenceMemberData): Promise<void> => {
      this.presenceData = data;
      await this.v2.enterPresence(this.channelName, data as unknown as Record<string, unknown>);
    },

    leave: async (): Promise<void> => {
      this.presenceData = null;
      await this.v2.leavePresence(this.channelName);
    },

    update: async (data: PresenceMemberData): Promise<void> => {
      this.presenceData = data;
      await this.v2.enterPresence(this.channelName, data as unknown as Record<string, unknown>);
    },

    get: async (): Promise<PresenceMember[]> => {
      const members = await this.v2.getPresenceMembers(this.channelName);
      return members.map((m) => ({
        clientId: m.userId,
        data: (m.metadata ?? {}) as unknown as PresenceMemberData,
      }));
    },

    subscribe: (
      action: PresenceAction | PresenceAction[],
      listener: PresenceListener
    ): void => {
      const actions = Array.isArray(action) ? action : [action];
      const unsub = this.v2.subscribePresence(
        this.channelName,
        (evt: PresenceEvent) => {
          const mapped: PresenceMember = {
            clientId: evt.userId,
            data: (evt.metadata ?? {}) as unknown as PresenceMemberData,
          };
          if (evt.event === "join" && actions.includes("enter")) listener(mapped);
          if (evt.event === "leave" && actions.includes("leave")) listener(mapped);
        }
      );
      this.presenceListeners.set(listener, unsub);
    },

    unsubscribe: (
      _action?: PresenceAction | PresenceAction[],
      listener?: PresenceListener
    ): void => {
      if (listener) {
        const unsub = this.presenceListeners.get(listener);
        if (unsub) { unsub(); this.presenceListeners.delete(listener); }
      } else {
        this.presenceListeners.forEach((unsub) => unsub());
        this.presenceListeners.clear();
        if (this.presenceUnsub) { this.presenceUnsub(); this.presenceUnsub = null; }
      }
    },
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

class PulseV1Provider implements IRealtimeProvider {
  private readonly channels = new Map<string, PulseV1Channel>();
  private readonly v2: PulseRealtimeProvider;

  constructor(apiUrl: string, getAccessToken: () => string | null) {
    this.v2 = new PulseRealtimeProvider(apiUrl, getAccessToken);
  }

  getChannel(name: string): IRealtimeChannel {
    const cached = this.channels.get(name);
    if (cached) return cached;
    const ch = new PulseV1Channel(name, this.v2);
    this.channels.set(name, ch);
    return ch;
  }

  disconnect(): void {
    this.v2.disconnect();
    this.channels.clear();
  }
}

export function createPulseProvider(
  accessToken: string,
  apiUrl: string
): IRealtimeProvider {
  return new PulseV1Provider(apiUrl, () => accessToken);
}
