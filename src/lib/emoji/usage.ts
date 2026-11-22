/**
 * Recent / frequent emojis. Same storage key and shape the reaction picker has always used
 * ({ [emoji]: { count, lastUsed } }), so people keep their history. Custom emojis are stored as `custom:<id>`.
 */
export const USAGE_STORAGE_KEY = "emoji_reaction_usage";
export const MAX_STORED = 100;

export interface UsageEntry { count: number; lastUsed: number }
export type UsageMap = Record<string, UsageEntry>;

export const DEFAULT_QUICK_EMOJIS = ["👍", "❤️", "😂", "🎉", "🙌", "🔥"];

export function usageScore(e: UsageEntry, now: number): number {
  const age = now - e.lastUsed;
  const recency = age < 3_600_000 ? 3 : age < 86_400_000 ? 1.5 : 1;
  return e.count * recency;
}

/** Pure: a new map with one more use of `key`, trimmed to the best `max` entries. */
export function recordUse(map: UsageMap, key: string, now: number, max = MAX_STORED): UsageMap {
  const next: UsageMap = { ...map, [key]: { count: (map[key]?.count ?? 0) + 1, lastUsed: now } };
  const entries = Object.entries(next);
  if (entries.length <= max) return next;
  entries.sort(([, a], [, b]) => usageScore(b, now) - usageScore(a, now));
  return Object.fromEntries(entries.slice(0, max));
}

/** Pure: the `n` best keys, then `fallback` ones (skipping duplicates) until there are `n`. */
export function topUsed(map: UsageMap, n: number, now: number, fallback: string[] = []): string[] {
  const out = Object.entries(map)
    .sort(([, a], [, b]) => usageScore(b, now) - usageScore(a, now))
    .map(([k]) => k)
    .slice(0, n);
  for (const f of fallback) {
    if (out.length >= n) break;
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

function sanitize(raw: unknown): UsageMap {
  if (!raw || typeof raw !== "object") return {};
  const out: UsageMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const e = v as Partial<UsageEntry> | null;
    if (e && typeof e.count === "number" && typeof e.lastUsed === "number") out[k] = { count: e.count, lastUsed: e.lastUsed };
  }
  return out;
}

export function loadUsage(): UsageMap {
  try { return sanitize(JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) ?? "{}")); } catch { return {}; }
}

function saveUsage(map: UsageMap): void {
  try { localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(map)); } catch { /* storage full or blocked: history is optional */ }
}

export function trackEmojiUse(key: string): void {
  saveUsage(recordUse(loadUsage(), key, Date.now()));
}

export function getTopEmojis(n = 5): string[] {
  return topUsed(loadUsage(), n, Date.now(), DEFAULT_QUICK_EMOJIS);
}

export const customUsageKey = (id: string) => `custom:${id}`;
