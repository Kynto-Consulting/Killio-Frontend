import type { MeshBrick, MeshConnection } from "@/lib/api/contracts";
import type { MeshTemplate } from "@/lib/mesh-templates";

// ── Built-in template catalog ─────────────────────────────────────────────────
// Authored as compact specs and compiled into full-fidelity MeshTemplates so the
// whole brick system is used: colored boards, shape bricks with inline text, text
// bricks, and styled connections. Inserted via the same instantiateTemplate path
// as user-saved templates (ids are remapped on insert, so the static ids here
// only need to be unique within a single template).

export type TemplateCategory = "flow" | "brainstorm" | "planning" | "strategy" | "diagram" | "personal";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "flow", label: "Flow" },
  { id: "brainstorm", label: "Brainstorm" },
  { id: "planning", label: "Planning" },
  { id: "strategy", label: "Strategy" },
  { id: "diagram", label: "Diagram" },
  { id: "personal", label: "Personal" },
];

type TNode = {
  ref: string;
  kind?: "board" | "shape" | "text";
  shape?: string;
  label?: string;
  text?: string;
  x: number; y: number; w: number; h: number;
  stroke?: string; fill?: string; sw?: number;
  parent?: string;
};
type TEdge = { from: string; to: string; label?: string; color?: string; pattern?: "solid" | "dashed"; connType?: string };
type TemplateSpec = {
  id: string;
  name: string;
  category: TemplateCategory;
  accent: string;
  nodes: TNode[];
  edges?: TEdge[];
};

// Palette — accent hex + a matching translucent fill.
const C = {
  cyan: "#22d3ee", violet: "#a78bfa", emerald: "#34d399", amber: "#fbbf24",
  rose: "#fb7185", sky: "#38bdf8", orange: "#fb923c", pink: "#f472b6",
  lime: "#a3e635", indigo: "#818cf8", teal: "#2dd4bf", slate: "#94a3b8",
};
function fill(hex: string, a = 0.12): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function bid(tid: string, ref: string): string { return `tpl-${tid}-${ref}`; }

function buildTemplate(spec: TemplateSpec): MeshTemplate {
  const childrenOf: Record<string, string[]> = {};
  spec.nodes.forEach((n) => {
    if (n.parent) (childrenOf[bid(spec.id, n.parent)] ??= []).push(bid(spec.id, n.ref));
  });

  const bricks: MeshBrick[] = spec.nodes.map((n) => {
    const id = bid(spec.id, n.ref);
    const parentId = n.parent ? bid(spec.id, n.parent) : null;
    const kind = n.kind ?? "shape";
    const stroke = n.stroke ?? spec.accent;
    const sw = n.sw ?? 2;
    let content: Record<string, unknown>;
    if (kind === "board") {
      content = {
        isContainer: true, childOrder: childrenOf[id] ?? [], label: n.label ?? "",
        style: { stroke, fill: n.fill ?? fill(stroke, 0.05), strokeWidth: sw },
      };
    } else if (kind === "text") {
      content = { markdown: n.text ?? n.label ?? "" };
    } else {
      content = {
        shapePreset: n.shape ?? "rounded-rect", isContainer: false, childOrder: childrenOf[id] ?? [],
        markdown: n.text ?? n.label ?? "",
        style: { stroke, fill: n.fill ?? fill(stroke, 0.12), strokeWidth: sw },
      };
    }
    return {
      id,
      kind: kind === "board" ? "board_empty" : kind === "text" ? "text" : "draw",
      parentId,
      position: { x: n.x, y: n.y },
      size: { w: n.w, h: n.h },
      content,
    } as MeshBrick;
  });

  const connections: MeshConnection[] = (spec.edges ?? []).map((e, i) => ({
    id: `tpl-${spec.id}-c${i}`,
    cons: [bid(spec.id, e.from), bid(spec.id, e.to)] as [string, string],
    label: e.label
      ? { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: e.label }] }] }
      : { type: "doc" as const, content: [] },
    style: { stroke: e.color ?? spec.accent, width: 2, pattern: e.pattern ?? "solid", connType: e.connType ?? "technical" },
  }));

  return { id: spec.id, name: spec.name, bricks, connections };
}

const SPECS: TemplateSpec[] = [
  // ── FLOW ──────────────────────────────────────────────────────────────────
  {
    id: "flow-basic", name: "Basic Flowchart", category: "flow", accent: C.cyan,
    nodes: [
      { ref: "s", shape: "ellipse", text: "Start", x: 10, y: 0, w: 150, h: 60 },
      { ref: "p", shape: "rect", text: "Process", x: 10, y: 110, w: 150, h: 70 },
      { ref: "d", shape: "diamond", text: "Decision?", x: 0, y: 230, w: 170, h: 110 },
      { ref: "e", shape: "ellipse", text: "End", x: 10, y: 390, w: 150, h: 60, stroke: C.emerald },
    ],
    edges: [{ from: "s", to: "p" }, { from: "p", to: "d" }, { from: "d", to: "e", label: "yes" }],
  },
  {
    id: "flow-approval", name: "Approval Workflow", category: "flow", accent: C.sky,
    nodes: [
      { ref: "req", shape: "rounded-rect", text: "Request", x: 130, y: 0, w: 160, h: 60 },
      { ref: "rev", shape: "rect", text: "Review", x: 130, y: 110, w: 160, h: 60 },
      { ref: "dec", shape: "diamond", text: "Approved?", x: 125, y: 210, w: 170, h: 100, stroke: C.amber },
      { ref: "ok", shape: "rounded-rect", text: "Notify ✓", x: 360, y: 230, w: 150, h: 60, stroke: C.emerald },
      { ref: "no", shape: "rounded-rect", text: "Send back", x: -90, y: 230, w: 150, h: 60, stroke: C.rose },
    ],
    edges: [
      { from: "req", to: "rev" }, { from: "rev", to: "dec" },
      { from: "dec", to: "ok", label: "yes", color: C.emerald },
      { from: "dec", to: "no", label: "no", color: C.rose },
    ],
  },
  {
    id: "data-pipeline", name: "Data Pipeline (ETL)", category: "flow", accent: C.teal,
    nodes: [
      { ref: "src", shape: "cylinder", text: "Source DB", x: 0, y: 40, w: 140, h: 90, stroke: C.slate },
      { ref: "ex", shape: "rounded-rect", text: "Extract", x: 190, y: 55, w: 140, h: 60 },
      { ref: "tr", shape: "rounded-rect", text: "Transform", x: 380, y: 55, w: 140, h: 60, stroke: C.violet },
      { ref: "ld", shape: "rounded-rect", text: "Load", x: 570, y: 55, w: 140, h: 60 },
      { ref: "dw", shape: "cylinder", text: "Warehouse", x: 760, y: 40, w: 140, h: 90, stroke: C.emerald },
    ],
    edges: [
      { from: "src", to: "ex" }, { from: "ex", to: "tr" }, { from: "tr", to: "ld" }, { from: "ld", to: "dw" },
    ],
  },
  {
    id: "swimlane", name: "Swimlane Process", category: "flow", accent: C.violet,
    nodes: [
      { ref: "l1", kind: "board", label: "Customer", x: 0, y: 0, w: 560, h: 140, stroke: C.sky },
      { ref: "l2", kind: "board", label: "Support", x: 0, y: 160, w: 560, h: 140, stroke: C.violet },
      { ref: "a", parent: "l1", shape: "rounded-rect", text: "Submit", x: 20, y: 50, w: 130, h: 56 },
      { ref: "b", parent: "l1", shape: "rounded-rect", text: "Confirm", x: 380, y: 50, w: 130, h: 56 },
      { ref: "c", parent: "l2", shape: "rounded-rect", text: "Triage", x: 200, y: 50, w: 130, h: 56 },
    ],
    edges: [{ from: "a", to: "c" }, { from: "c", to: "b" }],
  },
  {
    id: "bug-triage", name: "Bug Triage", category: "flow", accent: C.rose,
    nodes: [
      { ref: "in", shape: "ellipse", text: "Bug report", x: 120, y: 0, w: 160, h: 60 },
      { ref: "rep", shape: "diamond", text: "Reproducible?", x: 110, y: 110, w: 180, h: 110, stroke: C.amber },
      { ref: "pri", shape: "diamond", text: "Critical?", x: 360, y: 115, w: 160, h: 100, stroke: C.amber },
      { ref: "now", shape: "rounded-rect", text: "Fix now", x: 580, y: 80, w: 140, h: 56, stroke: C.rose },
      { ref: "back", shape: "rounded-rect", text: "Backlog", x: 580, y: 175, w: 140, h: 56, stroke: C.slate },
      { ref: "close", shape: "rounded-rect", text: "Need info", x: -110, y: 140, w: 150, h: 56, stroke: C.slate },
    ],
    edges: [
      { from: "in", to: "rep" }, { from: "rep", to: "pri", label: "yes" },
      { from: "rep", to: "close", label: "no", color: C.slate },
      { from: "pri", to: "now", label: "yes", color: C.rose },
      { from: "pri", to: "back", label: "no", color: C.slate },
    ],
  },

  // ── BRAINSTORM ──────────────────────────────────────────────────────────────
  {
    id: "mindmap", name: "Mind Map", category: "brainstorm", accent: C.violet,
    nodes: [
      { ref: "c", shape: "ellipse", text: "**Central idea**", x: 300, y: 190, w: 200, h: 90, stroke: C.violet, fill: fill(C.violet, 0.18) },
      { ref: "a", shape: "rounded-rect", text: "Branch A", x: 0, y: 0, w: 170, h: 64, stroke: C.cyan },
      { ref: "b", shape: "rounded-rect", text: "Branch B", x: 600, y: 0, w: 170, h: 64, stroke: C.emerald },
      { ref: "d", shape: "rounded-rect", text: "Branch C", x: 0, y: 400, w: 170, h: 64, stroke: C.amber },
      { ref: "e", shape: "rounded-rect", text: "Branch D", x: 600, y: 400, w: 170, h: 64, stroke: C.rose },
    ],
    edges: [
      { from: "c", to: "a", color: C.cyan, connType: "curved" }, { from: "c", to: "b", color: C.emerald, connType: "curved" },
      { from: "c", to: "d", color: C.amber, connType: "curved" }, { from: "c", to: "e", color: C.rose, connType: "curved" },
    ],
  },
  {
    id: "mindmap-6", name: "Mind Map (6)", category: "brainstorm", accent: C.indigo,
    nodes: [
      { ref: "c", shape: "ellipse", text: "**Topic**", x: 320, y: 200, w: 180, h: 90, stroke: C.indigo, fill: fill(C.indigo, 0.18) },
      { ref: "n1", shape: "rounded-rect", text: "Idea 1", x: 0, y: 40, w: 150, h: 56, stroke: C.cyan },
      { ref: "n2", shape: "rounded-rect", text: "Idea 2", x: 0, y: 200, w: 150, h: 56, stroke: C.sky },
      { ref: "n3", shape: "rounded-rect", text: "Idea 3", x: 0, y: 360, w: 150, h: 56, stroke: C.teal },
      { ref: "n4", shape: "rounded-rect", text: "Idea 4", x: 670, y: 40, w: 150, h: 56, stroke: C.violet },
      { ref: "n5", shape: "rounded-rect", text: "Idea 5", x: 670, y: 200, w: 150, h: 56, stroke: C.pink },
      { ref: "n6", shape: "rounded-rect", text: "Idea 6", x: 670, y: 360, w: 150, h: 56, stroke: C.amber },
    ],
    edges: [
      { from: "c", to: "n1", connType: "curved" }, { from: "c", to: "n2", connType: "curved" }, { from: "c", to: "n3", connType: "curved" },
      { from: "c", to: "n4", connType: "curved" }, { from: "c", to: "n5", connType: "curved" }, { from: "c", to: "n6", connType: "curved" },
    ],
  },
  {
    id: "fishbone", name: "Fishbone (Ishikawa)", category: "brainstorm", accent: C.amber,
    nodes: [
      { ref: "head", shape: "rounded-rect", text: "**Problem**", x: 620, y: 150, w: 180, h: 80, stroke: C.rose, fill: fill(C.rose, 0.15) },
      { ref: "m1", shape: "rounded-rect", text: "People", x: 40, y: 0, w: 150, h: 56, stroke: C.cyan },
      { ref: "m2", shape: "rounded-rect", text: "Process", x: 240, y: 0, w: 150, h: 56, stroke: C.sky },
      { ref: "m3", shape: "rounded-rect", text: "Tools", x: 440, y: 0, w: 150, h: 56, stroke: C.teal },
      { ref: "m4", shape: "rounded-rect", text: "Materials", x: 40, y: 320, w: 150, h: 56, stroke: C.violet },
      { ref: "m5", shape: "rounded-rect", text: "Environment", x: 240, y: 320, w: 150, h: 56, stroke: C.pink },
      { ref: "m6", shape: "rounded-rect", text: "Measurement", x: 440, y: 320, w: 150, h: 56, stroke: C.lime },
    ],
    edges: [
      { from: "m1", to: "head" }, { from: "m2", to: "head" }, { from: "m3", to: "head" },
      { from: "m4", to: "head" }, { from: "m5", to: "head" }, { from: "m6", to: "head" },
    ],
  },
  {
    id: "affinity", name: "Affinity Diagram", category: "brainstorm", accent: C.lime,
    nodes: [
      { ref: "g1", kind: "board", label: "Theme A", x: 0, y: 0, w: 200, h: 240, stroke: C.cyan },
      { ref: "g2", kind: "board", label: "Theme B", x: 230, y: 0, w: 200, h: 240, stroke: C.violet },
      { ref: "g3", kind: "board", label: "Theme C", x: 460, y: 0, w: 200, h: 240, stroke: C.amber },
      { ref: "a1", parent: "g1", shape: "note", text: "Note", x: 20, y: 44, w: 150, h: 56, stroke: C.cyan },
      { ref: "a2", parent: "g1", shape: "note", text: "Note", x: 20, y: 120, w: 150, h: 56, stroke: C.cyan },
      { ref: "b1", parent: "g2", shape: "note", text: "Note", x: 20, y: 44, w: 150, h: 56, stroke: C.violet },
      { ref: "c1", parent: "g3", shape: "note", text: "Note", x: 20, y: 44, w: 150, h: 56, stroke: C.amber },
    ],
  },

  // ── PLANNING ──────────────────────────────────────────────────────────────
  {
    id: "kanban-3", name: "Kanban (3 columns)", category: "planning", accent: C.sky,
    nodes: [
      { ref: "todo", kind: "board", label: "To Do", x: 0, y: 0, w: 230, h: 360, stroke: C.slate },
      { ref: "doing", kind: "board", label: "In Progress", x: 260, y: 0, w: 230, h: 360, stroke: C.amber },
      { ref: "done", kind: "board", label: "Done", x: 520, y: 0, w: 230, h: 360, stroke: C.emerald },
      { ref: "t1", parent: "todo", shape: "note", text: "Task", x: 20, y: 44, w: 190, h: 56, stroke: C.slate },
      { ref: "t2", parent: "todo", shape: "note", text: "Task", x: 20, y: 116, w: 190, h: 56, stroke: C.slate },
      { ref: "d1", parent: "doing", shape: "note", text: "Task", x: 20, y: 44, w: 190, h: 56, stroke: C.amber },
      { ref: "e1", parent: "done", shape: "note", text: "Task", x: 20, y: 44, w: 190, h: 56, stroke: C.emerald },
    ],
  },
  {
    id: "kanban-4", name: "Kanban (4 columns)", category: "planning", accent: C.cyan,
    nodes: [
      { ref: "b", kind: "board", label: "Backlog", x: 0, y: 0, w: 200, h: 340, stroke: C.slate },
      { ref: "t", kind: "board", label: "To Do", x: 220, y: 0, w: 200, h: 340, stroke: C.sky },
      { ref: "p", kind: "board", label: "In Progress", x: 440, y: 0, w: 200, h: 340, stroke: C.amber },
      { ref: "d", kind: "board", label: "Done", x: 660, y: 0, w: 200, h: 340, stroke: C.emerald },
      { ref: "b1", parent: "b", shape: "note", text: "Item", x: 16, y: 44, w: 168, h: 52, stroke: C.slate },
      { ref: "t1", parent: "t", shape: "note", text: "Item", x: 16, y: 44, w: 168, h: 52, stroke: C.sky },
      { ref: "p1", parent: "p", shape: "note", text: "Item", x: 16, y: 44, w: 168, h: 52, stroke: C.amber },
      { ref: "d1", parent: "d", shape: "note", text: "Item", x: 16, y: 44, w: 168, h: 52, stroke: C.emerald },
    ],
  },
  {
    id: "roadmap", name: "Quarterly Roadmap", category: "planning", accent: C.indigo,
    nodes: [
      { ref: "q1", kind: "board", label: "Q1", x: 0, y: 0, w: 200, h: 220, stroke: C.cyan },
      { ref: "q2", kind: "board", label: "Q2", x: 220, y: 0, w: 200, h: 220, stroke: C.violet },
      { ref: "q3", kind: "board", label: "Q3", x: 440, y: 0, w: 200, h: 220, stroke: C.amber },
      { ref: "q4", kind: "board", label: "Q4", x: 660, y: 0, w: 200, h: 220, stroke: C.emerald },
      { ref: "i1", parent: "q1", shape: "rounded-rect", text: "Milestone", x: 16, y: 44, w: 168, h: 50, stroke: C.cyan },
      { ref: "i2", parent: "q2", shape: "rounded-rect", text: "Milestone", x: 16, y: 44, w: 168, h: 50, stroke: C.violet },
      { ref: "i3", parent: "q3", shape: "rounded-rect", text: "Milestone", x: 16, y: 44, w: 168, h: 50, stroke: C.amber },
      { ref: "i4", parent: "q4", shape: "rounded-rect", text: "Launch 🚀", x: 16, y: 44, w: 168, h: 50, stroke: C.emerald },
    ],
  },
  {
    id: "okr", name: "OKR Planner", category: "planning", accent: C.emerald,
    nodes: [
      { ref: "obj", shape: "rounded-rect", text: "**Objective**", x: 250, y: 0, w: 240, h: 80, stroke: C.emerald, fill: fill(C.emerald, 0.16) },
      { ref: "kr1", shape: "rounded-rect", text: "Key Result 1", x: 0, y: 170, w: 200, h: 70, stroke: C.cyan },
      { ref: "kr2", shape: "rounded-rect", text: "Key Result 2", x: 270, y: 170, w: 200, h: 70, stroke: C.sky },
      { ref: "kr3", shape: "rounded-rect", text: "Key Result 3", x: 540, y: 170, w: 200, h: 70, stroke: C.teal },
    ],
    edges: [{ from: "obj", to: "kr1" }, { from: "obj", to: "kr2" }, { from: "obj", to: "kr3" }],
  },
  {
    id: "eisenhower", name: "Eisenhower Matrix", category: "planning", accent: C.rose,
    nodes: [
      { ref: "q1", kind: "board", label: "Urgent · Important", x: 0, y: 0, w: 280, h: 200, stroke: C.rose, fill: fill(C.rose, 0.08) },
      { ref: "q2", kind: "board", label: "Not Urgent · Important", x: 300, y: 0, w: 280, h: 200, stroke: C.emerald, fill: fill(C.emerald, 0.08) },
      { ref: "q3", kind: "board", label: "Urgent · Not Important", x: 0, y: 220, w: 280, h: 200, stroke: C.amber, fill: fill(C.amber, 0.08) },
      { ref: "q4", kind: "board", label: "Not Urgent · Not Important", x: 300, y: 220, w: 280, h: 200, stroke: C.slate, fill: fill(C.slate, 0.08) },
    ],
  },
  {
    id: "weekly", name: "Weekly Planner", category: "planning", accent: C.sky,
    nodes: [
      { ref: "mo", kind: "board", label: "Mon", x: 0, y: 0, w: 150, h: 300, stroke: C.cyan },
      { ref: "tu", kind: "board", label: "Tue", x: 165, y: 0, w: 150, h: 300, stroke: C.sky },
      { ref: "we", kind: "board", label: "Wed", x: 330, y: 0, w: 150, h: 300, stroke: C.teal },
      { ref: "th", kind: "board", label: "Thu", x: 495, y: 0, w: 150, h: 300, stroke: C.violet },
      { ref: "fr", kind: "board", label: "Fri", x: 660, y: 0, w: 150, h: 300, stroke: C.emerald },
    ],
  },
  {
    id: "sprint", name: "Sprint Board", category: "planning", accent: C.amber,
    nodes: [
      { ref: "goal", shape: "rounded-rect", text: "**Sprint Goal**", x: 0, y: 0, w: 760, h: 60, stroke: C.amber, fill: fill(C.amber, 0.14) },
      { ref: "todo", kind: "board", label: "To Do", x: 0, y: 90, w: 240, h: 300, stroke: C.slate },
      { ref: "doing", kind: "board", label: "Doing", x: 260, y: 90, w: 240, h: 300, stroke: C.sky },
      { ref: "review", kind: "board", label: "Review", x: 520, y: 90, w: 240, h: 300, stroke: C.violet },
    ],
  },

  // ── STRATEGY ──────────────────────────────────────────────────────────────
  {
    id: "swot", name: "SWOT Analysis", category: "strategy", accent: C.cyan,
    nodes: [
      { ref: "s", kind: "board", label: "Strengths", x: 0, y: 0, w: 280, h: 200, stroke: C.emerald, fill: fill(C.emerald, 0.08) },
      { ref: "w", kind: "board", label: "Weaknesses", x: 300, y: 0, w: 280, h: 200, stroke: C.rose, fill: fill(C.rose, 0.08) },
      { ref: "o", kind: "board", label: "Opportunities", x: 0, y: 220, w: 280, h: 200, stroke: C.sky, fill: fill(C.sky, 0.08) },
      { ref: "t", kind: "board", label: "Threats", x: 300, y: 220, w: 280, h: 200, stroke: C.amber, fill: fill(C.amber, 0.08) },
    ],
  },
  {
    id: "bmc", name: "Business Model Canvas", category: "strategy", accent: C.indigo,
    nodes: [
      { ref: "kp", kind: "board", label: "Key Partners", x: 0, y: 0, w: 180, h: 240, stroke: C.indigo },
      { ref: "ka", kind: "board", label: "Key Activities", x: 190, y: 0, w: 180, h: 115, stroke: C.violet },
      { ref: "kr", kind: "board", label: "Key Resources", x: 190, y: 125, w: 180, h: 115, stroke: C.violet },
      { ref: "vp", kind: "board", label: "Value Propositions", x: 380, y: 0, w: 180, h: 240, stroke: C.amber, fill: fill(C.amber, 0.08) },
      { ref: "cr", kind: "board", label: "Customer Relationships", x: 570, y: 0, w: 180, h: 115, stroke: C.pink },
      { ref: "ch", kind: "board", label: "Channels", x: 570, y: 125, w: 180, h: 115, stroke: C.pink },
      { ref: "cs", kind: "board", label: "Customer Segments", x: 760, y: 0, w: 180, h: 240, stroke: C.sky },
      { ref: "co", kind: "board", label: "Cost Structure", x: 0, y: 250, w: 460, h: 110, stroke: C.rose },
      { ref: "rs", kind: "board", label: "Revenue Streams", x: 470, y: 250, w: 470, h: 110, stroke: C.emerald },
    ],
  },
  {
    id: "lean-canvas", name: "Lean Canvas", category: "strategy", accent: C.teal,
    nodes: [
      { ref: "pr", kind: "board", label: "Problem", x: 0, y: 0, w: 180, h: 240, stroke: C.rose },
      { ref: "so", kind: "board", label: "Solution", x: 190, y: 0, w: 180, h: 115, stroke: C.emerald },
      { ref: "km", kind: "board", label: "Key Metrics", x: 190, y: 125, w: 180, h: 115, stroke: C.amber },
      { ref: "uvp", kind: "board", label: "Unique Value Prop", x: 380, y: 0, w: 180, h: 240, stroke: C.teal, fill: fill(C.teal, 0.08) },
      { ref: "ua", kind: "board", label: "Unfair Advantage", x: 570, y: 0, w: 180, h: 115, stroke: C.violet },
      { ref: "cn", kind: "board", label: "Channels", x: 570, y: 125, w: 180, h: 115, stroke: C.sky },
      { ref: "cs", kind: "board", label: "Customer Segments", x: 760, y: 0, w: 180, h: 240, stroke: C.cyan },
      { ref: "co", kind: "board", label: "Cost Structure", x: 0, y: 250, w: 460, h: 110, stroke: C.slate },
      { ref: "rev", kind: "board", label: "Revenue", x: 470, y: 250, w: 470, h: 110, stroke: C.emerald },
    ],
  },
  {
    id: "pros-cons", name: "Pros & Cons", category: "strategy", accent: C.emerald,
    nodes: [
      { ref: "p", kind: "board", label: "Pros", x: 0, y: 0, w: 280, h: 320, stroke: C.emerald, fill: fill(C.emerald, 0.08) },
      { ref: "c", kind: "board", label: "Cons", x: 300, y: 0, w: 280, h: 320, stroke: C.rose, fill: fill(C.rose, 0.08) },
      { ref: "p1", parent: "p", shape: "rounded-rect", text: "+ Benefit", x: 16, y: 44, w: 248, h: 50, stroke: C.emerald },
      { ref: "c1", parent: "c", shape: "rounded-rect", text: "− Drawback", x: 16, y: 44, w: 248, h: 50, stroke: C.rose },
    ],
  },
  {
    id: "porter", name: "Porter's 5 Forces", category: "strategy", accent: C.violet,
    nodes: [
      { ref: "c", shape: "ellipse", text: "**Rivalry**", x: 280, y: 180, w: 200, h: 100, stroke: C.violet, fill: fill(C.violet, 0.16) },
      { ref: "ne", shape: "rounded-rect", text: "New Entrants", x: 250, y: 0, w: 200, h: 64, stroke: C.cyan },
      { ref: "sub", shape: "rounded-rect", text: "Substitutes", x: 250, y: 380, w: 200, h: 64, stroke: C.amber },
      { ref: "buy", shape: "rounded-rect", text: "Buyer Power", x: 560, y: 190, w: 180, h: 64, stroke: C.emerald },
      { ref: "sup", shape: "rounded-rect", text: "Supplier Power", x: 0, y: 190, w: 180, h: 64, stroke: C.rose },
    ],
    edges: [
      { from: "ne", to: "c" }, { from: "sub", to: "c" }, { from: "buy", to: "c" }, { from: "sup", to: "c" },
    ],
  },
  {
    id: "pestel", name: "PESTEL Analysis", category: "strategy", accent: C.sky,
    nodes: [
      { ref: "p", kind: "board", label: "Political", x: 0, y: 0, w: 240, h: 180, stroke: C.rose },
      { ref: "e", kind: "board", label: "Economic", x: 250, y: 0, w: 240, h: 180, stroke: C.amber },
      { ref: "s", kind: "board", label: "Social", x: 500, y: 0, w: 240, h: 180, stroke: C.emerald },
      { ref: "t", kind: "board", label: "Technological", x: 0, y: 200, w: 240, h: 180, stroke: C.cyan },
      { ref: "en", kind: "board", label: "Environmental", x: 250, y: 200, w: 240, h: 180, stroke: C.teal },
      { ref: "l", kind: "board", label: "Legal", x: 500, y: 200, w: 240, h: 180, stroke: C.violet },
    ],
  },

  // ── DIAGRAM ─────────────────────────────────────────────────────────────────
  {
    id: "org-chart", name: "Org Chart", category: "diagram", accent: C.sky,
    nodes: [
      { ref: "ceo", shape: "rounded-rect", text: "**CEO**", x: 320, y: 0, w: 180, h: 64, stroke: C.sky, fill: fill(C.sky, 0.16) },
      { ref: "vp1", shape: "rounded-rect", text: "VP Eng", x: 120, y: 140, w: 160, h: 56, stroke: C.violet },
      { ref: "vp2", shape: "rounded-rect", text: "VP Sales", x: 540, y: 140, w: 160, h: 56, stroke: C.emerald },
      { ref: "t1", shape: "rounded-rect", text: "Team A", x: 0, y: 280, w: 150, h: 50, stroke: C.cyan },
      { ref: "t2", shape: "rounded-rect", text: "Team B", x: 170, y: 280, w: 150, h: 50, stroke: C.cyan },
      { ref: "t3", shape: "rounded-rect", text: "Team C", x: 470, y: 280, w: 150, h: 50, stroke: C.amber },
      { ref: "t4", shape: "rounded-rect", text: "Team D", x: 640, y: 280, w: 150, h: 50, stroke: C.amber },
    ],
    edges: [
      { from: "ceo", to: "vp1" }, { from: "ceo", to: "vp2" },
      { from: "vp1", to: "t1" }, { from: "vp1", to: "t2" }, { from: "vp2", to: "t3" }, { from: "vp2", to: "t4" },
    ],
  },
  {
    id: "user-flow", name: "User Flow", category: "diagram", accent: C.cyan,
    nodes: [
      { ref: "land", shape: "rounded-rect", text: "Landing", x: 0, y: 80, w: 150, h: 60, stroke: C.cyan },
      { ref: "sign", shape: "rounded-rect", text: "Sign up", x: 200, y: 80, w: 150, h: 60, stroke: C.sky },
      { ref: "onb", shape: "diamond", text: "First time?", x: 390, y: 60, w: 170, h: 100, stroke: C.amber },
      { ref: "tour", shape: "rounded-rect", text: "Tour", x: 610, y: 0, w: 150, h: 56, stroke: C.violet },
      { ref: "home", shape: "rounded-rect", text: "Dashboard", x: 610, y: 160, w: 150, h: 56, stroke: C.emerald },
    ],
    edges: [
      { from: "land", to: "sign" }, { from: "sign", to: "onb" },
      { from: "onb", to: "tour", label: "yes" }, { from: "onb", to: "home", label: "no" }, { from: "tour", to: "home" },
    ],
  },
  {
    id: "sitemap", name: "Sitemap", category: "diagram", accent: C.violet,
    nodes: [
      { ref: "home", shape: "rounded-rect", text: "**Home**", x: 330, y: 0, w: 170, h: 60, stroke: C.violet, fill: fill(C.violet, 0.16) },
      { ref: "p1", shape: "rounded-rect", text: "Products", x: 0, y: 150, w: 160, h: 54, stroke: C.cyan },
      { ref: "p2", shape: "rounded-rect", text: "About", x: 230, y: 150, w: 160, h: 54, stroke: C.sky },
      { ref: "p3", shape: "rounded-rect", text: "Pricing", x: 460, y: 150, w: 160, h: 54, stroke: C.emerald },
      { ref: "p4", shape: "rounded-rect", text: "Contact", x: 690, y: 150, w: 160, h: 54, stroke: C.amber },
      { ref: "s1", shape: "rounded-rect", text: "Detail", x: 0, y: 280, w: 160, h: 50, stroke: C.cyan },
    ],
    edges: [
      { from: "home", to: "p1" }, { from: "home", to: "p2" }, { from: "home", to: "p3" }, { from: "home", to: "p4" },
      { from: "p1", to: "s1" },
    ],
  },
  {
    id: "timeline", name: "Timeline", category: "diagram", accent: C.amber,
    nodes: [
      { ref: "m1", shape: "circle", text: "2021", x: 0, y: 100, w: 90, h: 90, stroke: C.cyan },
      { ref: "m2", shape: "circle", text: "2022", x: 220, y: 100, w: 90, h: 90, stroke: C.sky },
      { ref: "m3", shape: "circle", text: "2023", x: 440, y: 100, w: 90, h: 90, stroke: C.violet },
      { ref: "m4", shape: "circle", text: "2024", x: 660, y: 100, w: 90, h: 90, stroke: C.emerald },
      { ref: "l1", kind: "text", text: "Founded", x: 0, y: 0, w: 120, h: 40 },
      { ref: "l4", kind: "text", text: "Series A", x: 660, y: 0, w: 120, h: 40 },
    ],
    edges: [
      { from: "m1", to: "m2" }, { from: "m2", to: "m3" }, { from: "m3", to: "m4" },
    ],
  },
  {
    id: "network", name: "Network Diagram", category: "diagram", accent: C.teal,
    nodes: [
      { ref: "lb", shape: "rounded-rect", text: "Load Balancer", x: 280, y: 0, w: 180, h: 56, stroke: C.amber },
      { ref: "s1", shape: "rect", text: "Server 1", x: 80, y: 150, w: 150, h: 56, stroke: C.cyan },
      { ref: "s2", shape: "rect", text: "Server 2", x: 295, y: 150, w: 150, h: 56, stroke: C.cyan },
      { ref: "s3", shape: "rect", text: "Server 3", x: 510, y: 150, w: 150, h: 56, stroke: C.cyan },
      { ref: "db", shape: "cylinder", text: "Database", x: 280, y: 290, w: 180, h: 90, stroke: C.emerald },
    ],
    edges: [
      { from: "lb", to: "s1" }, { from: "lb", to: "s2" }, { from: "lb", to: "s3" },
      { from: "s1", to: "db" }, { from: "s2", to: "db" }, { from: "s3", to: "db" },
    ],
  },

  // ── PERSONAL ──────────────────────────────────────────────────────────────
  {
    id: "retro", name: "Retrospective", category: "personal", accent: C.emerald,
    nodes: [
      { ref: "start", kind: "board", label: "Start", x: 0, y: 0, w: 240, h: 300, stroke: C.emerald, fill: fill(C.emerald, 0.08) },
      { ref: "stop", kind: "board", label: "Stop", x: 260, y: 0, w: 240, h: 300, stroke: C.rose, fill: fill(C.rose, 0.08) },
      { ref: "cont", kind: "board", label: "Continue", x: 520, y: 0, w: 240, h: 300, stroke: C.sky, fill: fill(C.sky, 0.08) },
    ],
  },
  {
    id: "goals", name: "Goal Setting", category: "personal", accent: C.amber,
    nodes: [
      { ref: "g", shape: "ellipse", text: "**My Goal**", x: 290, y: 0, w: 200, h: 90, stroke: C.amber, fill: fill(C.amber, 0.16) },
      { ref: "s1", shape: "rounded-rect", text: "Step 1", x: 0, y: 180, w: 180, h: 60, stroke: C.cyan },
      { ref: "s2", shape: "rounded-rect", text: "Step 2", x: 300, y: 180, w: 180, h: 60, stroke: C.sky },
      { ref: "s3", shape: "rounded-rect", text: "Step 3", x: 600, y: 180, w: 180, h: 60, stroke: C.emerald },
    ],
    edges: [{ from: "g", to: "s1" }, { from: "g", to: "s2" }, { from: "g", to: "s3" }],
  },
  {
    id: "habit", name: "Habit Tracker", category: "personal", accent: C.violet,
    nodes: [
      { ref: "h1", kind: "board", label: "Daily", x: 0, y: 0, w: 240, h: 260, stroke: C.cyan },
      { ref: "h2", kind: "board", label: "Weekly", x: 260, y: 0, w: 240, h: 260, stroke: C.violet },
      { ref: "h3", kind: "board", label: "Monthly", x: 520, y: 0, w: 240, h: 260, stroke: C.emerald },
    ],
  },
];

export const TEMPLATE_CATALOG: Array<MeshTemplate & { category: TemplateCategory; accent: string }> =
  SPECS.map((spec) => ({ ...buildTemplate(spec), category: spec.category, accent: spec.accent }));
