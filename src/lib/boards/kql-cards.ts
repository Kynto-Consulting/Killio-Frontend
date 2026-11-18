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
