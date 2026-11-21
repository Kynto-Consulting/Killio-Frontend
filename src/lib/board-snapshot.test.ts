import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_SNAPSHOT_MAX_AGE_MS,
  BOARD_SNAPSHOT_MAX_BOARDS,
  BOARD_SNAPSHOT_MAX_CHARS,
  boardSnapshotKey,
  clearClientCaches,
  readBoardSnapshot,
  writeBoardSnapshot,
  type SnapshotStorage,
} from "./board-snapshot.ts";

function memoryStorage(): SnapshotStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const board = (name: string) => ({ id: "b1", name, lists: [{ id: "l1", name: "To do", cards: [] }] });

test("a written board is read back", () => {
  const s = memoryStorage();
  assert.equal(writeBoardSnapshot(s, "u1", "b1", board("A"), 1000), true);
  assert.deepEqual(readBoardSnapshot(s, "u1", "b1", 2000), board("A"));
});

test("keys are scoped by user: another account never reads the board", () => {
  const s = memoryStorage();
  writeBoardSnapshot(s, "u1", "b1", board("A"));
  assert.equal(readBoardSnapshot(s, "u2", "b1"), undefined);
  assert.ok(boardSnapshotKey("u1", "b1").includes("u1"));
});

test("without a user id nothing is stored or read", () => {
  const s = memoryStorage();
  assert.equal(writeBoardSnapshot(s, null, "b1", board("A")), false);
  assert.equal(s.data.size, 0);
  assert.equal(readBoardSnapshot(s, undefined, "b1"), undefined);
});

test("versioning: another version or a corrupt value is ignored and removed", () => {
  const s = memoryStorage();
  s.setItem(boardSnapshotKey("u1", "b1"), JSON.stringify({ v: 2, savedAt: 1, board: {} }));
  assert.equal(readBoardSnapshot(s, "u1", "b1", 2), undefined);
  assert.equal(s.data.size, 0);
  s.setItem(boardSnapshotKey("u1", "b2"), "{broken");
  assert.equal(readBoardSnapshot(s, "u1", "b2"), undefined);
  s.setItem(boardSnapshotKey("u1", "b3"), "null");
  assert.equal(readBoardSnapshot(s, "u1", "b3"), undefined);
});

test("an old snapshot is dropped", () => {
  const s = memoryStorage();
  writeBoardSnapshot(s, "u1", "b1", board("A"), 0);
  assert.equal(readBoardSnapshot(s, "u1", "b1", BOARD_SNAPSHOT_MAX_AGE_MS + 1), undefined);
  assert.equal(s.data.size, 0);
});

test("size cap: an oversized board is not stored", () => {
  const s = memoryStorage();
  assert.equal(writeBoardSnapshot(s, "u1", "b1", { blob: "x".repeat(BOARD_SNAPSHOT_MAX_CHARS) }), false);
  assert.equal(s.data.size, 0);
});

test("count cap: only the newest boards of the user are kept, other users untouched", () => {
  const s = memoryStorage();
  writeBoardSnapshot(s, "other", "bx", board("X"), 1);
  for (let i = 0; i < BOARD_SNAPSHOT_MAX_BOARDS + 3; i++) writeBoardSnapshot(s, "u1", `b${i}`, board(String(i)), 100 + i);
  const mine = [...s.data.keys()].filter((k) => k.includes(":u1:"));
  assert.equal(mine.length, BOARD_SNAPSHOT_MAX_BOARDS);
  assert.equal(readBoardSnapshot(s, "u1", "b0", 200), undefined, "the oldest was evicted");
  assert.ok(readBoardSnapshot(s, "u1", `b${BOARD_SNAPSHOT_MAX_BOARDS + 2}`, 200));
  assert.ok(readBoardSnapshot(s, "other", "bx", 200), "another user's entry is not evicted by this user");
});

test("logout clears every killio_cache key and leaves the rest", () => {
  const s = memoryStorage();
  writeBoardSnapshot(s, "u1", "b1", board("A"));
  writeBoardSnapshot(s, "u2", "b2", board("B"));
  s.setItem("killio_cache:boards:t1", "{}");
  s.setItem("killio_tenant_theme_v1", "{}");
  s.setItem("unrelated", "1");
  assert.equal(clearClientCaches(s), 3);
  assert.equal(readBoardSnapshot(s, "u1", "b1"), undefined);
  assert.equal(readBoardSnapshot(s, "u2", "b2"), undefined);
  assert.ok(s.getItem("killio_tenant_theme_v1"), "the tenant look is not user data");
  assert.ok(s.getItem("unrelated"));
});

test("a storage that throws never breaks the page", () => {
  const broken: SnapshotStorage = {
    length: 0,
    key: () => null,
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(readBoardSnapshot(broken, "u1", "b1"), undefined);
  assert.equal(writeBoardSnapshot(broken, "u1", "b1", board("A")), false);
  assert.equal(clearClientCaches(broken), 0);
  assert.equal(readBoardSnapshot(null, "u1", "b1"), undefined);
});
