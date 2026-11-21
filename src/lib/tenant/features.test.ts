import assert from "node:assert/strict";
import test from "node:test";

import { isPathEnabled } from "./features.ts";
import { DEFAULT_TENANT_CONFIG } from "./types.ts";

const features = DEFAULT_TENANT_CONFIG.features;

test("tenants can browse the marketplace but never reach the seller profile", () => {
  assert.equal(isPathEnabled("/marketplace", features, "tenant"), true);
  assert.equal(isPathEnabled("/marketplace/profile", features, "tenant"), false);
  assert.equal(isPathEnabled("/marketplace/profile/x", features, "tenant"), false);
});

test("killio.dev keeps the seller profile", () => {
  assert.equal(isPathEnabled("/marketplace/profile", features, "public"), true);
  assert.equal(isPathEnabled("/marketplace/profile", features), true);
});

test("the marketplace flag still hides everything", () => {
  assert.equal(isPathEnabled("/marketplace", { ...features, marketplace: false }, "tenant"), false);
});
