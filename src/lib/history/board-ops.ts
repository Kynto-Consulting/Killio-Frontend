import type { Op, OpApplier, OpDraft } from "./types";

// Board engine delta. The board page keeps `lists: { id, title, cards: [] }[]`.
// A board.batch captures list + card create/remove/update (incl. moves) between
// two snapshots, with its inverse, so it can drive undo/redo. Card objects are
// kept whole for recreate.

export const BOARD_BATCH = "board.batch";

export interface BoardCard {
  id: string;
  [k: string]: any;
}
export interface BoardList {
  id: string;
  title: string;
  cards: BoardCard[];
}

export interface BoardBatchPayload {
  lists: { created: { id: string; title: string }[]; removed: { id: string; title: string }[] };
  cards: {
    created: { listId: string; index: number; card: BoardCard }[];
    removed: { listId: string; index: number; card: BoardCard }[];
    // moved/field change → the full target card + where it lives now
    updated: { listId: string; index: number; card: BoardCard }[];
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

interface FlatCard { card: BoardCard; listId: string; index: number }

function flatten(lists: BoardList[]): Map<string, FlatCard> {
  const m = new Map<string, FlatCard>();
  for (const l of lists) {
    (l.cards || []).forEach((card, index) => m.set(card.id, { card, listId: l.id, index }));
  }
  return m;
}

export function computeBoardBatch(before: BoardList[], after: BoardList[]): OpDraft | null {
  const beforeL = new Map(before.map((l) => [l.id, l]));
  const afterL = new Map(after.map((l) => [l.id, l]));

  const listsCreated = after.filter((l) => !beforeL.has(l.id)).map((l) => ({ id: l.id, title: l.title }));
  const listsRemoved = before.filter((l) => !afterL.has(l.id)).map((l) => ({ id: l.id, title: l.title }));

  const beforeC = flatten(before);
  const afterC = flatten(after);

  const cardsCreated: { listId: string; index: number; card: BoardCard }[] = [];
  const cardsRemoved: { listId: string; index: number; card: BoardCard }[] = [];
  const cardsUpdated: { listId: string; index: number; card: BoardCard }[] = [];
  const cardsUpdatedPrev: { listId: string; index: number; card: BoardCard }[] = [];

  for (const [id, f] of afterC) {
    const b = beforeC.get(id);
    if (!b) cardsCreated.push({ listId: f.listId, index: f.index, card: clone(f.card) });
    else if (b.listId !== f.listId || b.index !== f.index || JSON.stringify(b.card) !== JSON.stringify(f.card)) {
      cardsUpdated.push({ listId: f.listId, index: f.index, card: clone(f.card) });
      cardsUpdatedPrev.push({ listId: b.listId, index: b.index, card: clone(b.card) });
    }
  }
  for (const [id, b] of beforeC) {
    if (!afterC.has(id)) cardsRemoved.push({ listId: b.listId, index: b.index, card: clone(b.card) });
  }

  if (
    listsCreated.length === 0 && listsRemoved.length === 0 &&
    cardsCreated.length === 0 && cardsRemoved.length === 0 && cardsUpdated.length === 0
  ) {
    return null;
  }

  const forward: BoardBatchPayload = {
    lists: { created: clone(listsCreated), removed: clone(listsRemoved) },
    cards: { created: clone(cardsCreated), removed: clone(cardsRemoved), updated: cardsUpdated },
  };
  const inverse: BoardBatchPayload = {
    lists: { created: clone(listsRemoved), removed: clone(listsCreated) },
    cards: { created: clone(cardsRemoved), removed: clone(cardsCreated), updated: cardsUpdatedPrev },
  };

  return { type: BOARD_BATCH, payload: forward, inverse: { type: BOARD_BATCH, payload: inverse } };
}

// Pure reducer: apply a board delta to a lists snapshot. Idempotent.
export function applyBoardBatch(lists: BoardList[], payload: BoardBatchPayload): BoardList[] {
  let next: BoardList[] = lists.map((l) => ({ ...l, cards: [...(l.cards || [])] }));
  const byId = new Map(next.map((l) => [l.id, l]));

  // remove cards
  if (payload.cards.removed.length) {
    const rm = new Set(payload.cards.removed.map((c) => c.card.id));
    for (const l of next) l.cards = l.cards.filter((c) => !rm.has(c.id));
  }
  // remove lists
  if (payload.lists.removed.length) {
    const rl = new Set(payload.lists.removed.map((l) => l.id));
    next = next.filter((l) => !rl.has(l.id));
  }
  // create lists
  for (const l of payload.lists.created) {
    if (!byId.has(l.id)) {
      const nl: BoardList = { id: l.id, title: l.title, cards: [] };
      next.push(nl);
      byId.set(l.id, nl);
    }
  }
  const rebuildIndex = () => {
    byId.clear();
    for (const l of next) byId.set(l.id, l);
  };
  rebuildIndex();

  const placeCard = (listId: string, index: number, card: BoardCard) => {
    const l = byId.get(listId);
    if (!l) return;
    l.cards = l.cards.filter((c) => c.id !== card.id); // dedupe / move
    const at = Math.max(0, Math.min(index, l.cards.length));
    l.cards.splice(at, 0, card);
  };
  // remove the updated card from its old list first (it may have moved)
  for (const u of payload.cards.updated) {
    for (const l of next) l.cards = l.cards.filter((c) => c.id !== u.card.id);
  }
  for (const c of payload.cards.created) placeCard(c.listId, c.index, c.card);
  for (const u of payload.cards.updated) placeCard(u.listId, u.index, u.card);

  return next;
}

export interface BoardApplierDeps {
  getLists: () => BoardList[];
  setLists: (next: BoardList[]) => void;
  token: () => string | null | undefined;
  createCard: (body: { id?: string; listId: string; title: string; summary?: string; dueAt?: string }, token?: string | null) => Promise<any>;
  updateCard: (cardId: string, updates: Record<string, any>, token?: string | null) => Promise<any>;
  deleteCard: (cardId: string, token?: string | null) => Promise<any>;
  createList: (boardId: string, body: { id?: string; name: string }, token?: string | null) => Promise<any>;
  deleteList: (boardId: string, listId: string, token?: string | null) => Promise<any>;
  boardId: () => string;
  onError?: () => void;
}

export function makeBoardApplier(deps: BoardApplierDeps): OpApplier {
  return async (op: Op, ctx) => {
    const payload = op.payload as BoardBatchPayload;

    // Optimistic local state.
    deps.setLists(applyBoardBatch(deps.getLists(), payload));

    if (!ctx.shouldPersist) return; // remote ops already persisted upstream
    const token = deps.token();
    if (!token) return;
    const boardId = deps.boardId();

    try {
      for (const c of payload.cards.removed) await deps.deleteCard(c.card.id, token);
      for (const l of payload.lists.removed) await deps.deleteList(boardId, l.id, token);
      for (const l of payload.lists.created) await deps.createList(boardId, { id: l.id, name: l.title }, token);
      for (const c of payload.cards.created) {
        await deps.createCard({ id: c.card.id, listId: c.listId, title: String(c.card.title ?? ""), summary: c.card.summary, dueAt: c.card.dueAt }, token);
        await deps.updateCard(c.card.id, { list_id: c.listId, position: c.index }, token);
      }
      for (const u of payload.cards.updated) {
        await deps.updateCard(u.card.id, { list_id: u.listId, position: u.index, title: u.card.title, summary: u.card.summary }, token);
      }
    } catch (e) {
      console.error("[board-history] persist failed", e);
      deps.onError?.();
    }
  };
}
