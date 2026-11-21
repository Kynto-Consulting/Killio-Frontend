"use client";

import { useState } from "react";
import { Loader2, Pin, PinOff, Send, X, MessagesSquare } from "lucide-react";
import { parseAiMarkup } from "@/lib/ai-markup";
import { getUserAvatarUrl } from "@/lib/gravatar";
import type { RoomMessage } from "@/lib/api/rooms";

type TFn = (key: string, params?: Record<string, string | number>) => string;

function PanelHeader({ title, onClose, closeLabel }: { title: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      <button type="button" onClick={onClose} aria-label={closeLabel} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

interface PinnedPanelProps {
  messages: RoomMessage[];
  isLoading?: boolean;
  canUnpin: boolean;
  onUnpin: (messageId: string) => Promise<void>;
  onJump: (messageId: string) => void;
  onClose: () => void;
  t: TFn;
}

/** Pinned messages of the channel, newest pin first. A pin can be opened in the chat or removed by whoever may pin. */
export function PinnedPanel({ messages, isLoading, canUnpin, onUnpin, onJump, onClose, t }: PinnedPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unpin = async (id: string) => {
    setBusyId(id);
    setError(null);
    try { await onUnpin(id); } catch { setError(t("msg.errors.failed")); } finally { setBusyId(null); }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      <PanelHeader title={t("pins.title")} onClose={onClose} closeLabel={t("members.close")} />
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && <div className="flex justify-center py-4" role="status" aria-label={t("pins.loading")}><Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden /></div>}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-muted-foreground">
            <Pin className="h-6 w-6 opacity-50" aria-hidden />
            <p className="font-semibold text-foreground">{t("pins.emptyTitle")}</p>
            <p>{t("pins.emptyHint")}</p>
          </div>
        )}
        {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className="rounded-xl border-2 border-[var(--memphis-line)] bg-background p-2.5">
              <div className="mb-1 flex items-center gap-2">
                <img src={getUserAvatarUrl(m.user?.avatarUrl, m.user?.email, 20)} alt="" className="h-5 w-5 rounded-full border border-border object-cover" />
                <span className="truncate text-xs font-bold">{m.user?.displayName ?? t("ai.unknown")}</span>
                <time className="ml-auto shrink-0 text-[10px] text-muted-foreground" dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleDateString()}</time>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-foreground/90">{parseAiMarkup(m.content).visibleText || m.content}</p>
              <div className="mt-2 flex gap-2 text-[11px]">
                <button type="button" onClick={() => onJump(m.id)} className="rounded-md border border-border px-2 py-0.5 font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("pins.jump")}</button>
                {canUnpin && (
                  <button type="button" onClick={() => void unpin(m.id)} disabled={busyId === m.id} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-50">
                    <PinOff className="h-3 w-3" aria-hidden />{t("msg.unpin")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ThreadPanelProps {
  root: RoomMessage | undefined;
  replies: RoomMessage[];
  canReply: boolean;
  onSend: (content: string) => Promise<void>;
  renderMessage: (message: RoomMessage) => React.ReactNode;
  onClose: () => void;
  t: TFn;
}

/** A simple thread: the original message, its replies, and a field to answer in the thread. */
export function ThreadPanel({ root, replies, canReply, onSend, renderMessage, onClose, t }: ThreadPanelProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(content);
      setText("");
    } catch {
      setError(t("msg.errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      <PanelHeader title={t("thread.title")} onClose={onClose} closeLabel={t("members.close")} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!root ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t("thread.rootMissing")}</p>
        ) : (
          <>
            <div className="border-b border-border pb-2">{renderMessage(root)}</div>
            <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <MessagesSquare className="mr-1 inline h-3 w-3" aria-hidden />{t("thread.replies", { count: replies.length })}
            </p>
            {replies.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{t("thread.noReplies")}</p>}
            <div>{replies.map((r) => <div key={r.id}>{renderMessage(r)}</div>)}</div>
          </>
        )}
      </div>
      {root && (
        <div className="shrink-0 border-t-2 border-[var(--memphis-line)] p-2">
          {canReply ? (
            <>
              <div className="flex items-end gap-1.5">
                <label className="sr-only" htmlFor="thread-input">{t("thread.inputLabel")}</label>
                <textarea
                  id="thread-input"
                  value={text}
                  rows={2}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={t("thread.inputPlaceholder")}
                  disabled={busy}
                  className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]"
                />
                <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} aria-label={t("chat.send")} className="rounded-full bg-[hsl(var(--accent-ink))] p-2 text-[hsl(var(--accent-ink-fg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] focus-visible:ring-offset-2 disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                </button>
              </div>
              {error && <p role="alert" className="mt-1 text-[11px] text-destructive">{error}</p>}
            </>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">{t("thread.readOnly")}</p>
          )}
        </div>
      )}
    </div>
  );
}
