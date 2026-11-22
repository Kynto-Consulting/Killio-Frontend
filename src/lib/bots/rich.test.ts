import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blankBlock, blocksToPlainText, isFallbackContent, checklistToLines, fieldsToLines, linesToChecklist, linesToFields, linesToList, linesToRows, readMessageExtras, rowsToLines, safeHttpsUrl,
  validateBlocks, BLOCK_TYPES, RICH_LIMITS,
} from "./rich.ts";

const codes = (blocks: unknown) => validateBlocks(blocks).map((i) => `${i.at.join(".")}:${i.code}`);

test("every blank block of every type needs only its required text", () => {
  for (const t of BLOCK_TYPES) {
    const issues = codes([blankBlock(t)]);
    if (["divider", "spacer", "progress"].includes(t)) assert.deepEqual(issues, [], t);
    else assert.ok(issues.length > 0, `${t} should need content`);
  }
});

test("valid blocks of each type", () => {
  assert.deepEqual(codes([
    { type: "text", text: "Hola" },
    { type: "heading", level: 3, text: "Titulo" },
    { type: "list", ordered: true, items: ["a", "b"] },
    { type: "checklist", items: [{ text: "a", checked: true }, "b"] },
    { type: "table", columns: ["A", "B"], rows: [["1", "2"], ["3"]] },
    { type: "image", url: "https://x.test/a.png", alt: "x" },
    { type: "link", url: "https://x.test", title: "t" },
    { type: "code", language: "ts", code: "const a = 1" },
    { type: "quote", text: "q" },
    { type: "divider" },
    { type: "embed", title: "T", color: "#aabbcc", fields: [{ name: "n", value: "v", inline: true }], timestamp: "2026-01-01T00:00:00Z" },
  ]), []);
  assert.deepEqual(codes([]), []);
  assert.deepEqual(codes(undefined), []);
});

test("list limits: 20 blocks, 32 KB total", () => {
  assert.ok(codes(Array.from({ length: 21 }, () => ({ type: "divider" }))).includes(":too_many"));
  const big = Array.from({ length: 20 }, () => ({ type: "text", text: "x".repeat(RICH_LIMITS.maxTextLength) }));
  assert.ok(codes(big).includes(":too_large"));
  assert.deepEqual(codes("no"), [":not_list"]);
});

test("text blocks: required, 2000 characters, headings level 1-3", () => {
  assert.deepEqual(codes([{ type: "text", text: "  " }]), ["0:text_required"]);
  assert.deepEqual(codes([{ type: "text", text: "x".repeat(2001) }]), ["0:text_long"]);
  assert.deepEqual(codes([{ type: "heading", level: 4, text: "x" }]), ["0:heading_level"]);
  assert.deepEqual(codes([{ type: "heading", text: "x".repeat(257) }]), ["0:text_long"]);
});

test("templated strings are not measured (the run renders them first)", () => {
  assert.deepEqual(codes([{ type: "text", text: `{{ options.nombre }}${"x".repeat(3000)}` }]), []);
  assert.deepEqual(codes([{ type: "image", url: "{imageUrl}" }]), []);
  assert.deepEqual(codes([{ type: "embed", title: "T", color: "{color}" }]), []);
});

test("lists: at least one and at most 25 non-empty items of 200 characters", () => {
  assert.deepEqual(codes([{ type: "list", items: [] }]), ["0:items_empty"]);
  assert.deepEqual(codes([{ type: "list", items: ["a", ""] }]), ["0.1:item_required"]);
  assert.ok(codes([{ type: "list", items: Array.from({ length: 26 }, () => "a") }]).includes("0:items_many"));
  assert.deepEqual(codes([{ type: "checklist", items: [{ text: "x".repeat(201) }] }]), ["0.0:item_long"]);
});

test("tables: 1-8 columns, at most 25 rows, no row wider than the columns", () => {
  assert.deepEqual(codes([{ type: "table", columns: [], rows: [] }]), ["0:columns_range"]);
  assert.deepEqual(codes([{ type: "table", columns: ["A"], rows: [["1", "2"]] }]), ["0.0:row_wide"]);
  assert.ok(codes([{ type: "table", columns: Array.from({ length: 9 }, (_, i) => `c${i}`), rows: [] }]).includes("0:columns_range"));
  assert.ok(codes([{ type: "table", columns: ["A"], rows: Array.from({ length: 26 }, () => ["1"]) }]).includes("0:rows_many"));
});

test("links and images need https; embeds need something to show and a #rrggbb colour", () => {
  assert.deepEqual(codes([{ type: "image", url: "http://x.test/a.png" }]), ["0:url_https"]);
  assert.deepEqual(codes([{ type: "link", url: "" }]), ["0:url_required"]);
  assert.deepEqual(codes([{ type: "link", url: "javascript:alert(1)" }]), ["0:url_https"]);
  assert.deepEqual(codes([{ type: "embed" }]), ["0:embed_empty"]);
  assert.deepEqual(codes([{ type: "embed", title: "T", color: "red" }]), ["0:color_format"]);
  assert.deepEqual(codes([{ type: "embed", title: "T", fields: [{ name: "", value: "v" }] }]), ["0.0:field_name"]);
  assert.deepEqual(codes([{ type: "embed", title: "T", timestamp: "ayer" }]), ["0:timestamp"]);
  assert.ok(codes([{ type: "embed", title: "T", fields: Array.from({ length: 11 }, () => ({ name: "n", value: "v" })) }]).includes("0:fields_many"));
});

test("unknown types are rejected", () => {
  assert.deepEqual(codes([{ type: "video" }]), ["0:type_unknown"]);
  assert.deepEqual(codes([null]), ["0:type_unknown"]);
});

test("plain text fallback mirrors the backend rendition", () => {
  const text = blocksToPlainText([
    { type: "heading", level: 1, text: "T" }, { type: "list", ordered: true, items: ["a", "b"] }, { type: "checklist", items: [{ text: "x", checked: true }] },
    { type: "table", columns: ["A", "B"], rows: [["1", "2"]] }, { type: "divider" }, { type: "link", url: "https://x.test", title: "Doc" }, { type: "embed", title: "E", description: "d" },
  ]);
  assert.equal(text, ["T", "1. a", "2. b", "[x] x", "A | B", "1 | 2", "Doc https://x.test", "E: d"].join("\n"));
  assert.equal(blocksToPlainText([{ type: "text", text: "x".repeat(3000) }], 10).length, 10);
});

test("fallback content: hidden only when it is exactly what the blocks render to", () => {
  const blocks = [{ type: "heading" as const, level: 2, text: "Titulo" }, { type: "list" as const, items: ["a", "b"] }];
  assert.equal(isFallbackContent("Titulo\n- a\n- b", blocks), true);
  assert.equal(isFallbackContent("Titulo\n\n- a   - b", blocks), true);
  assert.equal(isFallbackContent("", blocks), true);
  assert.equal(isFallbackContent("Un texto propio", blocks), false);
  assert.equal(isFallbackContent("Titulo\n- a\n- b", []), false);
  assert.equal(isFallbackContent("{​{ x }}", [{ type: "text" as const, text: "{​{ x }}" }]), true);
});

test("fallback content: a text that only repeats the first heading is hidden (the community pack welcome and rules)", () => {
  const rules = [{ type: "heading" as const, level: 2, text: "Reglas de Cemelitos" }, { type: "text" as const, text: "Respeta a las demas personas." }];
  assert.equal(isFallbackContent("Reglas de Cemelitos", rules), true);
  assert.equal(isFallbackContent("  Reglas   de Cemelitos ", rules), true);
  const welcome = [{ type: "heading" as const, level: 2, text: "Bienvenid@ Ana" }, { type: "text" as const, text: "Esto es Cemelitos." }];
  assert.equal(isFallbackContent("Bienvenid@ Ana a Cemelitos", welcome), true);
  // real content is never swallowed
  assert.equal(isFallbackContent("Reglas de Cemelitos: leelas antes de escribir y respeta siempre a las demas personas del club", rules), false);
  assert.equal(isFallbackContent("Otro texto", rules), false);
  assert.equal(isFallbackContent("Reglas de Cemelitos", [{ type: "text" as const, text: "Reglas de Cemelitos" }, { type: "text" as const, text: "y mas" }]), false);
});

test("line helpers of the structured editor round-trip", () => {
  assert.deepEqual(linesToList(" a \n\n b\r\nc"), ["a", "b", "c"]);
  assert.deepEqual(linesToChecklist("[x] hecho\n[ ] pendiente\nsuelto"), [{ text: "hecho", checked: true }, { text: "pendiente", checked: false }, { text: "suelto", checked: false }]);
  assert.equal(checklistToLines(linesToChecklist("[x] a\n[ ] b")), "[x] a\n[ ] b");
  assert.deepEqual(linesToRows("1 | 2\n3 | 4"), [["1", "2"], ["3", "4"]]);
  assert.equal(rowsToLines(linesToRows("1 | 2\n3 | 4")), "1 | 2\n3 | 4");
  assert.deepEqual(linesToFields("Estado | Activo | inline\nOtro | v"), [{ name: "Estado", value: "Activo", inline: true }, { name: "Otro", value: "v", inline: false }]);
  assert.equal(fieldsToLines(linesToFields("A | 1 | inline\nB | 2")), "A | 1 | inline\nB | 2");
});

test("message extras: reads rich, components, bot id and the bot reply reference; ignores garbage", () => {
  const e = readMessageExtras({
    rich: { version: 1, blocks: [{ type: "text", text: "a" }, { type: "nope" }, null, { type: "divider" }] },
    components: { rows: [{ components: [] }], expiresAt: "2026-01-01T00:00:00Z" },
    bot: { id: "b1", depth: 0 },
    replyTo: { messageId: "m1", userId: "u1", excerpt: "hola" },
  });
  assert.equal(e.blocks.length, 2);
  assert.equal(e.componentRows.length, 1);
  assert.equal(e.componentsExpiresAt, "2026-01-01T00:00:00Z");
  assert.equal(e.botId, "b1");
  assert.deepEqual(e.replyTo, { messageId: "m1", userId: "u1", excerpt: "hola" });
  const empty = readMessageExtras(null);
  assert.deepEqual([empty.blocks, empty.componentRows, empty.botId, empty.replyTo], [[], [], null, null]);
  // the people's replyTo ({ id, content, displayName }) is not a bot reference
  assert.equal(readMessageExtras({ replyTo: { id: "x", content: "y", displayName: "z" } }).replyTo, null);
});

test("only https urls open from a bot message", () => {
  assert.equal(safeHttpsUrl("https://x.test/a"), "https://x.test/a");
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpsUrl("http://x.test"), null);
  assert.equal(safeHttpsUrl("https://x.test/<script>"), null);
});
