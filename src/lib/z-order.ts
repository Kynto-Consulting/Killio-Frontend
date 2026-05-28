export type ZOrderOp = "front" | "forward" | "backward" | "back";

/**
 * Reorder `id` within `list`. Render order is array order: later index = drawn
 * later = visually on top. "front" → end, "back" → start, "forward"/"backward"
 * → swap with the neighbour toward the end/start. Returns a new array (or the
 * same reference if nothing changed). Pure.
 */
export function reorderInList(list: string[], id: string, op: ZOrderOp): string[] {
  const idx = list.indexOf(id);
  if (idx === -1) return list;
  const next = [...list];

  if (op === "front") {
    if (idx === next.length - 1) return list;
    next.splice(idx, 1);
    next.push(id);
    return next;
  }
  if (op === "back") {
    if (idx === 0) return list;
    next.splice(idx, 1);
    next.unshift(id);
    return next;
  }
  if (op === "forward") {
    if (idx >= next.length - 1) return list;
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    return next;
  }
  // backward
  if (idx <= 0) return list;
  [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
  return next;
}
