"use client";

/**
 * Bot parts of the room: what a bot message adds under its text (rich blocks, buttons and selects), the "only you see this"
 * private answers, and the "replying to" line of a bot reply. The pure rules are in lib/bots and lib/rooms/ephemeral.ts.
 */

import { useCallback, useMemo } from "react";
import { Bot, EyeOff, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { interactWithComponent } from "@/lib/api/room-tools";
import type { RoomMessage } from "@/lib/api/rooms";
import { isFallbackContent, readMessageExtras } from "@/lib/bots/rich";
import { readCommandGhost } from "@/lib/rooms/command-ghost";
import { ephemeralExtras, type EphemeralMessage } from "@/lib/rooms/ephemeral";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { InteractiveComponents, RichBlocks } from "./bot-message-parts";
import { CommandGhostHeader } from "./CommandGhostHeader";

/** True when the text of the message only repeats its blocks (the backend's plain-text fallback), so the text is not drawn twice. */
export function hidesFallbackText(message: Pick<RoomMessage, "content" | "metadata">): boolean {
  const { blocks } = readMessageExtras(message.metadata);
  return blocks.length > 0 && isFallbackContent(message.content ?? "", blocks);
}

/** Blocks and components of one room message. Renders nothing for a message without them. */
export function BotMessageExtras({ message }: { message: RoomMessage }) {
  const { accessToken } = useSession();
  const extras = useMemo(() => readMessageExtras(message.metadata), [message.metadata]);
  const interact = useCallback(
    async (customId: string, values?: string[]) => {
      if (!accessToken) throw Object.assign(new Error("no session"), { status: 401 });
      await interactWithComponent(message.roomId, message.id, { customId, values }, accessToken);
    },
    [accessToken, message.roomId, message.id],
  );
  const pending = message.id.startsWith("temp-") || message.status === "sending";
  if (extras.blocks.length === 0 && extras.componentRows.length === 0) return null;
  return (
    <div className="mt-1 flex min-w-0 flex-col gap-1.5" data-bot-extras>
      <RichBlocks blocks={extras.blocks} />
      {extras.componentRows.length > 0 && (
        <InteractiveComponents rows={extras.componentRows} expiresAt={extras.componentsExpiresAt} idPrefix={`c-${message.id}`} interact={pending ? undefined : interact} />
      )}
    </div>
  );
}

/** The quoted line above a bot reply (`metadata.replyTo = { messageId, userId, excerpt }`). */
export function BotReplyRef({ messageId, name, excerpt }: { messageId: string; name: string | null; excerpt: string }) {
  const t = useTranslations("rooms");
  return (
    <button
      type="button"
      onClick={() => {
        const el = document.getElementById(`msg-${messageId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.classList.add("animate-pulse-accent");
        setTimeout(() => el?.classList.remove("animate-pulse-accent"), 2000);
      }}
      aria-label={t("bot.replyTo.goTo", { name: name ?? t("bot.replyTo.unknown") })}
      className="mb-1 block max-w-[280px] overflow-hidden rounded-lg border-l-4 border-border bg-black/5 p-2 text-left text-[11px] opacity-80 transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-white/5 dark:hover:bg-white/10 motion-reduce:transition-none"
    >
      <span className="mb-0.5 block truncate text-[10px] font-bold text-foreground">{name ?? t("bot.replyTo.unknown")}</span>
      <span className="line-clamp-1 italic text-muted-foreground">{excerpt}</span>
    </button>
  );
}

/**
 * Private answers of bots: only the person who started the run receives them (realtime `user:<id>`), they are not in the room's history
 * and they expire. Their buttons cannot be pressed: the server only accepts presses on stored room messages.
 */
export function EphemeralList({ items, onDismiss }: { items: readonly EphemeralMessage[]; onDismiss: (id: string) => void }) {
  const t = useTranslations("rooms");
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2" aria-label={t("bot.ephemeral.listLabel")}>
      {items.map((e) => (
        <li key={e.id} data-testid="ephemeral-message" className="group relative flex gap-2.5 rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2">
          <span className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border bg-muted/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getUserAvatarUrl(e.botAvatarUrl, `${e.botName}@bot.killio.local`, 28)} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="text-[13px] font-bold">{e.botName}</span>
              <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1 text-[9px] font-bold uppercase tracking-tight text-violet-700 dark:text-violet-300">
                <Bot className="h-2.5 w-2.5" aria-hidden />
                {t("ai.bot")}
              </span>
              <time className="text-[10px] text-muted-foreground" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
            {readCommandGhost(e.metadata) && <div><CommandGhostHeader ghost={readCommandGhost(e.metadata)!} /></div>}
            <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              <EyeOff className="h-3 w-3" aria-hidden />
              {t("bot.ephemeral.onlyYou")}
            </p>
            <EphemeralBody e={e} />
          </div>
          <button
            type="button"
            onClick={() => onDismiss(e.id)}
            aria-label={t("bot.ephemeral.dismiss")}
            title={t("bot.ephemeral.dismiss")}
            className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function EphemeralBody({ e }: { e: EphemeralMessage }) {
  const extras = useMemo(() => ephemeralExtras(e), [e]);
  const t = useTranslations("rooms");
  const hide = extras.blocks.length > 0 && isFallbackContent(e.content, extras.blocks);
  // "The application did not respond" and the like: a code the client words in the person's language (the server text is the fallback).
  const failed = readCommandGhost(e.metadata)?.failed ?? null;
  return (
    <div className="min-w-0 space-y-1.5 text-sm">
      {failed && <p className="whitespace-pre-wrap break-words text-muted-foreground">{t(`bot.command.failed.${failed}`)}</p>}
      {!failed && !hide && e.content && <p className="whitespace-pre-wrap break-words">{e.content}</p>}
      <RichBlocks blocks={extras.blocks} />
      {extras.componentRows.length > 0 && <InteractiveComponents rows={extras.componentRows} expiresAt={extras.componentsExpiresAt} idPrefix={`e-${e.id}`} />}
    </div>
  );
}
