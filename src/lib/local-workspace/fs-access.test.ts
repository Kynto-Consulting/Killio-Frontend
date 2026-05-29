import assert from "node:assert/strict";
import test from "node:test";

import { kindFromFilename, isKillioFile, extForKind, splitPath, joinPath } from "./fs-access.ts";

test("splitPath separates folders from name", () => {
  assert.deepEqual(splitPath("notes.kd"), { dirs: [], name: "notes.kd" });
  assert.deepEqual(splitPath("specs/v2/notes.kd"), { dirs: ["specs", "v2"], name: "notes.kd" });
  assert.deepEqual(splitPath("/a//b/x.kd"), { dirs: ["a", "b"], name: "x.kd" });
});

test("joinPath builds normalized relative path", () => {
  assert.equal(joinPath("", "notes.kd"), "notes.kd");
  assert.equal(joinPath("specs/v2", "notes.kd"), "specs/v2/notes.kd");
  assert.equal(joinPath("/specs/", "notes.kd"), "specs/notes.kd");
});

test("splitPath/joinPath roundtrip", () => {
  const p = "a/b/c.km";
  const { dirs, name } = splitPath(p);
  assert.equal(joinPath(dirs.join("/"), name), p);
});

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
