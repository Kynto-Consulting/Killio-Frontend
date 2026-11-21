import test from "node:test";
import assert from "node:assert/strict";
import { createKqlScheduler } from "./scheduler.ts";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setImmediate(r));

test("identical keys share one in-flight call", async () => {
  const s = createKqlScheduler();
  let calls = 0;
  const d = deferred<number>();
  const task = () => { calls++; return d.promise; };
  const ps = Array.from({ length: 50 }, () => s.run("k", task));
  d.resolve(7);
  assert.deepEqual(await Promise.all(ps), Array(50).fill(7));
  assert.equal(calls, 1);
});

test("never more than 4 tasks at once, all complete in order", async () => {
  const s = createKqlScheduler({ concurrency: 4 });
  let running = 0;
  let peak = 0;
  const gates = Array.from({ length: 100 }, () => deferred<number>());
  const ps = gates.map((g, i) => s.run(`k${i}`, async () => {
    running++; peak = Math.max(peak, running);
    const v = await g.promise;
    running--;
    return v;
  }));
  await tick();
  assert.equal(s.stats().active, 4);
  assert.equal(s.stats().queued, 96);
  for (let i = 0; i < gates.length; i++) { gates[i].resolve(i); await tick(); }
  assert.deepEqual(await Promise.all(ps), gates.map((_, i) => i));
  assert.equal(peak, 4);
  assert.equal(s.stats().active, 0);
});

test("cache respects ttl and force", async () => {
  let t = 0;
  const s = createKqlScheduler({ ttlMs: 1000, now: () => t });
  let calls = 0;
  const task = async () => ++calls;
  assert.equal(await s.run("k", task), 1);
  assert.equal(await s.run("k", task), 1);
  assert.equal(s.peek("k"), 1);
  t = 1500;
  assert.equal(s.peek("k"), undefined);
  assert.equal(await s.run("k", task), 2);
  assert.equal(await s.run("k", task, { force: true }), 3);
  s.invalidate("k");
  assert.equal(await s.run("k", task), 4);
});

test("failures are not cached and free their slot", async () => {
  const s = createKqlScheduler({ concurrency: 1 });
  let n = 0;
  await assert.rejects(s.run("k", async () => { n++; throw new Error("boom"); }), /boom/);
  assert.equal(s.stats().active, 0);
  assert.equal(await s.run("k", async () => { n++; return "ok"; }), "ok");
  assert.equal(n, 2);
  await assert.rejects(s.run("sync", () => { throw new Error("sync"); }), /sync/);
  assert.equal(await s.run("after", async () => 1), 1);
});
