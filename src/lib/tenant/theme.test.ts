import assert from "node:assert/strict";
import test from "node:test";

import { buildTenantThemeCss } from "./theme.ts";
import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "./types.ts";

const tenant = (theme: Partial<PublicTenantConfig["theme"]>): PublicTenantConfig => ({
  ...DEFAULT_TENANT_CONFIG,
  mode: "tenant",
  theme: { ...DEFAULT_TENANT_CONFIG.theme, ...theme },
});

test("public mode never emits CSS", () => {
  const config = { ...tenant({ customCss: "body{color:red}" }), mode: "public" as const };
  assert.equal(buildTenantThemeCss(config), "");
});

test("free CSS variables and a stylesheet are emitted in tenant mode", () => {
  const css = buildTenantThemeCss(tenant({ vars: { light: { "sidebar-width": "15rem" }, dark: { "card-shadow": "0 1px 2px #000" } }, customCss: ".x{border-radius:4px}" }));
  assert.match(css, /:root\{[^}]*--sidebar-width:15rem;/);
  assert.match(css, /\.dark\{[^}]*--card-shadow:0 1px 2px #000;/);
  assert.match(css, /\.x\{border-radius:4px\}/);
});

test("unsafe overrides are dropped even if the backend let them through", () => {
  for (const customCss of ["</style><script>x</script>", "@import url(https://x.test/a.css);", "a{background:url(http://x.test/a.png)}", "a{content:\"\\3c\"}", "a{width:expression(1)}"]) {
    assert.ok(!buildTenantThemeCss(tenant({ customCss })).includes(customCss), customCss);
  }
  const css = buildTenantThemeCss(tenant({ vars: { light: { "Bad Name": "1", ok: "url(https://x.test)" }, dark: {} } }));
  assert.ok(!css.includes("Bad Name") && !css.includes("--ok"));
});

test("tenant fonts are preloaded (closest to regular first, at most three, only safe URLs)", async () => {
  const { tenantFontPreloads } = await import("./theme.ts");
  const fonts = [
    { weight: 300, url: "/tenant/A-Light.ttf" },
    { weight: 400, url: "/tenant/A-Regular.woff2" },
    { weight: 700, url: "https://cdn.acme.com/A-Bold.woff2" },
    { weight: 900, url: "/tenant/A-Black.woff2" },
    { weight: 500, url: "javascript:alert(1)" },
  ];
  const out = tenantFontPreloads(tenant({ fontFamily: "Acme Sans", fonts }));
  assert.equal(out.length, 3);
  assert.equal(out[0].href, "/tenant/A-Regular.woff2");
  assert.equal(out[0].type, "font/woff2");
  assert.ok(out.every((f) => !f.href.startsWith("javascript")));
  assert.deepEqual(tenantFontPreloads({ ...tenant({ fontFamily: "Acme Sans", fonts }), mode: "public" }), []);
  assert.deepEqual(tenantFontPreloads(tenant({ fonts })), [], "no family, no preload");
});

// ── purple palette follows the brand in tenant mode ───────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { purpleOverrideCss } from "./theme.ts";
import { PURPLE_CLASSES } from "./purple-classes.ts";

test("violet / purple classes are redrawn with the brand colour (base, hover, dark, opacity, gradients)", () => {
  const css = purpleOverrideCss(["bg-violet-600", "hover:bg-violet-500", "dark:text-violet-100", "bg-violet-950/70", "border-violet-800/40", "from-purple-500", "text-indigo-300"]);
  assert.ok(css.includes("html .bg-violet-600{background-color:hsl(var(--primary));}"));
  assert.ok(css.includes("html .hover\\:bg-violet-500:hover{background-color:color-mix(in srgb, hsl(var(--primary)) 92%, white);}"));
  assert.ok(css.includes("html.dark .dark\\:text-violet-100{color:color-mix(in srgb, hsl(var(--primary)) 15%, white);}"));
  assert.ok(css.includes("html .bg-violet-950\\/70{background-color:color-mix(in srgb, color-mix(in srgb, hsl(var(--primary)) 38%, black) 70%, transparent);}"));
  assert.ok(css.includes("--tw-gradient-from:color-mix"));
  assert.ok(!/violet[^{]*\{[^}]*#[0-9a-f]{3,6}/i.test(css), "no hard-coded colour is emitted");
});

test("tenant mode includes the overrides, public mode does not", () => {
  assert.ok(buildTenantThemeCss(tenant({})).includes("html .bg-violet-600{"));
  assert.equal(buildTenantThemeCss({ ...tenant({}), mode: "public" as const }), "");
});

test("every purple class used in src/ is covered (regenerate with node scripts/gen-purple-classes.js)", () => {
  const root = join(import.meta.dirname, "..", "..");
  const re = /((?:[a-z0-9-]+:)*)(bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret)-(violet|purple|indigo|fuchsia)-(\d{2,3})(?:\/(\d{1,3}))?/g;
  const used = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(p); continue; }
      if (!/\.(tsx|ts|css)$/.test(e.name) || /\.test\./.test(e.name) || e.name === "purple-classes.ts") continue;
      for (const m of readFileSync(p, "utf8").matchAll(re)) used.add(m[0]);
    }
  };
  walk(root);
  const listed = new Set(PURPLE_CLASSES);
  assert.deepEqual([...used].filter((c) => !listed.has(c)), []);
});
