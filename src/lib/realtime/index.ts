/**
 * PAR-02 — Realtime barrel export
 *
 * Re-exports both the original channel-based abstractions (types, channels, ably-provider)
 * and the new flat-API abstractions (realtime.interface, ably-realtime-provider, pulse-realtime-provider).
 */

// ── Original abstractions (channel-based) ─────────────────────────────────────
export type {
  IRealtimeProvider,
  IRealtimeChannel,
  MessageListener,
  PresenceMemberData,
  PresenceAction,
  PresenceListener,
} from "./types";
// Keep PresenceMember from types separately — the new interface also exports one
// with a different shape (userId vs clientId). Export both under distinct names.
export type { PresenceMember as PresenceMemberLegacy } from "./types";
export { createAblyProvider } from "./ably-provider";
export { realtimeChannel } from "./channels";

// ── New flat-API abstractions (IRealtimeProviderV2) ───────────────────────────
export type {
  IRealtimeProviderV2,
  PresenceEvent,
  PresenceMember,
} from "./realtime.interface";
export { AblyRealtimeProvider } from "./ably-realtime-provider";
export { PulseRealtimeProvider } from "./pulse-realtime-provider";
