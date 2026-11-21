/**
 * Incoming webhooks of a channel: normalising the answers, form validation, the one-time secret and the example call.
 * Pure, tested in webhooks.test.ts.
 * Contract: Killio-Backend/src/modules/rooms/room-tools.service.ts and room-tools.controller.ts.
 *   POST   /rooms/:id/webhooks        { name, avatarUrl? } -> { id, roomId, name, avatarUrl, userId, path, token, note }   (secret shown ONCE)
 *   GET    /rooms/:id/webhooks        [{ id, roomId, name, avatarUrl, userId, createdBy, lastUsedAt, createdAt }]
 *   DELETE /rooms/:id/webhooks/:wid   { success: true }   (the synthetic user leaves the workspace; its old messages stay)
 *   POST   /hooks/rooms/:wid/:token   { text?, blocks? } (public; 30 messages per minute per webhook; no bot ever reacts to them)
 * There is no rotate endpoint: rotating = create a new webhook, then revoke the old one (the secret of the old one cannot be read back).
 */

export const WEBHOOK_LIMITS = { maxPerRoom: 10, name: 80, avatarUrl: 2048, messagesPerMinute: 30 } as const;

export interface RoomWebhook {
  id: string;
  roomId: string;
  name: string;
  avatarUrl: string | null;
  userId: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
}

export interface CreatedWebhook extends RoomWebhook {
  /** `/hooks/rooms/<id>/<token>`: relative to the API base. Shown only now. */
  path: string;
  token: string;
}

const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function normalizeWebhook(raw: unknown): RoomWebhook | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  return { id: r.id, roomId: s(r.roomId) ?? "", name: typeof r.name === "string" ? r.name : "", avatarUrl: s(r.avatarUrl), userId: s(r.userId), createdBy: s(r.createdBy), lastUsedAt: s(r.lastUsedAt), createdAt: s(r.createdAt) };
}

export function normalizeWebhookList(raw: unknown): RoomWebhook[] {
  return (Array.isArray(raw) ? raw : []).map(normalizeWebhook).filter((w): w is RoomWebhook => !!w);
}

export function normalizeCreatedWebhook(raw: unknown): CreatedWebhook | null {
  const base = normalizeWebhook(raw);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!base || typeof r.token !== "string" || !r.token) return null;
  const path = typeof r.path === "string" && r.path.startsWith("/hooks/rooms/") ? r.path : `/hooks/rooms/${base.id}/${r.token}`;
  return { ...base, path, token: r.token };
}

/** Full public URL (https) from the API base and the relative path the server returns. */
export function publicWebhookUrl(apiBase: string, path: string): string {
  return `${apiBase.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The URL with the secret hidden, for lists and screenshots: `.../hooks/rooms/<id>/••••••••`. */
export function maskWebhookUrl(url: string): string {
  return url.replace(/(\/hooks\/rooms\/[^/]+\/)[^/?#]+/, "$1••••••••");
}

export type WebhookFormIssue = "name_required" | "name_long" | "avatar_invalid";

export function validateWebhookForm(f: { name: string; avatarUrl: string }): WebhookFormIssue[] {
  const out: WebhookFormIssue[] = [];
  const name = f.name.trim();
  if (!name) out.push("name_required");
  else if (name.length > WEBHOOK_LIMITS.name) out.push("name_long");
  const a = f.avatarUrl.trim();
  if (a && (!/^https:\/\/[^\s]{1,2040}$/i.test(a) || a.length > WEBHOOK_LIMITS.avatarUrl)) out.push("avatar_invalid");
  return out;
}

export function webhookBody(f: { name: string; avatarUrl: string }): { name: string; avatarUrl?: string } {
  const a = f.avatarUrl.trim();
  return { name: f.name.trim(), ...(a ? { avatarUrl: a } : {}) };
}

/** Example call for the copy box. The URL is shown as is (the person already holds the secret). */
export function webhookCurl(url: string): string {
  return `curl -X POST '${url}' -H 'Content-Type: application/json' -d '${JSON.stringify({ text: "Hola" })}'`;
}

/** Plain channels only (a webhook posts into a channel, never into a DM, thread or entity chat). */
export function roomSupportsWebhooks(room: { type?: string; linkedEntityType?: string | null } | null | undefined): boolean {
  return !!room && room.type === "channel" && !room.linkedEntityType;
}
