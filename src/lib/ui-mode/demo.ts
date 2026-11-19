import { createBoard, createCard, createList, deleteBoard } from "@/lib/api/contracts";
import { createDocument, createDocumentBrick, deleteDocument } from "@/lib/api/documents";
import { createCardTemplate, deleteCardTemplate } from "@/lib/api/card-templates";
import { apiCache, cacheKey } from "@/lib/api-cache";
import { demoDeleteOrder, type DemoEntity, type DemoPlan } from "./onboarding";

export interface CreatedDemo {
  boardId: string;
  documentId: string;
  entities: DemoEntity[];
}

/**
 * Creates the demo space in the active workspace: a board (lists + cards), a document and a card template.
 * Every id is returned as it is created, so a failure half-way can still be cleaned up (`onProgress` + thrown `partial`).
 */
export async function createDemoSpace(plan: DemoPlan, teamId: string, accessToken: string, onProgress?: (e: DemoEntity) => void): Promise<CreatedDemo> {
  const entities: DemoEntity[] = [];
  const push = (e: DemoEntity) => { entities.push(e); onProgress?.(e); };
  try {
    const slug = `demo-${Date.now().toString(36)}`;
    const board = await createBoard({ name: plan.boardName, slug, boardType: "kanban" }, teamId, accessToken);
    push({ type: "board", id: board.id });
    let firstListId: string | null = null;
    let position = 0;
    for (const l of plan.lists) {
      const list = await createList(board.id, { name: l.name, position: position++ }, accessToken);
      firstListId ??= list.id;
      for (const c of l.cards) await createCard({ listId: list.id, title: c.title, summary: c.summary }, accessToken);
    }
    const doc = await createDocument({ teamId, title: plan.documentTitle }, accessToken);
    push({ type: "document", id: doc.id });
    let pos = 0;
    for (const md of plan.documentParagraphs) {
      await createDocumentBrick(doc.id, { kind: "text", position: pos++, content: { kind: "text", displayStyle: "paragraph", markdown: md } }, accessToken);
    }
    const tpl = await createCardTemplate(board.id, {
      name: plan.template.name, description: plan.template.description, titlePattern: "{date}", targetListId: firstListId,
      tagIds: [], assigneeUserIds: [], assigneeGroupIds: [], startOffsetDays: null, dueOffsetDays: 3, blocks: [],
    }, accessToken);
    if (tpl) push({ type: "template", id: tpl.id, boardId: board.id });
    invalidateWorkspaceLists(teamId);
    return { boardId: board.id, documentId: doc.id, entities };
  } catch (error) {
    (error as { partial?: DemoEntity[] }).partial = entities;
    throw error;
  }
}

/** Board and document lists are cached client-side (memory, Cache API, localStorage): drop them so the change shows at once. */
export function invalidateWorkspaceLists(teamId: string, entities: readonly DemoEntity[] = []) {
  apiCache.invalidate(cacheKey.boards(teamId));
  apiCache.invalidate(cacheKey.documents(teamId));
  for (const e of entities) {
    if (e.type === "board") apiCache.invalidate(cacheKey.board(e.id));
    if (e.type === "document") apiCache.invalidate(cacheKey.document(e.id));
  }
}

/** Deletes the demo entities in a safe order. Entities already gone (404) count as deleted. Returns the ones that could not be removed. */
export async function deleteDemoSpace(entities: readonly DemoEntity[], accessToken: string): Promise<DemoEntity[]> {
  const failed: DemoEntity[] = [];
  for (const e of demoDeleteOrder(entities)) {
    try {
      if (e.type === "template" && e.boardId) await deleteCardTemplate(e.boardId, e.id, accessToken);
      else if (e.type === "document") await deleteDocument(e.id, accessToken);
      else if (e.type === "board") await deleteBoard(e.id, accessToken);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 404) failed.push(e);
    }
  }
  return failed;
}
