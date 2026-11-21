/**
 * Tri-state permission overrides of a channel / category (design addendum A1): every permission, for every subject,
 * is `allow` (yes), `deny` (no) or `inherit` (not set: falls to the next layer). Pure, tested in tristate.test.ts.
 *
 * Wire shape of a stored override: `{ subjectType, subjectId, allow: string[], deny: string[] }`
 * (a key in neither list is `inherit`).
 */

export type TriState = "allow" | "deny" | "inherit";
export type SubjectType = "everyone" | "role" | "group" | "member";

export const ROOM_PERMISSION_KEYS = [
  "room.view",
  "room.post",
  "room.react",
  "room.call",
  "room.manage_messages",
  "room.pin",
  "room.mention_everyone",
] as const;
export type RoomPermissionKey = (typeof ROOM_PERMISSION_KEYS)[number];

export interface Subject {
  subjectType: SubjectType;
  /** null only for `everyone`. */
  subjectId: string | null;
}

export interface OverrideDraft extends Subject {
  states: Partial<Record<RoomPermissionKey, TriState>>;
}

export interface OverrideDto {
  subjectType: SubjectType;
  subjectId: string | null;
  allow: string[];
  deny: string[];
}

export const EVERYONE: Subject = { subjectType: "everyone", subjectId: null };

export const subjectKey = (s: Subject): string => (s.subjectType === "everyone" ? "everyone" : `${s.subjectType}:${s.subjectId}`);

const isKey = (k: string): k is RoomPermissionKey => (ROOM_PERMISSION_KEYS as readonly string[]).includes(k);

/** Click order of the control: inherit -> allow -> deny -> inherit. */
export function nextState(state: TriState): TriState {
  return state === "inherit" ? "allow" : state === "allow" ? "deny" : "inherit";
}

export function stateOf(draft: OverrideDraft | undefined, key: RoomPermissionKey): TriState {
  return draft?.states[key] ?? "inherit";
}

export function toDraft(dto: OverrideDto): OverrideDraft {
  const states: OverrideDraft["states"] = {};
  for (const k of dto.allow ?? []) if (isKey(k)) states[k] = "allow";
  // A key listed as both is a deny: the safer reading of a contradictory record.
  for (const k of dto.deny ?? []) if (isKey(k)) states[k] = "deny";
  const subjectType = dto.subjectType;
  return { subjectType, subjectId: subjectType === "everyone" ? null : dto.subjectId ?? null, states };
}

/** Drafts with every key on `inherit` are dropped: they say nothing. Keys the UI does not know are not touched here. */
export function toDto(draft: OverrideDraft): OverrideDto | null {
  const allow: string[] = [];
  const deny: string[] = [];
  for (const k of ROOM_PERMISSION_KEYS) {
    const s = draft.states[k];
    if (s === "allow") allow.push(k);
    else if (s === "deny") deny.push(k);
  }
  if (allow.length === 0 && deny.length === 0) return null;
  return { subjectType: draft.subjectType, subjectId: draft.subjectType === "everyone" ? null : draft.subjectId, allow, deny };
}

export function draftsToDtos(drafts: readonly OverrideDraft[]): OverrideDto[] {
  const out: OverrideDto[] = [];
  for (const d of drafts) {
    const dto = toDto(d);
    if (dto) out.push(dto);
  }
  return out;
}

/** The answer of `GET /rooms/:id/permissions` may be a bare list or wrapped; anything unreadable is "no overrides". */
export function normalizeOverridesResponse(raw: unknown): OverrideDraft[] {
  const list: unknown = Array.isArray(raw) ? raw : (raw as any)?.overrides ?? (raw as any)?.data ?? [];
  if (!Array.isArray(list)) return [];
  const merged = new Map<string, OverrideDraft>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const type = (item as any).subjectType;
    if (type !== "everyone" && type !== "role" && type !== "group" && type !== "member") continue;
    const id = (item as any).subjectId;
    if (type !== "everyone" && typeof id !== "string") continue;
    const draft = toDraft({
      subjectType: type,
      subjectId: typeof id === "string" ? id : null,
      allow: Array.isArray((item as any).allow) ? (item as any).allow : [],
      deny: Array.isArray((item as any).deny) ? (item as any).deny : [],
    });
    merged.set(subjectKey(draft), draft);
  }
  return [...merged.values()];
}

/** Set one state, creating the subject row when needed. Never mutates the input. */
export function setState(drafts: readonly OverrideDraft[], subject: Subject, key: RoomPermissionKey, state: TriState): OverrideDraft[] {
  const target = subjectKey(subject);
  let found = false;
  const next = drafts.map((d) => {
    if (subjectKey(d) !== target) return d;
    found = true;
    const states = { ...d.states };
    if (state === "inherit") delete states[key];
    else states[key] = state;
    return { ...d, states };
  });
  if (!found && state !== "inherit") {
    next.push({ subjectType: subject.subjectType, subjectId: subject.subjectType === "everyone" ? null : subject.subjectId, states: { [key]: state } });
  }
  return next;
}

export function removeSubject(drafts: readonly OverrideDraft[], subject: Subject): OverrideDraft[] {
  const target = subjectKey(subject);
  return drafts.filter((d) => subjectKey(d) !== target);
}

export function ensureSubject(drafts: readonly OverrideDraft[], subject: Subject): OverrideDraft[] {
  if (drafts.some((d) => subjectKey(d) === subjectKey(subject))) return [...drafts];
  return [...drafts, { subjectType: subject.subjectType, subjectId: subject.subjectType === "everyone" ? null : subject.subjectId, states: {} }];
}

function withStates(drafts: readonly OverrideDraft[], subject: Subject, patch: Partial<Record<RoomPermissionKey, TriState>>): OverrideDraft[] {
  let next = ensureSubject(drafts, subject);
  for (const [k, v] of Object.entries(patch) as [RoomPermissionKey, TriState][]) next = setState(next, subject, k, v);
  return next;
}

/** One click: "Announcement channel": nobody posts (everyone: deny post) except the chosen roles (allow post). */
export function applyAnnouncementPreset(drafts: readonly OverrideDraft[], publisherRoleIds: readonly string[]): OverrideDraft[] {
  let next = withStates(drafts, EVERYONE, { "room.post": "deny" });
  for (const id of publisherRoleIds) next = withStates(next, { subjectType: "role", subjectId: id }, { "room.post": "allow" });
  return next;
}

/** One click: "Private channel for roles": hidden for everyone, visible and writable for the chosen roles. */
export function applyPrivatePreset(drafts: readonly OverrideDraft[], roleIds: readonly string[]): OverrideDraft[] {
  let next = withStates(drafts, EVERYONE, { "room.view": "deny" });
  for (const id of roleIds) next = withStates(next, { subjectType: "role", subjectId: id }, { "room.view": "allow", "room.post": "allow" });
  return next;
}

export type PresetName = "open" | "announcement" | "private" | "custom";

/** Name shown next to the editor: what the current overrides amount to. */
export function detectPreset(drafts: readonly OverrideDraft[]): PresetName {
  const active = drafts.filter((d) => toDto(d));
  if (active.length === 0) return "open";
  const everyone = active.find((d) => d.subjectType === "everyone");
  const others = active.filter((d) => d.subjectType !== "everyone");
  const onlyKeys = (d: OverrideDraft, keys: RoomPermissionKey[]) =>
    ROOM_PERMISSION_KEYS.every((k) => keys.includes(k) || (d.states[k] ?? "inherit") === "inherit");
  if (everyone && everyone.states["room.post"] === "deny" && onlyKeys(everyone, ["room.post"])
    && others.every((d) => d.states["room.post"] === "allow" && onlyKeys(d, ["room.post"]))) return "announcement";
  if (everyone && everyone.states["room.view"] === "deny" && onlyKeys(everyone, ["room.view"])
    && others.every((d) => d.states["room.view"] === "allow" && onlyKeys(d, ["room.view", "room.post"]))) return "private";
  return "custom";
}

export type DraftWarning = "hidden_from_everyone" | "nobody_can_post";

/** Mistakes worth a warning before saving (the owner / administrators still see the room whatever is set). */
export function validateDrafts(drafts: readonly OverrideDraft[]): DraftWarning[] {
  const out: DraftWarning[] = [];
  const everyone = drafts.find((d) => d.subjectType === "everyone");
  const others = drafts.filter((d) => d.subjectType !== "everyone");
  if (everyone?.states["room.view"] === "deny" && !others.some((d) => d.states["room.view"] === "allow")) out.push("hidden_from_everyone");
  if (everyone?.states["room.post"] === "deny" && !others.some((d) => d.states["room.post"] === "allow")) out.push("nobody_can_post");
  return out;
}

/** Counts shown on a subject row when it is collapsed ("2 yes, 1 no"). */
export function summarize(draft: OverrideDraft): { allow: number; deny: number } {
  let allow = 0;
  let deny = 0;
  for (const k of ROOM_PERMISSION_KEYS) {
    const s = draft.states[k];
    if (s === "allow") allow++;
    else if (s === "deny") deny++;
  }
  return { allow, deny };
}
