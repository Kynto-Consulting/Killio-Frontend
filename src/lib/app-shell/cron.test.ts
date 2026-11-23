import { test } from "node:test";
import assert from "node:assert/strict";
import { createCronJob, deleteCronJob, listCronJobs, nextRun, parseSchedule, takeDueCronJobs } from "./cron.ts";

// A tiny localStorage for the store functions.
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v); },
  removeItem: (k: string) => { memory.delete(k); },
};

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const show = (ms: number | null) => (ms === null ? null : new Date(ms).toString().slice(0, 21));

test("reads the five fields and refuses anything else", () => {
  assert.ok(parseSchedule("0 9 * * *"));
  assert.ok(parseSchedule("*/30 * * * *"));
  assert.ok(parseSchedule("0 9,18 1-15 */2 1-5"));
  assert.deepEqual([...parseSchedule("5/20 * * * *")!.minute], [5, 25, 45]);
  assert.ok(parseSchedule("0 0 * * 7")!.weekday.has(0), "7 is Sunday too");
  for (const bad of ["", "* * * *", "* * * * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "a b c d e", "*/0 * * * *", "5-1 * * * *"]) {
    assert.equal(parseSchedule(bad), null, bad);
  }
});

test("finds the next time a schedule names", () => {
  // Monday 2026-11-23 10:17 local.
  const now = at(2026, 11, 23, 10, 17);
  assert.equal(show(nextRun("0 9 * * *", now)), show(at(2026, 11, 24, 9, 0)), "tomorrow at nine");
  assert.equal(show(nextRun("*/30 * * * *", now)), show(at(2026, 11, 23, 10, 30)));
  assert.equal(show(nextRun("17 10 * * *", now)), show(at(2026, 11, 24, 10, 17)), "never the same minute again");
  assert.equal(show(nextRun("0 9 * * 1", now)), show(at(2026, 11, 30, 9, 0)), "next Monday");
  assert.equal(show(nextRun("0 0 1 1 *", now)), show(at(2027, 1, 1, 0, 0)), "new year");
  // Day of month OR weekday when both are restricted, as cron does: the 25th (a Wednesday) comes before Friday.
  assert.equal(show(nextRun("0 8 25 * 5", now)), show(at(2026, 11, 25, 8, 0)));
  assert.equal(nextRun("0 0 31 2 *", now), null, "the 31st of February never comes");
  assert.equal(nextRun("nonsense", now), null);
});

test("jobs are kept, run once when due, and stop at their limit", () => {
  memory.clear();
  const now = at(2026, 11, 23, 10, 17);
  assert.throws(() => createCronJob({ schedule: "bad", prompt: "x" }, now));
  assert.throws(() => createCronJob({ schedule: "0 9 * * *", prompt: "  " }, now));
  const job = createCronJob({ schedule: "*/10 * * * *", prompt: "Resumen", label: "Cada diez", maxRuns: 2 }, now);
  assert.equal(show(job.nextRunAt), show(at(2026, 11, 23, 10, 20)));
  assert.equal(listCronJobs().length, 1);

  assert.equal(takeDueCronJobs(at(2026, 11, 23, 10, 19)).length, 0, "not yet");
  // The app was closed for hours: due many times over, it runs once.
  const first = takeDueCronJobs(at(2026, 11, 23, 14, 3));
  assert.equal(first.length, 1);
  assert.equal(first[0].prompt, "Resumen");
  assert.equal(show(listCronJobs()[0].nextRunAt), show(at(2026, 11, 23, 14, 10)));
  assert.equal(takeDueCronJobs(at(2026, 11, 23, 14, 4)).length, 0);

  const second = takeDueCronJobs(at(2026, 11, 23, 14, 10));
  assert.equal(second.length, 1);
  assert.equal(listCronJobs()[0].active, false, "two runs was the limit");
  assert.equal(takeDueCronJobs(at(2026, 11, 23, 15, 0)).length, 0);

  assert.equal(deleteCronJob("nope"), false);
  assert.equal(deleteCronJob(job.id), true);
  assert.equal(listCronJobs().length, 0);
});
