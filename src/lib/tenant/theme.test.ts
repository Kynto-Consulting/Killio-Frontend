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
