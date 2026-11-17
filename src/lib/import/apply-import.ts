import {
  buildCardDrafts,
  distinctInOrder,
  matchMember,
  normalize,
  splitMulti,
  type CardBlock,
  type ImportPlan,
  type ImportSheet,
  type MemberLike,
} from "./table-import.ts";

/** The slice of the app's API the importer needs (injected so it can be tested and kept free of UI code). */
export interface ImportApi {
  createBoard(payload: { name: string; slug: string }): Promise<{ id: string }>;
  createList(boardId: string, payload: { name: string; position: number }): Promise<{ id: string }>;
  createCardsBatch(
    cards: Array<{ listId: string; title: string; dueAt?: string; tags?: string[]; assignees?: string[]; blocks?: CardBlock[] }>,
  ): Promise<Array<{ id: string }>>;
  createDocument(payload: { title: string }): Promise<{ id: string }>;
  createDocumentBrick(documentId: string, payload: { kind: string; position: number; content: unknown }): Promise<unknown>;
  createTag(payload: { name: string; color: string; tagKind: "priority" | "custom" }): Promise<{ id: string; name: string }>;
}

export interface ImportContext {
  /** Board that "cards" sheets go to. Without one, each cards sheet gets a board of its own. */
  defaultBoard?: { id: string; lists: Array<{ id: string; name: string }> };
  members: MemberLike[];
  existingTags: Array<{ id: string; name: string }>;
}

export interface SheetSelection {
  sheet: ImportSheet;
  plan: ImportPlan;
  enabled: boolean;
}

export interface ImportReport {
  boards: number;
  lists: number;
  cards: number;
  documents: number;
  tags: number;
  peopleInTeam: string[];
  peopleMissing: string[];
  unmatchedAssignees: string[];
  badDates: number;
  skippedRows: number;
  warnings: string[];
}

export const LIMITS = { newTags: 60, cardBatch: 50, tableRowsPerBrick: 1000 };
const TAG_COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];
const PRIORITY_WORDS = /^(alta|media|baja|urgente|cr[ií]tica|high|medium|low|urgent|critical|p[0-3])$/i;

const slugify = (name: string) => normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `import-${Date.now()}`;

export async function applyImport(
  selections: SheetSelection[],
  ctx: ImportContext,
  api: ImportApi,
  onProgress: (message: string, done: number, total: number) => void = () => {},
): Promise<ImportReport> {
  const report: ImportReport = {
    boards: 0, lists: 0, cards: 0, documents: 0, tags: 0,
    peopleInTeam: [], peopleMissing: [], unmatchedAssignees: [], badDates: 0, skippedRows: 0, warnings: [],
  };
  const active = selections.filter((s) => s.enabled && s.plan.entity !== "skip");

  // 1) Everything is derived from rows first, so tags can be created once and nothing is half-built if parsing fails.
  const drafts = new Map<SheetSelection, ReturnType<typeof buildCardDrafts>>();
  for (const sel of active) {
    if (sel.plan.entity === "cards" || sel.plan.entity === "boards") drafts.set(sel, buildCardDrafts(sel.sheet, sel.plan, ctx.members));
  }
  const total = [...drafts.values()].reduce((n, d) => n + d.cards.length, 0) + active.length;
  let done = 0;
  const step = (message: string, n = 1) => {
    done += n;
    onProgress(message, Math.min(done, total), total);
  };

  // 2) Tags: reuse what exists (case/accent-insensitive), create the missing ones.
  const tagIds = new Map(ctx.existingTags.map((t) => [normalize(t.name), t.id]));
  const wanted = new Map<string, { name: string; kind: "priority" | "custom" }>();
  for (const [sel, d] of drafts) {
    const prioritySet = new Set(sel.plan.priority === null ? [] : sel.sheet.rows.flatMap((r) => splitMulti(r[sel.plan.priority!] ?? "")).map(normalize));
    for (const card of d.cards) {
      for (const name of card.tagNames) {
        const key = normalize(name);
        if (!tagIds.has(key) && !wanted.has(key)) wanted.set(key, { name: name.slice(0, 40), kind: prioritySet.has(key) || PRIORITY_WORDS.test(name) ? "priority" : "custom" });
      }
    }
  }
  let colorIndex = 0;
  for (const [key, tag] of [...wanted].slice(0, LIMITS.newTags)) {
    try {
      const created = await api.createTag({ name: tag.name, color: TAG_COLORS[colorIndex++ % TAG_COLORS.length], tagKind: tag.kind });
      tagIds.set(key, created.id);
      report.tags++;
    } catch {
      report.warnings.push(`tag:${tag.name}`);
    }
  }
  if (wanted.size > LIMITS.newTags) report.warnings.push(`tags-capped:${wanted.size - LIMITS.newTags}`);

  // 3) Each sheet by what it is.
  for (const sel of active) {
    const { sheet, plan } = sel;
    if (plan.entity === "people") {
      const column = plan.email;
      const seen = new Set<string>();
      for (const row of sheet.rows) {
        const email = String(row[column ?? -1] ?? "").trim();
        const name = String(row[plan.title ?? -1] ?? "").trim();
        const label = name ? `${name} <${email}>` : email;
        if (!email || seen.has(normalize(email))) continue;
        seen.add(normalize(email));
        (matchMember(email, ctx.members) ? report.peopleInTeam : report.peopleMissing).push(label);
      }
      step(sheet.name);
      continue;
    }

    if (plan.entity === "documents") {
      const doc = await api.createDocument({ title: sheet.name });
      // Big tables are split into several table blocks (each repeats the header) to keep every block light.
      const per = LIMITS.tableRowsPerBrick;
      const chunks: string[][][] = [];
      for (let i = 0; i < sheet.rows.length; i += per) chunks.push(sheet.rows.slice(i, i + per));
      if (chunks.length === 0) chunks.push([]);
      for (let pos = 0; pos < chunks.length; pos++) {
        await api.createDocumentBrick(doc.id, { kind: "table", position: pos, content: { rows: [sheet.headers, ...chunks[pos]] } });
      }
      report.documents++;
      step(sheet.name);
      continue;
    }

    const d = drafts.get(sel)!;
    report.unmatchedAssignees.push(...d.unmatchedAssignees);
    report.badDates += d.badDates;
    report.skippedRows += d.skippedEmpty;
    if (d.cards.length === 0) {
      step(sheet.name);
      continue;
    }

    // Board + lists
    let board: { id: string; lists: Array<{ id: string; name: string }> };
    if (plan.entity === "cards" && ctx.defaultBoard) {
      board = { id: ctx.defaultBoard.id, lists: [...ctx.defaultBoard.lists] };
    } else {
      const created = await api.createBoard({ name: sheet.name.slice(0, 80), slug: slugify(sheet.name) });
      board = { id: created.id, lists: [] };
      report.boards++;
    }
    const listIdByName = new Map(board.lists.map((l) => [normalize(l.name), l.id]));
    const ensureList = async (name: string): Promise<string> => {
      const key = normalize(name);
      const existing = listIdByName.get(key);
      if (existing) return existing;
      const created = await api.createList(board.id, { name: name.slice(0, 80), position: listIdByName.size });
      listIdByName.set(key, created.id);
      report.lists++;
      return created.id;
    };
    // Lists are created in the order the statuses first appear in the file.
    for (const name of distinctInOrder(d.cards.map((c) => c.listName ?? ""))) await ensureList(name);
    const fallbackListId = d.cards.some((c) => !c.listName)
      ? (board.lists[0]?.id ?? (await ensureList(plan.entity === "boards" ? "Imported" : sheet.name)))
      : "";

    for (let i = 0; i < d.cards.length; i += LIMITS.cardBatch) {
      const batch = d.cards.slice(i, i + LIMITS.cardBatch);
      await api.createCardsBatch(
        batch.map((c) => ({
          listId: c.listName ? listIdByName.get(normalize(c.listName))! : fallbackListId,
          title: c.title.slice(0, 500),
          dueAt: c.dueAt,
          tags: c.tagNames.map((n) => tagIds.get(normalize(n))).filter((id): id is string => !!id),
          assignees: c.assigneeIds,
          blocks: c.blocks,
        })),
      );
      report.cards += batch.length;
      step(sheet.name, batch.length);
    }
    step(sheet.name);
  }
  report.unmatchedAssignees = [...new Set(report.unmatchedAssignees)];
  return report;
}
