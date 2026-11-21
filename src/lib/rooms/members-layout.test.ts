import assert from "node:assert/strict";
import test from "node:test";

import { buildMemberSections, highestRole, memberColor, type PanelMember } from "./members-layout.ts";

const admin = { id: "r-admin", name: "Admin", color: "#e11d48", position: 90 };
const mod = { id: "r-mod", name: "Moderador", color: "#2563eb", position: 50 };
const member = { id: "r-member", name: "Miembro", color: null, position: 10 };

const people: PanelMember[] = [
  { userId: "u1", displayName: "Zoe", roles: [member, mod] },
  { userId: "u2", displayName: "Ana", roles: [admin, mod] },
  { userId: "u3", displayName: "Beto", roles: [mod] },
  { userId: "u4", displayName: "Carla" },
  { userId: "u5", displayName: "Ayuda", isBot: true },
  { userId: "u6", displayName: "Dani", roles: [admin] },
];

test("the highest role (by position) names the section and gives the colour", () => {
  assert.equal(highestRole(people[0])?.id, "r-mod");
  assert.equal(memberColor(people[1]), "#e11d48");
  assert.equal(memberColor(people[3]), null);
  assert.equal(memberColor({ roles: [{ id: "x", name: "x", color: "javascript:alert(1)", position: 1 }] }), null);
});

test("online people are grouped by highest role, highest first, sorted by name; others follow", () => {
  const online = new Set(["u1", "u2", "u3", "u4", "u5"]);
  const sections = buildMemberSections(people, online);
  assert.deepEqual(sections.map((s) => s.key), ["role:r-admin", "role:r-mod", "online", "bots", "offline"]);
  assert.deepEqual(sections[0].members.map((m) => m.displayName), ["Ana"]);
  assert.deepEqual(sections[1].members.map((m) => m.displayName), ["Beto", "Zoe"]);
  assert.equal(sections[0].color, "#e11d48");
  assert.deepEqual(sections[4].members.map((m) => m.displayName), ["Dani"]);
});

test("bots are never offline-listed or role-listed, and appear even when nobody else is online", () => {
  const sections = buildMemberSections(people, new Set());
  assert.deepEqual(sections.map((s) => s.kind), ["bots", "offline"]);
  assert.equal(sections[1].members.length, 5);
});

test("an empty room has no sections", () => {
  assert.deepEqual(buildMemberSections([], new Set()), []);
});

test("an invalid role colour is dropped from the section", () => {
  const s = buildMemberSections([{ userId: "u", displayName: "U", roles: [{ id: "r", name: "R", color: "red", position: 1 }] }], new Set(["u"]));
  assert.equal(s[0].color, null);
  assert.equal(s[0].title, "R");
});
