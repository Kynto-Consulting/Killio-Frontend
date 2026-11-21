import assert from "node:assert/strict";
import test from "node:test";

import {
  addDaysISO,
  blocksToBricks,
  bricksToBlocks,
  duplicateForm,
  emptyForm,
  formToInput,
  groupTagsBySection,
  localDateISO,
  offsetsOutOfOrder,
  parseOffset,
  previewForm,
  resolvedDateToIso,
  resolvedToModalState,
  templateToForm,
  toggleId,
  uniqueCopyName,
  validateForm,
} from "./model.ts";

let n = 0;
const makeId = () => `id${++n}`;

const template = {
  id: "t1",
  boardId: "b1",
  name: "Digital - Bug",
  description: null,
  icon: "🐞",
  color: null,
  position: 0,
  titlePattern: "[{date}] ",
  targetListId: "l2",
  tagIds: ["g1", "g2"],
  assigneeUserIds: ["u1"],
  assigneeGroupIds: ["grp1"],
  startOffsetDays: 0,
  dueOffsetDays: 5,
  blocks: [
    { kind: "text" as const, displayStyle: "paragraph" as const, markdown: "## Qué ocurre\n\n## Workaround" },
    { kind: "checklist" as const, items: [{ id: "c1", label: "Reproducir", checked: false }] },
  ],
};

test("localDateISO uses the local calendar day", () => {
  assert.equal(localDateISO(new Date(2026, 10, 19, 23, 59)), "2026-11-19");
  assert.equal(localDateISO(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
});

test("addDaysISO crosses month and year, including negatives", () => {
  assert.equal(addDaysISO("2026-11-30", 1), "2026-12-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysISO("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysISO("garbage", 1), null);
});

test("parseOffset: empty is null, integers pass, junk and out-of-range fail", () => {
  assert.deepEqual(parseOffset(""), { ok: true, value: null });
  assert.deepEqual(parseOffset("  "), { ok: true, value: null });
  assert.deepEqual(parseOffset(null), { ok: true, value: null });
  assert.deepEqual(parseOffset("7"), { ok: true, value: 7 });
  assert.deepEqual(parseOffset("-3"), { ok: true, value: -3 });
  assert.deepEqual(parseOffset("+2"), { ok: true, value: 2 });
  assert.deepEqual(parseOffset("-0"), { ok: true, value: 0 });
  assert.deepEqual(parseOffset(4), { ok: true, value: 4 });
  assert.deepEqual(parseOffset("1.5"), { ok: false, error: "integer" });
  assert.deepEqual(parseOffset("abc"), { ok: false, error: "integer" });
  assert.deepEqual(parseOffset("3651"), { ok: false, error: "range" });
  assert.deepEqual(parseOffset("-3651"), { ok: false, error: "range" });
  assert.deepEqual(parseOffset("3650"), { ok: true, value: 3650 });
});

test("offsetsOutOfOrder only when both are set and due is before start", () => {
  assert.equal(offsetsOutOfOrder(0, 5), false);
  assert.equal(offsetsOutOfOrder(5, 5), false);
  assert.equal(offsetsOutOfOrder(5, 2), true);
  assert.equal(offsetsOutOfOrder(null, -4), false);
  assert.equal(offsetsOutOfOrder(3, null), false);
});

test("resolvedDateToIso keeps timestamps and turns bare days into local midnight", () => {
  assert.equal(resolvedDateToIso(null), null);
  assert.equal(resolvedDateToIso("nope"), null);
  assert.equal(resolvedDateToIso("2026-11-19T10:00:00.000Z"), "2026-11-19T10:00:00.000Z");
  assert.equal(resolvedDateToIso("2026-11-19"), new Date(2026, 10, 19).toISOString());
});

test("blocks round-trip through bricks; empty text and unknown kinds are dropped", () => {
  const bricks = blocksToBricks([...template.blocks, { kind: "weird" } as any, null], makeId);
  assert.equal(bricks.length, 2);
  assert.deepEqual(bricks.map((b) => b.position), [1000, 2000]);
  assert.ok(bricks.every((b) => b.parentBlockId === null && b.id));
  assert.deepEqual(bricksToBlocks(bricks), template.blocks);

  const withEmpty = [...bricks, ...blocksToBricks([{ kind: "text", displayStyle: "paragraph", markdown: "   " }], makeId)];
  assert.equal(bricksToBlocks(withEmpty).length, 2);
});

test("bricksToBlocks follows position order and ignores nested bricks", () => {
  const [a, b] = blocksToBricks(template.blocks, makeId);
  const reordered = [{ ...a, position: 5000 }, { ...b, position: 10 }, { ...b, id: "child", parentBlockId: "x", position: 1 }];
  const out = bricksToBlocks(reordered as any);
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, "checklist");
  assert.equal(out[1].kind, "text");
});

test("resolvedToModalState fills tags, assignees, dates, blocks and reports unknown tags and warnings", () => {
  const state = resolvedToModalState(
    {
      listId: "l2",
      title: "[2026-11-19] ",
      startAt: "2026-11-19",
      dueAt: "2026-11-24T00:00:00.000Z",
      tagIds: ["g1", "gone", "g1", "g2"],
      assigneeIds: ["u1", "u9", "u1"],
      blocks: template.blocks,
      warnings: ["tag removed", ""],
    },
    {
      tags: [{ id: "g1", name: "Bug", color: "ef4444" }, { id: "g2", name: "Alta" }],
      members: [{ id: "u1", name: "Ana", email: "ana@x.test", avatarUrl: "a.png" }],
      makeId,
    },
  );
  assert.equal(state.listId, "l2");
  assert.equal(state.title, "[2026-11-19] ");
  assert.deepEqual(state.tags.map((t) => t.id), ["g1", "g2"]);
  assert.deepEqual(state.unknownTagIds, ["gone"]);
  assert.deepEqual(state.assignees.map((a) => a.id), ["u1", "u9"]);
  assert.equal(state.assignees[0].name, "Ana");
  assert.equal(state.assignees[0].avatar_url, "a.png");
  assert.equal(state.assignees[1].name, "");
  assert.equal(state.startAt, new Date(2026, 10, 19).toISOString());
  assert.equal(state.dueAt, "2026-11-24T00:00:00.000Z");
  assert.equal(state.blocks.length, 2);
  assert.deepEqual(state.warnings, ["tag removed"]);
});

test("resolvedToModalState tolerates a sparse response", () => {
  const state = resolvedToModalState({ listId: "l1", title: "", startAt: null, dueAt: null } as any, { tags: [], members: [], makeId });
  assert.deepEqual([state.tags, state.assignees, state.blocks, state.warnings], [[], [], [], []]);
  assert.equal(state.startAt, null);
});

test("templateToForm -> formToInput returns the same DTO content", () => {
  const form = templateToForm(template, makeId);
  assert.equal(form.startOffset, "0");
  assert.equal(form.dueOffset, "5");
  assert.equal(form.targetListId, "l2");
  const res = formToInput(form);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.value.name, "Digital - Bug");
  assert.equal(res.value.description, null);
  assert.equal(res.value.startOffsetDays, 0);
  assert.equal(res.value.dueOffsetDays, 5);
  assert.equal(res.value.targetListId, "l2");
  assert.deepEqual(res.value.tagIds, ["g1", "g2"]);
  assert.deepEqual(res.value.assigneeGroupIds, ["grp1"]);
  assert.deepEqual(res.value.blocks, template.blocks);
});

test("formToInput normalises: blanks become null, ids are deduplicated, name is trimmed", () => {
  const res = formToInput({ ...emptyForm(), name: "  Tarea ", tagIds: ["a", "a", "", "b"], startOffset: " ", dueOffset: "-2", icon: " " });
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.value.name, "Tarea");
  assert.equal(res.value.icon, null);
  assert.equal(res.value.targetListId, null);
  assert.equal(res.value.startOffsetDays, null);
  assert.equal(res.value.dueOffsetDays, -2);
  assert.deepEqual(res.value.tagIds, ["a", "b"]);
});

test("validateForm reports every problem with a key", () => {
  assert.deepEqual(validateForm(emptyForm()), { name: "nameRequired" });
  const bad = validateForm({ ...emptyForm(), name: "x".repeat(61), startOffset: "1.5", dueOffset: "99999", titlePattern: "y".repeat(201) });
  assert.equal(bad.name, "nameTooLong");
  assert.equal(bad.startOffset, "startInvalid");
  assert.equal(bad.dueOffset, "dueRange");
  assert.equal(bad.titlePattern, "titleTooLong");
  assert.equal(validateForm({ ...emptyForm(), name: "a", startOffset: "5", dueOffset: "1" }).dueOffset, "dueBeforeStart");
  assert.equal(validateForm({ ...emptyForm(), name: "a", tagIds: Array.from({ length: 51 }, (_, i) => `t${i}`) }).tagIds, "tooManyTags");
  const res = formToInput({ ...emptyForm(), name: "" });
  assert.equal(res.ok, false);
});

test("uniqueCopyName and duplicateForm give a free name within the limit and fresh block ids", () => {
  assert.equal(uniqueCopyName("Bug", ["Bug"], "(copy)"), "Bug (copy)");
  assert.equal(uniqueCopyName("Bug", ["Bug", "bug (COPY)"], "(copy)"), "Bug (copy) 2");
  const long = "z".repeat(60);
  const copy = uniqueCopyName(long, [long], "(copy)");
  assert.ok(copy.length <= 60);
  assert.ok(copy.endsWith("(copy)"));

  const form = templateToForm(template, makeId);
  const dup = duplicateForm(form, ["Digital - Bug"], "(copy)", makeId);
  assert.equal(dup.name, "Digital - Bug (copy)");
  assert.notEqual(dup.blocks[0].id, form.blocks[0].id);
  assert.deepEqual(bricksToBlocks(dup.blocks), bricksToBlocks(form.blocks));
});

test("toggleId adds and removes", () => {
  assert.deepEqual(toggleId(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleId(["a", "b"], "a"), ["b"]);
});

test("groupTagsBySection matches team tag groups by name and keeps the rest last", () => {
  const tags = [{ id: "1", name: "Dropout" }, { id: "2", name: "TI" }, { id: "3", name: "0" }, { id: "4", name: "Suelta" }, { id: "5", name: "ti" }];
  const sections = groupTagsBySection(
    tags,
    [
      { id: "g-resp", name: "Responsable", tags: ["dropout", "TI", "Digital"] },
      { id: "g-prio", name: "Prioridad", tags: ["0", "1"] },
      { id: "g-empty", name: "Vacío", tags: ["nada"] },
    ],
    "Otros",
  );
  assert.deepEqual(sections.map((s) => s.name), ["Responsable", "Prioridad", "Otros"]);
  assert.deepEqual(sections[0].tags.map((t) => t.id), ["1", "2", "5"]);
  assert.deepEqual(sections[2].tags.map((t) => t.id), ["4"]);
  assert.deepEqual(groupTagsBySection(tags, [], "Otros").map((s) => s.name), ["Otros"]);
});

test("previewForm estimates title, dates and counts, and flags dangling ids", () => {
  const form = { ...templateToForm(template, makeId), tagIds: ["g1", "ghost"], assigneeUserIds: ["u1", "u404"] };
  const p = previewForm(form, "2026-11-19", {
    tags: [{ id: "g1", name: "Bug" }],
    members: [{ id: "u1", name: "Ana" }],
    groups: [{ id: "grp1", name: "Digital" }],
    lists: [{ id: "l2", name: "4.1 En espera" }],
  });
  assert.equal(p.title, "[2026-11-19] ");
  assert.equal(p.startDay, "2026-11-19");
  assert.equal(p.dueDay, "2026-11-24");
  assert.deepEqual(p.tagNames, ["Bug"]);
  assert.deepEqual(p.assigneeNames, ["Ana"]);
  assert.deepEqual(p.groupNames, ["Digital"]);
  assert.equal(p.listName, "4.1 En espera");
  assert.equal(p.blockCount, 2);
  assert.equal(p.missing, 2);

  const none = previewForm(emptyForm(), "2026-11-19", { tags: [], members: [], groups: [], lists: [] });
  assert.equal(none.startDay, null);
  assert.equal(none.dueDay, null);
  assert.equal(none.listName, null);
});

test("blocksToBricks accepts the document shape ({ content: { markdown } }) as well as the flat card shape", () => {
  let n = 0;
  const id = () => `b${++n}`;
  const flat = blocksToBricks([{ kind: "text", displayStyle: "paragraph", markdown: "A" } as never], id);
  const nested = blocksToBricks([{ kind: "text", content: { markdown: "B", displayStyle: "h2" } } as never], id);
  assert.equal((flat[0] as { markdown: string }).markdown, "A");
  assert.equal((nested[0] as { markdown: string }).markdown, "B");
  assert.equal((nested[0] as { displayStyle: string }).displayStyle, "h2");
});
