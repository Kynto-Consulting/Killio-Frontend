/**
 * Checklist summary of a card tile: every checklist item of every brick (text bricks styled as checklist use `tasks`,
 * `checklist` bricks use `items`), how many are done and the pending ones in order, so the board shows what is left.
 */
export interface ChecklistItem {
  label: string;
  checked: boolean;
}

export interface ChecklistSummary {
  total: number;
  done: number;
  /** Items still to do, in card order. */
  pending: ChecklistItem[];
  /** Items already done, in card order. */
  completed: ChecklistItem[];
}

const labelOf = (it: Record<string, unknown>): string => {
  const raw = it.label ?? it.text ?? it.title ?? it.name;
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
};

export function summarizeChecklists(blocks: unknown[] | null | undefined): ChecklistSummary {
  const pending: ChecklistItem[] = [];
  const completed: ChecklistItem[] = [];
  for (const raw of blocks ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, any>;
    const content = b.content && typeof b.content === 'object' ? b.content : b;
    for (const list of [content.tasks, content.items]) {
      if (!Array.isArray(list)) continue;
      for (const it of list) {
        if (!it || typeof it !== 'object') continue;
        const item = { label: labelOf(it as Record<string, unknown>), checked: (it as any).checked === true };
        (item.checked ? completed : pending).push(item);
      }
    }
  }
  const total = pending.length + completed.length;
  return { total, done: completed.length, pending, completed };
}
