import { fold } from "./dataset.ts";
import type { CustomEmoji, EmojiDataset, EmojiEntry } from "./types.ts";

export function normalizeQuery(query: string): string {
  return fold(query.trim()).replace(/^:+|:+$/g, "");
}

function scoreTerm(term: string, entry: EmojiEntry, aliasesOf: string[]): number {
  const id = fold(entry.id);
  if (id === term) return 100;
  if (aliasesOf.includes(term)) return 95;
  if (id.startsWith(term)) return 80;
  let best = 0;
  for (const kw of entry.keywords) {
    if (kw === term) best = Math.max(best, 70);
    else if (kw.startsWith(term)) best = Math.max(best, 60);
    else if (kw.split(/[\s_-]+/).some((w) => w.startsWith(term))) best = Math.max(best, 50);
    else if (term.length >= 3 && kw.includes(term)) best = Math.max(best, 25);
  }
  if (best < 40 && term.length >= 2 && id.includes(term)) best = Math.max(best, 40);
  return best;
}

export interface SearchOptions {
  limit?: number;
}

/** Aliases grouped by target id, so the scorer does not scan the whole alias table per entry. */
const aliasIndexCache = new WeakMap<EmojiDataset, Map<string, string[]>>();
function aliasIndex(ds: EmojiDataset): Map<string, string[]> {
  let idx = aliasIndexCache.get(ds);
  if (!idx) {
    idx = new Map();
    for (const [alias, target] of Object.entries(ds.aliases)) {
      const list = idx.get(target) ?? [];
      list.push(fold(alias));
      idx.set(target, list);
    }
    aliasIndexCache.set(ds, idx);
  }
  return idx;
}

/**
 * Search by shortcode, alias, English terms and (in "es") Spanish terms. Every word of the query has to match;
 * results are ordered by the sum of the per-word scores, ties keep the dataset order.
 */
export function searchEmojis(ds: EmojiDataset, query: string, opts: SearchOptions = {}): EmojiEntry[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const aliases = aliasIndex(ds);
  const scored: Array<{ entry: EmojiEntry; score: number; order: number }> = [];
  ds.entries.forEach((entry, order) => {
    let total = 0;
    const aliasList = aliases.get(entry.id) ?? [];
    for (const term of terms) {
      const s = scoreTerm(term, entry, aliasList);
      if (s === 0) return;
      total += s;
    }
    scored.push({ entry, score: total, order });
  });
  // Ties: the shorter shortcode is the more basic emoji ("heart" before "broken_heart"), then dataset order.
  scored.sort((a, b) => b.score - a.score || a.entry.id.length - b.entry.id.length || a.order - b.order);
  return scored.slice(0, opts.limit ?? 120).map((s) => s.entry);
}

/** Custom emojis of the space that match the query (name or keywords). */
export function searchCustomEmojis(list: CustomEmoji[], query: string): CustomEmoji[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  return list.filter((c) => fold(c.name).includes(q) || (c.keywords ?? []).some((k) => fold(k).includes(q)));
}
