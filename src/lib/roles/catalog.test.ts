import assert from "node:assert/strict";
import test from "node:test";

import {
  approximateCatalog, catalogIndex, groupCatalog, groupHeldByCatalog, localizedText, needsDangerConfirm, normalizeCatalog, obsoleteKeys,
  providerOfKey, providerOrigin, unmetRequires,
} from "./catalog.ts";

const raw = {
  providers: [
    {
      id: "integrations.github", label: { es: "GitHub", en: "GitHub" }, version: "1.0.0",
      permissions: [
        { key: "integrations.github.connect", label: { es: "Conectar GitHub", en: "Connect GitHub" }, description: "x", group: "github", scope: "team", dangerous: true, requires: ["integrations.manage"] },
        { key: "integrations.github.use", label: "Usar", group: "github", scope: "team" },
      ],
    },
    {
      id: "core", label: "Killio",
      permissions: [
        { key: "integrations.manage", label: "Integraciones", group: "integrations", scope: "team" },
        { key: "resource.view", label: "Ver", group: "resource", scope: "resource", resourceTypes: ["document", "board"] },
        { key: "resource.edit", label: "Editar", group: "resource", scope: "resource", resourceTypes: ["board"] },
        { key: "room.post", label: "Escribir", group: "rooms", scope: "room" },
        { key: "integrations.manage", label: "dup", group: "x", scope: "team" },
      ],
    },
    { id: "ext.old", label: "Viejo", installed: false, permissions: [{ key: "ext.old.thing", label: "Cosa", group: "g", scope: "team" }] },
    { label: "sin id", permissions: [] },
  ],
};

test("localizedText picks the language, then English, then anything", () => {
  assert.equal(localizedText({ es: "hola", en: "hi" }, "es-MX"), "hola");
  assert.equal(localizedText({ en: "hi" }, "fr"), "hi");
  assert.equal(localizedText({ de: "hallo" }, "fr"), "hallo");
  assert.equal(localizedText("plain", "es"), "plain");
  assert.equal(localizedText(null, "es"), "");
});

test("normalizeCatalog: providers, localisation, dedupe, uninstalled provider = obsolete, bad input = null", () => {
  assert.equal(normalizeCatalog({}), null);
  const c = normalizeCatalog(raw, "es")!;
  assert.deepEqual(c.providers.map((p) => p.id), ["integrations.github", "core", "ext.old"]);
  assert.equal(c.source, "server");
  const idx = catalogIndex(c);
  assert.equal(idx.get("integrations.github.connect")!.label, "Conectar GitHub");
  assert.equal(idx.get("integrations.manage")!.label, "Integraciones");
  assert.equal(idx.get("ext.old.thing")!.obsolete, true);
  assert.equal(idx.get("integrations.github.use")!.dangerous, false);
});

test("normalizeCatalog reads the nested groups[] form", () => {
  const c = normalizeCatalog([{ id: "x", groups: [{ id: "g1", label: { es: "Grupo" }, permissions: [{ key: "ext.x.a", label: "A" }] }] }], "es")!;
  const p = catalogIndex(c).get("ext.x.a")!;
  assert.equal(p.group, "g1");
  assert.equal(p.groupLabel, "Grupo");
  assert.equal(p.scope, "team");
});

test("groupCatalog: by provider and group, filters scope and resource type, hides obsolete, core first", () => {
  const c = normalizeCatalog(raw, "es")!;
  const team = groupCatalog(c, ["team"]);
  assert.deepEqual(team.map((s) => s.provider.id), ["core", "integrations.github"]);
  assert.deepEqual(team[1].groups.map((g) => [g.id, g.permissions.map((p) => p.key)]), [["github", ["integrations.github.connect", "integrations.github.use"]]]);
  assert.deepEqual(groupCatalog(c, ["resource"], "document")[0].groups[0].permissions.map((p) => p.key), ["resource.view"]);
  assert.deepEqual(groupCatalog(c, ["resource"], "board")[0].groups[0].permissions.map((p) => p.key), ["resource.view", "resource.edit"]);
  assert.deepEqual(groupCatalog(c, ["room"])[0].groups[0].permissions.map((p) => p.key), ["room.post"]);
  assert.equal(team.flatMap((s) => s.groups.flatMap((g) => g.permissions)).some((p) => p.key === "ext.old.thing"), false);
});

test("a new provider and group show up on their own", () => {
  const c = normalizeCatalog({ providers: [...raw.providers, { id: "ext.acme", label: "Acme", permissions: [{ key: "ext.acme.sync", label: "Sync", group: "sync", scope: "team" }] }] }, "es")!;
  const sections = groupCatalog(c, ["team"]);
  assert.ok(sections.some((s) => s.provider.id === "ext.acme" && s.groups[0].id === "sync"));
});

test("obsoleteKeys and provider helpers", () => {
  const c = normalizeCatalog(raw, "es")!;
  assert.deepEqual(obsoleteKeys(["integrations.manage", "ext.old.thing", "ext.gone.x"], c), ["ext.old.thing", "ext.gone.x"]);
  assert.equal(providerOfKey("ext.gone.x"), "gone");
  assert.equal(providerOfKey("boards.create"), null);
  assert.equal(providerOrigin("core"), "core");
  assert.equal(providerOrigin("integrations.github"), "integration");
  assert.equal(providerOrigin("ext.acme"), "extension");
});

test("requires and dangerous", () => {
  const c = normalizeCatalog(raw, "es")!;
  assert.deepEqual(unmetRequires("integrations.github.connect", () => false, c), ["integrations.manage"]);
  assert.deepEqual(unmetRequires("integrations.github.connect", (k) => k === "integrations.manage", c), []);
  assert.deepEqual(unmetRequires("unknown.key", () => false, c), []);
  assert.equal(needsDangerConfirm(c, "integrations.github.connect", "allow"), true);
  assert.equal(needsDangerConfirm(c, "integrations.github.connect", "deny"), false);
  assert.equal(needsDangerConfirm(c, "integrations.github.use", "allow"), false);
});

test("approximateCatalog is marked approx and covers team, room and resource scopes", () => {
  const c = approximateCatalog();
  assert.equal(c.source, "approx");
  const idx = catalogIndex(c);
  assert.equal(idx.get("administrator")!.dangerous, true);
  assert.equal(idx.get("room.post")!.scope, "room");
  assert.deepEqual(idx.get("room.post")!.requires, ["room.view"]);
  assert.equal(idx.get("resource.edit")!.scope, "resource");
  assert.equal(groupCatalog(c, ["team", "room"]).length, 1);
});

test("groupHeldByCatalog uses the live catalogue; administrator collapses; resource and obsolete keys are skipped", () => {
  const c = normalizeCatalog(raw, "es")!;
  const g = groupHeldByCatalog(["integrations.github.use", "integrations.manage", "ext.old.thing", "resource.view"], c);
  assert.deepEqual(g.map((x) => `${x.providerId}/${x.group}`).sort(), ["core/integrations", "integrations.github/github"]);
  assert.deepEqual(groupHeldByCatalog(["administrator", "integrations.manage"], approximateCatalog()).map((x) => x.keys), [["administrator"]]);
});
