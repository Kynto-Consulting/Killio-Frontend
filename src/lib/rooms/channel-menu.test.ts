import test from "node:test";
import assert from "node:assert/strict";
import { buildChannelMenu, channelUrl, focusableIds, stepIndex, type ChannelMenuInput } from "./channel-menu.ts";

const base: ChannelMenuInput = { roomType: "channel", unread: false, notifPref: "all", canManage: false, canDelete: false };
const flat = (i: Partial<ChannelMenuInput>) => buildChannelMenu({ ...base, ...i }).flat();
const idsOf = (i: Partial<ChannelMenuInput>) => flat(i).map((x) => x.id);

test("a plain member sees mark as read, notifications and copy link only", () => {
  assert.deepEqual(idsOf({}), ["markRead", "notifications", "copyLink"]);
});

test("mark as read is disabled with nothing unread and enabled otherwise", () => {
  assert.equal(flat({ unread: false })[0]!.disabled, true);
  assert.equal(flat({ unread: true })[0]!.disabled, false);
  assert.ok(!focusableIds(buildChannelMenu({ ...base })).includes("markRead"));
  assert.ok(focusableIds(buildChannelMenu({ ...base, unread: true })).includes("markRead"));
});

test("channel settings appear only for who can manage the channel", () => {
  assert.ok(!idsOf({ canManage: false }).includes("settings"));
  assert.ok(idsOf({ canManage: true }).includes("settings"));
});

test("delete needs the delete permission, comes last and is destructive", () => {
  assert.ok(!idsOf({ canManage: true }).includes("delete"));
  const items = flat({ canManage: true, canDelete: true });
  assert.equal(items[items.length - 1]!.id, "delete");
  assert.equal(items[items.length - 1]!.destructive, true);
});

test("direct messages, threads and the assistant room have no settings or delete; entity rooms keep settings but cannot be deleted here", () => {
  for (const extra of [{ roomType: "dm" }, { roomType: "thread" }, { isAiRoom: true }] as Partial<ChannelMenuInput>[]) {
    const ids = idsOf({ ...extra, canManage: true, canDelete: true });
    assert.ok(!ids.includes("settings") && !ids.includes("delete"), JSON.stringify(extra));
    assert.ok(ids.includes("notifications") && ids.includes("copyLink"));
  }
  const entity = idsOf({ linkedEntity: true, canManage: true, canDelete: true });
  assert.ok(entity.includes("settings"));
  assert.ok(!entity.includes("delete"));
});

const headerActions = { members: { count: 4 }, pins: { count: 2 }, bookmarks: true, copilot: true, transcripts: true, linked: true } as const;

test("from the sidebar row the menu has no header actions", () => {
  const ids = idsOf({ canManage: true, canDelete: true });
  assert.ok(!ids.some((id) => id.startsWith("h:")));
});

test("from the small header the same menu gets a first section with the actions the header hides", () => {
  const sections = buildChannelMenu({ ...base, headerActions: { ...headerActions } });
  assert.deepEqual(sections[0]!.map((x) => x.id), ["h:members", "h:pins", "h:bookmarks", "h:copilot", "h:transcripts", "h:linked"]);
  assert.equal(sections[0]![0]!.count, 4);
  assert.equal(sections[0]![1]!.count, 2);
  // below it, exactly the sidebar menu
  const plain = buildChannelMenu({ ...base }).flat().map((x) => x.id);
  assert.deepEqual(sections.slice(1).flat().map((x) => x.id), plain);
});

test("header actions respect what the room offers (no members in a DM, no transcripts, no linked entity)", () => {
  const sections = buildChannelMenu({ ...base, headerActions: { members: false, pins: { count: 0 }, bookmarks: false, copilot: true, transcripts: false, linked: false } });
  assert.deepEqual(sections[0]!.map((x) => x.id), ["h:pins", "h:copilot"]);
});

test("permissions apply the same from the header: settings and delete only for who can", () => {
  const member = buildChannelMenu({ ...base, headerActions: { ...headerActions } }).flat().map((x) => x.id);
  assert.ok(!member.includes("settings") && !member.includes("delete"));
  const admin = buildChannelMenu({ ...base, canManage: true, canDelete: true, headerActions: { ...headerActions } }).flat().map((x) => x.id);
  assert.ok(admin.includes("settings") && admin.includes("delete"));
});

test("notifications is a submenu with the three real preferences and the current one checked", () => {
  const n = flat({ notifPref: "mentions" }).find((x) => x.id === "notifications")!;
  assert.equal(n.submenu, true);
  assert.deepEqual(n.children!.map((c) => c.id), ["notif:all", "notif:mentions", "notif:none"]);
  assert.deepEqual(n.children!.map((c) => c.checked), [false, true, false]);
  const unknown = flat({ notifPref: null }).find((x) => x.id === "notifications")!;
  assert.ok(unknown.children!.every((c) => !c.checked));
});

test("no timed-mute items are offered (the backend has none)", () => {
  const all = JSON.stringify(buildChannelMenu({ ...base, canManage: true, canDelete: true }));
  assert.ok(!/15|hour|minute|until/i.test(all));
});

test("stepIndex wraps in both directions and starts at the ends", () => {
  assert.equal(stepIndex(-1, 1, 3), 0);
  assert.equal(stepIndex(-1, -1, 3), 2);
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(0, 1, 0), -1);
});

test("channelUrl joins origin and room id without double slashes", () => {
  assert.equal(channelUrl("https://app.killio.dev/", "abc"), "https://app.killio.dev/rooms/abc");
});
