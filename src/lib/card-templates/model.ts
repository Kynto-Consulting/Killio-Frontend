/**
 * Pure logic of card templates: offsets, the resolve response -> create-modal state, the editor form <-> API DTO,
 * and the editor's live preview. No React, no I/O (runnable by `node --experimental-strip-types --test`).
 */
import type { BoardBrick } from "../api/contracts";
import type { CardTemplate, CardTemplateBlock, CardTemplateInput, ResolvedCardTemplate } from "../api/card-templates";

export const TEMPLATE_LIMITS = {
  name: 60,
  description: 500,
  titlePattern: 200,
  icon: 8,
  tags: 50,
  blocks: 40,
  /** ~10 years each way; far enough for any plan, small enough to catch typos. */
  offsetDays: 3650,
} as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The client's local calendar day as `YYYY-MM-DD` (what `resolve` takes as `today`). */
export function localDateISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** `YYYY-MM-DD` + N days, by calendar arithmetic (no timezone/DST drift). Returns null for an invalid date. */
export function addDaysISO(isoDay: string, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m || !Number.isFinite(days)) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ── Offsets ────────────────────────────────────────────────────────────────────

export type OffsetParse = { ok: true; value: number | null } | { ok: false; error: "integer" | "range" };

/** Empty = no date (null). Otherwise a whole number of days within +-TEMPLATE_LIMITS.offsetDays (negative = before). */
export function parseOffset(raw: string | number | null | undefined): OffsetParse {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const text = typeof raw === "number" ? String(raw) : raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^[+-]?\d+$/.test(text)) return { ok: false, error: "integer" };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || Math.abs(value) > TEMPLATE_LIMITS.offsetDays) return { ok: false, error: "range" };
  return { ok: true, value: value === 0 ? 0 : value };
}

/** Both set and the due date falls before the start date. */
export function offsetsOutOfOrder(start: number | null, due: number | null): boolean {
  return start !== null && due !== null && due < start;
}

// ── Resolve response -> modal state ───────────────────────────────────────────────

/** An ISO timestamp as is; a bare `YYYY-MM-DD` as local midnight of that day (what the date inputs mean). */
export function resolvedDateToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type TextInput = Extract<CardTemplateBlock, { kind: "text" }>;
type ChecklistInput = Extract<CardTemplateBlock, { kind: "checklist" }>;

/** Template blocks (API shape) -> the modal's draft bricks. Spaced positions, no parent. Unknown kinds are skipped. */
export function blocksToBricks(blocks: ReadonlyArray<CardTemplateBlock | null | undefined>, makeId: () => string): BoardBrick[] {
  const out: BoardBrick[] = [];
  for (let raw of blocks ?? []) {
    if (!raw || typeof raw !== "object") continue;
    // Card blocks are flat ({ kind, markdown, displayStyle }); a block written in the document shape ({ kind, content: {...} })
    // is accepted too, so a template created by another client or script still shows up.
    const nested = (raw as { content?: unknown }).content;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) raw = { ...(nested as object), kind: raw.kind } as CardTemplateBlock;
    const position = (out.length + 1) * 1000;
    const base = { id: makeId(), position, parentBlockId: null };
    if (raw.kind === "text") {
      const t = raw as TextInput;
      out.push({ ...base, kind: "text", displayStyle: t.displayStyle || "paragraph", markdown: String(t.markdown ?? ""), tasks: [] });
    } else if (raw.kind === "checklist") {
      const c = raw as ChecklistInput;
      const items = (Array.isArray(c.items) ? c.items : []).map((it, i) => ({
        id: String(it?.id || makeId() + `-${i}`),
        label: String(it?.label ?? ""),
        checked: Boolean(it?.checked),
      }));
      out.push({ ...base, kind: "checklist", items });
    } else if (raw.kind === "table") {
      const rows = (raw as Extract<CardTemplateBlock, { kind: "table" }>).rows;
      out.push({ ...base, kind: "table", rows: (Array.isArray(rows) ? rows : []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [])) } as BoardBrick);
    }
  }
  return out;
}

/** Draft bricks -> template blocks. Only text, checklist and table are kept; empty text blocks are dropped. */
export function bricksToBlocks(bricks: ReadonlyArray<BoardBrick>): CardTemplateBlock[] {
  const out: CardTemplateBlock[] = [];
  const ordered = [...(bricks ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  for (const b of ordered) {
    if (b.parentBlockId) continue;
    if (b.kind === "text") {
      const markdown = b.markdown ?? "";
      if (!markdown.trim()) continue;
      out.push({ kind: "text", displayStyle: b.displayStyle || "paragraph", markdown });
    } else if (b.kind === "checklist") {
      const items = (b.items ?? []).map((it) => ({ id: String(it.id), label: String(it.label ?? ""), checked: Boolean(it.checked) })).filter((it) => it.label.trim());
      if (items.length === 0) continue;
      out.push({ kind: "checklist", items });
    } else if (b.kind === "table") {
      out.push({ kind: "table", rows: (b.rows ?? []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [])) });
    }
  }
  return out;
}

export interface TagLike {
  id: string;
  name?: string;
  color?: string | null;
  [key: string]: unknown;
}
export interface MemberLike {
  id?: string;
  userId?: string;
  name?: string;
  email?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  [key: string]: unknown;
}
export interface ModalAssignee {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface TemplateModalState {
  listId: string;
  title: string;
  startAt: string | null;
  dueAt: string | null;
  tags: TagLike[];
  assignees: ModalAssignee[];
  blocks: BoardBrick[];
  /** Tag ids the server returned that this client does not know (not in the board's tags). */
  unknownTagIds: string[];
  warnings: string[];
}

/** Maps the resolve response onto the create modal's local states. Unknown tags are reported, never invented. */
export function resolvedToModalState(
  resolved: ResolvedCardTemplate,
  ctx: { tags: ReadonlyArray<TagLike>; members: ReadonlyArray<MemberLike>; makeId: () => string },
): TemplateModalState {
  const tagById = new Map(ctx.tags.map((t) => [t.id, t]));
  const tags: TagLike[] = [];
  const unknownTagIds: string[] = [];
  const seenTags = new Set<string>();
  for (const id of resolved.tagIds ?? []) {
    if (seenTags.has(id)) continue;
    seenTags.add(id);
    const known = tagById.get(id);
    if (known) tags.push(known);
    else unknownTagIds.push(id);
  }
  const memberById = new Map<string, MemberLike>();
  for (const m of ctx.members) {
    const id = m.id ?? m.userId;
    if (id) memberById.set(id, m);
  }
  const seenUsers = new Set<string>();
  const assignees: ModalAssignee[] = [];
  for (const id of resolved.assigneeIds ?? []) {
    if (seenUsers.has(id)) continue;
    seenUsers.add(id);
    const m = memberById.get(id);
    assignees.push({
      id,
      name: m?.name || m?.email || "",
      email: m?.email || "",
      avatar_url: (m?.avatar_url ?? m?.avatarUrl ?? null) as string | null,
    });
  }
  return {
    listId: resolved.listId,
    title: resolved.title ?? "",
    startAt: resolvedDateToIso(resolved.startAt),
    dueAt: resolvedDateToIso(resolved.dueAt),
    tags,
    assignees,
    blocks: blocksToBricks(resolved.blocks ?? [], ctx.makeId),
    unknownTagIds,
    warnings: Array.isArray(resolved.warnings) ? resolved.warnings.filter((w) => typeof w === "string" && w) : [],
  };
}

// ── Editor form <-> DTO ───────────────────────────────────────────────────────

export interface TemplateForm {
  name: string;
  description: string;
  icon: string;
  titlePattern: string;
  targetListId: string;
  tagIds: string[];
  assigneeUserIds: string[];
  assigneeGroupIds: string[];
  /** Raw text of the offset inputs ("" = no date). */
  startOffset: string;
  dueOffset: string;
  blocks: BoardBrick[];
}

export function emptyForm(): TemplateForm {
  return { name: "", description: "", icon: "", titlePattern: "", targetListId: "", tagIds: [], assigneeUserIds: [], assigneeGroupIds: [], startOffset: "", dueOffset: "", blocks: [] };
}

export function templateToForm(t: CardTemplate, makeId: () => string): TemplateForm {
  return {
    name: t.name ?? "",
    description: t.description ?? "",
    icon: t.icon ?? "",
    titlePattern: t.titlePattern ?? "",
    targetListId: t.targetListId ?? "",
    tagIds: [...(t.tagIds ?? [])],
    assigneeUserIds: [...(t.assigneeUserIds ?? [])],
    assigneeGroupIds: [...(t.assigneeGroupIds ?? [])],
    startOffset: t.startOffsetDays === null || t.startOffsetDays === undefined ? "" : String(t.startOffsetDays),
    dueOffset: t.dueOffsetDays === null || t.dueOffsetDays === undefined ? "" : String(t.dueOffsetDays),
    blocks: blocksToBricks(t.blocks ?? [], makeId),
  };
}

export type FormErrorKey = "nameRequired" | "nameTooLong" | "titleTooLong" | "descriptionTooLong" | "startInvalid" | "startRange" | "dueInvalid" | "dueRange" | "dueBeforeStart" | "tooManyTags" | "tooManyBlocks";
export type FormErrors = Partial<Record<"name" | "titlePattern" | "description" | "startOffset" | "dueOffset" | "tagIds" | "blocks", FormErrorKey>>;

export function validateForm(form: TemplateForm): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > TEMPLATE_LIMITS.name) errors.name = "nameTooLong";
  if (form.titlePattern.length > TEMPLATE_LIMITS.titlePattern) errors.titlePattern = "titleTooLong";
  if (form.description.length > TEMPLATE_LIMITS.description) errors.description = "descriptionTooLong";
  const start = parseOffset(form.startOffset);
  const due = parseOffset(form.dueOffset);
  if (!start.ok) errors.startOffset = start.error === "integer" ? "startInvalid" : "startRange";
  if (!due.ok) errors.dueOffset = due.error === "integer" ? "dueInvalid" : "dueRange";
  if (start.ok && due.ok && offsetsOutOfOrder(start.value, due.value)) errors.dueOffset = "dueBeforeStart";
  if (form.tagIds.length > TEMPLATE_LIMITS.tags) errors.tagIds = "tooManyTags";
  if (bricksToBlocks(form.blocks).length > TEMPLATE_LIMITS.blocks) errors.blocks = "tooManyBlocks";
  return errors;
}

export type FormToInput = { ok: true; value: CardTemplateInput } | { ok: false; errors: FormErrors };

/** Form -> create/update body. Offsets become integers or null, empty text becomes null, ids are deduplicated. */
export function formToInput(form: TemplateForm): FormToInput {
  const errors = validateForm(form);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const start = parseOffset(form.startOffset);
  const due = parseOffset(form.dueOffset);
  const uniq = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)));
  return {
    ok: true,
    value: {
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
      titlePattern: form.titlePattern,
      targetListId: form.targetListId || null,
      tagIds: uniq(form.tagIds),
      assigneeUserIds: uniq(form.assigneeUserIds),
      assigneeGroupIds: uniq(form.assigneeGroupIds),
      startOffsetDays: start.ok ? start.value : null,
      dueOffsetDays: due.ok ? due.value : null,
      blocks: bricksToBlocks(form.blocks),
    },
  };
}

/** A name for a copy that is free among `existing` (case-insensitive) and fits the name limit. */
export function uniqueCopyName(name: string, existing: ReadonlyArray<string>, suffix: string): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const stem = name.trim();
  const make = (tail: string) => `${stem.slice(0, Math.max(1, TEMPLATE_LIMITS.name - tail.length)).trimEnd()}${tail}`;
  let candidate = make(` ${suffix}`);
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = make(` ${suffix} ${i}`);
  return candidate;
}

/** The form of a copy of `form`: same content, a free name, fresh block ids. */
export function duplicateForm(form: TemplateForm, existingNames: ReadonlyArray<string>, suffix: string, makeId: () => string): TemplateForm {
  return { ...form, name: uniqueCopyName(form.name, existingNames, suffix), blocks: blocksToBricks(bricksToBlocks(form.blocks), makeId) };
}

export function toggleId(ids: ReadonlyArray<string>, id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

// ── Tag picker grouping ───────────────────────────────────────────────────────

export interface TagGroupLike {
  id: string;
  name: string;
  /** Tag NAMES (that is what team tag groups store). */
  tags: string[];
}
export interface TagSection {
  id: string;
  name: string;
  tags: TagLike[];
}

/** Groups the board's tags by the team's tag groups (matched by name, case-insensitive); the rest go in a last section. */
export function groupTagsBySection(tags: ReadonlyArray<TagLike>, groups: ReadonlyArray<TagGroupLike>, otherName: string): TagSection[] {
  const byName = new Map<string, TagLike[]>();
  for (const t of tags) {
    const key = String(t.name ?? "").trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(t);
  }
  const used = new Set<string>();
  const sections: TagSection[] = [];
  for (const g of groups) {
    const members: TagLike[] = [];
    for (const name of g.tags) {
      const key = name.trim().toLowerCase();
      for (const t of byName.get(key) ?? []) {
        if (!members.includes(t)) members.push(t);
        used.add(t.id);
      }
    }
    if (members.length > 0) sections.push({ id: g.id, name: g.name, tags: members });
  }
  const rest = tags.filter((t) => !used.has(t.id));
  if (rest.length > 0) sections.push({ id: "__other__", name: otherName, tags: rest });
  return sections;
}

// ── Live preview ──────────────────────────────────────────────────────────────

export interface FormPreview {
  title: string;
  startDay: string | null;
  dueDay: string | null;
  tagNames: string[];
  assigneeNames: string[];
  groupNames: string[];
  listName: string | null;
  blockCount: number;
  /** Tag/user/group ids of the form that no longer exist (they would be dropped, with a warning, on resolve). */
  missing: number;
}

/**
 * What `resolve` would roughly produce for the form as it stands (client estimate, nothing sent):
 * `{date}` in the title becomes today's date, offsets are added to today. The server is the source of truth.
 */
export function previewForm(
  form: TemplateForm,
  today: string,
  ctx: { tags: ReadonlyArray<TagLike>; members: ReadonlyArray<MemberLike>; groups: ReadonlyArray<{ id: string; name: string }>; lists: ReadonlyArray<{ id: string; name: string }> },
): FormPreview {
  const start = parseOffset(form.startOffset);
  const due = parseOffset(form.dueOffset);
  const tagById = new Map(ctx.tags.map((t) => [t.id, t]));
  const memberById = new Map<string, MemberLike>();
  for (const m of ctx.members) {
    const id = m.id ?? m.userId;
    if (id) memberById.set(id, m);
  }
  const groupById = new Map(ctx.groups.map((g) => [g.id, g]));
  let missing = 0;
  const tagNames: string[] = [];
  for (const id of form.tagIds) {
    const t = tagById.get(id);
    if (t) tagNames.push(String(t.name ?? id));
    else missing++;
  }
  const assigneeNames: string[] = [];
  for (const id of form.assigneeUserIds) {
    const m = memberById.get(id);
    if (m) assigneeNames.push(m.name || m.email || id);
    else missing++;
  }
  const groupNames: string[] = [];
  for (const id of form.assigneeGroupIds) {
    const g = groupById.get(id);
    if (g) groupNames.push(g.name);
    else missing++;
  }
  return {
    title: form.titlePattern.split("{date}").join(today),
    startDay: start.ok && start.value !== null ? addDaysISO(today, start.value) : null,
    dueDay: due.ok && due.value !== null ? addDaysISO(today, due.value) : null,
    tagNames,
    assigneeNames,
    groupNames,
    listName: ctx.lists.find((l) => l.id === form.targetListId)?.name ?? null,
    blockCount: bricksToBlocks(form.blocks).length,
    missing,
  };
}
