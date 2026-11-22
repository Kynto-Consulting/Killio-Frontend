/**
 * Room presence heartbeat: while the person is looking at a room (tab visible, room open) the client tells the server every
 * ~20 s (`PUT /rooms/:id/active`, valid ~45 s) so it does not send a push for messages that are already on screen. Leaving
 * (`DELETE`) resumes pushes at once. Pure timer logic, no React or DOM, so it can be tested.
 */
export const ROOM_ACTIVE_INTERVAL_MS = 20_000;

export interface HeartbeatDeps {
  send: () => void;
  clear: () => void;
  intervalMs?: number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export function createRoomHeartbeat(deps: HeartbeatDeps) {
  const every = deps.intervalMs ?? ROOM_ACTIVE_INTERVAL_MS;
  const set = deps.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
  const unset = deps.clearIntervalFn ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  let handle: unknown = null;
  return {
    /** true: beat now and every interval; false: stop and tell the server once. Repeated calls with the same value do nothing. */
    setActive(active: boolean) {
      if (active && handle === null) {
        deps.send();
        handle = set(deps.send, every);
      } else if (!active && handle !== null) {
        unset(handle);
        handle = null;
        deps.clear();
      }
    },
    get running() { return handle !== null; },
  };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** keepalive lets the DELETE survive a tab close. Failures are ignored: presence is best effort. */
export function sendRoomActivity(roomId: string, accessToken: string, active: boolean): void {
  try {
    void fetch(`${API_BASE_URL}/rooms/${roomId}/active`, {
      method: active ? 'PUT' : 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
