import assert from "node:assert/strict";
import test from "node:test";

import {
  bannerStyle, cardPosition, formatLocalTime, formatMemberSince, groupProfileRoles, muteState, profileActions, profileColor,
  profileSections, profileTabs, type ActionContext, type MemberProfile, type ProfileRole,
} from "./user-profile.ts";

const role = (id: string, position: number, over: Partial<ProfileRole> = {}): ProfileRole => ({ id, name: id, color: null, position, inherited: false, ...over });

const profile = (over: Partial<MemberProfile> = {}): MemberProfile => ({
  userId: "u1", displayName: "Ana", name: "Ana", email: null, avatarUrl: null, bio: null, timezone: null, locale: null, isBot: false,
  joinedTeamAt: null, roles: [], groups: [], isOwner: false, mute: null, bot: null, room: null,
  viewer: { isSelf: false, canManage: false, canAssignRoles: false, canManageGroups: false, canMute: false, canKick: false },
  ...over,
});

// ── roles ──────────────────────────────────────────────────────────────────

test("roles are split into own and inherited-by-group, highest first", () => {
  const r = groupProfileRoles([role("low", 10), role("g1", 90, { inherited: true }), role("top", 50), role("g0", 20, { inherited: true })]);
  assert.deepEqual(r.direct.map((x) => x.id), ["top", "low"]);
  assert.deepEqual(r.inherited.map((x) => x.id), ["g1", "g0"]);
});

test("ties on position are ordered by name; the name colour is the highest role WITH a valid colour only when it is the top one", () => {
  assert.deepEqual(groupProfileRoles([role("b", 5), role("a", 5)]).direct.map((x) => x.id), ["a", "b"]);
  assert.equal(profileColor([role("x", 1, { color: "#112233" }), role("y", 9, { color: "#aabbcc" })]), "#aabbcc");
  assert.equal(profileColor([role("y", 9, { color: "red" })]), null, "invalid colours never reach a style attribute");
  assert.equal(profileColor([]), null);
});

test("banner: role colour when valid, brand fallback otherwise", () => {
  assert.match(bannerStyle("#2563eb").background, /#2563eb/);
  assert.match(bannerStyle(null).background, /var\(--primary\)/);
  assert.match(bannerStyle("url(javascript:1)").background, /var\(--primary\)/);
});

// ── dates ──────────────────────────────────────────────────────────────────

test("member since: formatted in the given language, empty when unknown or broken", () => {
  assert.equal(formatMemberSince(null, "en"), "");
  assert.equal(formatMemberSince("nonsense", "en"), "");
  assert.match(formatMemberSince("2026-01-15T12:00:00Z", "en"), /Jan.*15.*2026|15.*Jan.*2026/);
  assert.match(formatMemberSince("2026-01-15T12:00:00Z", "es"), /ene.*2026/i);
});

test("local time uses the person's timezone and ignores a bad one", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  assert.equal(formatLocalTime("Asia/Tokyo", now, "en-GB"), "21:00");
  assert.equal(formatLocalTime("America/Lima", now, "en-GB"), "07:00");
  assert.equal(formatLocalTime("Mars/Olympus", now, "en"), "");
  assert.equal(formatLocalTime(null, now), "");
});

test("mute state: forever, until a future date, nothing once expired", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");
  assert.equal(muteState(null, now), null);
  assert.deepEqual(muteState({ until: null, reason: null }, now), { kind: "forever" });
  assert.deepEqual(muteState({ until: "2026-07-01T00:00:00Z", reason: null }, now), { kind: "until", until: "2026-07-01T00:00:00Z" });
  assert.equal(muteState({ until: "2026-05-01T00:00:00Z", reason: null }, now), null);
});

// ── sections / tabs ────────────────────────────────────────────────────────

test("a human with nothing filled in shows only what exists: no empty About, no empty groups", () => {
  assert.deepEqual(profileSections(profile()), []);
  assert.deepEqual(profileSections(profile({ bio: "hola", roles: [role("a", 1)], joinedTeamAt: "2026-01-01T00:00:00Z" })), ["about", "roles", "dates"]);
  assert.deepEqual(profileSections(profile({ timezone: "Europe/Madrid", groups: [{ id: "g", name: "G", color: null }], mute: { until: null, reason: null } })), ["about", "groups", "mute"]);
});

test("a bot gets the bot block and its commands, never the human About", () => {
  const bot = { id: "b", description: "x", isActive: true, createdByName: null, createdAt: "2026-01-01T00:00:00Z", commands: [{ name: "ping", description: "", usage: null }] };
  assert.deepEqual(profileSections(profile({ isBot: true, bio: "ignored", bot })), ["bot", "commands"]);
  assert.deepEqual(profileSections(profile({ isBot: true, bot: { ...bot, commands: [] } })), ["bot"]);
});

test("the room join date counts as a date even when the team date is unknown", () => {
  assert.deepEqual(profileSections(profile({ room: { id: "r", joinedAt: "2026-02-01T00:00:00Z", permissions: null } })), ["dates"]);
});

test("the Permissions tab exists only when the server sent the effective permissions", () => {
  assert.deepEqual(profileTabs(null), ["profile"]);
  assert.deepEqual(profileTabs(profile({ room: { id: "r", joinedAt: null, permissions: null } })), ["profile"]);
  assert.deepEqual(profileTabs(profile({ room: { id: "r", joinedAt: null, permissions: { canSee: true, allowed: [], denied: [] } } })), ["profile", "permissions"]);
});

// ── actions ────────────────────────────────────────────────────────────────

const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({ isSelf: false, isBot: false, canDm: true, canMention: true, muted: false, viewer: null, ...over });
const all = { canAssignRoles: true, canManageGroups: true, canMute: true, canKick: true };

test("a plain viewer sees message, mention and copy id about a person", () => {
  assert.deepEqual(profileActions(ctx()), ["message", "mention", "copyId"]);
});

test("a bot has no DM action; a surface without composer has no mention", () => {
  assert.deepEqual(profileActions(ctx({ isBot: true })), ["mention", "copyId"]);
  assert.deepEqual(profileActions(ctx({ canMention: false, canDm: false })), ["copyId"]);
});

test("your own card offers Edit profile and nothing destructive, even for an owner", () => {
  assert.deepEqual(profileActions(ctx({ isSelf: true, viewer: all })), ["editProfile", "copyId"]);
});

test("a manager gets mute/unmute (by state), roles, groups and kick, in that order", () => {
  assert.deepEqual(profileActions(ctx({ viewer: all })), ["message", "mention", "copyId", "mute", "roles", "groups", "kick"]);
  assert.deepEqual(profileActions(ctx({ viewer: all, muted: true })).slice(3, 5), ["unmute", "roles"]);
});

test("management actions follow the caps one by one; bots take roles but not groups", () => {
  assert.deepEqual(profileActions(ctx({ viewer: { canAssignRoles: true, canManageGroups: false, canMute: false, canKick: false } })), ["message", "mention", "copyId", "roles"]);
  assert.deepEqual(profileActions(ctx({ isBot: true, viewer: all })), ["mention", "copyId", "mute", "roles", "kick"]);
});

// ── placement ──────────────────────────────────────────────────────────────

const VP = { width: 1280, height: 800 };
const SIZE = { width: 340, height: 420 };

test("opens to the right of a left-side anchor and aligned to its top", () => {
  const p = cardPosition({ left: 100, top: 200, right: 130, bottom: 230 }, SIZE, VP);
  assert.deepEqual(p, { left: 138, top: 200, side: "right" });
});

test("a row in the right-hand members panel opens to the LEFT so it never covers the list", () => {
  const p = cardPosition({ left: 1020, top: 300, right: 1270, bottom: 330 }, SIZE, VP);
  assert.equal(p.side, "left");
  assert.equal(p.left, 1020 - 8 - 340);
  assert.ok(p.left + SIZE.width <= 1020, "ends before the anchor starts");
});

test("always clamped inside the viewport", () => {
  const low = cardPosition({ left: 100, top: 760, right: 130, bottom: 790 }, SIZE, VP);
  assert.equal(low.top, 800 - 8 - 420);
  const high = cardPosition({ left: 100, top: -50, right: 130, bottom: -20 }, SIZE, VP);
  assert.equal(high.top, 8);
  const narrow = cardPosition({ left: 10, top: 10, right: 40, bottom: 40 }, SIZE, { width: 360, height: 700 });
  assert.ok(narrow.left >= 8 && narrow.left + SIZE.width <= 352);
});
