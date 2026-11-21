/**
 * Personal bookmarks of messages (private to the person). Pure, tested in bookmarks.test.ts.
 * Contract: Killio-Backend/src/modules/rooms/room-tools.service.ts
 *   PUT    /rooms/:id/messages/:mid/bookmark   { note? } -> { bookmarked: true, messageId, roomId, note }   (idempotent: updates the note)
 *   DELETE /rooms/:id/messages/:mid/bookmark   -> { bookmarked: false, ... }
 *   GET    /me/bookmarks?roomId=&limit=        [{ messageId, roomId, roomName, note, bookmarkedAt, content, authorId, messageCreatedAt }]
 * Up to 500 bookmarks per person, notes of 500 characters; rooms the person can no longer see are filtered out by the server.
 */

export const BOOKMARK_LIMITS = { perUser: 500, note: 500, listMax: 200, listDefault: 50 } as const;

export interface Bookmark {
  messageId: string;
  roomId: string;
  roomName: string;
  note: string | null;
  bookmarkedAt: string;
  content: string;
  authorId: string | null;
  messageCreatedAt: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function normalizeBookmark(raw: unknown): Bookmark | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.messageId !== "string" || typeof r.roomId !== "string") return null;
  return {
    messageId: r.messageId,
    roomId: r.roomId,
    roomName: str(r.roomName) ?? "",
    note: str(r.note)?.trim() || null,
    bookmarkedAt: str(r.bookmarkedAt) ?? "",
    content: str(r.content) ?? "",
    authorId: str(r.authorId),
    messageCreatedAt: str(r.messageCreatedAt),
  };
}

export const normalizeBookmarks = (raw: unknown): Bookmark[] => (Array.isArray(raw) ? raw : []).map(normalizeBookmark).filter((b): b is Bookmark => !!b);

/** Text of a stored message for a list row: mentions as `@Name`, markup tags dropped, whitespace collapsed. */
export function plainExcerpt(content: string, max = 160): string {
  const text = content
    .replace(/@\[([^\]]*)\]\(([^)]*)\)/g, (_m, name: string) => `@${name}`)
    .replace(/@\[(?:user|role|group):[^:\]]+:([^\]]*)\]/g, "@$1")
    .replace(/<asset[^>]*\/>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const clampNote = (note: string): string => note.trim().slice(0, BOOKMARK_LIMITS.note);

/** Newest first, as the server returns them; this keeps the order stable when the list is patched locally. */
export function sortBookmarks(list: readonly Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => b.bookmarkedAt.localeCompare(a.bookmarkedAt));
}

export function addBookmarkLocal(list: readonly Bookmark[], b: Bookmark): Bookmark[] {
  return sortBookmarks([b, ...list.filter((x) => x.messageId !== b.messageId)]);
}

export const removeBookmarkLocal = (list: readonly Bookmark[], messageId: string): Bookmark[] => list.filter((x) => x.messageId !== messageId);

export interface BookmarkGroup {
  roomId: string;
  roomName: string;
  items: Bookmark[];
}

/** Groups by room keeping the order of the first appearance (newest bookmark first). */
export function groupByRoom(list: readonly Bookmark[]): BookmarkGroup[] {
  const map = new Map<string, BookmarkGroup>();
  for (const b of list) {
    const g = map.get(b.roomId) ?? { roomId: b.roomId, roomName: b.roomName, items: [] };
    g.items.push(b);
    map.set(b.roomId, g);
  }
  return [...map.values()];
}

/** Accent- and case-insensitive filter over text, note and room. */
export function filterBookmarks(list: readonly Bookmark[], query: string): Bookmark[] {
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return [...list];
  return list.filter((b) => norm(`${plainExcerpt(b.content, 4000)} ${b.note ?? ""} ${b.roomName}`).includes(q));
}
