/**
 * Selection rules of tag groups. A group is `single` (one tag of the group per card), `multi` (any number, the default) or
 * `limited` (at most `maxTags`). Tags belong to a group by name, like everywhere else (`rank("Group")`, the template editor).
 */

export type TagGroupMode = "single" | "multi" | "limited";
export const TAG_GROUP_MODES: readonly TagGroupMode[] = ["single", "multi", "limited"];
export const TAG_GROUP_MAX_LIMIT = 50;
export const DEFAULT_GROUP_LIMIT = 3;

export interface RuleGroup {
  id: string;
  name: string;
  tags: string[];
  mode?: TagGroupMode;
  maxTags?: number | null;
}

export interface RuleTag {
  id: string;
  name?: string | null;
}

const key = (name: unknown) => String(name ?? "").trim().toLowerCase();

/** How many tags of the group a card may carry; `null` = no limit. */
export function groupLimit(group: Pick<RuleGroup, "mode" | "maxTags">): number | null {
  if (group.mode === "single") return 1;
  if (group.mode === "limited") {
    const n = Number(group.maxTags);
    return Number.isInteger(n) && n >= 1 ? n : DEFAULT_GROUP_LIMIT;
  }
  return null;
}

export type AddResult =
  | { ok: true; ids: string[]; replaced: string[] }
  | { ok: false; ids: string[]; group: string; limit: number };

/**
 * Adds `tag` to the selection honouring every group it belongs to: in a `single` group it replaces the tag of that group
 * already chosen (reported in `replaced`); in a `limited` group that is full it is refused (`ok: false`, nothing changes).
 * Tags outside any group, and `multi` groups, never block. Adding a tag that is already selected is a no-op.
 */
export function addTagWithRules(selectedIds: readonly string[], tag: RuleTag, allTags: readonly RuleTag[], groups: readonly RuleGroup[]): AddResult {
  if (selectedIds.includes(tag.id)) return { ok: true, ids: [...selectedIds], replaced: [] };
  const byId = new Map(allTags.map((t) => [t.id, t]));
  const name = key(tag.name);
  const mine = groups.filter((g) => g.tags.some((x) => key(x) === name));
  const toDrop = new Set<string>();
  for (const g of mine) {
    const limit = groupLimit(g);
    if (limit === null) continue;
    const names = new Set(g.tags.map(key));
    const inGroup = selectedIds.filter((id) => names.has(key(byId.get(id)?.name)));
    if (g.mode === "single") {
      for (const id of inGroup) toDrop.add(id);
    } else if (inGroup.length >= limit) {
      return { ok: false, ids: [...selectedIds], group: g.name, limit };
    }
  }
  const kept = selectedIds.filter((id) => !toDrop.has(id));
  return { ok: true, ids: [...kept, tag.id], replaced: [...toDrop] };
}

/** Groups whose current selection is over its limit (data created before the rule, or by another route). */
export function groupsOverLimit(selectedIds: readonly string[], allTags: readonly RuleTag[], groups: readonly RuleGroup[]): Array<{ group: string; count: number; limit: number }> {
  const byId = new Map(allTags.map((t) => [t.id, t]));
  const out: Array<{ group: string; count: number; limit: number }> = [];
  for (const g of groups) {
    const limit = groupLimit(g);
    if (limit === null) continue;
    const names = new Set(g.tags.map(key));
    const count = selectedIds.filter((id) => names.has(key(byId.get(id)?.name))).length;
    if (count > limit) out.push({ group: g.name, count, limit });
  }
  return out;
}

/** Normalised mode and limit as stored: only `limited` keeps a limit (1 to 50). */
export function normalizeRule(mode: unknown, maxTags: unknown): { mode: TagGroupMode; maxTags: number | null } {
  const m: TagGroupMode = mode === "single" || mode === "limited" ? mode : "multi";
  if (m !== "limited") return { mode: m, maxTags: null };
  const n = Math.floor(Number(maxTags));
  return { mode: m, maxTags: Number.isFinite(n) ? Math.min(TAG_GROUP_MAX_LIMIT, Math.max(1, n)) : DEFAULT_GROUP_LIMIT };
}
