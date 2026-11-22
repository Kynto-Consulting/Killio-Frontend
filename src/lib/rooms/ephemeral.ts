/**
 * Ephemeral bot messages: answers only ONE person sees (invalid command arguments, private results, interaction replies).
 * They never enter the room's message list. Pure, tested in ephemeral.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-ephemeral.service.ts
 *   realtime  `user:<id>` event `room.ephemeral` -> EphemeralDto (delivered only to the recipient)
 *   GET    /rooms/:id/ephemeral        the caller's own, unexpired and not dismissed, oldest first (max 50)
 *   DELETE /rooms/:id/ephemeral/:eid   dismiss
 * They expire after one hour.
 */
import { readMessageExtras, type MessageExtras } from "../bots/rich.ts";
import { readModal } from "../bots/components.ts";

export interface EphemeralMessage {
  id: string;
  roomId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sourceMessageId: string | null;
  botName: string;
  botAvatarUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function normalizeEphemeral(raw: unknown): EphemeralMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  if (typeof r.id !== "string" || typeof r.roomId !== "string") return null;
  return {
    id: r.id,
    roomId: r.roomId,
    content: typeof r.content === "string" ? r.content : "",
    metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : null,
    sourceMessageId: str(r.sourceMessageId),
    botName: str(r.user?.displayName) ?? "Bot",
    botAvatarUrl: str(r.user?.avatarUrl),
    createdAt: str(r.createdAt) ?? new Date(0).toISOString(),
    expiresAt: str(r.expiresAt) ?? new Date(0).toISOString(),
  };
}

export const normalizeEphemeralList = (raw: unknown): EphemeralMessage[] => (Array.isArray(raw) ? raw : []).map(normalizeEphemeral).filter((e): e is EphemeralMessage => !!e);

export const isLive = (e: Pick<EphemeralMessage, "expiresAt">, now: number = Date.now()): boolean => {
  const t = Date.parse(e.expiresAt);
  return Number.isFinite(t) && t > now;
};

/**
 * A modal a script opened (`metadata.modal`, see components.ts): it travels as an ephemeral row but is NOT a message. The client opens a
 * dialog for it; submit goes to POST /rooms/:id/ephemeral/:eid/modal-submit.
 */
export const isModalEphemeral = (e: Pick<EphemeralMessage, "metadata">): boolean => !!readModal((e.metadata as Record<string, unknown> | null)?.modal);

/** The modal of an ephemeral message that has not expired (its own `expiresAt`, else the row's). */
export function liveModal(e: EphemeralMessage, now: number = Date.now()) {
  const modal = readModal((e.metadata as Record<string, unknown> | null)?.modal);
  if (!modal) return null;
  const t = Date.parse(modal.expiresAt ?? e.expiresAt);
  return Number.isFinite(t) && t > now ? modal : null;
}

/** What the room shows: this room only, unexpired, oldest first. Modals are not shown as messages. */
export function visibleEphemeral(list: readonly EphemeralMessage[], roomId: string, now: number = Date.now()): EphemeralMessage[] {
  return list.filter((e) => e.roomId === roomId && isLive(e, now) && !isModalEphemeral(e)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The modal waiting for the person in this room (the newest one), if any. */
export function pendingModal(list: readonly EphemeralMessage[], roomId: string, now: number = Date.now()): { ephemeral: EphemeralMessage; modal: NonNullable<ReturnType<typeof liveModal>> } | null {
  const mine = list.filter((e) => e.roomId === roomId && isLive(e, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const e of mine) {
    const modal = liveModal(e, now);
    if (modal) return { ephemeral: e, modal };
  }
  return null;
}

/** Adds (or replaces, by id) a delivered message and drops what has expired. */
export function addEphemeral(list: readonly EphemeralMessage[], msg: EphemeralMessage, now: number = Date.now()): EphemeralMessage[] {
  return [...list.filter((e) => e.id !== msg.id), msg].filter((e) => isLive(e, now));
}

export const dismissEphemeral = (list: readonly EphemeralMessage[], id: string): EphemeralMessage[] => list.filter((e) => e.id !== id);

/** Merges the server's list of a room with what is held locally (server wins for that room; other rooms are kept). */
export function mergeRoomEphemeral(local: readonly EphemeralMessage[], roomId: string, fetched: readonly EphemeralMessage[], now: number = Date.now()): EphemeralMessage[] {
  const others = local.filter((e) => e.roomId !== roomId);
  return [...others, ...fetched].filter((e) => isLive(e, now));
}

/** Rich content and components of an ephemeral message use the same shape as a room message's metadata. */
export const ephemeralExtras = (e: Pick<EphemeralMessage, "metadata">): MessageExtras => readMessageExtras(e.metadata);
