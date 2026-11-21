import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSidebarModel, categoryOrder, dmDisplayName, isEntityRoom, isSectionCollapsed, moveCategory, reorderCategory, sortCategories, totalBadges,
  type LayoutRoom,
} from "./channel-layout.ts";

const cats = [
  { id: "c2", name: "Equipo", sortOrder: 1 },
  { id: "c1", name: "General", sortOrder: 0 },
  { id: "c3", name: "Archivo", sortOrder: 1 },
];

test("categories are ordered by sortOrder, ties by name", () => {
  assert.deepEqual(sortCategories(cats).map((c) => c.id), ["c1", "c3", "c2"]);
  assert.deepEqual(categoryOrder(cats), ["c1", "c3", "c2"]);
});

test("moveCategory swaps neighbours and ignores edges and unknown ids", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(moveCategory(order, "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveCategory(order, "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveCategory(order, "a", -1), order);
  assert.deepEqual(moveCategory(order, "c", 1), order);
  assert.deepEqual(moveCategory(order, "zzz", 1), order);
  assert.notEqual(moveCategory(order, "a", -1), order, "returns a copy");
});

test("reorderCategory puts the dragged item at the target slot", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(reorderCategory(order, "a", "c"), ["b", "c", "a", "d"]);
  assert.deepEqual(reorderCategory(order, "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(reorderCategory(order, "b", "b"), order);
  assert.deepEqual(reorderCategory(order, "x", "b"), order);
});

const rooms: LayoutRoom[] = [
  { id: "r1", name: "general", type: "channel", groupId: "c1", unreadCount: 2, mentionCount: 1 },
  { id: "r2", name: "anuncios", type: "channel", categoryId: "c1", channelType: "announcement", position: 0 },
  { id: "r3", name: "suelto", type: "channel", groupId: "borrada" },
  { id: "r4", name: "Plan Q3", type: "thread", linkedEntityType: "document", linkedEntityId: "d1", unreadCount: 5 },
  { id: "r5", name: "Sprint", type: "thread", linkedEntityType: "board", linkedEntityId: "b1" },
  { id: "r6", name: "Ana, Luis", type: "dm" },
  { id: "r7", name: "vault chat", type: "channel", linkedEntityType: "vault_conversation" },
  { id: "r8", name: "ruidoso", type: "channel", groupId: "c1", unreadCount: 9, mentionCount: 3, muted: true },
];

test("channels, entity rooms and DMs are never mixed", () => {
  const model = buildSidebarModel(rooms, cats);
  const channelIds = model.categories.flatMap((c) => c.rooms.map((r) => r.id));
  assert.deepEqual(channelIds.sort(), ["r1", "r2", "r3", "r7", "r8"]);
  assert.deepEqual(model.entityGroups.map((g) => g.entityType), ["document", "board"]);
  assert.deepEqual(model.directMessages.map((r) => r.id), ["r6"]);
  assert.equal(rooms.filter(isEntityRoom).length, 2, "vault conversation is not an entity room");
});

test("channels of an unknown category fall into the uncategorized block, which comes first", () => {
  const model = buildSidebarModel(rooms, cats);
  assert.equal(model.categories[0].category, null);
  assert.deepEqual(model.categories[0].rooms.map((r) => r.id).sort(), ["r3", "r7"]);
  assert.deepEqual(model.categories.slice(1).map((c) => c.category?.id), ["c1", "c3", "c2"]);
});

test("channels inside a category follow position, then name; empty categories are kept", () => {
  const model = buildSidebarModel(rooms, cats);
  const general = model.categories.find((c) => c.category?.id === "c1")!;
  assert.deepEqual(general.rooms.map((r) => r.id), ["r2", "r1", "r8"]);
  assert.equal(model.categories.find((c) => c.category?.id === "c2")!.rooms.length, 0);
});

test("muted rooms do not raise the badge of their category", () => {
  const model = buildSidebarModel(rooms, cats);
  const general = model.categories.find((c) => c.category?.id === "c1")!;
  assert.equal(general.unread, 2);
  assert.equal(general.mentions, 1);
  assert.deepEqual(totalBadges(model), { unread: 7, mentions: 1 });
});

test("unknown entity types are grouped last under their own name", () => {
  const model = buildSidebarModel([
    { id: "a", name: "z", type: "thread", linkedEntityType: "script" },
    { id: "b", name: "y", type: "thread", linkedEntityType: "card" },
    { id: "c", name: "x", type: "thread" },
  ], []);
  assert.deepEqual(model.entityGroups.map((g) => g.entityType), ["card", "other", "script"]);
});

test("a DM is titled after the other person", () => {
  assert.equal(dmDisplayName({ name: "Ana, Luis" }, ["Ana"]), "Luis");
  assert.equal(dmDisplayName({ name: "Ana, Luis" }, ["luis", "luis@x.com"]), "Ana");
  assert.equal(dmDisplayName({ name: "Ana, Luis" }, ["Ana"], "Luis Perez"), "Luis Perez");
  assert.equal(dmDisplayName({ name: "Ana, Luis" }, [null, undefined]), "Ana, Luis", "unknown viewer: keep the text");
  assert.equal(dmDisplayName({ name: "Ana, Ana" }, ["Ana"]), "Ana, Ana", "same name twice: nothing left to show");
  assert.equal(dmDisplayName({ name: "Ana, Luis" }, ["Pedro"]), "Ana, Luis");
});

test("collapsed state: explicit choice beats the default", () => {
  assert.equal(isSectionCollapsed({}, "entities", true), true);
  assert.equal(isSectionCollapsed({ entities: false }, "entities", true), false);
  assert.equal(isSectionCollapsed({}, "cat:1"), false);
});
