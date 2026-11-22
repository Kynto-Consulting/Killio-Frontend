import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RICH_LIMITS, V2_BLOCK_TYPES, accessoryButtons, badgesToLines, blankBlock, blocksToPlainText, contractVersion, countBlocks, countImages, formatTimestamp, galleryToLines, isFallbackContent,
  linesToBadges, linesToGallery, linesToPairs, linesToPollOptions, linesToStats, needsEmbedPermission, pairsToLines, pollOptionsToLines, pollResults, progressFraction, readMessageExtras, safeHttpsUrl,
  statsToLines, validateBlocks,
} from "./rich.ts";

const codes = (blocks: unknown) => validateBlocks(blocks).map((i) => `${i.at.join(".")}:${i.code}`);
const img = "https://x.test/a.png";

test("a valid example of every v2 block", () => {
  assert.deepEqual(codes([
    { type: "section", text: "Hola", accessory: { type: "thumbnail", url: img, alt: "logo" } },
    { type: "section", text: "Pulsa", accessory: { type: "button", label: "Ir", style: "link", url: "https://x.test" } },
    { type: "section", text: "Pulsa", accessory: { type: "button", label: "Ok", style: "success", customId: "ok:1" } },
    { type: "thumbnail", url: img, alt: "a", size: "lg" },
    { type: "media_gallery", items: [{ url: img, alt: "a" }, { url: img, caption: "b" }] },
    { type: "fields", columns: 2, fields: [{ name: "a", value: "1", inline: true }, { name: "b", value: "2" }] },
    { type: "author", name: "Ana", iconUrl: img, url: "https://x.test" },
    { type: "footer", text: "pie", iconUrl: img },
    { type: "timestamp", value: "2026-01-01T00:00:00Z", style: "relative", label: "Desde" },
    { type: "progress", value: 5, max: 10, label: "Carga", showPercent: true, tone: "success" },
    { type: "stats", items: [{ label: "A", value: "1", delta: "+2", trend: "up" }] },
    { type: "key_value", items: [{ key: "k", value: "v" }] },
    { type: "badges", items: [{ text: "nuevo", color: "green" }, { text: "x" }] },
    { type: "callout", variant: "warning", title: "Ojo", text: "t", icon: "⚠" },
    { type: "spacer", size: "sm" },
    { type: "divider", size: "lg" },
    { type: "poll", question: "¿?", options: [{ label: "a", votes: 3 }, { label: "b" }], closed: false },
    { type: "embed", title: "T", authorName: "A", authorIconUrl: img, footerIconUrl: img, footer: "f" },
    { type: "container", accentColor: "#112233", blocks: [{ type: "text", text: "x" }, { type: "columns", columns: [{ blocks: [{ type: "text", text: "a" }] }, { blocks: [{ type: "text", text: "b" }] }] }] },
    { type: "columns", columns: [{ blocks: [{ type: "text", text: "a" }] }, { blocks: [{ type: "image", url: img }] }, { blocks: [{ type: "badges", items: [{ text: "x" }] }] }] },
  ]), []);
});

test("every v2 type is a known block with a blank form", () => {
  for (const t of V2_BLOCK_TYPES) assert.equal(blankBlock(t).type, t);
});

test("overflows: gallery, fields, stats, key_value, badges, poll, columns, children", () => {
  const many = (n: number, item: unknown) => Array.from({ length: n }, () => item);
  assert.ok(codes([{ type: "media_gallery", items: many(7, { url: img }) }]).includes("0:gallery_range"));
  assert.ok(codes([{ type: "media_gallery", items: [] }]).includes("0:gallery_range"));
  assert.ok(codes([{ type: "fields", fields: many(13, { name: "a", value: "b" }) }]).includes("0:fields_many"));
  assert.ok(codes([{ type: "stats", items: many(9, { label: "a", value: "b" }) }]).includes("0:items_many"));
  assert.ok(codes([{ type: "key_value", items: many(16, { key: "a", value: "b" }) }]).includes("0:items_many"));
  assert.ok(codes([{ type: "badges", items: many(16, { text: "a" }) }]).includes("0:items_many"));
  assert.ok(codes([{ type: "poll", question: "q", options: [{ label: "a" }] }]).includes("0:poll_options"));
  assert.ok(codes([{ type: "poll", question: "q", options: many(11, { label: "a" }) }]).includes("0:poll_options"));
  assert.ok(codes([{ type: "columns", columns: [{ blocks: [{ type: "text", text: "a" }] }] }]).includes("0:columns_count"));
  assert.ok(codes([{ type: "container", blocks: many(16, { type: "text", text: "a" }) }]).includes("0:children_range"));
  assert.ok(codes([{ type: "container", blocks: [] }]).includes("0:children_range"));
  assert.ok(codes([{ type: "columns", columns: [{ blocks: many(7, { type: "text", text: "a" }) }, { blocks: [{ type: "text", text: "b" }] }] }]).includes("0:children_range"));
});

test("invalid values of each v2 type", () => {
  assert.deepEqual(codes([{ type: "progress", value: 11, max: 10 }]), ["0:progress_range"]);
  assert.deepEqual(codes([{ type: "progress", value: -1 }]), ["0:progress_range"]);
  assert.deepEqual(codes([{ type: "progress", value: 5, max: 0 }]), ["0:progress_range"]);
  assert.deepEqual(codes([{ type: "progress", value: "{n}" }]), [], "templated values are not measured");
  assert.deepEqual(codes([{ type: "callout", variant: "loud", text: "x" }]), ["0:variant_invalid"]);
  assert.deepEqual(codes([{ type: "spacer", size: "xl" }]), ["0:size_invalid"]);
  assert.deepEqual(codes([{ type: "timestamp", value: "nope" }]), ["0:timestamp"]);
  assert.deepEqual(codes([{ type: "thumbnail", url: "http://x.test/a.png" }]), ["0:url_https"]);
  assert.deepEqual(codes([{ type: "author", name: "a", iconUrl: "javascript:alert(1)" }]), ["0:url_https"]);
  assert.deepEqual(codes([{ type: "footer", text: "a", iconUrl: "data:image/png;base64,AAAA" }]), ["0:url_https"]);
  assert.deepEqual(codes([{ type: "section", text: "a", accessory: { type: "thumbnail", url: "ftp://x" } }]), ["0:url_https"]);
  assert.deepEqual(codes([{ type: "section", text: "a", accessory: { type: "button", label: "x", style: "primary" } }]), ["0:accessory_invalid"]);
  assert.deepEqual(codes([{ type: "section", text: "a", accessory: { type: "button", label: "x", style: "primary", customId: "bad id" } }]), ["0:accessory_invalid"]);
  assert.deepEqual(codes([{ type: "section", text: "a", accessory: { type: "video" } }]), ["0:accessory_invalid"]);
  assert.deepEqual(codes([{ type: "section", text: "x".repeat(2001) }]), ["0:text_long"]);
  assert.deepEqual(codes([{ type: "stats", items: [{ label: "a", value: "b", trend: "sideways" }] }]), ["0.0:stat_item"]);
  assert.deepEqual(codes([{ type: "badges", items: [{ text: "a", color: "magenta" }] }]), ["0.0:badge_item"]);
  assert.deepEqual(codes([{ type: "poll", question: "q", options: [{ label: "a", votes: -2 }, { label: "b" }] }]), ["0.0:poll_votes"]);
  assert.deepEqual(codes([{ type: "container", accentColor: "red", blocks: [{ type: "text", text: "a" }] }]), ["0:color_format"]);
  assert.deepEqual(codes([{ type: "fields", columns: 4, fields: [{ name: "a", value: "b" }] }]), ["0:columns_range"]);
  assert.deepEqual(codes([{ type: "divider", size: "huge" }]), ["0:size_invalid"]);
});

test("nesting: a container holds no container, columns hold only simple blocks", () => {
  assert.ok(codes([{ type: "container", blocks: [{ type: "container", blocks: [{ type: "text", text: "a" }] }] }]).some((c) => c.endsWith(":nesting")));
  const inColumns = [{ type: "columns", columns: [{ blocks: [{ type: "container", blocks: [{ type: "text", text: "a" }] }] }, { blocks: [{ type: "text", text: "b" }] }] }];
  assert.ok(codes(inColumns).some((c) => c.endsWith(":nesting")));
  const columnsInColumns = [{ type: "columns", columns: [{ blocks: [{ type: "columns", columns: [] }] }, { blocks: [{ type: "text", text: "b" }] }] }];
  assert.ok(codes(columnsInColumns).some((c) => c.endsWith(":nesting")));
  // a problem inside a child is reported under the root block
  assert.deepEqual(codes([{ type: "container", blocks: [{ type: "text", text: "" }] }]), ["0.0:text_required"]);
});

test("message-wide limits: 60 blocks counting nested, 10 images, 32 KB", () => {
  const kids = Array.from({ length: 15 }, () => ({ type: "text", text: "a" }));
  const four = Array.from({ length: 4 }, () => ({ type: "container", blocks: kids }));
  assert.equal(countBlocks(four), 4 + 60);
  assert.ok(codes(four).includes(":total_blocks"));
  const gallery = { type: "media_gallery", items: Array.from({ length: 6 }, () => ({ url: img })) };
  assert.equal(countImages(gallery), 6);
  assert.ok(codes([gallery, gallery]).includes(":images_many"));
  assert.equal(countImages({ type: "embed", title: "t", imageUrl: img, thumbnailUrl: img }), 2);
  assert.equal(countImages({ type: "container", blocks: [gallery, { type: "thumbnail", url: img }] }), 7);
  const big = Array.from({ length: 20 }, () => ({ type: "text", text: "x".repeat(RICH_LIMITS.maxTextLength) }));
  assert.ok(codes(big).includes(":too_large"));
});

test("contract version: v1 stays 1, anything new is 2", () => {
  assert.equal(contractVersion([{ type: "text", text: "a" }, { type: "embed", title: "t" }, { type: "divider" }]), 1);
  assert.equal(contractVersion([{ type: "divider", size: "sm" }]), 2);
  assert.equal(contractVersion([{ type: "embed", title: "t", authorName: "x" }]), 2);
  assert.equal(contractVersion([{ type: "callout", text: "x" }]), 2);
});

test("embed permission is needed at any depth for remote content", () => {
  assert.equal(needsEmbedPermission([{ type: "text", text: "a" }, { type: "callout", text: "x" }, { type: "badges", items: [] }]), false);
  assert.equal(needsEmbedPermission([{ type: "container", blocks: [{ type: "thumbnail", url: img }] }]), true);
  assert.equal(needsEmbedPermission([{ type: "columns", columns: [{ blocks: [{ type: "text", text: "a" }] }, { blocks: [{ type: "media_gallery", items: [{ url: img }] }] }] }]), true);
  assert.equal(needsEmbedPermission([{ type: "section", text: "a", accessory: { type: "thumbnail", url: img } }]), true);
  assert.equal(needsEmbedPermission([{ type: "section", text: "a", accessory: { type: "button", label: "x", style: "primary", customId: "a" } }]), false);
  assert.equal(needsEmbedPermission([{ type: "author", name: "a", iconUrl: img }]), true);
  assert.equal(needsEmbedPermission([{ type: "author", name: "a" }]), false);
});

test("accessory buttons are found at any depth", () => {
  const found = accessoryButtons([
    { type: "section", text: "a", accessory: { type: "button", label: "1", style: "primary", customId: "a" } },
    { type: "container", blocks: [{ type: "section", text: "b", accessory: { type: "button", label: "2", style: "primary", customId: "b" } }, { type: "section", text: "c", accessory: { type: "thumbnail", url: img } }] },
  ]);
  assert.deepEqual(found.map((b) => b.customId), ["a", "b"]);
});

test("reader: messages stored by the v1 contract render the same", () => {
  const v1 = { rich: { version: 1, blocks: [{ type: "heading", level: 2, text: "Tus roles" }, { type: "text", text: "Pulsa" }, { type: "embed", title: "T", fields: [{ name: "a", value: "b" }] }] }, components: { expiresAt: "2030-01-01T00:00:00Z", rows: [] } };
  const e = readMessageExtras(v1);
  assert.deepEqual(e.blocks, v1.rich.blocks);
  assert.equal(e.componentsExpiresAt, "2030-01-01T00:00:00Z");
});

test("reader: unknown blocks are skipped, nested ones are re-limited, nothing throws", () => {
  const e = readMessageExtras({
    rich: {
      version: 9,
      blocks: [
        { type: "hologram", x: 1 },
        null,
        "x",
        { type: "text", text: "a" },
        { type: "container", blocks: [{ type: "gizmo" }, { type: "container", blocks: [{ type: "text", text: "no" }] }, { type: "text", text: "ok" }] },
        { type: "columns", columns: [{ blocks: [{ type: "columns", columns: [] }, { type: "text", text: "l" }] }, { blocks: [{ type: "text", text: "r" }] }, { blocks: [] }, { blocks: [] }] },
      ],
    },
  });
  assert.deepEqual(e.blocks.map((b) => b.type), ["text", "container", "columns"]);
  assert.deepEqual(e.blocks[1].blocks.map((b: any) => b.text), ["ok"]);
  assert.equal(e.blocks[2].columns.length, 3);
  assert.deepEqual(e.blocks[2].columns[0].blocks.map((b: any) => b.type), ["text"]);
  assert.deepEqual(readMessageExtras({ rich: { blocks: "no" } }).blocks, []);
});

test("plain-text rendition covers v2 blocks and nested ones", () => {
  const blocks: any[] = [
    { type: "container", blocks: [{ type: "section", text: "Hola" }, { type: "badges", items: [{ text: "a" }, { text: "b" }] }] },
    { type: "stats", items: [{ label: "Uptime", value: "99%" }] },
    { type: "progress", value: 3, max: 4, label: "Carga" },
    { type: "poll", question: "¿Día?", options: [{ label: "Lunes" }, { label: "Martes" }] },
    { type: "callout", title: "Ojo", text: "cuidado" },
    { type: "key_value", items: [{ key: "k", value: "v" }] },
  ];
  const text = blocksToPlainText(blocks);
  for (const part of ["Hola", "a, b", "Uptime: 99%", "Carga: 3/4", "¿Día?", "- Lunes", "Ojo: cuidado", "k: v"]) assert.ok(text.includes(part), part);
  assert.equal(isFallbackContent(text, blocks), true);
});

test("poll results: percentages of the votes the script wrote", () => {
  assert.deepEqual(pollResults([{ label: "a", votes: 3 }, { label: "b", votes: 1 }]).map((r) => r.percent), [75, 25]);
  assert.deepEqual(pollResults([{ label: "a" }, { label: "b" }]).map((r) => r.percent), [0, 0]);
  assert.deepEqual(pollResults("x"), []);
  assert.equal(pollResults([{ label: "a", votes: -4 }])[0].votes, 0);
});

test("progress fraction is clamped and never NaN", () => {
  assert.equal(progressFraction(5, 10), 0.5);
  assert.equal(progressFraction(50, 10), 1);
  assert.equal(progressFraction(-1, 10), 0);
  assert.equal(progressFraction("x", 10), 0);
  assert.equal(progressFraction(1, 0), 0);
  assert.equal(progressFraction(25, undefined), 0.25);
});

test("timestamps: relative and absolute in the reader's locale", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  assert.equal(formatTimestamp("2026-06-01T09:00:00Z", "relative", now, "en"), "3 hours ago");
  assert.equal(formatTimestamp("2026-06-02T12:00:00Z", "relative", now, "en"), "tomorrow");
  assert.equal(formatTimestamp("garbage", "relative", now, "en"), "");
  assert.ok(formatTimestamp("2026-06-01T09:00:00Z", "date", now, "en").includes("2026"));
  assert.ok(formatTimestamp("2026-06-01T09:00:00Z", "nonsense", now, "en").length > 8, "unknown style falls back to date and time");
});

test("editor lines round-trip", () => {
  const stats = [{ label: "A", value: "1", delta: "+2", trend: "up" }, { label: "B", value: "2" }];
  assert.deepEqual(linesToStats(statsToLines(stats)), stats);
  const pairs = [{ key: "k", value: "v" }];
  assert.deepEqual(linesToPairs(pairsToLines(pairs)), pairs);
  const badges = [{ text: "a", color: "green" }, { text: "b" }];
  assert.deepEqual(linesToBadges(badgesToLines(badges)), badges);
  const options = [{ label: "a", votes: 2 }, { label: "b" }];
  assert.deepEqual(linesToPollOptions(pollOptionsToLines(options)), options);
  const gallery = [{ url: img, alt: "x", caption: "y" }, { url: img }];
  assert.deepEqual(linesToGallery(galleryToLines(gallery)), gallery);
  assert.deepEqual(linesToStats("A | 1 | | sideways"), [{ label: "A", value: "1" }]);
});

test("URLs: only https is ever opened", () => {
  assert.equal(safeHttpsUrl("https://x.test/a"), "https://x.test/a");
  for (const bad of ["http://x.test", "javascript:alert(1)", "//x.test", "https://x.test/a b", "data:text/html,hi", "", null, undefined, 5]) assert.equal(safeHttpsUrl(bad), null, String(bad));
});
