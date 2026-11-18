/**
 * Dedupe + cache + concurrency cap for pill queries. Pure (no React, no fetch): the task is injected.
 * Identical keys share one in-flight promise; finished results are reused for `ttlMs`; at most
 * `concurrency` tasks run at once, the rest wait in FIFO order.
 */
export interface KqlSchedulerOptions {
  concurrency?: number;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export interface KqlScheduler {
  run<T>(key: string, task: () => Promise<T>, opts?: { force?: boolean }): Promise<T>;
  /** Drops cached results (one key, or all). In-flight work is left alone. */
  invalidate(key?: string): void;
  /** The cached value if still fresh. */
  peek<T>(key: string): T | undefined;
  stats(): { active: number; queued: number; inflight: number; cached: number };
}

export function createKqlScheduler(options: KqlSchedulerOptions = {}): KqlScheduler {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const ttlMs = options.ttlMs ?? 30_000;
  const maxEntries = options.maxEntries ?? 200;
  const now = options.now ?? (() => Date.now());

  const cache = new Map<string, { at: number; value: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();
  const queue: Array<() => void> = [];
  let active = 0;

  const pump = () => {
    while (active < concurrency && queue.length > 0) {
      const start = queue.shift()!;
      active++;
      start();
    }
  };

  const fresh = (key: string): { at: number; value: unknown } | undefined => {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (now() - hit.at > ttlMs) {
      cache.delete(key);
      return undefined;
    }
    return hit;
  };

  return {
    run<T>(key: string, task: () => Promise<T>, opts: { force?: boolean } = {}): Promise<T> {
      if (!opts.force) {
        const hit = fresh(key);
        if (hit) return Promise.resolve(hit.value as T);
        const running = inflight.get(key);
        if (running) return running as Promise<T>;
      } else {
        cache.delete(key);
      }
      const promise = new Promise<T>((resolve, reject) => {
        queue.push(() => {
          let p: Promise<T>;
          try {
            p = Promise.resolve(task());
          } catch (e) {
            p = Promise.reject(e);
          }
          const done = () => {
            active--;
            if (inflight.get(key) === promise) inflight.delete(key);
          };
          p.then(
            (value) => {
              cache.set(key, { at: now(), value });
              while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
              done();
              resolve(value);
              pump();
            },
            (err) => {
              done();
              reject(err);
              pump();
            },
          );
        });
      });
      inflight.set(key, promise);
      // Avoid unhandled-rejection noise for fire-and-forget callers; awaiting callers still see it.
      promise.catch(() => undefined);
      pump();
      return promise;
    },
    invalidate(key?: string) {
      if (key === undefined) cache.clear();
      else cache.delete(key);
    },
    peek<T>(key: string): T | undefined {
      return fresh(key)?.value as T | undefined;
    },
    stats() {
      return { active, queued: queue.length, inflight: inflight.size, cached: cache.size };
    },
  };
}
