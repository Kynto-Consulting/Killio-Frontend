/** Chat footprint of an entity (`/teams/:teamId/entity-chats`), for the "this will also delete its chat" confirmation. */

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** Entity types that can own chats (mirrors the backend ENTITY_TARGETS registry). */
export type EntityChatType =
  | "board"
  | "mesh"
  | "list"
  | "card"
  | "document"
  | "script"
  | "killio_table"
  | "shared_table"
  | "folder";

export interface EntityChatSummary {
  /** Room chats bound to the entity. */
  rooms: number;
  /** Room messages plus agent messages that would be deleted with it. */
  messages: number;
  /** Agent (copilot) conversations bound to the entity. */
  conversations: number;
}

export class EntityChatsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EntityChatsApiError";
    this.status = status;
  }
}

export async function getEntityChatSummary(
  teamId: string,
  entityType: EntityChatType,
  entityId: string,
  accessToken: string,
): Promise<EntityChatSummary> {
  const res = await fetch(
    `${API}/teams/${encodeURIComponent(teamId)}/entity-chats/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/summary`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new EntityChatsApiError(message || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as EntityChatSummary;
}

/** True when deleting the entity would also remove chat content worth warning about. */
export const hasChatContent = (summary: EntityChatSummary) => summary.messages > 0 || summary.rooms > 0 || summary.conversations > 0;
