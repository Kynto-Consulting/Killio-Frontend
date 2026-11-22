"use client";

/**
 * "Send a message to @name" field of the profile card. It reuses the existing direct-message flow: `findOrCreateDm` (the same call
 * behind `handleOpenDirectMessage`) and `sendRoomMessage` (the same call the chat composer uses). Enter sends, Shift+Enter is a
 * new line; focus stays in the field; a failure shows the reason the server gave.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, SendHorizontal } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { findOrCreateDm, RoomsApiError, sendRoomMessage } from "@/lib/api/rooms";
import { dmKeyAction } from "@/lib/rooms/user-profile-compact";

const MAX_LENGTH = 4000;

export function UserProfileDm({ teamId, userId, displayName, onOpenConversation }: {
  teamId: string;
  userId: string;
  displayName: string;
  /** Opens the DM in the chat (the page's `handleOpenDirectMessage`). */
  onOpenConversation: (userId: string) => void;
}) {
  const t = useTranslations("rooms");
  const { accessToken } = useSession();
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const statusId = useId();

  // The box grows with its text (up to a few lines) so a long message stays readable.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [text]);

  const send = async () => {
    const content = text.trim();
    if (!content || !accessToken || state === "sending") return;
    setState("sending");
    setReason("");
    try {
      const room = await findOrCreateDm(teamId, userId, accessToken);
      await sendRoomMessage(room.id, content, accessToken);
      setText("");
      setState("sent");
    } catch (e) {
      const status = e instanceof RoomsApiError ? e.status : 0;
      const detail = e instanceof Error && e.message && !/^Failed to /.test(e.message) ? e.message : "";
      setReason(detail || (status === 403 ? t("profile.dm.forbidden") : t("profile.dm.failed")));
      setState("error");
    } finally {
      requestAnimationFrame(() => ref.current?.focus());
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const action = dmKeyAction({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, text);
    if (action === "send") { e.preventDefault(); void send(); }
    else if (e.key === "Enter" && !e.shiftKey) e.preventDefault(); // blank Enter: no stray line
  };

  return (
    <div className="border-t border-border/50 px-3 py-2.5">
      <div className="flex items-end gap-1.5 rounded-xl border border-border/60 bg-background px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-primary/40">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          maxLength={MAX_LENGTH}
          onChange={(e) => { setText(e.target.value); if (state !== "sending") setState("idle"); }}
          onKeyDown={onKeyDown}
          disabled={state === "sending"}
          aria-label={t("profile.dm.label", { name: displayName })}
          aria-describedby={`${hintId} ${statusId}`}
          placeholder={t("profile.dm.placeholder", { name: displayName })}
          className="max-h-24 min-h-[1.5rem] flex-1 resize-none bg-transparent py-0.5 text-xs leading-5 outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || state === "sending"}
          aria-label={t("profile.actions.message")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
        >
          {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <SendHorizontal className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <span id={hintId} className="sr-only">{t("profile.dm.hint")}</span>
      <div id={statusId} role={state === "error" ? "alert" : "status"} aria-live="polite" className="min-h-0 text-[11px]">
        {state === "sent" && (
          <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {t("profile.dm.sent")} ·{" "}
            <button type="button" onClick={() => onOpenConversation(userId)} className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("profile.dm.open")}</button>
          </p>
        )}
        {state === "error" && <p className="mt-1.5 text-destructive">{reason}</p>}
      </div>
    </div>
  );
}
