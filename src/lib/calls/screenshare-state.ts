/**
 * Screen-share state of a call: who is sharing, as seen by this browser.
 *
 * Two sources feed it and both are idempotent, so duplicates and reordering are harmless:
 *   - the server (`call.screenshare.started|stopped` on the room's signal channel, plus the snapshot from GET .../state),
 *   - the sharer itself (`call.screen` { peerId, active, ... }, the original client-to-client signal; it keeps working when the
 *     server is unreachable and for tabs running the previous version).
 * The reducer is pure: the hook only dispatches and renders.
 */

export type SharePolicy = "single" | "multiple";

export interface ScreenShare {
  peerId: string;
  /** Id of the MediaStream that carries the shared screen (the receiver tells it apart from the camera stream by this id). */
  streamId?: string;
  withAudio: boolean;
  startedAt: number;
}

export interface ScreenShareState {
  policy: SharePolicy;
  shares: ScreenShare[];
}

export const initialScreenShareState: ScreenShareState = { policy: "single", shares: [] };

export type ScreenShareAction =
  | { type: "started"; share: ScreenShare }
  | { type: "stopped"; peerId: string }
  | { type: "peerLeft"; peerId: string }
  | { type: "snapshot"; shares: ScreenShare[]; policy?: SharePolicy }
  | { type: "reset" };

export function screenShareReducer(state: ScreenShareState, action: ScreenShareAction): ScreenShareState {
  switch (action.type) {
    case "started": {
      const existing = state.shares.find((s) => s.peerId === action.share.peerId);
      if (existing) {
        // Keep the original start time (the earliest sharer stays the "primary"), refresh what the sharer says about its stream.
        const merged: ScreenShare = {
          ...existing,
          streamId: action.share.streamId ?? existing.streamId,
          withAudio: action.share.withAudio,
        };
        const same = merged.streamId === existing.streamId && merged.withAudio === existing.withAudio;
        return same ? state : { ...state, shares: state.shares.map((s) => (s.peerId === merged.peerId ? merged : s)) };
      }
      return { ...state, shares: [...state.shares, action.share].sort((a, b) => a.startedAt - b.startedAt) };
    }
    case "stopped":
    case "peerLeft":
      return state.shares.some((s) => s.peerId === action.peerId)
        ? { ...state, shares: state.shares.filter((s) => s.peerId !== action.peerId) }
        : state;
    case "snapshot": {
      // The server's list is the truth for who is sharing, but the stream id is only known to the sharer: keep ids we already have.
      const byPeer = new Map(state.shares.map((s) => [s.peerId, s]));
      const shares = action.shares
        .map((s) => ({ ...s, streamId: s.streamId ?? byPeer.get(s.peerId)?.streamId }))
        .sort((a, b) => a.startedAt - b.startedAt);
      return { policy: action.policy ?? state.policy, shares };
    }
    case "reset":
      return state.shares.length === 0 ? state : { ...state, shares: [] };
  }
}

/** The share to put on the big stage: the one that started first (stable while others join in). */
export function primaryShare(state: ScreenShareState): ScreenShare | null {
  return state.shares[0] ?? null;
}

export type ShareGate = { ok: true } | { ok: false; reason: "busy"; sharerPeerId: string };

/** Client-side mirror of the server rule (the server decides; this avoids the picker when the answer is already known). */
export function canStartShare(state: ScreenShareState, myPeerId: string): ShareGate {
  if (state.policy === "multiple") return { ok: true };
  const other = state.shares.find((s) => s.peerId !== myPeerId);
  return other ? { ok: false, reason: "busy", sharerPeerId: other.peerId } : { ok: true };
}

// ── Signal payloads ────────────────────────────────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Turns any of the screen-share signals into a reducer action (or null when the payload is not usable):
 *   call.screen              { peerId, active, streamId?, audio? }       from the sharer
 *   call.screenshare.started { peerId, withAudio, startedAt? (ISO) }     from the server
 *   call.screenshare.stopped { peerId, reason? }                         from the server
 */
export function actionFromSignal(event: string, data: unknown, now: number = Date.now()): ScreenShareAction | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const peerId = str(d.peerId);
  if (!peerId) return null;
  if (event === "call.screenshare.stopped") return { type: "stopped", peerId };
  if (event === "call.screenshare.started" || (event === "call.screen" && d.active === true)) {
    const iso = typeof d.startedAt === "string" ? Date.parse(d.startedAt) : NaN;
    return {
      type: "started",
      share: {
        peerId,
        streamId: str(d.streamId),
        withAudio: d.withAudio === true || d.audio === true,
        startedAt: Number.isFinite(iso) ? iso : now,
      },
    };
  }
  if (event === "call.screen" && d.active === false) return { type: "stopped", peerId };
  return null;
}

/** Snapshot from GET /rooms/:roomId/calls/:callId/state. */
export function snapshotFromState(data: unknown): ScreenShareAction | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { screenShares?: unknown; screenSharePolicy?: unknown };
  if (!Array.isArray(d.screenShares)) return null;
  const shares: ScreenShare[] = [];
  for (const raw of d.screenShares) {
    const a = actionFromSignal("call.screenshare.started", raw);
    if (a?.type === "started") shares.push(a.share);
  }
  return { type: "snapshot", shares, policy: d.screenSharePolicy === "multiple" ? "multiple" : d.screenSharePolicy === "single" ? "single" : undefined };
}
