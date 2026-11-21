import assert from "node:assert/strict";
import test from "node:test";

import {
  activeSlashQuery, BUILTIN_COMMANDS, buildSlashCandidates, messageActions, pinnedMessages, splitThreads, threadSummary,
  type ActionRights, type StructMessage,
} from "./message-structure.ts";

const rights: ActionRights = { canEditOwn: true, canDeleteOwn: true, canDeleteOthers: false, canPin: false, canReply: true, showReactions: true };
const msg = (over: Partial<StructMessage> = {}): StructMessage => ({ id: "m1", userId: "me", type: "text", createdAt: "2026-11-21T10:00:00Z", ...over });

test("own text: edit and delete; others': neither unless moderating", () => {
  assert.deepEqual(messageActions(msg(), "me", rights), { canEdit: true, canDelete: true, canPin: false, canReply: true, canThread: true, canReact: true });
  const other = messageActions(msg({ userId: "you" }), "me", rights);
  assert.equal(other.canEdit, false);
  assert.equal(other.canDelete, false);
  const mod = messageActions(msg({ userId: "you" }), "me", { ...rights, canDeleteOthers: true, canPin: true });
  assert.equal(mod.canDelete, true);
  assert.equal(mod.canPin, true);
  assert.equal(mod.canEdit, false, "moderators delete, they do not rewrite other people");
});

test("AI, bot, system, call banners and unsent messages offer no edit", () => {
  assert.equal(messageActions(msg({ type: "ai" }), "me", rights).canEdit, false);
  assert.equal(messageActions(msg({ type: "ai_response" }), "me", rights).canEdit, false);
  assert.equal(messageActions(msg({ user: { isBot: true } }), "me", rights).canEdit, false);
  assert.equal(messageActions(msg({ type: "system" }), "me", rights).canDelete, false);
  assert.equal(messageActions(msg({ type: "call_summary" }), "me", rights).canReply, false);
  const pending = messageActions(msg({ id: "temp-123", status: "sending" }), "me", rights);
  assert.deepEqual(Object.values(pending), [false, false, false, false, false, false]);
  assert.equal(messageActions(msg({ status: "failed" }), "me", rights).canDelete, false);
});

test("a muted user (no rights) gets nothing to edit, delete, reply or react", () => {
  const none: ActionRights = { canEditOwn: false, canDeleteOwn: false, canDeleteOthers: false, canPin: false, canReply: false, showReactions: false };
  assert.deepEqual(Object.values(messageActions(msg(), "me", none)), [false, false, false, false, false, false]);
});

test("a thread reply cannot start a thread of its own", () => {
  assert.equal(messageActions(msg({ threadRootId: "root" }), "me", rights).canThread, false);
});

const thread: StructMessage[] = [
  { id: "a", userId: "u1", type: "text", createdAt: "2026-11-21T10:00:00Z" },
  { id: "b", userId: "u2", type: "text", createdAt: "2026-11-21T10:05:00Z", threadRootId: "a" },
  { id: "c", userId: "u1", type: "text", createdAt: "2026-11-21T10:02:00Z", threadRootId: "a" },
  { id: "d", userId: "u3", type: "text", createdAt: "2026-11-21T10:06:00Z" },
  { id: "e", userId: "u3", type: "text", createdAt: "2026-11-21T10:07:00Z", threadRootId: "not-loaded" },
];

test("replies leave the main flow and group under their root, oldest first", () => {
  const { main, replies } = splitThreads(thread);
  assert.deepEqual(main.map((m) => m.id), ["a", "d", "e"], "reply to an unloaded root stays visible");
  assert.deepEqual(replies.get("a")?.map((m) => m.id), ["c", "b"]);
  assert.deepEqual(threadSummary(replies.get("a")), { count: 2, lastAt: "2026-11-21T10:05:00Z" });
  assert.deepEqual(threadSummary(undefined), { count: 0, lastAt: null });
});

test("pinned messages come most recently pinned first", () => {
  const list = pinnedMessages([
    { ...thread[0], pinnedAt: "2026-11-21T11:00:00Z" },
    { ...thread[3] },
    { ...thread[1], pinnedAt: "2026-11-21T12:00:00Z" },
  ]);
  assert.deepEqual(list.map((m) => m.id), ["b", "a"]);
});

test("slash query is the command name being typed, nothing once arguments start", () => {
  assert.equal(activeSlashQuery("/"), "");
  assert.equal(activeSlashQuery("/po"), "po");
  assert.equal(activeSlashQuery("/PO"), "po");
  assert.equal(activeSlashQuery("/poll question"), null);
  assert.equal(activeSlashQuery("hola /po"), null);
  assert.equal(activeSlashQuery("/a/b"), null);
});

test("slash candidates: built-ins plus bot commands, prefix first, duplicates collapsed", () => {
  const bot = { name: "ping", description: "Pong", source: "Helper" };
  const all = [...BUILTIN_COMMANDS, bot, bot, { name: "poker", description: "", source: "Other" }];
  assert.deepEqual(buildSlashCandidates(all, "po").map((c) => c.name), ["poker", "poll"]);
  assert.deepEqual(buildSlashCandidates(all, "").map((c) => c.name), ["ping", "poker", "poll", "survey"]);
  assert.deepEqual(buildSlashCandidates(all, "zzz"), []);
  assert.equal(buildSlashCandidates(all, "", 2).length, 2);
});

test("pinned list merges loaded and fetched, loaded copy wins, unpinning removes", async () => {
  const { mergePinned, filterMessagesByText } = await import("./message-structure.ts");
  type Pin = { id: string; userId: string; type: string; createdAt: string; pinnedAt: string | null; content?: string };
  const a: Pin = { id: "a", userId: "u", type: "text", createdAt: "1", pinnedAt: "2026-11-21T10:00:00Z" };
  const b: Pin = { id: "b", userId: "u", type: "text", createdAt: "2", pinnedAt: "2026-11-21T12:00:00Z" };
  const merged = mergePinned([{ ...a, content: "live" }], [a, b]);
  assert.deepEqual(merged.map((m) => m.id), ["b", "a"]);
  assert.equal(merged.find((m) => m.id === "a")?.content, "live");
  assert.deepEqual(mergePinned([{ ...a, pinnedAt: null }], [a]).map((m) => m.id), [], "unpinned live message drops the stale pin");
  assert.deepEqual(mergePinned([], []), []);

  const msgs = [
    { id: "1", userId: "u", type: "text", createdAt: "1", content: "Reunión de planificación" },
    { id: "2", userId: "u", type: "text", createdAt: "2", content: "Café" },
  ];
  assert.deepEqual(filterMessagesByText(msgs, "reunion", (m) => m.content ?? "").map((m) => m.id), ["1"]);
  assert.deepEqual(filterMessagesByText(msgs, "  ", (m) => m.content ?? "").length, 2);
  assert.deepEqual(filterMessagesByText(msgs, "zzz", (m) => m.content ?? ""), []);
});
