/** Local search of the command palette: what the open page contains (cards, lists) and the team's boards, by name. */

export interface SearchableCard {
  id: string;
  title: string;
  tags?: ReadonlyArray<{ name?: string | null }>;
}
export interface SearchableList {
  id: string;
  name: string;
  cards: ReadonlyArray<SearchableCard>;
}
export interface CardHit {
  id: string;
  title: string;
  listName: string;
  tagNames: string[];
}

const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Every word of the query must appear in the title, list name or a tag; title matches rank first, then starts-with. */
export function searchCards(lists: ReadonlyArray<SearchableList>, query: string, limit = 8): CardHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ hit: CardHit; score: number }> = [];
  for (const list of lists) {
    for (const card of list.cards) {
      const title = fold(card.title);
      const tagNames = (card.tags ?? []).map((t) => String(t.name ?? "")).filter(Boolean);
      const hay = `${title} ${fold(list.name)} ${tagNames.map(fold).join(" ")}`;
      if (!words.every((w) => hay.includes(w))) continue;
      const inTitle = words.every((w) => title.includes(w));
      const score = (inTitle ? 2 : 0) + (title.startsWith(words[0]) ? 1 : 0);
      scored.push({ hit: { id: card.id, title: card.title, listName: list.name, tagNames }, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.hit);
}

export function searchByName<T extends { name: string }>(items: ReadonlyArray<T>, query: string, limit = 5): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return items.filter((i) => words.every((w) => fold(i.name).includes(w))).slice(0, limit);
}
