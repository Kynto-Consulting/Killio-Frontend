/**
 * Card templates per board (`/boards/:boardId/card-templates`).
 * Listing, resolving: board editors. Creating, editing, deleting: board admins/owners (enforced by the API).
 * In a local workspace (.kb file) there is no server: every call is a no-op (list -> [], the rest -> null).
 */
import type { BrickMutationInput } from "./contracts";
import type { TemplateWizard } from "@/lib/card-templates/wizard";
import { localDateISO } from "../card-templates/model";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

/** A block as stored in a template: the same shape the card bricks endpoint takes. */
export type CardTemplateBlock = BrickMutationInput;

export interface CardTemplate {
  id: string;
  boardId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  position: number;
  /** Prefix/pattern of the card title. `{date}` is replaced by the creation date. */
  titlePattern: string;
  targetListId: string | null;
  tagIds: string[];
  assigneeUserIds: string[];
  /** Groups are expanded to their members when the card is created. */
  assigneeGroupIds: string[];
  /** Days relative to the creation day; null = no date. */
  startOffsetDays: number | null;
  dueOffsetDays: number | null;
  blocks: CardTemplateBlock[];
  /** Reserved for typed fields (phase 2). */
  fields?: unknown[];
  /** Steps the "new card" modal walks through; `null` = none. */
  wizard?: TemplateWizard | null;
}

export interface CardTemplateInput {
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  position?: number;
  titlePattern: string;
  targetListId: string | null;
  tagIds: string[];
  assigneeUserIds: string[];
  assigneeGroupIds: string[];
  startOffsetDays: number | null;
  dueOffsetDays: number | null;
  blocks: CardTemplateBlock[];
  /** `null` removes the wizard. */
  wizard?: TemplateWizard | null;
}

/** What `resolve` produces: everything the create modal needs, with nothing written. */
export interface ResolvedCardTemplate {
  listId: string;
  title: string;
  summary?: string | null;
  startAt: string | null;
  dueAt: string | null;
  tagIds: string[];
  assigneeIds: string[];
  blocks: CardTemplateBlock[];
  warnings: string[];
}

export class CardTemplateApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CardTemplateApiError";
    this.status = status;
  }
}

async function call<T>(path: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new CardTemplateApiError(message || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

const base = (boardId: string) => `/boards/${encodeURIComponent(boardId)}/card-templates`;

export async function listCardTemplates(boardId: string, accessToken: string, localMode = false): Promise<CardTemplate[]> {
  if (localMode) return [];
  const rows = await call<CardTemplate[]>(base(boardId), accessToken);
  return Array.isArray(rows) ? rows : [];
}

export async function createCardTemplate(boardId: string, input: CardTemplateInput, accessToken: string, localMode = false): Promise<CardTemplate | null> {
  if (localMode) return null;
  return call<CardTemplate>(base(boardId), accessToken, { method: "POST", body: input });
}

export async function updateCardTemplate(boardId: string, id: string, patch: Partial<CardTemplateInput>, accessToken: string, localMode = false): Promise<CardTemplate | null> {
  if (localMode) return null;
  return call<CardTemplate>(`${base(boardId)}/${encodeURIComponent(id)}`, accessToken, { method: "PATCH", body: patch });
}

export async function deleteCardTemplate(boardId: string, id: string, accessToken: string, localMode = false): Promise<{ deleted: boolean } | null> {
  if (localMode) return null;
  return call<{ deleted: boolean }>(`${base(boardId)}/${encodeURIComponent(id)}`, accessToken, { method: "DELETE" });
}

export async function resolveCardTemplate(
  boardId: string,
  id: string,
  body: { listId?: string; today?: string },
  accessToken: string,
  localMode = false,
): Promise<ResolvedCardTemplate | null> {
  if (localMode) return null;
  const payload = { ...(body.listId ? { listId: body.listId } : {}), today: body.today ?? localDateISO() };
  const res = await call<ResolvedCardTemplate>(`${base(boardId)}/${encodeURIComponent(id)}/resolve`, accessToken, { method: "POST", body: payload });
  return { ...res, tagIds: res.tagIds ?? [], assigneeIds: res.assigneeIds ?? [], blocks: res.blocks ?? [], warnings: res.warnings ?? [] };
}
