import test from "node:test";
import assert from "node:assert/strict";
import { PrefetchScheduler, likelyNeighbours, type PrefetchTimers } from "./prefetch.ts";

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const timers: PrefetchTimers = {
    set: (fn, ms) => { const id = ++seq; jobs.set(id, { at: now + ms, fn }); return id; },
    clear: (h) => { jobs.delete(h as number); },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, j] of [...jobs]) if (j.at <= now) { jobs.delete(id); j.fn(); }
  };
  return { timers, advance, pendingCount: () => jobs.size };
}

const tick = () => new Promise((r) => setImmediate(r));

function setup(skip: (id: string) => boolean = () => false) {
  const t = fakeTimers();
  const loaded: string[] = [];
  const aborted: string[] = [];
  const resolvers = new Map<string, () => void>();
  const s = new PrefetchScheduler({
    timers: t.timers,
    skip,
    load: (id, signal) => new Promise<void>((resolve) => {
      loaded.push(id);
      signal.addEventListener("abort", () => { aborted.push(id); resolve(); });
      resolvers.set(id, resolve);
    }),
  });
  return { s, t, loaded, aborted, finish: (id: string) => resolvers.get(id)?.() };
}

test("hover waits for the debounce before loading", async () => {
  const { s, t, loaded } = setup();
  s.hover("a");
  t.advance(100);
  assert.deepEqual(loaded, []);
  t.advance(30);
  await tick();
  assert.deepEqual(loaded, ["a"]);
});

test("leaving before the delay cancels the request (crossing the list fires nothing)", async () => {
  const { s, t, loaded } = setup();
  s.hover("a"); s.leave("a");
  s.hover("b"); s.leave("b");
  t.advance(500);
  await tick();
  assert.deepEqual(loaded, []);
  assert.equal(t.pendingCount(), 0);
});

test("leaving while a request runs aborts it", async () => {
  const { s, t, aborted } = setup();
  s.hover("a");
  t.advance(130);
  await tick();
  assert.equal(s.inFlight, 1);
  s.leave("a");
  await tick();
  assert.deepEqual(aborted, ["a"]);
  assert.equal(s.inFlight, 0);
});

test("hovering the same room again restarts the debounce instead of stacking requests", async () => {
  const { s, t, loaded } = setup();
  s.hover("a"); t.advance(100); s.hover("a"); t.advance(100);
  await tick();
  assert.deepEqual(loaded, []);
  t.advance(30);
  await tick();
  assert.deepEqual(loaded, ["a"]);
});

test("a room that needs nothing (cached and fresh, or the open one) is skipped", async () => {
  const { s, t, loaded } = setup((id) => id === "cached");
  s.hover("cached");
  t.advance(500);
  await tick();
  assert.deepEqual(loaded, []);
  assert.equal(t.pendingCount(), 0);
});

test("a room already being loaded is not requested twice", async () => {
  const { s, t, loaded } = setup();
  s.hover("a"); t.advance(130); await tick();
  s.hover("a"); t.advance(500); await tick();
  assert.deepEqual(loaded, ["a"]);
});

test("at most two requests run in parallel", async () => {
  const { s, t, loaded } = setup();
  s.hover("a"); t.advance(130); await tick();
  s.hover("b"); t.advance(130); await tick();
  s.hover("c"); t.advance(130); await tick();
  assert.deepEqual(loaded, ["a", "b"]);
  assert.equal(s.inFlight, 2);
});

test("warm-up is staggered, lower priority and is not cancelled by leaving another room", async () => {
  const { s, t, loaded } = setup();
  s.warm(["n1", "n2"]);
  s.leave("other");
  t.advance(600); await tick();
  assert.deepEqual(loaded, ["n1"]);
  t.advance(600); await tick();
  assert.deepEqual(loaded, ["n1", "n2"]);
});

test("cancelAll drops pending timers and aborts what runs", async () => {
  const { s, t, aborted, loaded } = setup();
  s.hover("a"); t.advance(130); await tick();
  s.hover("b");
  s.cancelAll();
  await tick();
  t.advance(1000); await tick();
  assert.deepEqual(aborted, ["a"]);
  assert.deepEqual(loaded, ["a"]);
});

test("a failing load is silent", async () => {
  const t = fakeTimers();
  const s = new PrefetchScheduler({ timers: t.timers, skip: () => false, load: async () => { throw new Error("boom"); } });
  s.hover("a"); t.advance(130); await tick(); await tick();
  assert.equal(s.inFlight, 0);
});

test("likelyNeighbours: next first, then previous, bounded by the list", () => {
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(likelyNeighbours(ids, "c"), ["d", "b"]);
  assert.deepEqual(likelyNeighbours(ids, "a"), ["b", "c"]);
  assert.deepEqual(likelyNeighbours(ids, "e"), ["d", "c"]);
  assert.deepEqual(likelyNeighbours(ids, "zz"), []);
  assert.deepEqual(likelyNeighbours(["a"], "a"), []);
});
