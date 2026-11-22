import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CORE_KEY_GROUP, ROOM_GROUP_ORDER, coreRoomCatalog, groupRoomKeys, permLabelPath } from "./permission-catalog.ts";

const read = (locale: string) => JSON.parse(readFileSync(new URL(`../../i18n/locales/${locale}/rooms.json`, import.meta.url), "utf8"));

/** Resolves `perm.<ns>.<path>` like the app does: nested objects, no dots inside a segment. */
function lookup(json: any, path: string): unknown {
  return path.split(".").reduce((o: any, seg) => (o && typeof o === "object" ? o[seg] : undefined), json);
}

test("permLabelPath keeps the namespace and flattens the rest", () => {
  assert.equal(permLabelPath("room.view"), "room.view");
  assert.equal(permLabelPath("room.call.start"), "room.call_start");
  assert.equal(permLabelPath("room.call.remove_participants"), "room.call_remove_participants");
  assert.equal(permLabelPath("plain"), "plain");
});

for (const locale of ["es", "en"]) {
  test(`${locale}: every core room permission key has a name and a hint (no raw keys in the UI)`, () => {
    const json = read(locale);
    const missingNames: string[] = [];
    const missingHints: string[] = [];
    for (const key of Object.keys(CORE_KEY_GROUP)) {
      const path = permLabelPath(key);
      if (typeof lookup(json, `perm.keys.${path}`) !== "string") missingNames.push(key);
      if (typeof lookup(json, `perm.keyHints.${path}`) !== "string") missingHints.push(key);
    }
    assert.deepEqual(missingNames, [], `${locale}: keys without a name in perm.keys`);
    assert.deepEqual(missingHints, [], `${locale}: keys without a hint in perm.keyHints`);
  });

  test(`${locale}: every group of the permission list has a title`, () => {
    const json = read(locale);
    for (const id of [...ROOM_GROUP_ORDER, "other"]) {
      assert.equal(typeof lookup(json, `perm.keyGroups.${id}`), "string", `${locale}: perm.keyGroups.${id}`);
    }
  });
}

test("the profile permission view lists every core key in a titled group, none under 'other'", () => {
  const catalog = coreRoomCatalog();
  const groups = groupRoomKeys(catalog, { name: (k) => k.key, desc: () => "", group: (id) => id });
  const listed = groups.flatMap((g) => g.keys.map((k) => k.key)).sort();
  assert.deepEqual(listed, Object.keys(CORE_KEY_GROUP).sort());
  assert.ok(groups.every((g) => (ROOM_GROUP_ORDER as readonly string[]).includes(g.id)), "a core key fell outside the known groups");
});
