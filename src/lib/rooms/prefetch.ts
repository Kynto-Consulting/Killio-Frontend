/**
 * Prefetch of a room's first messages when the pointer or the keyboard focus rests on a channel, plus a quiet warm-up of
 * the likeliest neighbours of the open room. Pure scheduling (debounce, cancellation, de-duplication, a cap on parallel
 * work); the actual request is injected. Tested in prefetch.test.ts. Relative imports only.
 */

export interface PrefetchTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface PrefetchOptions {
  /** Loads what a visit needs (messages, read state) into the cache. Must stop early when `signal` aborts. */
  load: (roomId: string, signal: AbortSignal) => Promise<void>;
  /** True when the room needs nothing (already cached and recent, or the open one). */
  skip: (roomId: string) => boolean;
  /** Pause before a hover starts a request: crossing the list quickly must not fire one per row. */
  hoverDelayMs?: number;
  /** Pause before warming a neighbour (lower priority than a hover). */
  warmDelayMs?: number;
  /** Requests running at once. */
  maxParallel?: number;
  timers?: PrefetchTimers;
}

const realTimers: PrefetchTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export class PrefetchScheduler {
  private readonly o: Required<Omit<PrefetchOptions, "timers">> & { timers: PrefetchTimers };
  private pending = new Map<string, unknown>();
  private running = new Map<string, AbortController>();

  constructor(options: PrefetchOptions) {
    this.o = { hoverDelayMs: 120, warmDelayMs: 600, maxParallel: 2, timers: realTimers, ...options } as PrefetchScheduler["o"];
  }

  /** The pointer / focus is on a room: after the delay, load it (unless it needs nothing). */
  hover(roomId: string): void {
    this.schedule(roomId, this.o.hoverDelayMs, true);
  }

  /** The pointer / focus left: a request that has not started is dropped, a running one is aborted. */
  leave(roomId: string): void {
    this.cancelPending(roomId);
    this.running.get(roomId)?.abort();
  }

  /** Quiet warm-up of rooms likely to be opened next (the neighbours of the open one). Never aborts anything. */
  warm(roomIds: readonly string[]): void {
    roomIds.forEach((id, i) => this.schedule(id, this.o.warmDelayMs * (i + 1), false));
  }

  cancelAll(): void {
    for (const id of [...this.pending.keys()]) this.cancelPending(id);
    for (const c of this.running.values()) c.abort();
  }

  get inFlight(): number {
    return this.running.size;
  }

  private cancelPending(roomId: string): void {
    const h = this.pending.get(roomId);
    if (h !== undefined) this.o.timers.clear(h);
    this.pending.delete(roomId);
  }

  private schedule(roomId: string, delay: number, replace: boolean): void {
    if (this.running.has(roomId) || this.o.skip(roomId)) return;
    if (this.pending.has(roomId)) {
      if (!replace) return;
      this.cancelPending(roomId);
    }
    const handle = this.o.timers.set(() => {
      this.pending.delete(roomId);
      void this.start(roomId);
    }, delay);
    this.pending.set(roomId, handle);
  }

  private async start(roomId: string): Promise<void> {
    if (this.running.has(roomId) || this.o.skip(roomId)) return;
    if (this.running.size >= this.o.maxParallel) return;
    const controller = new AbortController();
    this.running.set(roomId, controller);
    try {
      await this.o.load(roomId, controller.signal);
    } catch {
      // a prefetch is only an optimisation: failures and aborts are silent, the visit loads normally
    } finally {
      this.running.delete(roomId);
    }
  }
}

/** The rooms most likely to be opened after `activeId`: the next and previous visible ones (the next first). */
export function likelyNeighbours(orderedIds: readonly string[], activeId: string | null | undefined, count = 2): string[] {
  const i = activeId ? orderedIds.indexOf(activeId) : -1;
  if (i === -1) return [];
  const out: string[] = [];
  for (let d = 1; out.length < count && (i + d < orderedIds.length || i - d >= 0); d += 1) {
    if (i + d < orderedIds.length) out.push(orderedIds[i + d]!);
    if (out.length < count && i - d >= 0) out.push(orderedIds[i - d]!);
  }
  return out;
}
