/**
 * Board cards -> KQL cards. Pure (no React, no fetch) so it can be unit tested with `node --test`.
 *
 * The rules mirror the backend `rowToKqlCard` (Killio-Backend/src/modules/query/query-data.service.ts) so a filter typed
 * on a board selects the same cards a query run from the team screen would.
 */
import type { KqlCard, KqlContext, KqlGroup, KqlUser } from '../query/kql.ts';

/** Same words as the backend `DONE_LIST_NAME`: a list with such a name holds finished cards. */
export const DONE_LIST_NAME = /^(done|hecho|hecha|resuelt[oa]s?|completad[oa]s?|terminad[oa]s?|finalizad[oa]s?|cerrad[oa]s?|closed|listo)/i;

/** The subset of `CardView` (src/lib/api/contracts.ts) the mapper reads. Everything is optional: local boards are sparse. */
export interface BoardCardLike {
  id: string;
  title: string;
  summary?: string | null;
  status?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  tags?: Array<{ name: string; tag_kind?: string | null }> | null;
  /** Untyped on the wire: string ids, `{ id }`, `{ userId }` or `{ user_id }`. */
  assignees?: unknown[] | null;
  commentsCount?: number | null;
  boardId?: string | null;
  /** Bricks of the card (checklists, media...), when the board payload carries them. */
  blocks?: unknown[] | null;
}

export interface BoardListLike {
  id: string;
  title: string;
  /** `done` for the system "done" list. */
  systemKey?: string | null;
  /** The user group that owns every card of the list. */
  assignedGroupId?: string | null;
}

export function assigneeId(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const id = o.id ?? o.userId ?? o.user_id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
}

const MEDIA_KINDS = new Set(['media', 'image', 'file', 'video', 'audio']);

/** checklist_total / checklist_done / attachments of a card from its bricks (same rules as the backend query: top-level items). */
export function brickCounts(blocks: unknown[] | null | undefined): { total: number; done: number; attachments: number } {
  let total = 0;
  let done = 0;
  let attachments = 0;
  for (const raw of blocks ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, any>;
    const kind = b.kind ?? b.block_type ?? b.blockType;
    if (MEDIA_KINDS.has(kind)) attachments++;
    const content = b.content && typeof b.content === 'object' ? b.content : b;
    for (const list of [content.tasks, content.items]) {
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        total++;
        if (it && typeof it === 'object' && (it as any).checked === true) done++;
      }
    }
  }
  return { total, done, attachments };
}

export function isDoneList(list: Pick<BoardListLike, 'title' | 'systemKey'>): boolean {
  return list.systemKey === 'done' || DONE_LIST_NAME.test(list.title ?? '');
}

/**
 * `priorityAsTag`: keep the priority tag in `tags` too (default: excluded, like the backend). Board views opt in so that
 * the old tag filter, tag-group sorting and tag-group categories also work with priority-kind tags ("Urgente", "Alta"...).
 */
export function toKqlCard(card: BoardCardLike, list: BoardListLike, boardName?: string | null, opts: { priorityAsTag?: boolean } = {}): KqlCard {
  const done = card.status === 'done' || !!card.completedAt || isDoneList(list);
  const tags = card.tags ?? [];
  const priorityTag = tags.find((t) => t.tag_kind === 'priority');
  const updated = card.updatedAt ?? null;
  const assignees: string[] = [];
  for (const a of card.assignees ?? []) {
    const id = assigneeId(a);
    if (id && !assignees.includes(id)) assignees.push(id);
  }
  return {
    id: card.id,
    title: card.title,
    description: card.summary ?? null,
    board: boardName ?? null,
    list: list.title,
    done,
    archived: !!card.archivedAt || card.status === 'archived',
    assignees,
    groupIds: list.assignedGroupId ? [list.assignedGroupId] : [],
    tags: tags.filter((t) => opts.priorityAsTag || t.tag_kind !== 'priority').map((t) => t.name),
    due: card.dueAt ?? null,
    start: card.startAt ?? null,
    created: card.createdAt ?? null,
    updated,
    completed: card.completedAt ?? (done ? updated : null),
    priority: priorityTag ? priorityTag.name : null,
    comments: card.commentsCount ?? 0,
    fields: cardFields(card, list),
  };
}

/** Extra lower_snake fields, the same names as the backend card records (team / created_by / parent_id are only known there). */
export function cardFields(card: BoardCardLike, list: BoardListLike): Record<string, string | number | boolean | null> {
  const { total, done, attachments } = brickCounts(card.blocks);
  const start = card.startAt ? new Date(card.startAt).getTime() : NaN;
  const end = card.dueAt ? new Date(card.dueAt).getTime() : NaN;
  return {
    board_id: card.boardId ?? null,
    list_id: list.id,
    archived_at: card.archivedAt ?? null,
    description_length: (card.summary ?? '').length,
    checklist_total: total,
    checklist_done: done,
    checklist_progress: total ? Math.round((done / total) * 100) : null,
    attachments,
    timer_minutes: Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 60_000) : null,
  };
}

export interface BoardMemberLike {
  id: string;
  name?: string | null;
  alias?: string | null;
  email?: string | null;
  displayName?: string | null;
  workspaceAlias?: string | null;
}

export interface TeamGroupLike {
  id: string;
  slug: string;
  name: string;
  memberUserIds: string[];
}

export function buildKqlContext(input: {
  me?: string | null;
  meInfo?: { id: string; name?: string | null; email?: string | null } | null;
  members?: BoardMemberLike[];
  groups?: TeamGroupLike[];
  now?: Date;
}): KqlContext {
  const users: KqlUser[] = [];
  const seen = new Set<string>();
  for (const m of input.members ?? []) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    users.push({ id: m.id, name: m.displayName ?? m.name ?? null, alias: m.workspaceAlias ?? m.alias ?? null, email: m.email ?? null });
  }
  if (input.meInfo?.id && !seen.has(input.meInfo.id)) {
    users.push({ id: input.meInfo.id, name: input.meInfo.name ?? null, email: input.meInfo.email ?? null });
  }
  const groups: KqlGroup[] = (input.groups ?? []).map((g) => ({ id: g.id, slug: g.slug, name: g.name, memberIds: g.memberUserIds ?? [] }));
  const ctx: KqlContext = { users, groups };
  const me = input.me ?? input.meInfo?.id;
  if (me) ctx.me = me;
  if (input.now) ctx.now = input.now;
  return ctx;
}
