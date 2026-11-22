import assert from "node:assert/strict";
import test from "node:test";

import {
  activityRows, badgeRoles, bannerButtons, bioPreview, canOpenModeration, dmKeyAction, formatCounter, moderationActions, moderationSummary, moreItems, profileLink,
  roleOverflow, searchChipsFor, showDmField, type CompactContext,
} from "./user-profile-compact.ts";
import type { ProfileRole } from "./user-profile.ts";

const role = (id: string, position: number, inherited = false): ProfileRole => ({ id, name: id, color: null, position, inherited });
const ctx = (over: Partial<CompactContext> = {}): CompactContext => ({ isSelf: false, isBot: false, isCopilot: false, canMention: true, canModerate: false, canSendDm: true, canLink: true, ...over });

// ── biography ──────────────────────────────────────────────────────────────

test("a short bio is shown whole with no 'see all' link", () => {
  assert.deepEqual(bioPreview("Hola, soy Ana."), { text: "Hola, soy Ana.", truncated: false });
  assert.deepEqual(bioPreview("   "), { text: "", truncated: false });
  assert.deepEqual(bioPreview(null), { text: "", truncated: false });
  assert.deepEqual(bioPreview("uno\ndos\ntres"), { text: "uno\ndos\ntres", truncated: false }, "exactly three lines still fits");
});

test("more than three lines or ~160 characters is clipped, at a word, with an ellipsis", () => {
  const lines = bioPreview("a\nb\nc\nd");
  assert.equal(lines.truncated, true);
  assert.equal(lines.text, "a\nb\nc…");
  const long = "palabra ".repeat(40).trim();
  const p = bioPreview(long);
  assert.equal(p.truncated, true);
  assert.ok(p.text.length <= 161 && p.text.endsWith("palabra…"), p.text.slice(-12));
  const unbroken = bioPreview("x".repeat(500));
  assert.equal(unbroken.text.length, 161, "no space to cut at: hard cut");
});

// ── roles ──────────────────────────────────────────────────────────────────

test("roles: highest first, the rest behind +N, and expanding shows them all", () => {
  const roles = [role("a", 1), role("b", 5), role("c", 3), role("d", 9), role("e", 2), role("f", 4)];
  const r = roleOverflow(roles, 4);
  assert.deepEqual(r.visible.map((x) => x.id), ["d", "b", "f", "c"]);
  assert.equal(r.hidden, 2);
  assert.equal(roleOverflow(roles, 4, true).visible.length, 6);
  assert.equal(roleOverflow(roles, 4, true).hidden, 0);
  assert.deepEqual(roleOverflow(roles.slice(0, 4), 4), { visible: roleOverflow(roles.slice(0, 4), 4).visible, hidden: 0 }, "exactly max: no +N");
});

test("badges next to the name: the two highest roles the person holds themselves", () => {
  const b = badgeRoles([role("low", 1), role("grp", 99, true), role("top", 50), role("mid", 20)]);
  assert.deepEqual(b.map((r) => r.id), ["top", "mid"]);
});

// ── buttons ────────────────────────────────────────────────────────────────

test("banner: the moderator button only for moderators and never on your own card; the AI copilot has none", () => {
  assert.deepEqual(bannerButtons(ctx()), ["more"]);
  assert.deepEqual(bannerButtons(ctx({ canModerate: true })), ["moderate", "more"]);
  assert.deepEqual(bannerButtons(ctx({ canModerate: true, isSelf: true })), ["more"]);
  assert.deepEqual(bannerButtons(ctx({ isCopilot: true, canModerate: true })), []);
});

test("More menu: mention, copy id, copy link; Edit profile only on your own card; no big buttons left", () => {
  assert.deepEqual(moreItems(ctx()), ["mention", "copyId", "copyLink"]);
  assert.deepEqual(moreItems(ctx({ isSelf: true })), ["copyId", "copyLink", "editProfile"]);
  assert.deepEqual(moreItems(ctx({ canMention: false, canLink: false })), ["copyId"]);
  assert.deepEqual(moreItems(ctx({ isCopilot: true })), []);
});

test("the DM field: other humans only; bots only when a DM with bots exists; never yourself or the copilot", () => {
  assert.equal(showDmField(ctx()), true);
  assert.equal(showDmField(ctx({ isSelf: true })), false);
  assert.equal(showDmField(ctx({ isCopilot: true, isBot: true })), false);
  assert.equal(showDmField(ctx({ isBot: true })), false);
  assert.equal(showDmField(ctx({ isBot: true }), true), true);
  assert.equal(showDmField(ctx({ canSendDm: false })), false);
});

test("Enter sends, Shift+Enter is a new line, blank text and IME composition send nothing", () => {
  assert.equal(dmKeyAction({ key: "Enter", shiftKey: false }, "hola"), "send");
  assert.equal(dmKeyAction({ key: "Enter", shiftKey: true }, "hola"), "newline");
  assert.equal(dmKeyAction({ key: "Enter", shiftKey: false }, "   "), "none");
  assert.equal(dmKeyAction({ key: "Enter", shiftKey: false, isComposing: true }, "hola"), "none");
  assert.equal(dmKeyAction({ key: "a", shiftKey: false }, "hola"), "none");
});

test("profile link points to the room with the card to open, ids encoded", () => {
  assert.equal(profileLink("https://app.test/", "r 1", "u/2"), "https://app.test/rooms/r%201?profile=u%2F2");
});

// ── moderator view ─────────────────────────────────────────────────────────

test("moderator actions follow the server caps; unmute replaces mute; groups never for bots; Copy ID always last", () => {
  const all = { canMute: true, canAssignRoles: true, canManageGroups: true, canKick: true };
  assert.deepEqual(moderationActions(all, false, false), ["mute", "roles", "groups", "kick", "copyId"]);
  assert.deepEqual(moderationActions(all, true, false)[0], "unmute");
  assert.deepEqual(moderationActions(all, false, true), ["mute", "roles", "kick", "copyId"]);
  assert.deepEqual(moderationActions({ canMute: false, canAssignRoles: false, canManageGroups: false, canKick: false }, false, false), ["copyId"]);
});

test("moderator permissions summary: none, all (N), or a short list with +more", () => {
  assert.deepEqual(moderationSummary([], 9), { kind: "none" });
  assert.deepEqual(moderationSummary(Array.from({ length: 9 }, (_, i) => `k${i}`), 9), { kind: "all", count: 9 });
  assert.deepEqual(moderationSummary(["a", "b"], 9), { kind: "some", shown: ["a", "b"], more: 0, count: 2 });
  const s = moderationSummary(["a", "b", "c", "d", "e", "f"], 9);
  assert.equal(s.kind === "some" && s.more, 2);
});

test("counters: thousands separator, a plus when capped, a dash when absent", () => {
  assert.equal(formatCounter({ count: 1234, capped: false }, "en"), "1,234");
  assert.equal(formatCounter({ count: 10000, capped: true }, "en"), "10,000+");
  assert.equal(formatCounter(null), "—");
});

test("activity rows: the audit row only when the server sent the audit counter", () => {
  const c = { count: 1, capped: false };
  assert.deepEqual(activityRows({ messages: c, links: c, media: c, audit: null }), ["messages", "links", "media"]);
  assert.deepEqual(activityRows({ messages: c, links: c, media: c, audit: c }), ["messages", "links", "media", "audit"]);
});

test("search chips of an activity row: author plus the operator that matches", () => {
  assert.deepEqual(searchChipsFor("messages", "Ana"), [{ key: "from", value: "Ana" }]);
  assert.deepEqual(searchChipsFor("links", "Ana"), [{ key: "from", value: "Ana" }, { key: "has", value: "link" }]);
  assert.deepEqual(searchChipsFor("media", "Ana")[1], { key: "has", value: "file" });
});

test("the moderator view needs the server's canModerate and is never for yourself", () => {
  const v = { isSelf: false, canManage: false, canAssignRoles: false, canManageGroups: false, canMute: false, canKick: false, canModerate: true };
  assert.equal(canOpenModeration({ viewer: v }), true);
  assert.equal(canOpenModeration({ viewer: { ...v, canModerate: false } }), false);
  assert.equal(canOpenModeration({ viewer: { ...v, isSelf: true } }), false);
  assert.equal(canOpenModeration(null), false);
});
