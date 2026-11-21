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
  "room.pin_permanent",
  "room.unpin_others",
  "room.view_pins",
  "room.mention_everyone",
] as const;
export type RoomPermissionKey = (typeof ROOM_PERMISSION_KEYS)[number];

export interface Subject {
  subjectType: SubjectType;
  /** null only for `everyone`. */
  subjectId: string | null;
}

export interface OverrideDraft extends Subject {
  /** Any permission key the server's universe knows (the fixed list is only the fallback). */
  states: Partial<Record<string, TriState>>;
}

export interface OverrideDto {
  subjectType: SubjectType;
  subjectId: string | null;
  allow: string[];
  deny: string[];
}

export const EVERYONE: Subject = { subjectType: "everyone", subjectId: null };

export const subjectKey = (s: Subject): string => (s.subjectType === "everyone" ? "everyone" : `${s.subjectType}:${s.subjectId}`);

/** Keys a draft may carry: the server's universe, or the fixed list when the server sent no catalog. */
export type KeyScope = readonly string[];

/** Click order of the control: inherit -> allow -> deny -> inherit. */
export function nextState(state: TriState): TriState {
  return state === "inherit" ? "allow" : state === "allow" ? "deny" : "inherit";
}

export function stateOf(draft: OverrideDraft | undefined, key: string): TriState {
  return draft?.states[key] ?? "inherit";
}

/** Keys outside `scope` are dropped: the server would refuse them on save (and an old server never stored them). */
export function toDraft(dto: OverrideDto, scope: KeyScope = ROOM_PERMISSION_KEYS): OverrideDraft {
  const states: OverrideDraft["states"] = {};
  for (const k of dto.allow ?? []) if (scope.includes(k)) states[k] = "allow";
  // A key listed as both is a deny: the safer reading of a contradictory record.
  for (const k of dto.deny ?? []) if (scope.includes(k)) states[k] = "deny";
  const subjectType = dto.subjectType;
  return { subjectType, subjectId: subjectType === "everyone" ? null : dto.subjectId ?? null, states };
}

/** Drafts with every key on `inherit` are dropped: they say nothing. Only keys of `scope` are written (in its order). */
export function toDto(draft: OverrideDraft, scope: KeyScope = ROOM_PERMISSION_KEYS): OverrideDto | null {
  const allow: string[] = [];
  const deny: string[] = [];
  for (const k of scope) {
    const s = draft.states[k];
    if (s === "allow") allow.push(k);
    else if (s === "deny") deny.push(k);
  }
  if (allow.length === 0 && deny.length === 0) return null;
  return { subjectType: draft.subjectType, subjectId: draft.subjectType === "everyone" ? null : draft.subjectId, allow, deny };
}

export function draftsToDtos(drafts: readonly OverrideDraft[], scope: KeyScope = ROOM_PERMISSION_KEYS): OverrideDto[] {
  const out: OverrideDto[] = [];
  for (const d of drafts) {
    const dto = toDto(d, scope);
    if (dto) out.push(dto);
  }
  return out;
}

/** The answer of `GET /rooms/:id/permissions` may be a bare list or wrapped; anything unreadable is "no overrides". */
export function normalizeOverridesResponse(raw: unknown, scope: KeyScope = ROOM_PERMISSION_KEYS): OverrideDraft[] {
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
    }, scope);
    merged.set(subjectKey(draft), draft);
  }
  return [...merged.values()];
}

/** Set one state, creating the subject row when needed. Never mutates the input. */
export function setState(drafts: readonly OverrideDraft[], subject: Subject, key: string, state: TriState): OverrideDraft[] {
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

/** `available` (the keys of the server's universe) lets a preset skip keys the server does not have. */
type Available = ReadonlySet<string> | undefined;
const hasKey = (available: Available, key: string) => !available || available.has(key);

function withStates(drafts: readonly OverrideDraft[], subject: Subject, patch: Record<string, TriState>, available?: Available): OverrideDraft[] {
  const entries = Object.entries(patch).filter(([k]) => hasKey(available, k));
  if (entries.length === 0) return [...drafts];
  let next = ensureSubject(drafts, subject);
  for (const [k, v] of entries) next = setState(next, subject, k, v);
  return next;
}

/** One click: "Announcement channel": nobody posts (everyone: deny post) except the chosen roles (allow post). */
export function applyAnnouncementPreset(drafts: readonly OverrideDraft[], publisherRoleIds: readonly string[], available?: Available): OverrideDraft[] {
  let next = withStates(drafts, EVERYONE, { "room.post": "deny" }, available);
  for (const id of publisherRoleIds) next = withStates(next, { subjectType: "role", subjectId: id }, { "room.post": "allow" }, available);
  return next;
}

/** One click: "Private channel for roles": hidden for everyone, visible and writable for the chosen roles. */
export function applyPrivatePreset(drafts: readonly OverrideDraft[], roleIds: readonly string[], available?: Available): OverrideDraft[] {
  let next = withStates(drafts, EVERYONE, { "room.view": "deny" }, available);
  for (const id of roleIds) next = withStates(next, { subjectType: "role", subjectId: id }, { "room.view": "allow", "room.post": "allow" }, available);
  return next;
}

/** Keys of the "read only" shortcut: everybody reads, nobody writes or reacts (the fine keys follow `room.post`). */
export const READONLY_PRESET_KEYS = ["room.post", "room.react"] as const;

/** One click: "Read only for everyone". Administrators and channel managers keep writing (the server never locks them out). */
export function applyReadonlyPreset(drafts: readonly OverrideDraft[], available?: Available): OverrideDraft[] {
  return withStates(drafts, EVERYONE, Object.fromEntries(READONLY_PRESET_KEYS.map((k) => [k, "deny" as const])), available);
}

/** What the chosen roles get in a moderation channel, on top of seeing it and writing in it. */
export const MODERATION_PRESET_EXTRA_KEYS = ["room.manage_messages", "room.view_audit"] as const;

/** One click: "Moderation channel": hidden for everyone; the chosen roles see it, write and moderate messages / read the log. */
export function applyModerationPreset(drafts: readonly OverrideDraft[], roleIds: readonly string[], available?: Available): OverrideDraft[] {
  let next = withStates(drafts, EVERYONE, { "room.view": "deny" }, available);
  const grant: Record<string, TriState> = { "room.view": "allow", "room.post": "allow", ...Object.fromEntries(MODERATION_PRESET_EXTRA_KEYS.map((k) => [k, "allow" as const])) };
  for (const id of roleIds) next = withStates(next, { subjectType: "role", subjectId: id }, grant, available);
  return next;
}

/** Keys the bots shortcut closes for everybody (noise a bot channel does not need). */
export const BOTS_PRESET_DENY_KEYS = ["room.create_threads", "room.attach_files", "room.send_bricks", "room.mention_everyone"] as const;
export const BOTS_PRESET_ALLOW_KEYS = ["room.use_commands", "room.use_components"] as const;

/**
 * One click: "Bots channel": everybody may run commands and press bot buttons (explicit allow, so it holds even when posting is
 * restricted further up) and no threads, attachments, rich blocks or @everyone. The server has no key that limits free text to
 * commands, so people can still type: this keeps the channel tidy, it does not make it command-only.
 */
export function applyBotsPreset(drafts: readonly OverrideDraft[], available?: Available): OverrideDraft[] {
  const patch: Record<string, TriState> = {};
  for (const k of BOTS_PRESET_ALLOW_KEYS) patch[k] = "allow";
  for (const k of BOTS_PRESET_DENY_KEYS) patch[k] = "deny";
  return withStates(drafts, EVERYONE, patch, available);
}

export type PresetName = "open" | "announcement" | "private" | "readonly" | "moderation" | "bots" | "custom";
export type PresetId = Exclude<PresetName, "open" | "custom">;

/** Shortcuts the server's universe can honour (a preset whose anchor key is missing is not offered). */
export function availablePresets(available?: Available): PresetId[] {
  const out: PresetId[] = [];
  if (hasKey(available, "room.post")) out.push("announcement");
  if (hasKey(available, "room.view")) out.push("private");
  if (hasKey(available, "room.post")) out.push("readonly");
  if (hasKey(available, "room.view") && hasKey(available, "room.post") && hasKey(available, "room.manage_messages")) out.push("moderation");
  if (hasKey(available, "room.use_commands")) out.push("bots");
  return out;
}

const activeStates = (d: OverrideDraft): [string, TriState][] =>
  Object.entries(d.states).filter((e): e is [string, TriState] => e[1] === "allow" || e[1] === "deny");
const onlyKeys = (d: OverrideDraft, keys: readonly string[]) => activeStates(d).every(([k]) => keys.includes(k));

/** Name shown next to the editor: what the current overrides amount to. */
export function detectPreset(drafts: readonly OverrideDraft[]): PresetName {
  const rows = drafts.filter((d) => activeStates(d).length > 0);
  if (rows.length === 0) return "open";
  const everyone = rows.find((d) => d.subjectType === "everyone");
  const others = rows.filter((d) => d.subjectType !== "everyone");
  const st = (d: OverrideDraft | undefined, key: string) => d?.states[key];
  if (everyone && st(everyone, "room.post") === "deny" && onlyKeys(everyone, ["room.post"]) && others.length > 0
    && others.every((d) => d.states["room.post"] === "allow" && onlyKeys(d, ["room.post"]))) return "announcement";
  if (everyone && others.length === 0 && st(everyone, "room.post") === "deny" && onlyKeys(everyone, READONLY_PRESET_KEYS)) return "readonly";
  if (everyone && st(everyone, "room.view") === "deny" && onlyKeys(everyone, ["room.view"]) && others.length > 0
    && others.every((d) => d.states["room.view"] === "allow")) {
    if (others.every((d) => onlyKeys(d, ["room.view", "room.post"]))) return "private";
    if (others.every((d) => d.states["room.manage_messages"] === "allow" && onlyKeys(d, ["room.view", "room.post", ...MODERATION_PRESET_EXTRA_KEYS]))) return "moderation";
  }
  if (everyone && others.length === 0 && st(everyone, "room.use_commands") === "allow"
    && onlyKeys(everyone, [...BOTS_PRESET_ALLOW_KEYS, ...BOTS_PRESET_DENY_KEYS])) return "bots";
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

/** Counts shown on a subject row when it is collapsed ("2 yes, 1 no"). `scope` limits the count to those keys. */
export function summarize(draft: OverrideDraft, scope?: KeyScope): { allow: number; deny: number } {
  let allow = 0;
  let deny = 0;
  for (const [k, s] of Object.entries(draft.states)) {
    if (scope && !scope.includes(k)) continue;
    if (s === "allow") allow++;
    else if (s === "deny") deny++;
  }
  return { allow, deny };
}
