import assert from "node:assert/strict";
import test from "node:test";

import { kindFromFilename, isKillioFile, extForKind } from "./fs-access.ts";

test("kindFromFilename maps each extension", () => {
  assert.equal(kindFromFilename("notes.kd"), "kd");
  assert.equal(kindFromFilename("board.kb"), "kb");
  assert.equal(kindFromFilename("flow.ks"), "ks");
  assert.equal(kindFromFilename("diagram.km"), "km");
});

test("kindFromFilename is case-insensitive on extension", () => {
  assert.equal(kindFromFilename("X.KM"), "km");
});

test("kindFromFilename rejects non-killio + extensionless", () => {
  assert.equal(kindFromFilename("photo.png"), null);
  assert.equal(kindFromFilename("README"), null);
  assert.equal(kindFromFilename("archive.json"), null);
});

test("kindFromFilename handles dotted names", () => {
  assert.equal(kindFromFilename("my.cool.mesh.km"), "km");
});

test("isKillioFile reflects kindFromFilename", () => {
  assert.equal(isKillioFile("a.km"), true);
  assert.equal(isKillioFile("a.txt"), false);
});

test("extForKind returns dot extension", () => {
  assert.equal(extForKind("kd"), ".kd");
  assert.equal(extForKind("km"), ".km");
  assert.equal(extForKind("kb"), ".kb");
  assert.equal(extForKind("ks"), ".ks");
});
