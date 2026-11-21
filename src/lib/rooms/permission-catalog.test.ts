import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRoomCatalog, CORE_KEY_GROUP, fallbackRoomCatalog, groupRuleCounts, groupRoomKeys, ROOM_KEY_PARENT, roomEntriesOfTeamCatalog, textsOfTeamCatalog,
  type KeyTextResolver, type TeamCatalogEntry,
} from "./permission-catalog.ts";
import { ROOM_PERMISSION_KEYS, toDraft } from "./tristate.ts";

const entry = (key: string, extra: Record<string, unknown> = {}) => ({
  key, label: key, description: "", group: "Access to a room", scope: "room", alsoIn: [], resourceTypes: ["room", "room_category"], dangerous: false, requires: [], impliedBy: null, providerId: "core", ...extra,
});

const raw = {
  roomId: "r1",
  overrides: [],
  permissionKeys: ["room.view", "room.post", "room.call.start", "room.call.screen_share", "room.pin", "room.manage_webhooks", "ext.acme.sync"],
  universe: ["room.view", "room.post", "room.call.start", "room.call.screen_share", "room.pin", "room.manage_webhooks", "ext.acme.sync"],
  catalog: [
    entry("room.view", { label: "View the room", description: "See the room." }),
    entry("room.post", { label: "Post" }),
    entry("room.call.start", { label: "Start calls" }),
    entry("room.call.screen_share", { label: "Share screen" }),
    entry("room.pin", { label: "Pin messages", group: "Rooms", scope: "team", alsoIn: ["room"] }),
    entry("room.manage_webhooks", { label: "Manage webhooks", dangerous: true }),
    entry("ext.acme.sync", { label: "Sync", group: "Acme", impliedBy: "room.post" }),
  ],
};

const plain: KeyTextResolver = { name: (k) => k.label || k.key, desc: (k) => k.description, group: (id, label) => label || id };

test("a server catalog gives the keys in the server order with label, description and danger", () => {
  const c = buildRoomCatalog(raw);
  assert.equal(c.source, "server");
  assert.deepEqual(c.universe, raw.universe);
  assert.equal(c.index.get("room.view")?.description, "See the room.");
  assert.equal(c.index.get("room.manage_webhooks")?.dangerous, true);
  assert.equal(c.index.get("room.post")?.dangerous, false);
  assert.ok(c.universeSet.has("ext.acme.sync"));
});

test("known keys are sorted into the client groups; the rest keep the server group", () => {
  const groups = groupRoomKeys(buildRoomCatalog(raw), plain);
  assert.deepEqual(groups.map((g) => g.id), ["access", "messages", "pins", "calls", "webhooks", "srv:Acme"]);
  assert.deepEqual(groups.find((g) => g.id === "calls")?.keys.map((k) => k.key), ["room.call.start", "room.call.screen_share"]);
  assert.equal(groups.find((g) => g.id === "srv:Acme")?.label, "Acme");
});

test("the call keys of the spec all live under calls", () => {
  for (const k of ["room.call.start", "room.call.join", "room.call.speak", "room.call.video", "room.call.screen_share", "room.call.mute_others", "room.call.remove_participants"]) {
    assert.equal(CORE_KEY_GROUP[k], "calls", k);
  }
});

test("every fixed key has a client group, so the fallback is grouped too", () => {
  for (const k of ROOM_PERMISSION_KEYS) assert.ok(CORE_KEY_GROUP[k], k);
});

test("impliedBy: the server value wins, the mirrored room cascade fills the gaps", () => {
  const c = buildRoomCatalog(raw);
  assert.equal(c.index.get("ext.acme.sync")?.impliedBy, "room.post");
  assert.equal(c.index.get("room.call.start")?.impliedBy, "room.call");
  assert.equal(c.index.get("room.view")?.impliedBy, null);
  assert.equal(ROOM_KEY_PARENT["room.call.screen_share"], "room.call");
});

test("localised team texts replace the server English; the server label stays when the team catalogue lacks the key", () => {
  const texts = new Map([["room.post", { label: "Escribir", description: "Enviar mensajes." }]]);
  const c = buildRoomCatalog(raw, { texts });
  assert.equal(c.index.get("room.post")?.label, "Escribir");
  assert.equal(c.index.get("room.post")?.description, "Enviar mensajes.");
  assert.equal(c.index.get("room.view")?.label, "View the room");
});

test("a label that just echoes the key counts as no text", () => {
  const c = buildRoomCatalog({ universe: ["room.view"], catalog: [entry("room.view")] });
  assert.equal(c.index.get("room.view")?.label, "");
});

test("a universe key the catalog does not describe still shows up", () => {
  const c = buildRoomCatalog({ universe: ["room.view", "room.zzz"], catalog: [entry("room.view")] });
  assert.deepEqual(c.universe, ["room.view", "room.zzz"]);
  assert.equal(c.index.get("room.zzz")?.groupId, "srv:other");
});

test("no universe but a catalog: the catalog is the universe; duplicates collapse", () => {
  const c = buildRoomCatalog({ catalog: [entry("room.view"), entry("room.post"), entry("room.view")] });
  assert.deepEqual(c.universe, ["room.view", "room.post"]);
  assert.equal(c.source, "server");
});

test("degradation: nothing usable from the server gives the fixed list", () => {
  for (const bad of [undefined, null, 5, "x", [], {}, { universe: [], catalog: [] }, { universe: [1, 2], catalog: [null] }]) {
    const c = buildRoomCatalog(bad);
    assert.equal(c.source, "fallback");
    assert.deepEqual(c.universe, [...ROOM_PERMISSION_KEYS]);
  }
  assert.equal(fallbackRoomCatalog().index.get("room.post")?.label, "");
});

const team = (key: string, extra: Partial<TeamCatalogEntry> = {}): TeamCatalogEntry => ({
  key, label: "L " + key, description: "D " + key, groupLabel: "G", scope: "room", resourceTypes: null, dangerous: false, requires: [], ...extra,
});

test("without a room answer (a new channel) the team catalogue supplies the room keys", () => {
  const entries = [
    team("room.view", { resourceTypes: ["room", "room_category"] }),
    team("resource.view", { scope: "resource", resourceTypes: ["board"] }),
    team("rooms.create", { scope: "team" }),
    team("room.pin", { scope: "team", alsoIn: ["room"] }),
    team("room.call.start"),
    team("room.old", { obsolete: true }),
    team("room.board_only", { resourceTypes: ["board"] }),
  ];
  assert.deepEqual(roomEntriesOfTeamCatalog(entries).map((e) => e.key), ["room.view", "room.pin", "room.call.start"]);
  const c = buildRoomCatalog(undefined, { teamEntries: entries });
  assert.equal(c.source, "team");
  assert.deepEqual(c.universe, ["room.view", "room.pin", "room.call.start"]);
  assert.equal(c.index.get("room.call.start")?.label, "L room.call.start");
});

test("filtering: by name, description, key and group, accent-insensitive; empty groups vanish", () => {
  const c = buildRoomCatalog(raw, { texts: new Map([["room.post", { label: "Escribir mensajes", description: "Enviar y responder." }], ["room.call.screen_share", { label: "Compartir pantalla", description: "" }]]) });
  assert.deepEqual(groupRoomKeys(c, plain, "pantalla").map((g) => g.id), ["calls"]);
  assert.deepEqual(groupRoomKeys(c, plain, "RESPONDER").flatMap((g) => g.keys.map((k) => k.key)), ["room.post"]);
  assert.deepEqual(groupRoomKeys(c, plain, "room.pin").flatMap((g) => g.keys.map((k) => k.key)), ["room.pin"]);
  assert.deepEqual(groupRoomKeys(c, plain, "acme").map((g) => g.id), ["srv:Acme"]);
  assert.deepEqual(groupRoomKeys(c, plain, "zzzz"), []);
  const accents: KeyTextResolver = { name: (k) => k.key, desc: (k) => (k.key === "room.view" ? "Aparece en la lista" : ""), group: (id) => id };
  assert.deepEqual(groupRoomKeys(c, accents, "lísta").flatMap((g) => g.keys.map((k) => k.key)), ["room.view"]);
});

test("a matching group name keeps all of its keys", () => {
  const named: KeyTextResolver = { ...plain, group: (id, label) => (id === "calls" ? "Llamadas" : label || id) };
  const g = groupRoomKeys(buildRoomCatalog(raw), named, "llamad");
  assert.deepEqual(g.map((x) => x.id), ["calls"]);
  assert.equal(g[0].keys.length, 2);
});

test("rule counters per group count yes and no of one subject", () => {
  const c = buildRoomCatalog(raw);
  const groups = groupRoomKeys(c, plain);
  const d = toDraft({ subjectType: "role", subjectId: "r", allow: ["room.call.start", "room.post"], deny: ["room.call.screen_share"] }, c.universe);
  const counts = groupRuleCounts(d.states, groups);
  assert.deepEqual(counts.get("calls"), { allow: 1, deny: 1 });
  assert.deepEqual(counts.get("messages"), { allow: 1, deny: 0 });
  assert.deepEqual(counts.get("webhooks"), { allow: 0, deny: 0 });
});

test("texts of the team catalogue are indexed by key", () => {
  const m = textsOfTeamCatalog([team("room.post"), team("room.empty", { label: "", description: "" })]);
  assert.equal(m.get("room.post")?.label, "L room.post");
  assert.equal(m.has("room.empty"), false);
});

test("localized marks the texts that came in the app language", () => {
  const c = buildRoomCatalog(raw, { texts: new Map([["room.post", { label: "Escribir", description: "" }]]) });
  assert.equal(c.index.get("room.post")?.localized, true);
  assert.equal(c.index.get("room.view")?.localized, false);
});
