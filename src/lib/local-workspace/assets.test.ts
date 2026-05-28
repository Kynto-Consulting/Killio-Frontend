import assert from "node:assert/strict";
import test from "node:test";

import { extFromMime, assetFilename, makeAssetRef, isAssetRef, assetNameFromRef } from "./assets.ts";

test("extFromMime maps common types, falls back to bin", () => {
  assert.equal(extFromMime("image/png"), "png");
  assert.equal(extFromMime("image/jpeg"), "jpg");
  assert.equal(extFromMime("image/svg+xml"), "svg");
  assert.equal(extFromMime("application/pdf"), "pdf");
  assert.equal(extFromMime("application/x-weird"), "bin");
  assert.equal(extFromMime(""), "bin");
});

test("assetFilename combines id + ext", () => {
  assert.equal(assetFilename("image/png", "abc123"), "abc123.png");
  assert.equal(assetFilename("application/x-weird", "id"), "id.bin");
});

test("asset ref scheme roundtrips", () => {
  const ref = makeAssetRef("abc123.png");
  assert.equal(ref, "asset:abc123.png");
  assert.equal(isAssetRef(ref), true);
  assert.equal(assetNameFromRef(ref), "abc123.png");
});

test("isAssetRef rejects non-refs (http/data/plain)", () => {
  assert.equal(isAssetRef("https://x/y.png"), false);
  assert.equal(isAssetRef("data:image/png;base64,xxx"), false);
  assert.equal(isAssetRef("plain"), false);
  assert.equal(isAssetRef(123), false);
  assert.equal(isAssetRef(null), false);
});

test("assetNameFromRef passes through a bare name", () => {
  assert.equal(assetNameFromRef("already-name.png"), "already-name.png");
});
