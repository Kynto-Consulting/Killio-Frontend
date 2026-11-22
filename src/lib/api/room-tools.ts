/**
 * Typed API of the room extras written for bots and personal use (Killio-Backend/src/modules/rooms/room-tools.controller.ts and
 * src/modules/bots/bot-interactions.controller.ts, bot-ephemeral.controller.ts). The pure rules live in lib/bots and lib/rooms.
 *
 *   POST   /rooms/:id/webhooks                           create (the secret comes back ONCE)
 *   GET    /rooms/:id/webhooks                           list (no secrets)
 *   DELETE /rooms/:id/webhooks/:webhookId                revoke
 *   PUT    /rooms/:id/messages/:messageId/bookmark       { note? }
 *   DELETE /rooms/:id/messages/:messageId/bookmark
 *   GET    /me/bookmarks?roomId=&limit=
 *   POST   /rooms/:id/messages/:messageId/interact       { customId, values? } -> 202 { ok, interactionId }
 *   GET    /rooms/:id/ephemeral                          the caller's own private bot messages of the room
 *   DELETE /rooms/:id/ephemeral/:eid                     dismiss
 *   GET    /rooms/:id/messages/:messageId/select-options?customId=&q=   candidates of a user / role / channel / mentionable select
 *   POST   /rooms/:id/ephemeral/:eid/modal-submit        { fields } -> 202
 */

import { fetchApi } from "@/lib/api/client";
import { normalizeBookmarks, type Bookmark } from "@/lib/rooms/bookmarks";
import { readPickerItems, type PickerItem } from "@/lib/bots/components";
import { normalizeEphemeralList, type EphemeralMessage } from "@/lib/rooms/ephemeral";
import { normalizeCreatedWebhook, normalizeWebhookList, webhookBody, type CreatedWebhook, type RoomWebhook } from "@/lib/bots/webhooks";

const q = encodeURIComponent;

/* ── webhooks ── */

export async function listRoomWebhooks(roomId: string, accessToken: string): Promise<RoomWebhook[]> {
  return normalizeWebhookList(await fetchApi<unknown>(`/rooms/${q(roomId)}/webhooks`, { accessToken }));
}

export async function createRoomWebhook(roomId: string, input: { name: string; avatarUrl: string }, accessToken: string): Promise<CreatedWebhook> {
  const raw = await fetchApi<unknown>(`/rooms/${q(roomId)}/webhooks`, { method: "POST", body: JSON.stringify(webhookBody(input)), accessToken });
  const created = normalizeCreatedWebhook(raw);
  if (!created) throw new Error("Unexpected webhook response");
  return created;
}

export async function revokeRoomWebhook(roomId: string, webhookId: string, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/rooms/${q(roomId)}/webhooks/${q(webhookId)}`, { method: "DELETE", accessToken });
}

/**
 * Rotation = a NEW webhook with the same name and avatar (new URL and secret), then the old one revoked. The server cannot return an old
 * secret, so there is no in-place rotation. The new one is created first: if it fails nothing is lost; if the revoke fails the caller
 * is told (the old URL still works until it is revoked).
 */
export async function rotateRoomWebhook(roomId: string, old: Pick<RoomWebhook, "id" | "name" | "avatarUrl">, accessToken: string): Promise<{ created: CreatedWebhook; revoked: boolean }> {
  const created = await createRoomWebhook(roomId, { name: old.name, avatarUrl: old.avatarUrl ?? "" }, accessToken);
  try {
    await revokeRoomWebhook(roomId, old.id, accessToken);
    return { created, revoked: true };
  } catch {
    return { created, revoked: false };
  }
}

/* ── bookmarks ── */

export async function addMessageBookmark(roomId: string, messageId: string, note: string | null, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/rooms/${q(roomId)}/messages/${q(messageId)}/bookmark`, { method: "PUT", body: JSON.stringify(note ? { note } : {}), accessToken });
}

export async function removeMessageBookmark(roomId: string, messageId: string, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/rooms/${q(roomId)}/messages/${q(messageId)}/bookmark`, { method: "DELETE", accessToken });
}

export async function listMyBookmarks(accessToken: string, opts: { roomId?: string; limit?: number } = {}): Promise<Bookmark[]> {
  const params = new URLSearchParams();
  if (opts.roomId) params.set("roomId", opts.roomId);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return normalizeBookmarks(await fetchApi<unknown>(`/me/bookmarks${qs ? `?${qs}` : ""}`, { accessToken }));
}

/* ── interactive components ── */

export async function interactWithComponent(roomId: string, messageId: string, input: { customId: string; values?: string[] }, accessToken: string): Promise<{ ok: boolean; interactionId?: string }> {
  const raw = await fetchApi<{ ok?: boolean; interactionId?: string }>(`/rooms/${q(roomId)}/messages/${q(messageId)}/interact`, {
    method: "POST",
    body: JSON.stringify(input.values ? { customId: input.customId, values: input.values } : { customId: input.customId }),
    accessToken,
  });
  return { ok: raw?.ok !== false, interactionId: raw?.interactionId };
}

/* ── ephemeral messages ── */

export async function listRoomEphemeral(roomId: string, accessToken: string): Promise<EphemeralMessage[]> {
  return normalizeEphemeralList(await fetchApi<unknown>(`/rooms/${q(roomId)}/ephemeral`, { accessToken }));
}

export async function dismissRoomEphemeral(roomId: string, id: string, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/rooms/${q(roomId)}/ephemeral/${q(id)}`, { method: "DELETE", accessToken });
}

/* ── pickers and modals (rich messages v2) ── */

/** People / roles / channels a select may offer, already filtered by the server to what the caller may see. */
export async function listSelectOptions(roomId: string, messageId: string, customId: string, query: string, accessToken: string): Promise<PickerItem[]> {
  const params = new URLSearchParams({ customId });
  if (query.trim()) params.set("q", query.trim().slice(0, 100));
  return readPickerItems(await fetchApi<unknown>(`/rooms/${q(roomId)}/messages/${q(messageId)}/select-options?${params.toString()}`, { accessToken }));
}

export async function submitModal(roomId: string, ephemeralId: string, fields: Record<string, string>, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/rooms/${q(roomId)}/ephemeral/${q(ephemeralId)}/modal-submit`, { method: "POST", body: JSON.stringify({ fields }), accessToken });
}
