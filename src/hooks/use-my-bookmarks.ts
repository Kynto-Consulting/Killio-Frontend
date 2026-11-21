"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMessageBookmark, listMyBookmarks, removeMessageBookmark } from "@/lib/api/room-tools";
import type { RoomMessage } from "@/lib/api/rooms";
import { BOOKMARK_LIMITS, addBookmarkLocal, clampNote, removeBookmarkLocal, type Bookmark } from "@/lib/rooms/bookmarks";

export type BookmarksState = "idle" | "loading" | "ready" | "error";

/**
 * The person's personal bookmarks (GET /me/bookmarks, newest first). Loaded once and kept in step with the toggles made here, so the
 * message tools can show the state without asking the server per message. The list is private: nobody else sees it.
 */
export function useMyBookmarks(accessToken: string | null | undefined) {
  const [list, setList] = useState<Bookmark[]>([]);
  const [state, setState] = useState<BookmarksState>("idle");

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setState((s) => (s === "ready" ? s : "loading"));
    try {
      setList(await listMyBookmarks(accessToken, { limit: BOOKMARK_LIMITS.listMax }));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ids = useMemo(() => new Set(list.map((b) => b.messageId)), [list]);

  /** Bookmarks or un-bookmarks one message. Throws (with `status`) so the caller can show the reason. */
  const toggle = useCallback(
    async (message: Pick<RoomMessage, "id" | "roomId" | "content" | "userId" | "createdAt">, roomName = "") => {
      if (!accessToken) return;
      if (ids.has(message.id)) {
        await removeMessageBookmark(message.roomId, message.id, accessToken);
        setList((cur) => removeBookmarkLocal(cur, message.id));
        return;
      }
      await addMessageBookmark(message.roomId, message.id, null, accessToken);
      setList((cur) => addBookmarkLocal(cur, { messageId: message.id, roomId: message.roomId, roomName, note: null, bookmarkedAt: new Date().toISOString(), content: message.content, authorId: message.userId, messageCreatedAt: message.createdAt }));
    },
    [accessToken, ids],
  );

  const remove = useCallback(
    async (b: Pick<Bookmark, "messageId" | "roomId">) => {
      if (!accessToken) return;
      await removeMessageBookmark(b.roomId, b.messageId, accessToken);
      setList((cur) => removeBookmarkLocal(cur, b.messageId));
    },
    [accessToken],
  );

  /** Saves the note (PUT is idempotent: it updates the note of an existing bookmark). */
  const setNote = useCallback(
    async (b: Pick<Bookmark, "messageId" | "roomId">, note: string) => {
      if (!accessToken) return;
      const clean = clampNote(note);
      await addMessageBookmark(b.roomId, b.messageId, clean || null, accessToken);
      setList((cur) => cur.map((x) => (x.messageId === b.messageId ? { ...x, note: clean || null } : x)));
    },
    [accessToken],
  );

  return { list, ids, state, reload, toggle, remove, setNote };
}
