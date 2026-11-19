/**
 * The last board payload per board, kept in sessionStorage so a reload paints the previous board at once while the
 * fresh one is fetched (stale-while-revalidate). In memory-only form (`apiCache`) a hard reload starts empty, which is
 * what left the board blank until the API answered.
 *
 * Privacy: every key carries the user id, so a second account in the same tab never reads the first one's boards, and
 * `clearClientCaches` removes everything on logout. sessionStorage dies with the tab, which bounds the exposure further.
 */
export const BOARD_SNAPSHOT_PREFIX = "killio_cache_board_v1:";
/** Anything starting with this is a per-user cache and is removed on logout. */
export const CLIENT_CACHE_PREFIX = "killio_cache";
/** A single board larger than this (serialised) is not stored. */
export const BOARD_SNAPSHOT_MAX_CHARS = 400_000;
/** At most this many boards are kept per user; the oldest go first. */
export const BOARD_SNAPSHOT_MAX_BOARDS = 5;
/** Older than this it is dropped; it is always revalidated anyway, this only stops very old data from flashing. */
export const BOARD_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** The methods used, so tests can pass a plain object. `key`/`length` are needed to enumerate. */
export type SnapshotStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

type Stored<T> = { v: 1; savedAt: number; board: T };

export function boardSnapshotKey(userId: string, boardId: string): string {
  return `${BOARD_SNAPSHOT_PREFIX}${userId}:${boardId}`;
}

function keysWithPrefix(storage: SnapshotStorage, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

export function readBoardSnapshot<T>(
  storage: SnapshotStorage | null | undefined,
  userId: string | null | undefined,
  boardId: string,
  now = Date.now(),
): T | undefined {
  if (!storage || !userId || !boardId) return undefined;
  const key = boardSnapshotKey(userId, boardId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Stored<T>> | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== "number" || parsed.board == null || typeof parsed.board !== "object") {
      storage.removeItem(key);
      return undefined;
    }
    if (now - parsed.savedAt > BOARD_SNAPSHOT_MAX_AGE_MS) {
      storage.removeItem(key);
      return undefined;
    }
    return parsed.board as T;
  } catch {
    return undefined;
  }
}

/** Returns whether it was stored. Never throws (quota, private mode, corrupt neighbours). */
export function writeBoardSnapshot<T extends object>(
  storage: SnapshotStorage | null | undefined,
  userId: string | null | undefined,
  boardId: string,
  board: T,
  now = Date.now(),
): boolean {
  if (!storage || !userId || !boardId) return false;
  try {
    const raw = JSON.stringify({ v: 1, savedAt: now, board } satisfies Stored<T>);
    if (raw.length > BOARD_SNAPSHOT_MAX_CHARS) return false;
    const key = boardSnapshotKey(userId, boardId);
    // Keep the newest boards of this user only.
    const others = keysWithPrefix(storage, `${BOARD_SNAPSHOT_PREFIX}${userId}:`)
      .filter((k) => k !== key)
      .map((k) => {
        let savedAt = 0;
        try {
          savedAt = (JSON.parse(storage.getItem(k) ?? "null") as Partial<Stored<unknown>> | null)?.savedAt ?? 0;
        } catch {
          /* corrupt: oldest */
        }
        return { k, savedAt };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
    for (const stale of others.slice(BOARD_SNAPSHOT_MAX_BOARDS - 1)) storage.removeItem(stale.k);
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

/** Removes every per-user cache entry (`killio_cache*`) from the storage. Used on logout. Never throws. */
export function clearClientCaches(storage: SnapshotStorage | null | undefined): number {
  if (!storage) return 0;
  try {
    const keys = keysWithPrefix(storage, CLIENT_CACHE_PREFIX);
    keys.forEach((k) => storage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}
