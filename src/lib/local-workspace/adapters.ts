// Entity ↔ Killio-file payload adapters for documents (.kd), kanban boards
// (.kb) and scripts (.ks). Pure functions: map a fetched entity to the portable
// payload that gets serialized to KAML, and back to a "draft" shape used to
// reconstruct the entity on import. (Mesh has its own adapter in mesh-file.ts.)

export const KD_SCHEMA = "2026-v1";
export const KB_SCHEMA = "2026-v1";
export const KS_SCHEMA = "2026-v1";

// ── Documents (.kd) ───────────────────────────────────────────────────────────
export type KdBrick = { id: string; kind: string; position: number; content: unknown };
export type KdPayload = { id: string; title: string; bricks: KdBrick[] };

export function docToKd(doc: {
  id?: string; title?: string;
  bricks?: Array<{ id: string; kind: string; position: number; content: unknown }>;
}): KdPayload {
  const bricks = Array.isArray(doc.bricks) ? doc.bricks : [];
  return {
    id: doc.id ?? "",
    title: doc.title ?? "Untitled",
    bricks: bricks
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((b) => ({ id: b.id, kind: b.kind, position: b.position ?? 0, content: b.content ?? {} })),
  };
}

export function kdToDocDraft(payload: unknown): { title: string; bricks: KdBrick[] } {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const bricks = Array.isArray(p.bricks) ? (p.bricks as KdBrick[]) : [];
  return {
    title: typeof p.title === "string" ? p.title : "Untitled",
    bricks: bricks
      .filter((b) => b && typeof b.kind === "string")
      .map((b, i) => ({ id: String(b.id ?? `b${i}`), kind: b.kind, position: typeof b.position === "number" ? b.position : i, content: b.content ?? {} })),
  };
}

// ── Kanban boards (.kb) ─────────────────────────────────────────────────────────
export type KbCard = {
  id?: string; title: string; summary?: string; status?: string;
  startAt?: unknown; dueAt?: unknown; completedAt?: unknown; archivedAt?: unknown;
  urgency?: string; position?: number;
  tags?: Array<{ name: string; color?: string | null; tag_kind?: string }>;
  blocks?: unknown[];
};
export type KbList = { id?: string; name: string; cards: KbCard[] };
export type KbPayload = {
  id: string; name: string; description?: string | null; boardType?: string;
  backgroundKind?: string; backgroundValue?: string | null; visibility?: string;
  lists: KbList[];
};

export function boardToKb(board: {
  id?: string; name?: string; description?: string | null; boardType?: string;
  backgroundKind?: string; backgroundValue?: string | null; visibility?: string;
  lists?: Array<{ id?: string; name?: string; cards?: KbCard[] }>;
}): KbPayload {
  const lists = Array.isArray(board.lists) ? board.lists : [];
  return {
    id: board.id ?? "",
    name: board.name ?? "Untitled board",
    description: board.description ?? null,
    boardType: board.boardType ?? "kanban",
    backgroundKind: board.backgroundKind ?? "none",
    backgroundValue: board.backgroundValue ?? null,
    visibility: board.visibility ?? "team",
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name ?? "List",
      cards: (Array.isArray(l.cards) ? l.cards : []).map((c) => ({
        id: c.id,
        title: c.title ?? "",
        summary: c.summary,
        status: c.status,
        startAt: c.startAt,
        dueAt: c.dueAt,
        urgency: c.urgency ?? "normal",
        position: c.position,
        tags: (c.tags ?? []).map((t) => ({ name: t.name, color: t.color ?? null, tag_kind: t.tag_kind })),
        blocks: Array.isArray(c.blocks) ? c.blocks : [],
      })),
    })),
  };
}

/** Merge a card patch into the matching card of a .kb payload (by card id). Pure. */
export function patchCardInKb(payload: unknown, cardId: string, patch: Partial<KbCard>): KbPayload {
  const kb = kbToBoardDraft(payload);
  return {
    ...kb,
    lists: kb.lists.map((l) => ({
      ...l,
      cards: l.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
    })),
  };
}

export function kbToBoardDraft(payload: unknown): KbPayload {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return boardToKb({
    id: typeof p.id === "string" ? p.id : "",
    name: typeof p.name === "string" ? p.name : "Untitled board",
    description: (p.description as string | null) ?? null,
    boardType: typeof p.boardType === "string" ? p.boardType : "kanban",
    backgroundKind: typeof p.backgroundKind === "string" ? p.backgroundKind : "none",
    backgroundValue: (p.backgroundValue as string | null) ?? null,
    visibility: typeof p.visibility === "string" ? p.visibility : "team",
    lists: Array.isArray(p.lists) ? (p.lists as KbList[]) : [],
  });
}

// ── Scripts (.ks) ────────────────────────────────────────────────────────────────
export type KsNode = { id: string; nodeKind: string; label: string | null; config: unknown; positionX: number; positionY: number };
export type KsEdge = { id: string; sourceNodeId: string; targetNodeId: string; sourceHandle: string | null; targetHandle: string | null };
export type KsPayload = {
  id: string; name: string; description?: string | null;
  triggerType?: string; triggerConfig?: unknown;
  nodes: KsNode[]; edges: KsEdge[];
};

export function scriptToKs(
  summary: { id?: string; name?: string; description?: string | null; triggerType?: string; triggerConfig?: unknown },
  graph: { nodes?: KsNode[]; edges?: KsEdge[] },
): KsPayload {
  return {
    id: summary.id ?? "",
    name: summary.name ?? "Untitled script",
    description: summary.description ?? null,
    triggerType: summary.triggerType ?? "manual",
    triggerConfig: summary.triggerConfig ?? {},
    nodes: (Array.isArray(graph.nodes) ? graph.nodes : []).map((n) => ({
      id: n.id, nodeKind: n.nodeKind, label: n.label ?? null, config: n.config ?? {}, positionX: n.positionX ?? 0, positionY: n.positionY ?? 0,
    })),
    edges: (Array.isArray(graph.edges) ? graph.edges : []).map((e) => ({
      id: e.id, sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
    })),
  };
}

export function ksToScriptDraft(payload: unknown): { summary: { name: string; description: string | null; triggerType: string; triggerConfig: unknown }; graph: { nodes: KsNode[]; edges: KsEdge[] } } {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const nodes = (Array.isArray(p.nodes) ? p.nodes : []) as KsNode[];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(p.edges) ? p.edges : []) as KsEdge[];
  return {
    summary: {
      name: typeof p.name === "string" ? p.name : "Untitled script",
      description: (p.description as string | null) ?? null,
      triggerType: typeof p.triggerType === "string" ? p.triggerType : "manual",
      triggerConfig: p.triggerConfig ?? {},
    },
    graph: {
      nodes: nodes.filter((n) => n && typeof n.id === "string" && typeof n.nodeKind === "string"),
      // drop edges referencing unknown nodes
      edges: edges.filter((e) => e && nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId)),
    },
  };
}
