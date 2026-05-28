import type { MeshBrick, MeshConnection, GeneratedMesh } from "@/lib/api/contracts";

export type MeshTemplate = {
  id: string;
  name: string;
  // Root bricks are normalized so the group's bounding box top-left is (0,0).
  bricks: MeshBrick[];
  connections: MeshConnection[];
};

// ── Built-in templates (authored as lightweight GeneratedMesh) ────────────────
export const BUILT_IN_TEMPLATES: Array<{ id: string; nameKey: string; mesh: GeneratedMesh }> = [
  {
    id: "flow-starter",
    nameKey: "flowStarter",
    mesh: {
      nodes: [
        { ref: "s", kind: "shape", shape: "ellipse", label: "Start", x: 0, y: 0, w: 160, h: 70 },
        { ref: "p", kind: "shape", shape: "rect", label: "Process", x: 0, y: 150, w: 160, h: 80 },
        { ref: "d", kind: "shape", shape: "diamond", label: "Decision?", x: 0, y: 310, w: 180, h: 110 },
        { ref: "e", kind: "shape", shape: "ellipse", label: "End", x: 0, y: 500, w: 160, h: 70 },
      ],
      edges: [
        { from: "s", to: "p" },
        { from: "p", to: "d" },
        { from: "d", to: "e", label: "yes" },
      ],
    },
  },
  {
    id: "swot",
    nameKey: "swot",
    mesh: {
      nodes: [
        { ref: "s", kind: "board", label: "Strengths", x: 0, y: 0, w: 280, h: 200 },
        { ref: "w", kind: "board", label: "Weaknesses", x: 320, y: 0, w: 280, h: 200 },
        { ref: "o", kind: "board", label: "Opportunities", x: 0, y: 240, w: 280, h: 200 },
        { ref: "t", kind: "board", label: "Threats", x: 320, y: 240, w: 280, h: 200 },
      ],
      edges: [],
    },
  },
  {
    id: "kanban",
    nameKey: "kanban",
    mesh: {
      nodes: [
        { ref: "todo", kind: "board", label: "To Do", x: 0, y: 0, w: 240, h: 360 },
        { ref: "doing", kind: "board", label: "In Progress", x: 280, y: 0, w: 240, h: 360 },
        { ref: "done", kind: "board", label: "Done", x: 560, y: 0, w: 240, h: 360 },
      ],
      edges: [],
    },
  },
  {
    id: "mindmap",
    nameKey: "mindmap",
    mesh: {
      nodes: [
        { ref: "c", kind: "shape", shape: "ellipse", label: "Central idea", x: 280, y: 180, w: 200, h: 90 },
        { ref: "a", kind: "shape", shape: "rounded-rect", label: "Branch A", x: 0, y: 0, w: 170, h: 70 },
        { ref: "b", kind: "shape", shape: "rounded-rect", label: "Branch B", x: 560, y: 0, w: 170, h: 70 },
        { ref: "d", kind: "shape", shape: "rounded-rect", label: "Branch C", x: 0, y: 360, w: 170, h: 70 },
        { ref: "e", kind: "shape", shape: "rounded-rect", label: "Branch D", x: 560, y: 360, w: 170, h: 70 },
      ],
      edges: [
        { from: "c", to: "a" }, { from: "c", to: "b" }, { from: "c", to: "d" }, { from: "c", to: "e" },
      ],
    },
  },
];

// Self-contained global-position resolver (walks the parent chain).
function resolveGlobal(bricksById: Record<string, MeshBrick>, id: string): { x: number; y: number } {
  let x = 0, y = 0;
  let cur: MeshBrick | undefined = bricksById[id];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    x += cur.position.x;
    y += cur.position.y;
    cur = cur.parentId ? bricksById[cur.parentId] : undefined;
  }
  return { x, y };
}

function childOrderOf(b: MeshBrick): string[] {
  const co = (b.content as Record<string, unknown> | undefined)?.childOrder;
  return Array.isArray(co) ? (co as string[]) : [];
}

/**
 * Capture a set of selected bricks (and their descendants) as a reusable
 * template. Root bricks are detached (parentId=null) and shifted so the group
 * bounding box starts at (0,0). Connections fully inside the set are kept. Pure.
 */
export function captureTemplate(
  name: string,
  selectedIds: Set<string>,
  bricksById: Record<string, MeshBrick>,
  connectionsById: Record<string, MeshConnection>,
  makeId: (prefix: string) => string,
): MeshTemplate | null {
  const all = new Set<string>();
  const addTree = (id: string) => {
    const b = bricksById[id];
    if (!b || all.has(id)) return;
    all.add(id);
    childOrderOf(b).forEach(addTree);
    // also include children referenced via parentId
    Object.values(bricksById).forEach((c) => { if (c.parentId === id) addTree(c.id); });
  };
  selectedIds.forEach((id) => { if (bricksById[id]) addTree(id); });
  if (all.size === 0) return null;

  const roots = [...all].filter((id) => {
    const p = bricksById[id]?.parentId;
    return !p || !all.has(p);
  });

  let minX = Infinity, minY = Infinity;
  roots.forEach((id) => {
    const g = resolveGlobal(bricksById, id);
    if (g.x < minX) minX = g.x;
    if (g.y < minY) minY = g.y;
  });
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; }

  const rootSet = new Set(roots);
  const bricks: MeshBrick[] = [...all].map((id) => {
    const b = bricksById[id];
    const content = { ...(b.content as Record<string, unknown>) };
    if (Array.isArray(content.childOrder)) {
      content.childOrder = (content.childOrder as string[]).filter((cid) => all.has(cid));
    }
    if (rootSet.has(id)) {
      const g = resolveGlobal(bricksById, id);
      return { ...b, parentId: null, position: { x: g.x - minX, y: g.y - minY }, content };
    }
    return { ...b, content };
  });

  const connections: MeshConnection[] = Object.values(connectionsById)
    .filter((c) => all.has(c.cons[0]) && all.has(c.cons[1]))
    .map((c) => ({ ...c }));

  return { id: makeId("tpl"), name: name.trim() || "Template", bricks, connections };
}

/**
 * Clone a template into fresh bricks + connections with remapped ids, offsetting
 * root bricks by the given amount. Pure.
 */
export function instantiateTemplate(
  tpl: MeshTemplate,
  offset: { x: number; y: number },
  makeId: (prefix: string) => string,
): { bricks: MeshBrick[]; connections: MeshConnection[] } {
  const idMap: Record<string, string> = {};
  tpl.bricks.forEach((b) => { idMap[b.id] = makeId("brick"); });

  const bricks = tpl.bricks.map((b) => {
    const newParent = b.parentId && idMap[b.parentId] ? idMap[b.parentId] : null;
    const position = newParent ? b.position : { x: b.position.x + offset.x, y: b.position.y + offset.y };
    const content = { ...(b.content as Record<string, unknown>) };
    if (Array.isArray(content.childOrder)) {
      content.childOrder = (content.childOrder as string[]).map((cid) => idMap[cid]).filter(Boolean);
    }
    return { ...b, id: idMap[b.id], parentId: newParent, position, content };
  });

  const connections = tpl.connections
    .filter((c) => idMap[c.cons[0]] && idMap[c.cons[1]])
    .map((c) => ({ ...c, id: makeId("conn"), cons: [idMap[c.cons[0]], idMap[c.cons[1]]] as [string, string] }));

  return { bricks, connections };
}

// ── localStorage persistence for user templates ──────────────────────────────
const LS_KEY = "mesh:user-templates";

export function loadUserTemplates(): MeshTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistUserTemplates(templates: MeshTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(templates.slice(0, 50)));
  } catch {
    /* quota — ignore */
  }
}
