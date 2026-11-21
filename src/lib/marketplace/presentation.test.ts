import assert from "node:assert/strict";
import test from "node:test";

import {
  addTag, categoriesFromPacks, coverFamily, filterPacks, generateCover, groupAssets, KNOWN_CATEGORIES, MAX_TAGS, moveItem,
  parseInstallParam, relatedPacks, slugifyCategory, sortPacks, validateCategory, validateImageFile, validateImageUrl,
} from "./presentation.ts";

const packs = [
  { id: "a", title: "Control de gastos", summary: "Presupuesto mensual", category: "finanzas", tags: ["ahorro", "Café"], authorName: "Ana", updatedAt: "2026-01-02", pricingType: "paid" as const, priceAmountMinor: 900, currency: "USD" },
  { id: "b", title: "Kit comunidad", summary: null, category: "comunidad", tags: [], authorName: null, updatedAt: "2026-03-01" },
  { id: "c", title: "Tablero dev", summary: "Sprints", category: "desarrollo", tags: ["agile"], updatedAt: "2026-02-01", pricingType: "paid" as const, priceAmountMinor: 300, currency: "USD" },
  { id: "d", title: "Sin categoria", updatedAt: "2025-12-01" },
];

test("generated cover is deterministic and varies by category", () => {
  assert.deepEqual(generateCover("p1", "finanzas"), generateCover("p1", "finanzas"));
  assert.notDeepEqual(generateCover("p1", "finanzas"), generateCover("p2", "finanzas"));
  const bgs = new Set([...KNOWN_CATEGORIES, "otra"].map((c) => generateCover("x", c).background));
  assert.equal(bgs.size, KNOWN_CATEGORIES.length + 1);
  assert.equal(generateCover("x", null).family, "otra");
  assert.equal(coverFamily("zzz"), "otra");
});

test("generated cover shapes stay inside the 160x100 canvas", () => {
  for (const cat of [...KNOWN_CATEGORIES, "otra"]) {
    for (const seed of ["a", "b", "zz9", "00000000-1111"]) {
      for (const sh of generateCover(seed, cat).shapes) {
        assert.ok(sh.x >= 6 && sh.x <= 154 && sh.y >= 6 && sh.y <= 94);
      }
    }
  }
});

test("filter by category, text and tags (accents ignored)", () => {
  assert.deepEqual(filterPacks(packs, { category: "finanzas" }).map((p) => p.id), ["a"]);
  assert.deepEqual(filterPacks(packs, { category: "all" }).length, 4);
  assert.deepEqual(filterPacks(packs, { query: "cafe" }).map((p) => p.id), ["a"]);
  assert.deepEqual(filterPacks(packs, { query: "AGILE" }).map((p) => p.id), ["c"]);
  assert.deepEqual(filterPacks(packs, { query: "ana presupuesto" }).map((p) => p.id), ["a"]);
  assert.deepEqual(filterPacks(packs, { query: "kit", category: "finanzas" }), []);
});

test("categories are listed with counts, known first", () => {
  assert.deepEqual(categoriesFromPacks([...packs, { id: "e", title: "x", category: "zeta" }]), [
    { slug: "finanzas", count: 1 }, { slug: "comunidad", count: 1 }, { slug: "desarrollo", count: 1 }, { slug: "zeta", count: 1 },
  ]);
});

test("sorting: recent, free first, price", () => {
  assert.deepEqual(sortPacks(packs, "recent").map((p) => p.id), ["b", "c", "a", "d"]);
  assert.deepEqual(sortPacks(packs, "freeFirst").map((p) => p.id), ["b", "d", "c", "a"]);
  assert.deepEqual(sortPacks(packs, "price").map((p) => p.id), ["b", "d", "c", "a"]);
  assert.equal(packs[0].id, "a");
});

test("related packs share the category and exclude the current one", () => {
  const more = [...packs, { id: "f", title: "Otro", category: "finanzas", updatedAt: "2026-04-01" }];
  assert.deepEqual(relatedPacks(more, { id: "a", category: "finanzas" }).map((p) => p.id), ["f"]);
  assert.deepEqual(relatedPacks(more, { id: "d", category: null }), []);
});

test("assets are grouped by type with counts and display names", () => {
  const groups = groupAssets([
    { assetType: "script", logicalKey: "s1", displayName: null, orderIndex: 0 },
    { assetType: "document", logicalKey: "d2", displayName: "Guia", orderIndex: 1 },
    { assetType: "document", logicalKey: "d1", displayName: "  ", orderIndex: 0 },
  ]);
  assert.deepEqual(groups.map((g) => [g.type, g.count]), [["document", 2], ["script", 1]]);
  assert.deepEqual(groups[0].items.map((i) => i.name), ["d1", "Guia"]);
});

test("image url validation", () => {
  assert.deepEqual(validateImageUrl("https://a.com/x.png"), { ok: true, url: "https://a.com/x.png" });
  assert.equal(validateImageUrl("/uploads/image/a.png").ok, true);
  assert.equal(validateImageUrl("data:image/png;base64,AAAA").ok, true);
  assert.deepEqual(validateImageUrl(""), { ok: false, reason: "empty" });
  assert.deepEqual(validateImageUrl("javascript:alert(1)"), { ok: false, reason: "protocol" });
  assert.deepEqual(validateImageUrl("data:image/svg+xml;base64,AAAA"), { ok: false, reason: "protocol" });
  assert.deepEqual(validateImageUrl("not a url"), { ok: false, reason: "invalid" });
  assert.equal(validateImageUrl("https://u:p@a.com/x.png").ok, false);
  assert.deepEqual(validateImageUrl("https://a.com/" + "x".repeat(2100)), { ok: false, reason: "tooLong" });
});

test("image file validation", () => {
  assert.equal(validateImageFile({ type: "image/png", size: 1000 }).ok, true);
  assert.deepEqual(validateImageFile({ type: "image/svg+xml", size: 1000 }), { ok: false, reason: "type" });
  assert.deepEqual(validateImageFile({ type: "image/png", size: 6 * 1024 * 1024 }), { ok: false, reason: "size" });
  assert.deepEqual(validateImageFile({ type: "image/png", size: 0 }), { ok: false, reason: "empty" });
});

test("tags, reorder and category helpers", () => {
  assert.deepEqual(addTag(["a"], "  Café Bar!"), ["a", "cafe-bar"]);
  assert.deepEqual(addTag(["a"], "A"), ["a"]);
  assert.deepEqual(addTag(["a"], "!!"), ["a"]);
  let tags: string[] = [];
  for (let i = 0; i < 12; i += 1) tags = addTag(tags, `t${i}`);
  assert.equal(tags.length, MAX_TAGS);
  assert.deepEqual(moveItem([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(moveItem([1, 2, 3], 0, 5), [1, 2, 3]);
  assert.equal(validateCategory("finanzas"), null);
  assert.equal(validateCategory(""), null);
  assert.equal(validateCategory("Mal Slug"), "invalid");
  assert.equal(slugifyCategory("Educación Online"), "educacion-online");
});

test("install param parser", () => {
  assert.equal(parseInstallParam("?install=abc-123_X"), "abc-123_X");
  assert.equal(parseInstallParam("?install="), null);
  assert.equal(parseInstallParam("?install=../x"), null);
  assert.equal(parseInstallParam("?other=1"), null);
  assert.equal(parseInstallParam("?install=" + "a".repeat(65)), null);
});

import { readFileSync } from "node:fs";
import { COVER_TOKENS, contrastRatio, relativeLuminance } from "./presentation.ts";

test("contrast function matches WCAG reference values", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
  assert.ok(Math.abs(contrastRatio("#777777", "#FFFFFF") - 4.48) < 0.05);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
});

test("every cover pair meets WCAG AA (4.5:1) in light and dark mode", () => {
  for (const mode of ["light", "dark"] as const) {
    const t = COVER_TOKENS[mode];
    const bgs = Object.entries(t).filter(([k]) => k.startsWith("--cover-bg-") || k.startsWith("--cover-badge-"));
    assert.equal(bgs.length, 8);
    for (const [name, bg] of bgs) assert.ok(contrastRatio(t["--cover-ink"], bg) >= 4.5, `${mode} ${name}`);
    assert.ok(contrastRatio(t["--cover-ink"], t["--cover-sticker"]) >= 4.5, `${mode} sticker`);
  }
});

test("globals.css defines exactly the cover tokens of both modes", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  const tail = css.slice(css.indexOf("Marketplace cover tokens"));
  const rootBlock = /:root \{([^}]*)\}/.exec(tail)?.[1] ?? "";
  const darkBlock = /\.dark \{([^}]*)\}/.exec(tail)?.[1] ?? "";
  for (const [mode, block] of [["light", rootBlock], ["dark", darkBlock]] as const) {
    for (const [name, value] of Object.entries(COVER_TOKENS[mode])) {
      assert.ok(block.includes(`${name}: ${value};`), `${mode} ${name}`);
    }
  }
});

test("generated covers never use fixed backgrounds", () => {
  for (const cat of [...KNOWN_CATEGORIES, "otra"]) assert.match(generateCover("x", cat).background, /^var\(--cover-bg-/);
});
