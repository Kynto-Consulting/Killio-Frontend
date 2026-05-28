/**
 * PAR-02 — Pulse implementation of IRealtimeProviderV2
 *
 * Connects to the Kynto Pulse WebSocket worker using plain WebSocket (no extra deps).
 *
 * Worker URL  : NEXT_PUBLIC_PULSE_WORKER_URL  (default: https://websockets.kynto.workers.dev)
 * Auth flow   : GET /pulse/auth?channel={channelName}  →  { token: string, channelName: string, expiresIn: number }
 *               The JWT is passed as ?token= in the WebSocket URL.
 *
 * Wire format:
 *   → client sends : { type: 'pulse', event: 'ping', ts: number }               (heartbeat)
 *   → client sends : { event: string, payload: unknown }                          (publish)
 *   ← server sends : { event: string, payload: unknown }                          (message)
 *   ← server sends : { type: 'presence', event: 'join'|'leave'|'sync', userId, metadata?, users? }
 *   ← server sends : { type: 'system', event: 'ready'|'pong', ... }
 *   ← server sends : { type: 'error', ... }
 */

import type { IRealtimeProviderV2, PresenceEvent, PresenceMember } from "./realtime.interface";

// ─── Internal message shape ───────────────────────────────────────────────────

interface PulseMessage {
  event?: string;
  payload?: unknown;
  type?: "presence" | "system" | "error";
  userId?: string;
  metadata?: Record<string, unknown>;
  users?: Array<{ userId: string; metadata?: Record<string, unknown> }>;
}

// ─── Per-channel WebSocket wrapper ───────────────────────────────────────────

class PulseChannel {
  private ws: WebSocket | null = null;
  /** Named-event listeners */
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();
  /** Wildcard listeners */
  private readonly allListeners = new Set<
    (eventName: string, data: unknown) => void
  >();
  /** Presence event listeners */
  private readonly presenceListeners = new Set<
    (event: PresenceEvent) => void
  >();
  /** Current presence state (userId → member) */
  private readonly presence = new Map<string, PresenceMember>();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(
    private readonly channelName: string,
    private readonly getToken: (channel: string) => Promise<string>,
    private readonly baseUrl: string
  ) {}

  async connect(): Promise<void> {
    const token = await this.getToken(this.channelName);
    // Convert http(s)://… → ws(s)://…
    const wsBase = this.baseUrl.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.startHeartbeat();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as PulseMessage;

        if (msg.type === "presence") {
          this.handlePresence(msg);
          return;
        }
        if (msg.type === "system" || msg.type === "error") return;

        // Regular message
        if (msg.event) {
          const eventSet = this.listeners.get(msg.event);
          if (eventSet) {
            for (const cb of eventSet) cb(msg.payload);
          }
          for (const cb of this.allListeners) cb(msg.event, msg.payload);
        }
      } catch {
        // Ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => void this.connect(), 3_000);
      }
    };

    this.ws.onerror = () => {
      // onclose fires automatically after onerror; let it drive reconnect
      this.ws?.close();
    };
  }

  private handlePresence(msg: PulseMessage): void {
    if (msg.event === "sync" && msg.users) {
      this.presence.clear();
      for (const u of msg.users) this.presence.set(u.userId, u);
    } else if (msg.event === "join" && msg.userId) {
      this.presence.set(msg.userId, {
        userId: msg.userId,
        metadata: msg.metadata,
      });
    } else if (msg.event === "leave" && msg.userId) {
      this.presence.delete(msg.userId);
    }

    // Emit to listeners (sync events may lack userId — skip those)
    const eventName = msg.event as PresenceEvent["event"] | undefined;
    if (eventName && (msg.userId || eventName === "sync")) {
      const evt: PresenceEvent = {
        event: eventName,
        userId: msg.userId ?? "",
        metadata: msg.metadata,
      };
      for (const cb of this.presenceListeners) cb(evt);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({ type: "pulse", event: "ping", ts: Date.now() })
        );
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Listener registration ─────────────────────────────────────────────────

  on(eventName: string, cb: (data: unknown) => void): () => void {
    if (!this.listeners.has(eventName))
      this.listeners.set(eventName, new Set());
    this.listeners.get(eventName)!.add(cb);
    return () => this.listeners.get(eventName)?.delete(cb);
  }

  onAll(cb: (eventName: string, data: unknown) => void): () => void {
    this.allListeners.add(cb);
    return () => this.allListeners.delete(cb);
  }

  onPresence(cb: (event: PresenceEvent) => void): () => void {
    this.presenceListeners.add(cb);
    return () => this.presenceListeners.delete(cb);
  }

  // ── Presence snapshot ─────────────────────────────────────────────────────

  getMembers(): PresenceMember[] {
    return Array.from(this.presence.values());
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  send(eventName: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: eventName, payload }));
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.ws?.close();
  }
}

// ─── Public provider ──────────────────────────────────────────────────────────

export class PulseRealtimeProvider implements IRealtimeProviderV2 {
  private readonly channels = new Map<string, PulseChannel>();
  private readonly baseUrl: string;
  private readonly authBaseUrl: string;
  private readonly getAccessToken: () => string | null;

  constructor(authBaseUrl: string, getAccessToken: () => string | null) {
    this.baseUrl =
      process.env.NEXT_PUBLIC_PULSE_WORKER_URL ??
      "https://websockets.kynto.workers.dev";
    this.authBaseUrl = authBaseUrl;
    this.getAccessToken = getAccessToken;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async getOrCreateChannel(channelName: string): Promise<PulseChannel> {
    if (!this.channels.has(channelName)) {
      const ch = new PulseChannel(
        channelName,
        (c) => this.fetchToken(c),
        this.baseUrl
      );
      this.channels.set(channelName, ch);
      await ch.connect();
    }
    return this.channels.get(channelName)!;
  }

  private async fetchToken(channelName: string): Promise<string> {
    const accessToken = this.getAccessToken();
    const res = await fetch(
      `${this.authBaseUrl}/pulse/auth?channel=${encodeURIComponent(channelName)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok)
      throw new Error(`[PulseRealtimeProvider] auth failed: ${res.status}`);
    const data = (await res.json()) as { token: string };
    return data.token;
  }

  // ── IRealtimeProviderV2 ───────────────────────────────────────────────────

  subscribe(
    channelName: string,
    eventName: string,
    callback: (data: unknown) => void
  ): () => void {
    let unsub: (() => void) | null = null;
    this.getOrCreateChannel(channelName).then((ch) => {
      unsub = ch.on(eventName, callback);
    });
    return () => unsub?.();
  }

  subscribeAll(
    channelName: string,
    callback: (eventName: string, data: unknown) => void
  ): () => void {
    let unsub: (() => void) | null = null;
    this.getOrCreateChannel(channelName).then((ch) => {
      unsub = ch.onAll(callback);
    });
    return () => unsub?.();
  }

  async publish(
    channelName: string,
    eventName: string,
    data: unknown
  ): Promise<void> {
    const ch = await this.getOrCreateChannel(channelName);
    ch.send(eventName, data);
  }

  /**
   * Presence is handled by the Pulse worker on connect (via the JWT).
   * Explicit enter/leave are no-ops here — the worker tracks connection lifecycle.
   */
  async enterPresence(
    _channelName: string,
    _data?: Record<string, unknown>
  ): Promise<void> {
    // no-op: managed by worker
  }

  async leavePresence(_channelName: string): Promise<void> {
    // no-op: handled on WebSocket close
  }

  subscribePresence(
    channelName: string,
    callback: (event: PresenceEvent) => void
  ): () => void {
    let unsub: (() => void) | null = null;
    this.getOrCreateChannel(channelName).then((ch) => {
      unsub = ch.onPresence(callback);
    });
    return () => unsub?.();
  }

  async getPresenceMembers(channelName: string): Promise<PresenceMember[]> {
    const ch = await this.getOrCreateChannel(channelName);
    return ch.getMembers();
  }

  disconnect(): void {
    for (const ch of this.channels.values()) ch.close();
    this.channels.clear();
  }
}
