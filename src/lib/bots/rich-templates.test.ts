import assert from "node:assert/strict";
import { test } from "node:test";

import { validateComponents } from "./components.ts";
import { TEMPLATE_IDS, richTemplate } from "./rich-templates.ts";
import { accessoryButtons, blocksToPlainText, contractVersion, validateBlocks } from "./rich.ts";

const tr = (key: string) => key.split(".").slice(-2).join(" ");

test("every template validates with the backend limits (blocks, components, shared customIds)", () => {
  for (const id of TEMPLATE_IDS) {
    const tpl = richTemplate(id, tr);
    assert.deepEqual(validateBlocks(tpl.blocks), [], `${id} blocks`);
    assert.deepEqual(validateComponents(tpl.components ?? [], tpl.expiresInMinutes, tpl.blocks), [], `${id} components`);
    assert.equal(contractVersion(tpl.blocks), 2, `${id} uses v2`);
    assert.ok(blocksToPlainText(tpl.blocks).length > 0, `${id} has a plain-text fallback`);
  }
});

test("role panel: role select with a customId the trigger prefix role:* catches, beside a clear button", () => {
  const tpl = richTemplate("rolePanel", tr);
  const rows = tpl.components!;
  assert.equal(rows[0].components[0].type, "role_select");
  for (const row of rows) for (const c of row.components) assert.match((c as { customId: string }).customId, /^role:/);
  assert.equal(tpl.expiresInMinutes, 30);
});

test("welcome card nests a section with a thumbnail inside a container", () => {
  const tpl = richTemplate("welcomeCard", tr);
  const container = tpl.blocks[0] as any;
  assert.equal(container.type, "container");
  assert.ok(container.blocks.some((b: any) => b.type === "section" && b.accessory?.type === "thumbnail"));
  assert.equal(accessoryButtons(tpl.blocks).length, 0);
});

test("poll and server status use the data blocks", () => {
  assert.ok(richTemplate("poll", tr).blocks.some((b) => b.type === "poll"));
  assert.deepEqual(richTemplate("poll", tr).components![0].components.map((c: any) => c.customId), ["vote:a", "vote:b", "vote:c"]);
  const types = richTemplate("serverStatus", tr).blocks.map((b) => b.type);
  for (const t of ["progress", "stats", "key_value"]) assert.ok(types.includes(t as never), t);
});
