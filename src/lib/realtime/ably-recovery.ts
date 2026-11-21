/**
 * Recovery of Ably channels that are refused for lack of capability.
 *
 * With `ABLY_RESTRICT_CAPABILITY` on, the backend signs tokens limited to the rooms the user can see right now. A room
 * created (or shared) after the token was issued is therefore refused until the token is renewed. This module holds the
 * decision logic, free of the Ably SDK so it can be tested with a simulated client (ably-recovery.test.ts):
 *  - which errors mean "no permission" (40160 / 40161),
 *  - the retry policy (bounded, exponential),
 *  - a coordinator so a burst of failing channels renews the token ONCE,
 *  - `attachWithRecovery`: attach, and on a permission error renew + retry.
 * Pulse (`NEXT_PUBLIC_REALTIME_PROVIDER=pulse`) authorises per team on the server and needs none of this.
 */

/** Ably error codes for a channel refused by the capability of the token. */
export const PERMISSION_ERROR_CODES: readonly number[] = [40160, 40161];

export interface RetryPolicy {
  /** Total attach attempts, the first one included. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 4000 };

/** Reads the numeric code out of the shapes Ably (and our own wrappers) use for errors. */
export function errorCode(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; reason?: unknown; statusCode?: unknown };
  if (typeof e.code === "number") return e.code;
  if (e.reason && typeof e.reason === "object" && typeof (e.reason as { code?: unknown }).code === "number") {
    return (e.reason as { code: number }).code;
  }
  return null;
}

export function isPermissionError(err: unknown): boolean {
  const code = errorCode(err);
  return code !== null && PERMISSION_ERROR_CODES.includes(code);
}

/** Delay before attempt number `attempt + 1`, where `attempt` counts the attempts already made (1-based). */
export function retryDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const exp = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, exp);
}

export function shouldRetry(err: unknown, attemptsMade: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  return isPermissionError(err) && attemptsMade < policy.maxAttempts;
}

/**
 * Shares one token renewal between everything that asks for it:
 *  - a call made while a renewal is running joins it;
 *  - a call made right after one finished (within `cooldownMs`) reuses its result instead of renewing again.
 */
export class RenewalCoordinator {
  private inflight: Promise<boolean> | null = null;
  private lastDoneAt = Number.NEGATIVE_INFINITY;
  private lastResult = false;

  private readonly authorize: () => Promise<unknown>;
  private readonly options: { cooldownMs?: number; now?: () => number };

  constructor(authorize: () => Promise<unknown>, options: { cooldownMs?: number; now?: () => number } = {}) {
    this.authorize = authorize;
    this.options = options;
  }

  renew(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    const now = (this.options.now ?? Date.now)();
    const cooldown = this.options.cooldownMs ?? 1000;
    if (this.lastResult && now - this.lastDoneAt < cooldown) return Promise.resolve(true);
    this.inflight = this.authorize()
      .then(() => true, () => false)
      .then((ok) => {
        this.lastResult = ok;
        this.lastDoneAt = (this.options.now ?? Date.now)();
        this.inflight = null;
        return ok;
      });
    return this.inflight;
  }
}

export interface AttachableChannel {
  attach(): Promise<unknown>;
}

export interface RecoveryResult {
  ok: boolean;
  attempts: number;
  renewals: number;
  error?: unknown;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Attach a channel; when it is refused for lack of permission, renew the token and try again, up to the policy.
 * Any other error is returned at once: the SDK already retries transient network failures by itself.
 */
export async function attachWithRecovery(
  channel: AttachableChannel,
  renew: () => Promise<boolean>,
  options: { policy?: RetryPolicy; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RecoveryResult> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const sleep = options.sleep ?? realSleep;
  let attempts = 0;
  let renewals = 0;
  let lastError: unknown;
  while (attempts < policy.maxAttempts) {
    attempts++;
    try {
      await channel.attach();
      return { ok: true, attempts, renewals };
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err, attempts, policy)) break;
      renewals++;
      await renew();
      await sleep(retryDelay(attempts, policy));
    }
  }
  return { ok: false, attempts, renewals, error: lastError };
}

/**
 * Rooms that appeared in the list since the previous one (created by the user, or shared with them). The first list
 * (`previous` null) is the baseline, never "new": the token was just issued with those rooms already in it.
 * Seeing any of these means the token must be renewed before their channels can be subscribed.
 */
export function newlyVisibleRooms(previous: ReadonlySet<string> | null, current: readonly string[]): string[] {
  if (previous === null) return [];
  return current.filter((id) => !previous.has(id));
}

/** Minimal view of the Ably channel state-change event this module needs. */
export interface ChannelStateChange {
  current?: string;
  reason?: unknown;
}

/**
 * Wires recovery to a channel's `failed` event. `on` is the SDK's `channel.on`; returns the stop function.
 * Calls `onGiveUp` when the retries are spent so the UI can show an error state instead of a silent chat.
 */
export function watchChannelFailures(
  channel: AttachableChannel & { on(event: "failed", listener: (change: ChannelStateChange) => void): void; off?(event: "failed", listener: (change: ChannelStateChange) => void): void },
  renew: () => Promise<boolean>,
  options: { policy?: RetryPolicy; sleep?: (ms: number) => Promise<void>; onGiveUp?: (error: unknown) => void } = {},
): () => void {
  let running = false;
  let stopped = false;
  const listener = (change: ChannelStateChange) => {
    if (stopped || running || !isPermissionError(change.reason)) return;
    running = true;
    attachWithRecovery(channel, renew, options)
      .then((result) => {
        if (!result.ok && !stopped) options.onGiveUp?.(result.error);
      })
      .finally(() => { running = false; });
  };
  channel.on("failed", listener);
  return () => {
    stopped = true;
    try { channel.off?.("failed", listener); } catch { /* channel already released */ }
  };
}
