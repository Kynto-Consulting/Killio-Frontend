import assert from "node:assert/strict";
import test from "node:test";

import { cardProgress, cardSpan, getGanttWindow, initials, layoutBar, nameHue, nowPosition, startOfWeekMonday } from "./gantt-layout.ts";

const d = (iso: string) => new Date(iso);

test("weeks start on Monday and windows are aligned", () => {
  assert.equal(startOfWeekMonday(d("2026-11-18T15:00:00")).getDay(), 1);
  assert.equal(startOfWeekMonday(d("2026-11-22T10:00:00")).getDate(), 16); // Sunday -> the Monday before
  const week = getGanttWindow("week", d("2026-11-18T12:00:00"), 0);
  assert.equal(week.units.length, 7);
  assert.equal(new Date(week.startMs).getDate(), 16);
  assert.equal(getGanttWindow("month", d("2026-11-18T12:00:00"), 0).units.length, 35);
  assert.equal(getGanttWindow("day", d("2026-11-18T12:00:00"), 0).units.length, 24);
  const next = getGanttWindow("week", d("2026-11-18T12:00:00"), 1);
  assert.equal(new Date(next.startMs).getDate(), 23);
});

test("a card with both dates spans them; with one date it covers that day", () => {
  const both = cardSpan({ startAt: "2026-11-17T09:00:00", dueAt: "2026-11-19T17:00:00" })!;
  assert.equal(both.single, false);
  assert.ok(both.endMs > both.startMs);
  const one = cardSpan({ dueAt: "2026-11-18T14:00:00" })!;
  assert.equal(one.single, true);
  assert.ok(one.endMs - one.startMs >= 23 * 3_600_000 && one.endMs - one.startMs <= 25 * 3_600_000, "one calendar day (DST-safe)");
  assert.equal(cardSpan({}), null);
  assert.equal(cardSpan({ startAt: "nonsense" }), null);
  // a date without time covers the whole due day
  const dateOnly = cardSpan({ startAt: "2026-11-16T00:00:00", dueAt: "2026-11-18T00:00:00" })!;
  assert.equal(new Date(dateOnly.endMs).getDate(), 19);
  // reversed dates are fixed
  const reversed = cardSpan({ startAt: "2026-11-19T10:00:00", dueAt: "2026-11-17T10:00:00" })!;
  assert.ok(reversed.startMs < reversed.endMs);
});

test("bars are clipped to the window and flag the clipped side", () => {
  const week = getGanttWindow("week", d("2026-11-18T12:00:00"), 0);
  const inside = layoutBar(cardSpan({ startAt: "2026-11-17T00:00:00", dueAt: "2026-11-18T00:00:00" })!, week)!;
  assert.ok(inside.leftPct > 0 && inside.widthPct > 0 && !inside.clippedLeft && !inside.clippedRight);
  assert.ok(Math.abs(inside.leftPct - (1 / 7) * 100) < 0.01);
  assert.ok(Math.abs(inside.widthPct - (2 / 7) * 100) < 0.01);
  const long = layoutBar(cardSpan({ startAt: "2026-11-01T00:00:00", dueAt: "2026-12-30T00:00:00" })!, week)!;
  assert.equal(long.leftPct, 0);
  assert.equal(long.widthPct, 100);
  assert.ok(long.clippedLeft && long.clippedRight);
  assert.equal(layoutBar(cardSpan({ dueAt: "2026-12-30T10:00:00" })!, week), null);
  assert.equal(layoutBar(cardSpan({ dueAt: "2026-11-02T10:00:00" })!, week), null);
  // never wider than what is left of the window
  const edge = layoutBar(cardSpan({ dueAt: "2026-11-22T10:00:00" })!, week)!;
  assert.ok(edge.leftPct + edge.widthPct <= 100.0001);
});

test("progress comes from the checklist, or 100 when the card is done", () => {
  assert.equal(cardProgress({ completedAt: "2026-11-01" }), 100);
  assert.equal(cardProgress({ status: "done" }), 100);
  assert.equal(cardProgress({}), 0);
  assert.equal(cardProgress({ blocks: [{ kind: "text", displayStyle: "paragraph" }] }), 0);
  const blocks = [
    { kind: "text", displayStyle: "checklist", tasks: [{ checked: true }, { checked: false }] },
    { kind: "text", displayStyle: "checklist", tasks: [{ checked: true }, { checked: true }] },
  ];
  assert.equal(cardProgress({ blocks }), 75);
});

test("the today line sits inside the window only", () => {
  const week = getGanttWindow("week", d("2026-11-18T12:00:00"), 0);
  const mid = nowPosition(week, d("2026-11-19T12:00:00").getTime())!;
  assert.ok(Math.abs(mid - 50) < 0.5, `Thursday noon is the middle of the week, got ${mid}`);
  assert.equal(nowPosition(week, d("2026-12-01T00:00:00").getTime()), null);
});

test("initials and colours are stable", () => {
  assert.equal(initials("Ana Torres"), "AT");
  assert.equal(initials("luis@labroe.com"), "LL");
  assert.equal(initials("Marta"), "MA");
  assert.equal(initials(""), "?");
  assert.equal(nameHue("Ana"), nameHue("Ana"));
  assert.ok(nameHue("Ana") >= 0 && nameHue("Ana") < 360);
});
