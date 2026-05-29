// Lightweight local signal: board mutation API calls announce success so the
// board page can record an undo op for *this user's own* edits (board state is
// otherwise a realtime projection with no per-event actor). Frontend-only; the
// page gates on it so peer-originated realtime changes are never recorded.

export const BOARD_MUTATION_EVENT = "killio:board-mutation";

export type BoardMutationDetail = {
  kind: "card.create" | "card.update" | "card.delete" | "list.create" | "list.delete";
  boardId?: string;
  listId?: string;
  cardId?: string;
};

export function emitBoardMutation(detail: BoardMutationDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<BoardMutationDetail>(BOARD_MUTATION_EVENT, { detail }));
  } catch {
    /* noop */
  }
}
