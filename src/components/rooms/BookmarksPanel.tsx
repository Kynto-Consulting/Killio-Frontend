"use client";

/**
 * "My bookmarks": the person's private list of saved messages, across rooms, with a search box, an optional note per bookmark,
 * a jump to the message and a remove button. Rules: lib/rooms/bookmarks.ts.
 */

import { useMemo, useState } from "react";
import { Bookmark as BookmarkIcon, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";

import { BOOKMARK_LIMITS, clampNote, filterBookmarks, groupByRoom, plainExcerpt, type Bookmark } from "@/lib/rooms/bookmarks";
import type { BookmarksState } from "@/hooks/use-my-bookmarks";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface Props {
  bookmarks: readonly Bookmark[];
  state: BookmarksState;
  currentRoomId: string;
  /** Name of a room by id, for bookmarks that were just added here (the server fills `roomName` on reload). */
  roomNameOf: (roomId: string) => string | null;
  onJump: (b: Bookmark) => void;
  onRemove: (b: Bookmark) => Promise<void>;
  onSaveNote: (b: Bookmark, note: string) => Promise<void>;
  onReload: () => void;
  onClose: () => void;
  t: TFn;
}

export function BookmarksPanel({ bookmarks, state, currentRoomId, roomNameOf, onJump, onRemove, onSaveNote, onReload, onClose, t }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const visible = useMemo(() => filterBookmarks(bookmarks, query), [bookmarks, query]);
  const groups = useMemo(() => {
    const g = groupByRoom(visible);
    // The room the person is in comes first: it is the most likely thing to look for.
    return [...g].sort((a, b) => Number(b.roomId === currentRoomId) - Number(a.roomId === currentRoomId));
  }, [visible, currentRoomId]);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as { status?: number })?.status === 403 ? t("bookmarks.errors.forbidden") : t("bookmarks.errors.generic"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("bookmarks.title")}</h2>
        <button type="button" onClick={onClose} aria-label={t("members.close")} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="shrink-0 border-b border-border px-3 py-2">
        <label htmlFor="bookmarks-search" className="sr-only">{t("bookmarks.search")}</label>
        <input id="bookmarks-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("bookmarks.search")} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]" />
        <p className="mt-1 text-[10px] text-muted-foreground">{t("bookmarks.private", { count: bookmarks.length, max: BOOKMARK_LIMITS.perUser })}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {state === "loading" && <div className="flex justify-center py-4" role="status" aria-label={t("bookmarks.loading")}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden /></div>}
        {state === "error" && (
          <p role="alert" className="mb-2 flex items-center gap-2 text-xs text-destructive">
            {t("bookmarks.errors.load")}
            <button type="button" onClick={onReload} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3 w-3" aria-hidden />{t("errors.retry")}</button>
          </p>
        )}
        {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
        {state !== "loading" && state !== "error" && bookmarks.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted-foreground">
            <BookmarkIcon className="h-6 w-6 opacity-50" aria-hidden />
            <p className="font-semibold text-foreground">{t("bookmarks.emptyTitle")}</p>
            <p>{t("bookmarks.emptyHint")}</p>
          </div>
        )}
        {bookmarks.length > 0 && visible.length === 0 && <p role="status" className="px-2 py-4 text-center text-xs text-muted-foreground">{t("bookmarks.noMatches")}</p>}

        {groups.map((g) => (
          <section key={g.roomId} aria-label={g.roomName || roomNameOf(g.roomId) || t("bookmarks.unknownRoom")} className="mb-3">
            <h3 className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              # {g.roomName || roomNameOf(g.roomId) || t("bookmarks.unknownRoom")}
              {g.roomId === currentRoomId && <span className="ml-1.5 rounded bg-muted px-1 normal-case">{t("bookmarks.thisRoom")}</span>}
            </h3>
            <ul className="space-y-2">
              {g.items.map((b) => {
                const isEditing = editing === b.messageId;
                const working = busy === b.messageId;
                const excerpt = plainExcerpt(b.content, 200);
                return (
                  <li key={b.messageId} className="rounded-xl border-2 border-[var(--memphis-line)] bg-background p-2.5">
                    <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-foreground/90">{excerpt || t("bookmarks.noText")}</p>
                    {b.note && !isEditing && <p className="mt-1.5 rounded-md bg-muted/60 px-2 py-1 text-[11px] italic text-muted-foreground">{b.note}</p>}
                    {isEditing && (
                      <div className="mt-1.5">
                        <label htmlFor={`bm-note-${b.messageId}`} className="sr-only">{t("bookmarks.noteLabel")}</label>
                        <textarea id={`bm-note-${b.messageId}`} autoFocus rows={2} value={draft} maxLength={BOOKMARK_LIMITS.note} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} placeholder={t("bookmarks.notePlaceholder")} className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]" />
                        <div className="mt-1 flex justify-end gap-2 text-[11px]">
                          <button type="button" onClick={() => setEditing(null)} className="rounded-md px-2 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("createRoom.cancel")}</button>
                          <button type="button" disabled={working} onClick={() => void run(b.messageId, async () => { await onSaveNote(b, clampNote(draft)); setEditing(null); })} className="rounded-md border border-border px-2 py-0.5 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-50">{t("msg.save")}</button>
                        </div>
                      </div>
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                      {b.messageCreatedAt && <time dateTime={b.messageCreatedAt}>{new Date(b.messageCreatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time>}
                      {b.bookmarkedAt && <><span aria-hidden>·</span><span>{t("bookmarks.savedOn", { when: new Date(b.bookmarkedAt).toLocaleDateString() })}</span></>}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <button type="button" onClick={() => onJump(b)} className="rounded-md border border-border px-2 py-0.5 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("bookmarks.open")}</button>
                      {!isEditing && (
                        <button type="button" onClick={() => { setEditing(b.messageId); setDraft(b.note ?? ""); }} aria-label={t("bookmarks.editNote", { text: excerpt.slice(0, 40) })} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
                          <Pencil className="h-3 w-3" aria-hidden />{b.note ? t("bookmarks.editNoteShort") : t("bookmarks.addNote")}
                        </button>
                      )}
                      <button type="button" disabled={working} onClick={() => void run(b.messageId, () => onRemove(b))} aria-label={t("bookmarks.removeLabel", { text: excerpt.slice(0, 40) })} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-50">
                        <Trash2 className="h-3 w-3" aria-hidden />{t("bookmarks.remove")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
