import assert from "node:assert/strict";
import test from "node:test";

import {
  activeMentionQuery, buildMentionCandidates, EVERYONE_TOKEN, mentionsMe, neutralizeEveryone, parseMentions, roleMentionToken, safeColor,
} from "./mentions.ts";

test("tokens of every kind are parsed once each", () => {
  const p = parseMentions("hola @[user:u1:Ana] @[user:u1:Ana] @[role:r1:Moderador] @[group:g1:Dev] y @[doc:d1:Plan]");
  assert.deepEqual(p, { users: ["u1"], groups: ["g1"], roles: ["r1"], everyone: false });
});

test("@everyone: token and typed text, but not inside an address", () => {
  assert.equal(parseMentions(`aviso ${EVERYONE_TOKEN}`).everyone, true);
  assert.equal(parseMentions("aviso @everyone: reunión").everyone, true);
  assert.equal(parseMentions("@todos atención").everyone, true);
  assert.equal(parseMentions("escribe a pepe@everyone.com").everyone, false);
  assert.equal(parseMentions("nada").everyone, false);
});

test("a message mentions me by name, role, group or everyone", () => {
  const me = { userId: "u1", roleIds: ["r9"], groupIds: ["g9"] };
  assert.equal(mentionsMe("@[user:u1:Yo]", me), true);
  assert.equal(mentionsMe("@[user:u2:Otro]", me), false);
  assert.equal(mentionsMe("@[role:r9:Mod]", me), true);
  assert.equal(mentionsMe("@[role:r1:Mod]", me), false);
  assert.equal(mentionsMe("@[group:g9:Dev]", me), true);
  assert.equal(mentionsMe(EVERYONE_TOKEN, me), true);
  assert.equal(mentionsMe("sin menciones", me), false);
});

test("without the right, @everyone becomes inert text", () => {
  assert.equal(neutralizeEveryone(`hola ${EVERYONE_TOKEN}`, false), "hola everyone");
  assert.equal(neutralizeEveryone("hola @everyone", false), "hola everyone");
  assert.equal(neutralizeEveryone(`hola ${EVERYONE_TOKEN}`, true), `hola ${EVERYONE_TOKEN}`);
  assert.equal(parseMentions(neutralizeEveryone("@[everyone:everyone:everyone] @todos", false)).everyone, false);
});

test("role token never breaks on a closing bracket in the name", () => {
  assert.equal(roleMentionToken({ id: "r1", name: "Ops [eu]" }), "@[role:r1:Ops [eu]");
  assert.equal(parseMentions(roleMentionToken({ id: "r1", name: "Ops" })).roles[0], "r1");
});

test("colors are validated before use", () => {
  assert.equal(safeColor("#aabbcc"), "#aabbcc");
  assert.equal(safeColor("red; background:url(x)"), null);
  assert.equal(safeColor(undefined), null);
});

const sources = {
  users: [{ id: "u1", name: "Ana Pérez", email: "ana@x.com" }, { id: "u2", name: "Luis" }],
  roles: [{ id: "r1", name: "Moderador", color: "#ff0000" }, { id: "r2", name: "Privado", mentionable: false }],
  groups: [{ id: "g1", name: "Desarrollo", color: "#00ff00", memberCount: 4 }],
  canMentionEveryone: true,
  everyoneLabel: "everyone",
};

test("autocomplete: empty query lists everyone, roles, groups, people (hidden roles skipped)", () => {
  const c = buildMentionCandidates(sources, "");
  assert.deepEqual(c.map((x) => x.kind), ["everyone", "role", "group", "user", "user"]);
  assert.ok(!c.some((x) => x.id === "r2"));
  assert.equal(c[1].color, "#ff0000");
});

test("autocomplete: prefix first, accents ignored, everyone only with the right", () => {
  assert.deepEqual(buildMentionCandidates(sources, "mod").map((x) => x.id), ["r1"]);
  assert.deepEqual(buildMentionCandidates(sources, "perez").map((x) => x.id), ["u1"]);
  assert.deepEqual(buildMentionCandidates(sources, "todos").map((x) => x.kind), ["everyone"]);
  assert.equal(buildMentionCandidates({ ...sources, canMentionEveryone: false }, "every").length, 0);
  assert.equal(buildMentionCandidates(sources, "zzz").length, 0);
});

test("autocomplete respects the limit", () => {
  assert.equal(buildMentionCandidates(sources, "", 2).length, 2);
});

test("the mention being typed is detected only right after @", () => {
  assert.equal(activeMentionQuery("hola @mo"), "mo");
  assert.equal(activeMentionQuery("hola @"), "");
  assert.equal(activeMentionQuery("hola @mo "), null);
  assert.equal(activeMentionQuery("correo pepe@dom"), null);
  assert.equal(activeMentionQuery("sin arroba"), null);
  assert.equal(activeMentionQuery("@[user:u1:Ana"), null);
});

test("editor tokens convert to what the server reads and back", async () => {
  const { toWireMentions, fromWireMentions } = await import("./mentions.ts");
  const editor = "hola @[user:u1:Ana] @[role:r-1:Moderador] @[group:g-1:Dev] @[everyone:everyone:everyone] y @[doc:d1:Plan]";
  const wire = toWireMentions(editor);
  assert.equal(wire, "hola @[Ana](u1) @[Moderador](role:r-1) @[Dev](group:g-1) @[everyone](everyone) y @[doc:d1:Plan]");
  assert.equal(fromWireMentions(wire), "hola @[user:u1:Ana] @[role:r-1:Moderador] @[group:g-1:Dev] @[everyone:everyone:everyone] y @[doc:d1:Plan]");
});

test("the server format is understood everywhere a mention is read", () => {
  const wire = "@[Ana](u1) @[Mod](role:r1) @[Dev](group:g1) @[everyone](everyone)";
  const p = parseMentions(wire);
  assert.deepEqual(p, { users: ["u1"], groups: ["g1"], roles: ["r1"], everyone: true });
  assert.equal(mentionsMe("@[Mod](role:r1)", { roleIds: ["r1"] }), true);
  assert.equal(mentionsMe("@[Ana](u1)", { userId: "u2" }), false);
  assert.equal(parseMentions(neutralizeEveryone("@[everyone](everyone)", false)).everyone, false);
});

test("links that look like mentions are not mistaken for them", async () => {
  const { fromWireMentions } = await import("./mentions.ts");
  const link = "mira @[docs](https://example.com/a?b=c) aqui";
  assert.equal(fromWireMentions(link), link);
  assert.equal(fromWireMentions("sin tokens"), "sin tokens");
});
