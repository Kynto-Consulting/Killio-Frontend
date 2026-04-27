"use client";

// ─── Mesh Board – Miro/Excalidraw-style canvas ────────────────────────────────
// Modes: select · pan · pen (iinkTS → bricks)
// Features: inline editing, delete, diamond-decision, board-relative children,
//   reparent drag-drop, resize, vector edit, connections, realtime (Ably).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, BarChart2, CheckSquare, ChevronDown, Code2,
  Copy, Edit3, ExternalLink, Eye, FileText, Film, GitBranch, Hand,
  Image, Layers, LayoutGrid, Link2, Loader2, MessageSquare,
  Minus, MousePointer, Pencil, Save, Square, Trash2, Type, Wand2, X,
} from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import { UnifiedTextBrick } from "@/components/bricks/unified-text-brick";
import { RichText } from "@/components/ui/rich-text";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import { DocumentBrick } from "@/lib/api/documents";
import type { ResolverContext } from "@/lib/reference-resolver";
import { EntitySelectorModal, type EntitySelectorResult } from "@/components/ui/entity-selector-modal";
import {
  MeshBrick, MeshBrickKind, MeshConnection, MeshState,
  getMesh, normalizeMeshState, updateMeshState,
} from "@/lib/api/contracts";
import { toast } from "@/lib/toast";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────

type ToolMode = "select" | "pan" | "pen" | "conn" | "vec";
type Port = "top" | "right" | "bottom" | "left";

type ShapePreset =
  | "rect" | "rounded-rect" | "circle" | "ellipse" | "diamond"
  | "triangle" | "hexagon" | "star" | "arrow" | "note" | "frame-vector" | "flow-terminator";

type ConnStyle = "technical" | "dashed" | "handdrawn";

type DragState    = { brickId: string; startMouse: { x: number; y: number }; startPosition: { x: number; y: number }; originalParentId: string | null };
type ResizeState  = { brickId: string; startMouse: { x: number; y: number }; startSize: { w: number; h: number } };
type VecDragState = { brickId: string; pointIndex: number; startMouse: { x: number; y: number } };
type PanDragState = { startMouse: { x: number; y: number }; startScroll: { x: number; y: number } };
type PenPoint     = { x: number; y: number; t: number };
type PenStroke    = { points: PenPoint[] };

type MetaEntry = { kind: MeshBrickKind; label: string; unifierKind?: string; icon: React.ReactNode };

// ─── Toolbar config ───────────────────────────────────────────────────────────

const BASIC_BRICKS: MetaEntry[] = [
  { kind: "board_empty", label: "Board",   icon: <LayoutGrid className="h-4 w-4" /> },
  { kind: "text",        label: "Text",    icon: <Type       className="h-4 w-4" /> },
  { kind: "portal",      label: "Portal",  icon: <Link2      className="h-4 w-4" /> },
  { kind: "mirror",      label: "Mirror",  icon: <Copy       className="h-4 w-4" /> },
  { kind: "draw",        label: "Draw",    icon: <Pencil     className="h-4 w-4" /> },
  { kind: "script",      label: "Script",  icon: <Code2      className="h-4 w-4" /> },
];

const CONTENT_BRICKS: MetaEntry[] = [
  { kind: "portal",  label: "Doc",      unifierKind: "text",      icon: <FileText      className="h-4 w-4" /> },
  { kind: "portal",  label: "Gráfico",  unifierKind: "graph",     icon: <BarChart2     className="h-4 w-4" /> },
  { kind: "portal",  label: "Media",    unifierKind: "media",     icon: <Film          className="h-4 w-4" /> },
  { kind: "portal",  label: "Imagen",   unifierKind: "image",     icon: <Image         className="h-4 w-4" /> },
  { kind: "portal",  label: "Tabla",    unifierKind: "table",     icon: <MessageSquare className="h-4 w-4" /> },
  { kind: "portal",  label: "Lista",    unifierKind: "checklist", icon: <CheckSquare   className="h-4 w-4" /> },
  { kind: "portal",  label: "Cita",     unifierKind: "quote",     icon: <MessageSquare className="h-4 w-4" /> },
  { kind: "portal",  label: "Callout",  unifierKind: "callout",   icon: <AlertTriangle className="h-4 w-4" /> },
  { kind: "mirror",  label: "Acordeón", unifierKind: "accordion", icon: <ChevronDown   className="h-4 w-4" /> },
  { kind: "mirror",  label: "Tabs",     unifierKind: "tabs",      icon: <Layers        className="h-4 w-4" /> },
  { kind: "mirror",  label: "Columnas", unifierKind: "columns",   icon: <Copy          className="h-4 w-4" /> },
  { kind: "mirror",  label: "Card",     unifierKind: "callout",   icon: <Copy          className="h-4 w-4" /> },
  { kind: "portal",  label: "Divider",  unifierKind: "divider",   icon: <Minus         className="h-4 w-4" /> },
];

const SHAPES: { preset: ShapePreset; label: string }[] = [
  { preset: "rect",            label: "Rect"     },
  { preset: "rounded-rect",    label: "Round"    },
  { preset: "circle",          label: "Circle"   },
  { preset: "ellipse",         label: "Ellipse"  },
  { preset: "diamond",         label: "Diamond"  },
  { preset: "triangle",        label: "Triangle" },
  { preset: "hexagon",         label: "Hexagon"  },
  { preset: "star",            label: "Star"     },
  { preset: "arrow",           label: "Arrow"    },
  { preset: "note",            label: "Note"     },
  { preset: "frame-vector",    label: "Frame"    },
  { preset: "flow-terminator", label: "Pill"     },
];

// ─── Defaults ─────────────────────────────────────────────────────────────────

const BRICK_SIZE: Record<MeshBrickKind, { w: number; h: number }> = {
  board_empty: { w: 520, h: 340 },
  text:        { w: 200, h: 90  },
  frame:       { w: 260, h: 180 },
  script:      { w: 240, h: 140 },
  mirror:      { w: 220, h: 140 },
  portal:      { w: 220, h: 160 },
  decision:    { w: 150, h: 110 },
  draw:        { w: 160, h: 120 },
};

const BRICK_MIN: Partial<Record<MeshBrickKind, { w: number; h: number }>> = {
  board_empty: { w: 200, h: 140 },
  text:        { w: 100, h: 40  },
  frame:       { w: 80,  h: 60  },
  draw:        { w: 60,  h: 40  },
  decision:    { w: 70,  h: 50  },
  portal:      { w: 100, h: 60  },
  mirror:      { w: 100, h: 60  },
  script:      { w: 100, h: 60  },
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function mkId(prefix: string) {
  return typeof crypto?.randomUUID === "function"
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
}

function asRec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function resolveGlobal(by: Record<string, MeshBrick>, id: string): { x: number; y: number } {
  const b = by[id];
  if (!b) return { x: 0, y: 0 };
  if (!b.parentId) return { x: b.position.x, y: b.position.y };
  const p = resolveGlobal(by, b.parentId);
  return { x: p.x + b.position.x, y: p.y + b.position.y };
}

function isDesc(by: Record<string, MeshBrick>, ancId: string, id: string): boolean {
  let cur = by[id];
  while (cur?.parentId) {
    if (cur.parentId === ancId) return true;
    cur = by[cur.parentId];
  }
  return false;
}

function isContainer(b: MeshBrick): boolean {
  return b.kind === "board_empty" || !!asRec(b.content).isContainer;
}

function boardAt(by: Record<string, MeshBrick>, x: number, y: number, excl: string): MeshBrick | null {
  const boards = Object.values(by).filter(
    (b) => isContainer(b) && b.id !== excl && !isDesc(by, excl, b.id),
  );
  for (let i = boards.length - 1; i >= 0; i--) {
    const g = resolveGlobal(by, boards[i].id);
    if (x >= g.x && x <= g.x + boards[i].size.w && y >= g.y && y <= g.y + boards[i].size.h)
      return boards[i];
  }
  return null;
}

function childOrder(b: MeshBrick): string[] {
  const co = asRec(b.content).childOrder;
  return Array.isArray(co) ? (co as string[]).filter((v) => typeof v === "string") : [];
}

function withChildOrder(b: MeshBrick, order: string[]): MeshBrick {
  return { ...b, content: { ...asRec(b.content), childOrder: order, isContainer: true } };
}

function getMd(b: MeshBrick): string {
  const md = asRec(b.content).markdown;
  return typeof md === "string" ? md : "";
}

function setMd(b: MeshBrick, md: string): MeshBrick {
  return { ...b, content: { ...asRec(b.content), markdown: md } };
}


function toDocBrick(mb: MeshBrick, forcedKind?: string): DocumentBrick {
  const c = asRec(mb.content);
  const md = typeof c.markdown === "string" ? c.markdown : "";
  const kind = forcedKind ?? (typeof c.unifierKind === "string" ? c.unifierKind : "text");
  return {
    id: mb.id,
    documentId: `mesh:${mb.id}`,
    kind,
    position: 0,
    content: { ...c, kind, markdown: md, text: md },
    createdByUserId: "mesh",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

// ─── Connector pathfinding helpers ───────────────────────────────────────────

/** Where a line from brick center toward (tcx,tcy) exits the brick border. */
function edgeExit(bx: number, by: number, bw: number, bh: number, tcx: number, tcy: number) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  const dx = tcx - cx, dy = tcy - cy;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { x: cx, y: cy - bh / 2, nx: 0, ny: -1 };
  const w2 = bw / 2, h2 = bh / 2;
  if (Math.abs(dx) * h2 >= Math.abs(dy) * w2) {
    const t = w2 / Math.abs(dx);
    return { x: cx + dx * t, y: cy + dy * t, nx: Math.sign(dx), ny: 0 };
  }
  const t = h2 / Math.abs(dy);
  return { x: cx + dx * t, y: cy + dy * t, nx: 0, ny: Math.sign(dy) };
}

/** Liang-Barsky segment–AABB intersection. */
function segHitsRect(ax: number, ay: number, bx: number, by: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - rx, rx + rw - ax, ay - ry, ry + rh - ay];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const t = q[i] / p[i]; if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
  }
  return t0 < t1;
}

function collisionScore(pts: Array<{ x: number; y: number }>, obs: Array<{ x: number; y: number; w: number; h: number }>): number {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    for (const o of obs) {
      if (segHitsRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, o.x + 4, o.y + 4, o.w - 8, o.h - 8)) n++;
    }
  }
  return n;
}

/** Polyline with rounded corners of radius r using Q bezier arcs. */
function smoothPoly(pts: Array<{ x: number; y: number }>, r: number): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], c = pts[i], b = pts[i + 1];
    const d1 = Math.hypot(c.x - a.x, c.y - a.y);
    const d2 = Math.hypot(b.x - c.x, b.y - c.y);
    const cr = Math.min(r, d1 / 2, d2 / 2);
    if (cr < 1) { d += ` L${c.x.toFixed(1)},${c.y.toFixed(1)}`; continue; }
    const t1 = cr / d1, t2 = cr / d2;
    const qx = c.x - (c.x - a.x) * t1, qy = c.y - (c.y - a.y) * t1;
    const ex = c.x + (b.x - c.x) * t2, ey = c.y + (b.y - c.y) * t2;
    d += ` L${qx.toFixed(1)},${qy.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  }
  d += ` L${pts[pts.length - 1].x.toFixed(1)},${pts[pts.length - 1].y.toFixed(1)}`;
  return d;
}

const STUB = 28, CORNER_R = 10, SNAP_R = 22;
const ALL_PORTS: Port[] = ["top", "right", "bottom", "left"];

function portAbsPos(gx: number, gy: number, bw: number, bh: number, port: Port) {
  switch (port) {
    case "top":    return { x: gx + bw / 2, y: gy,          nx: 0,  ny: -1 };
    case "right":  return { x: gx + bw,     y: gy + bh / 2, nx: 1,  ny: 0  };
    case "bottom": return { x: gx + bw / 2, y: gy + bh,     nx: 0,  ny: 1  };
    case "left":   return { x: gx,          y: gy + bh / 2, nx: -1, ny: 0  };
  }
}

function buildConnPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: Array<{ x: number; y: number; w: number; h: number }>,
  srcPort?: Port,
  tgtPort?: Port,
): string {
  return smoothPoly(buildConnPolyline(srcRect, tgtRect, obs, srcPort, tgtPort), CORNER_R);
}

function buildConnPolyline(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: Array<{ x: number; y: number; w: number; h: number }>,
  srcPort?: Port,
  tgtPort?: Port,
): Array<{ x: number; y: number }> {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = srcPort
    ? portAbsPos(srcRect.x, srcRect.y, srcRect.w, srcRect.h, srcPort)
    : edgeExit(srcRect.x, srcRect.y, srcRect.w, srcRect.h, tc.x, tc.y);
  const e2 = tgtPort
    ? portAbsPos(tgtRect.x, tgtRect.y, tgtRect.w, tgtRect.h, tgtPort)
    : edgeExit(tgtRect.x, tgtRect.y, tgtRect.w, tgtRect.h, sc.x, sc.y);
  const s1 = { x: e1.x + e1.nx * STUB, y: e1.y + e1.ny * STUB };
  const s2 = { x: e2.x + e2.nx * STUB, y: e2.y + e2.ny * STUB };

  const hvPts = [{ x: e1.x, y: e1.y }, s1, { x: s2.x, y: s1.y }, s2, { x: e2.x, y: e2.y }];
  const vhPts = [{ x: e1.x, y: e1.y }, s1, { x: s1.x, y: s2.y }, s2, { x: e2.x, y: e2.y }];
  const scoreHV = collisionScore(hvPts, obs);
  const scoreVH = collisionScore(vhPts, obs);
  return scoreHV <= scoreVH ? hvPts : vhPts;
}

function pointAtPolylineFraction(pts: Array<{ x: number; y: number }>, fraction: number): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];

  const clamped = Math.max(0, Math.min(1, fraction));
  let total = 0;
  const segments: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segments.push(seg);
    total += seg;
  }
  if (total <= 0) return pts[Math.floor((pts.length - 1) / 2)];

  const target = total * clamped;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (acc + seg >= target) {
      const t = seg > 0 ? (target - acc) / seg : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

function findRawDrawAt(by: Record<string, MeshBrick>, x: number, y: number): MeshBrick | null {
  const candidates = Object.values(by).filter((b) => {
    if (b.kind !== "draw") return false;
    const c = asRec(b.content);
    return typeof c.shapePreset !== "string";
  });

  for (let i = candidates.length - 1; i >= 0; i--) {
    const b = candidates[i];
    const g = resolveGlobal(by, b.id);
    if (x >= g.x && x <= g.x + b.size.w && y >= g.y && y <= g.y + b.size.h) {
      return b;
    }
  }
  return null;
}

function insertBrick(state: MeshState, brick: MeshBrick, globalDrop?: { x: number; y: number }): MeshState {
  const by = { ...state.bricksById };
  let root = [...state.rootOrder];
  let parentId = brick.parentId ?? null;
  let pos = { ...brick.position };

  if (globalDrop) {
    const container = boardAt(state.bricksById, globalDrop.x, globalDrop.y, brick.id);
    parentId = container?.id ?? null;
    if (parentId) {
      const pg = resolveGlobal(state.bricksById, parentId);
      pos = { x: globalDrop.x - pg.x, y: globalDrop.y - pg.y };
    } else {
      pos = { ...globalDrop };
    }
  }

  const placed: MeshBrick = { ...brick, parentId, position: pos };
  by[placed.id] = placed;

  if (parentId && by[parentId]) {
    by[parentId] = withChildOrder(by[parentId], [...childOrder(by[parentId]), placed.id]);
  } else {
    root = [...root, placed.id];
  }

  return { ...state, bricksById: by, rootOrder: root };
}

// ─── Delete helpers ───────────────────────────────────────────────────────────

function descendants(by: Record<string, MeshBrick>, id: string): string[] {
  const result: string[] = [];
  const q = [id];
  while (q.length) {
    const cur = q.shift()!;
    result.push(cur);
    Object.values(by).filter((b) => b.parentId === cur).forEach((b) => q.push(b.id));
  }
  return result;
}

function deleteBrick(state: MeshState, id: string): MeshState {
  const brick = state.bricksById[id];
  if (!brick) return state;
  const del = new Set(descendants(state.bricksById, id));
  const by = { ...state.bricksById };
  let root = state.rootOrder.filter((i) => !del.has(i));
  if (brick.parentId && by[brick.parentId]) {
    by[brick.parentId] = withChildOrder(by[brick.parentId], childOrder(by[brick.parentId]).filter((i) => i !== id));
  }
  del.forEach((i) => delete by[i]);
  const conns: Record<string, MeshConnection> = {};
  Object.values(state.connectionsById).forEach((c) => {
    if (!del.has(c.cons[0]) && !del.has(c.cons[1])) conns[c.id] = c;
  });
  return { ...state, bricksById: by, rootOrder: root, connectionsById: conns };
}

function deleteConn(state: MeshState, id: string): MeshState {
  const conns = { ...state.connectionsById };
  delete conns[id];
  return { ...state, connectionsById: conns };
}

// ─── Brick factory ────────────────────────────────────────────────────────────

function mkBrick(
  kind: MeshBrickKind,
  count: number,
  parentId: string | null = null,
  pos?: { x: number; y: number },
  shapePreset?: ShapePreset,
  unifierKind?: string,
): MeshBrick {
  const id  = mkId("brick");
  const size = BRICK_SIZE[kind] ?? { w: 180, h: 120 };
  const defaultPts = shapePreset ? SHAPE_PTS[shapePreset] : undefined;

  let content: Record<string, unknown>;
  if (kind === "board_empty" || kind === "frame") {
    content = { childOrder: [], isContainer: true,
      ...(kind === "frame" ? { style: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.04)", strokeWidth: 2 } } : {}) };
  } else if (kind === "text") {
    content = { markdown: "" };
  } else if (kind === "decision") {
    content = { markdown: "**¿Decisión?**" };
  } else if (kind === "portal") {
    if (unifierKind) { content = { unifierKind, markdown: "" }; }
    else             { content = { targetType: "mesh", targetId: "", targetLabel: "" }; }
  } else if (kind === "mirror") {
    if (unifierKind) { content = { unifierKind: unifierKind ?? "callout", markdown: "" }; }
    else             { content = { sourceId: "", sourceLabel: "", previewMarkdown: "" }; }
  } else if (shapePreset) {
    content = {
      shapePreset, isContainer: true, childOrder: [],
      vectorPoints: defaultPts ? JSON.parse(JSON.stringify(defaultPts)) : undefined,
      style: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.08)", strokeWidth: 2 },
    };
  } else {
    content = {};
  }

  return {
    id, kind, parentId,
    position: pos ?? { x: 64 + (count % 6) * 60, y: 64 + Math.floor(count / 6) * 60 },
    size,
    content,
  } as MeshBrick;
}

// ─── iinkTS ───────────────────────────────────────────────────────────────────

type IinkShape = { kind: string; bbox: { x: number; y: number; w: number; h: number } | null };
type IinkResult = { text: string | null; shapes: IinkShape[] };

async function callIink(strokes: PenStroke[], w: number, h: number, token: string): Promise<IinkResult | null> {
  if (!strokes.length) return null;
  const payload = {
    strokes: strokes.map((s) => ({
      x: s.points.map((p) => Math.round(p.x)),
      y: s.points.map((p) => Math.round(p.y)),
      t: s.points.map((p) => p.t),
    })),
    width: Math.round(w),
    height: Math.round(h),
  };
  try {
    const res = await fetch(`${API_BASE}/meshes/iink`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { text: data.text ?? null, shapes: data.shapes ?? [] };
  } catch {
    return null;
  }
}

// Map MyScript shape kind → MeshBrickKind + optional shapePreset
function shapeKindToBrick(kind: string): { meshKind: MeshBrickKind; preset?: ShapePreset } | null {
  switch (kind.toLowerCase()) {
    case "rectangle": case "square":         return { meshKind: "board_empty" };
    case "rhombus":   case "diamond":        return { meshKind: "decision" };
    case "circle":    case "ellipse":        return { meshKind: "draw", preset: "circle" };
    case "triangle":                         return { meshKind: "draw", preset: "triangle" };
    case "hexagon":                          return { meshKind: "draw", preset: "hexagon" };
    case "parallelogram":                    return { meshKind: "draw", preset: "rounded-rect" };
    default:                                 return null;
  }
}

function strokesBBox(strokes: PenStroke[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  strokes.forEach((s) => s.points.forEach((p) => {
    if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
  }));
  if (!isFinite(x0)) return { x: 0, y: 0, w: 120, h: 50 };
  return { x: x0, y: y0, w: Math.max(x1 - x0, 80), h: Math.max(y1 - y0, 30) };
}

function strokeToPath(s: PenStroke): string {
  if (!s.points.length) return "";
  const [f, ...rest] = s.points;
  return `M${f.x.toFixed(1)},${f.y.toFixed(1)}` + rest.map((p) => ` L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

// ─── Shape geometry ───────────────────────────────────────────────────────────

function hexPts() {
  return [-90, -30, 30, 90, 150, 210].map((d) => {
    const r = (d * Math.PI) / 180;
    return { x: +(0.5 + 0.5 * Math.cos(r)).toFixed(4), y: +(0.5 + 0.5 * Math.sin(r)).toFixed(4) };
  });
}

function starPts() {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const oa = ((i * 72 - 90) * Math.PI) / 180;
    const ia = ((i * 72 - 54) * Math.PI) / 180;
    pts.push({ x: +(0.5 + 0.5 * Math.cos(oa)).toFixed(4), y: +(0.5 + 0.5 * Math.sin(oa)).toFixed(4) });
    pts.push({ x: +(0.5 + 0.22 * Math.cos(ia)).toFixed(4), y: +(0.5 + 0.22 * Math.sin(ia)).toFixed(4) });
  }
  return pts;
}

const SHAPE_PTS: Partial<Record<ShapePreset, { x: number; y: number }[]>> = {
  diamond:        [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }],
  triangle:       [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  hexagon:        hexPts(),
  star:           starPts(),
  arrow:          [{ x: 0, y: 0.35 }, { x: 0.6, y: 0.35 }, { x: 0.6, y: 0.1 }, { x: 1, y: 0.5 }, { x: 0.6, y: 0.9 }, { x: 0.6, y: 0.65 }, { x: 0, y: 0.65 }],
  "frame-vector": [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
};

// ─── SVG renderers ────────────────────────────────────────────────────────────

function ShapeSvg({ preset, w, h, pts, stroke = "#22d3ee", fill = "rgba(34,211,238,0.07)", sw = 2, cr = 10 }: {
  preset: ShapePreset; w: number; h: number;
  pts?: { x: number; y: number }[];
  stroke?: string; fill?: string; sw?: number; cr?: number;
}) {
  const vp = pts ?? SHAPE_PTS[preset];

  if (preset === "circle" || preset === "ellipse" || preset === "flow-terminator") {
    const rx = preset === "flow-terminator" ? Math.min(w / 2, h / 2) : w / 2 - 2;
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <ellipse cx={w / 2} cy={h / 2} rx={rx} ry={h / 2 - 2} stroke={stroke} fill={fill} strokeWidth={sw} />
      </svg>
    );
  }
  if (preset === "rect") {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <rect x={1} y={1} width={w - 2} height={h - 2} stroke={stroke} fill={fill} strokeWidth={sw} />
      </svg>
    );
  }
  if (preset === "rounded-rect") {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={cr} ry={cr} stroke={stroke} fill={fill} strokeWidth={sw} />
      </svg>
    );
  }
  if (preset === "note") {
    const fold = Math.min(w * 0.18, 28);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <polygon points={`0,0 ${w - fold},0 ${w},${fold} ${w},${h} 0,${h}`} stroke={stroke} fill={fill} strokeWidth={sw} />
        <polyline points={`${w - fold},0 ${w - fold},${fold} ${w},${fold}`} stroke={stroke} fill="none" strokeWidth={sw} />
      </svg>
    );
  }
  if (!vp) return null;
  const pStr = vp.map((p) => `${+(p.x * w).toFixed(1)},${+(p.y * h).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
      <polygon points={pStr} stroke={stroke} fill={fill} strokeWidth={sw} />
    </svg>
  );
}


function defaultMeshState(): MeshState {
  return { version: "1.0.0", viewport: { x: 0, y: 0, zoom: 1 }, rootOrder: [], bricksById: {}, connectionsById: {} };
}

function connStyle(preset: ConnStyle): Record<string, unknown> {
  if (preset === "dashed")    return { stroke: "#7dd3fc", width: 2, pattern: "dashed",  handDrawn: false };
  if (preset === "handdrawn") return { stroke: "#93c5fd", width: 2.5, pattern: "solid", handDrawn: true  };
  return                             { stroke: "#22d3ee", width: 2, pattern: "solid",  handDrawn: false };
}

const MESH_RICH_TEXT_CONTEXT: ResolverContext = {
  documents: [],
  boards: [],
  activeBricks: [],
  users: [],
};

// ─── Toolbar item component ───────────────────────────────────────────────────

function TBItem({
  icon, label, draggable: drag = false,
  onDragStart, onClick, active = false,
}: {
  icon: React.ReactNode; label: string;
  draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={drag}
      onDragStart={onDragStart}
      onClick={onClick}
      title={label}
      className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-[9px] leading-none transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent/20 hover:text-foreground"
      }`}
    >
      {icon}
      <span className="mt-0.5 max-w-[48px] truncate">{label}</span>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MeshBoardPage() {
  const params  = useParams<{ meshId: string }>();
  const meshId  = params?.meshId;
  const { accessToken, activeTeamId } = useSession();
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [state,      setState]      = useState<MeshState>(defaultMeshState());
  const [revision,   setRevision]   = useState(0);
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(null);
  const [isLoading,  setIsLoading]  = useState(false);
  const [isSaving,   setIsSaving]   = useState(false);

  // entity selector modal state (portal / mirror double-click)
  const [selectorModalBrickId,   setSelectorModalBrickId]   = useState<string | null>(null);
  const [selectorModalBrickKind, setSelectorModalBrickKind] = useState<"portal" | "mirror">("portal");

  // tool state
  const [toolMode,       setToolMode]       = useState<ToolMode>("select");
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [editingConnId,  setEditingConnId]  = useState<string | null>(null);
  const [editingBrickId, setEditingBrickId] = useState<string | null>(null);
  const [editingValue,   setEditingValue]   = useState<string>("");
  const [connSrcId,      setConnSrcId]      = useState<string | null>(null);
  const [connPreset,     setConnPreset]     = useState<ConnStyle>("technical");

  // drag state
  const [dragState,    setDragState]    = useState<DragState | null>(null);
  const [resizeState,  setResizeState]  = useState<ResizeState | null>(null);
  const [vecDragState, setVecDragState] = useState<VecDragState | null>(null);
  const [panDragState, setPanDragState] = useState<PanDragState | null>(null);
  const [selRect,      setSelRect]      = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pointer,      setPointer]      = useState<{ x: number; y: number } | null>(null);

  // pen state
  const [penStrokes,    setPenStrokes]    = useState<PenStroke[]>([]);
  const [activePen,     setActivePen]     = useState<PenPoint[] | null>(null);
  const [recognizing,   setRecognizing]   = useState(false);
  const [collapsedBoards, setCollapsedBoards] = useState<Set<string>>(new Set());
  const [hoveredRawDrawId, setHoveredRawDrawId] = useState<string | null>(null);
  const [connSrcPort,  setConnSrcPort]  = useState<Port | null>(null);
  const [snapTarget,   setSnapTarget]   = useState<{ brickId: string; port: Port } | null>(null);
  const penTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penStrokesRef  = useRef<PenStroke[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const revisionRef = useRef(0);
  const stateHashRef = useRef("");
  const lastSavedHashRef = useRef("");

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!meshId || !accessToken) return;
    setIsLoading(true);
    getMesh(meshId, accessToken)
      .then((s) => {
        setState(s.state);
        setRevision(s.revision);
        setUpdatedAt(s.updatedAt);
        const initialHash = JSON.stringify(s.state);
        stateHashRef.current = initialHash;
        lastSavedHashRef.current = initialHash;
        revisionRef.current = s.revision;
      })
      .catch(() => toast("No se pudo cargar la mesh.", "error"))
      .finally(() => setIsLoading(false));
  }, [meshId, accessToken]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useBoardRealtime(meshId, (e) => {
    if (e.type !== "mesh.state.updated") return;
    const p = e.payload as Record<string, unknown>;
    if (p.meshId !== meshId) return;
    const nr = typeof p.revision === "number" ? p.revision : null;
    const ns = p.state as MeshState | undefined;
    if (!nr || !ns || nr <= revision) return;
    const remoteHash = JSON.stringify(ns);
    stateHashRef.current = remoteHash;
    lastSavedHashRef.current = remoteHash;
    revisionRef.current = nr;
    setState(ns); setRevision(nr); setUpdatedAt(new Date().toISOString());
  }, accessToken);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    stateHashRef.current = JSON.stringify(state);
  }, [state]);

  const saveMeshState = useCallback(async (nextState: MeshState, opts?: { silent?: boolean }) => {
    if (!meshId || !accessToken) return false;
    if (isSavingRef.current) return false;

    const snapshotHash = JSON.stringify(nextState);
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const s = await updateMeshState(meshId, { state: nextState, expectedRevision: revisionRef.current }, accessToken);
      const serverHash = JSON.stringify(s.state);
      lastSavedHashRef.current = serverHash;
      revisionRef.current = s.revision;

      // Avoid snapping back if user kept editing while autosave was in flight.
      if (stateHashRef.current === snapshotHash) {
        stateHashRef.current = serverHash;
        setState(s.state);
      }
      setRevision(s.revision);
      setUpdatedAt(s.updatedAt);
      if (!opts?.silent) toast("Guardado.", "success");
      return true;
    } catch {
      if (!opts?.silent) toast("Error al guardar.", "error");
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [meshId, accessToken]);

  // ── Canvas coords ────────────────────────────────────────────────────────────
  const toCanvas = useCallback((cx: number, cy: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: cx - r.left + el.scrollLeft, y: cy - r.top + el.scrollTop };
  }, []);

  const fromEv = useCallback((e: { clientX: number; clientY: number }) => toCanvas(e.clientX, e.clientY), [toCanvas]);

  const gPos = useCallback((id: string) => resolveGlobal(state.bricksById, id), [state.bricksById]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (active?.isContentEditable) return;
      if (e.key === "s" || e.key === "v") { setToolMode("select"); return; }
      if (e.key === "h")                  { setToolMode("pan"); return; }
      if (e.key === "p")                  { setToolMode("pen"); return; }
      if (e.key === "Escape")             { setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null); setConnSrcId(null); setEditingBrickId(null); setEditingConnId(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.size > 0) {
          setState((c) => { let s = c; selectedIds.forEach((id) => { s = deleteBrick(s, id); }); return s; });
          setSelectedIds(new Set()); toast(`${selectedIds.size} eliminado(s).`, "success");
        } else {
          if (selectedId) { setState((c) => deleteBrick(c, selectedId)); setSelectedId(null); toast("Eliminado.", "success"); }
          if (selectedConnId) { setState((c) => deleteConn(c, selectedConnId)); setSelectedConnId(null); }
        }
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selectedId, selectedIds, selectedConnId, editingBrickId]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    await saveMeshState(state, { silent: false });
  }, [saveMeshState, state]);

  useEffect(() => {
    if (!meshId || !accessToken || isLoading) return;
    const currentHash = stateHashRef.current;
    if (!currentHash || currentHash === lastSavedHashRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveMeshState(state, { silent: true });
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [meshId, accessToken, isLoading, state, saveMeshState]);

  // ── Inline editing ────────────────────────────────────────────────────────────
  const startEdit = useCallback((brickId: string) => {
    const b = state.bricksById[brickId];
    if (!b) return;
    if (b.kind === "text" || b.kind === "decision") { setEditingValue(getMd(b)); setEditingBrickId(brickId); return; }
    if (b.kind === "draw" || b.kind === "frame") {
      setEditingValue(getMd(b)); setEditingBrickId(brickId); return;
    }
    if (b.kind === "portal") {
      if (activeTeamId) {
        setSelectorModalBrickKind("portal");
        setSelectorModalBrickId(brickId);
        return;
      }
      const lbl = typeof asRec(b.content).targetLabel === "string" ? asRec(b.content).targetLabel as string : "";
      setEditingValue(lbl); setEditingBrickId(brickId); return;
    }
    if (b.kind === "mirror") {
      if (activeTeamId) {
        setSelectorModalBrickKind("mirror");
        setSelectorModalBrickId(brickId);
        return;
      }
      const lbl = typeof asRec(b.content).sourceLabel === "string" ? asRec(b.content).sourceLabel as string : "";
      setEditingValue(lbl); setEditingBrickId(brickId); return;
    }
    setEditingBrickId(brickId);
  }, [state.bricksById]);

  const commitEdit = useCallback(() => {
    if (!editingBrickId) return;
    setState((cur) => {
      const b = cur.bricksById[editingBrickId];
      if (!b) return cur;
      let updated: MeshBrick;
      if (b.kind === "text" || b.kind === "decision") updated = setMd(b, editingValue);
      else if (b.kind === "draw" || b.kind === "frame") updated = setMd(b, editingValue);
      else if (b.kind === "portal") updated = { ...b, content: { ...asRec(b.content), targetLabel: editingValue } };
      else if (b.kind === "mirror") updated = { ...b, content: { ...asRec(b.content), sourceLabel: editingValue } };
      else return cur;
      return { ...cur, bricksById: { ...cur.bricksById, [editingBrickId]: updated } };
    });
    setEditingBrickId(null);
  }, [editingBrickId, editingValue]);

  const handleUnifierUpdate = useCallback((brickId: string) => (updates: Partial<DocumentBrick>) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;

      const rawUpdates = (updates && typeof updates === "object") ? (updates as Record<string, unknown>) : {};
      const contentPatch = (
        rawUpdates.content && typeof rawUpdates.content === "object" && !Array.isArray(rawUpdates.content)
          ? (rawUpdates.content as Record<string, unknown>)
          : rawUpdates
      );

      return {
        ...cur,
        bricksById: {
          ...cur.bricksById,
          [brickId]: { ...b, content: { ...asRec(b.content), ...contentPatch } },
        },
      };
    });
  }, []);

  // ── Add bricks ────────────────────────────────────────────────────────────────
  const addMeta = useCallback((entry: MetaEntry, at?: { x: number; y: number }) => {
    let newId = "";
    setState((cur) => {
      const b = mkBrick(entry.kind, Object.keys(cur.bricksById).length, null, undefined, undefined, entry.unifierKind);
      newId = b.id;
      let drop: { x: number; y: number } | undefined;
      if (at) {
        drop = { x: at.x - b.size.w / 2, y: at.y - b.size.h / 2 };
      } else if (selectedId && cur.bricksById[selectedId]?.kind === "board_empty") {
        const board = cur.bricksById[selectedId];
        const g = resolveGlobal(cur.bricksById, selectedId);
        const n = childOrder(board).length;
        drop = { x: g.x + 20 + (n % 3) * 60, y: g.y + 40 + Math.floor(n / 3) * 50 };
      }
      return insertBrick(cur, b, drop);
    });
    // auto-focus new text bricks
    if (entry.kind === "text") {
      setTimeout(() => { setEditingBrickId(newId); setEditingValue(""); }, 30);
    }
  }, [selectedId]);

  const addShape = useCallback((preset: ShapePreset, at?: { x: number; y: number }) => {
    setState((cur) => {
      const kind: MeshBrickKind = preset === "frame-vector" ? "frame" : "draw";
      const b = mkBrick(kind, Object.keys(cur.bricksById).length, null, undefined, preset);
      const drop = at ? { x: at.x - b.size.w / 2, y: at.y - b.size.h / 2 } : undefined;
      return insertBrick(cur, b, drop);
    });
  }, []);

  // ── Drag-from-toolbar ────────────────────────────────────────────────────────
  const onToolDragStart = useCallback((e: React.DragEvent, data: { type: "meta"; entry: MetaEntry } | { type: "shape"; preset: ShapePreset }) => {
    e.dataTransfer.setData("killio-mesh", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const onCanvasDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);

  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("killio-mesh");
    if (!raw) return;
    let data: any;
    try { data = JSON.parse(raw); } catch { return; }
    const pos = toCanvas(e.clientX, e.clientY);
    if (data.type === "meta") addMeta(data.entry, pos);
    if (data.type === "shape") addShape(data.preset, pos);
  }, [addMeta, addShape, toCanvas]);

  // ── Connections ───────────────────────────────────────────────────────────────
  const addConn = useCallback((src: string, tgt: string, sp?: Port, tp?: Port) => {
    if (src === tgt) return;
    setState((cur) => {
      if (Object.values(cur.connectionsById).some((c) => c.cons[0] === src && c.cons[1] === tgt)) return cur;
      const style: Record<string, unknown> = { ...connStyle(connPreset) };
      if (sp) style.srcPort = sp;
      if (tp) style.tgtPort = tp;
      const conn: MeshConnection = { id: mkId("conn"), cons: [src, tgt], label: { type: "doc", content: [] }, style };
      return { ...cur, connectionsById: { ...cur.connectionsById, [conn.id]: conn } };
    });
  }, [connPreset]);

  const startConnFromPort = useCallback((brickId: string, port: Port) => {
    if (toolMode !== "conn") return;
    setConnSrcId(brickId);
    setConnSrcPort(port);
  }, [toolMode]);

  const finishConnAtPort = useCallback((brickId: string, port: Port) => {
    if (!connSrcId || connSrcId === brickId) return;
    addConn(connSrcId, brickId, connSrcPort ?? undefined, port);
    setConnSrcId(null); setConnSrcPort(null); setSnapTarget(null);
    toast("Conexión creada.", "success");
  }, [connSrcId, connSrcPort, addConn]);

  // ── Mouse move ────────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = fromEv(e);
    setPointer({ x, y });

    // Rubber-band selection rect
    if (toolMode === "select" && selRect) {
      setSelRect((r) => r ? { ...r, x2: x, y2: y } : null);
    }

    // Update snap target when mid-connection
    if (toolMode === "conn" && connSrcId) {
      let bestId: string | null = null, bestPort: Port | null = null, bestDist = SNAP_R;
      Object.values(state.bricksById).forEach((b) => {
        if (b.id === connSrcId) return;
        const g = gPos(b.id);
        ALL_PORTS.forEach((port) => {
          const mp = portAbsPos(g.x, g.y, b.size.w, b.size.h, port);
          const d = Math.hypot(x - mp.x, y - mp.y);
          if (d < bestDist) { bestDist = d; bestId = b.id; bestPort = port; }
        });
      });
      setSnapTarget(bestId && bestPort ? { brickId: bestId, port: bestPort } : null);
    }

    if (toolMode === "pan" && panDragState) {
      const el = canvasRef.current;
      if (!el) return;
      el.scrollLeft = panDragState.startScroll.x - (e.clientX - panDragState.startMouse.x);
      el.scrollTop  = panDragState.startScroll.y - (e.clientY - panDragState.startMouse.y);
      return;
    }

    if (toolMode === "pen" && activePen) {
      setActivePen((p) => p ? [...p, { x, y, t: Date.now() }] : p);
      return;
    }

    if (toolMode !== "select" && toolMode !== "vec") return;

    if (vecDragState) {
      setState((cur) => {
        const b = cur.bricksById[vecDragState.brickId];
        if (!b) return cur;
        const g = resolveGlobal(cur.bricksById, b.id);
        const nx = Math.max(0, Math.min(1, (x - g.x) / Math.max(b.size.w, 1)));
        const ny = Math.max(0, Math.min(1, (y - g.y) / Math.max(b.size.h, 1)));
        const c  = asRec(b.content);
        const pts = Array.isArray(c.vectorPoints) ? [...(c.vectorPoints as { x: number; y: number }[])] : [];
        pts[vecDragState.pointIndex] = { x: +nx.toFixed(4), y: +ny.toFixed(4) };
        return { ...cur, bricksById: { ...cur.bricksById, [b.id]: { ...b, content: { ...c, vectorPoints: pts } } } };
      });
      return;
    }

    if (resizeState) {
      const dx = x - resizeState.startMouse.x;
      const dy = y - resizeState.startMouse.y;
      setState((cur) => {
        const b = cur.bricksById[resizeState.brickId];
        if (!b) return cur;
        const min = BRICK_MIN[b.kind] ?? { w: 60, h: 40 };
        return { ...cur, bricksById: { ...cur.bricksById, [b.id]: { ...b, size: { w: Math.max(min.w, resizeState.startSize.w + dx), h: Math.max(min.h, resizeState.startSize.h + dy) } } } };
      });
      return;
    }

    if (dragState) {
      const dx = x - dragState.startMouse.x;
      const dy = y - dragState.startMouse.y;
      setState((cur) => {
        const b = cur.bricksById[dragState.brickId];
        if (!b) return cur;
        return { ...cur, bricksById: { ...cur.bricksById, [b.id]: { ...b, position: { x: dragState.startPosition.x + dx, y: dragState.startPosition.y + dy } } } };
      });
    }
  }, [toolMode, fromEv, panDragState, activePen, vecDragState, resizeState, dragState, selRect, connSrcId]);

  // ── Mouse up ──────────────────────────────────────────────────────────────────
  const onMouseUp = useCallback(() => {
    if (panDragState) { setPanDragState(null); return; }

    // pen flush — use ref to avoid React Strict Mode double-invoke
    if (toolMode === "pen" && activePen && activePen.length > 1) {
      const stroke: PenStroke = { points: activePen };
      setActivePen(null);
      penStrokesRef.current = [...penStrokesRef.current, stroke];
      setPenStrokes([...penStrokesRef.current]);
      if (penTimer.current) clearTimeout(penTimer.current);
      penTimer.current = setTimeout(() => {
        const strokes = penStrokesRef.current;
        penStrokesRef.current = [];
        setPenStrokes([]);
        if (!strokes.length) return;

        const rawDrawTarget = (() => {
          const bb = strokesBBox(strokes);
          const mid = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
          return findRawDrawAt(state.bricksById, mid.x, mid.y);
        })();

        if (rawDrawTarget) {
          setState((cur) => {
            const b = cur.bricksById[rawDrawTarget.id];
            if (!b) return cur;
            const c = asRec(b.content);
            const current = Array.isArray(c.manualStrokes) ? [...(c.manualStrokes as unknown[])] : [];
            const g = resolveGlobal(cur.bricksById, b.id);
            const normalizedBatch = strokes.map((s) =>
              s.points.map((p) => ({
                x: +Math.max(0, Math.min(1, (p.x - g.x) / Math.max(b.size.w, 1))).toFixed(4),
                y: +Math.max(0, Math.min(1, (p.y - g.y) / Math.max(b.size.h, 1))).toFixed(4),
              }))
            );
            return {
              ...cur,
              bricksById: {
                ...cur.bricksById,
                [b.id]: { ...b, content: { ...c, manualStrokes: [...current, ...normalizedBatch] } },
              },
            };
          });
          return;
        }

        const el = canvasRef.current;
        const cw = el ? el.scrollWidth : 1600;
        const ch = el ? el.scrollHeight : 900;
        setRecognizing(true);
        callIink(strokes, cw, ch, accessToken ?? "").then((result) => {
          setRecognizing(false);
          if (!result) { toast("iink: sin respuesta", "error"); return; }
          const { text, shapes } = result;
          console.log("[iink]", { text, shapes });
          const primaryShape = shapes[0];
          const mapped = primaryShape ? shapeKindToBrick(primaryShape.kind) : null;
          if (!mapped && (!text || !text.trim())) {
            // Try line-to-connection: if stroke endpoints are near two different bricks
            const allPts = strokes.flatMap((s) => s.points);
            if (allPts.length >= 2) {
              const start = allPts[0], end = allPts[allPts.length - 1];
              setState((cur) => {
                let srcId: string | null = null, tgtId: string | null = null, srcD = 100, tgtD = 100;
                Object.values(cur.bricksById).forEach((b) => {
                  const g = resolveGlobal(cur.bricksById, b.id);
                  const cx = g.x + b.size.w / 2, cy = g.y + b.size.h / 2;
                  const ds = Math.hypot(cx - start.x, cy - start.y);
                  const de = Math.hypot(cx - end.x, cy - end.y);
                  if (ds < srcD) { srcD = ds; srcId = b.id; }
                  if (de < tgtD) { tgtD = de; tgtId = b.id; }
                });
                if (srcId && tgtId && srcId !== tgtId) {
                  const conn: MeshConnection = { id: mkId("conn"), cons: [srcId, tgtId], label: { type: "doc", content: [] }, style: { ...connStyle(connPreset) } };
                  toast("Conexión por trazo.", "success");
                  return { ...cur, connectionsById: { ...cur.connectionsById, [conn.id]: conn } };
                }
                return cur;
              });
            }
            return;
          }
          const bbox = strokesBBox(strokes);
          setState((cur) => {
            const mid = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
            const board = boardAt(cur.bricksById, mid.x, mid.y, "");
            const parentId = board?.id ?? null;
            let pos = { x: bbox.x, y: bbox.y };
            if (parentId && board) { const pg = resolveGlobal(cur.bricksById, parentId); pos = { x: bbox.x - pg.x, y: bbox.y - pg.y }; }
            let nb: MeshBrick;
            if (mapped) {
              const sz = primaryShape?.bbox
                ? { w: Math.max(mapped.meshKind === "board_empty" ? 240 : 150, primaryShape.bbox.w),
                    h: Math.max(mapped.meshKind === "board_empty" ? 160 : 110, primaryShape.bbox.h) }
                : undefined;
              nb = mkBrick(mapped.meshKind, Object.keys(cur.bricksById).length, parentId, pos, mapped.preset);
              if (sz) nb = { ...nb, size: sz };
            } else {
              nb = setMd(mkBrick("text", Object.keys(cur.bricksById).length, parentId, pos), text!.trim());
            }
            const by = { ...cur.bricksById, [nb.id]: nb };
            let root = cur.rootOrder;
            if (!parentId) root = [...root, nb.id];
            if (parentId && board) by[board.id] = withChildOrder(board, [...childOrder(board), nb.id]);
            return { ...cur, bricksById: by, rootOrder: root };
          });
          if (mapped) toast(`Figura: ${primaryShape!.kind}`, "success");
          else if (text) toast(`"${text.trim().slice(0, 30)}"`, "success");
        });
      }, 900);
      return;
    }
    setActivePen(null);

    // reparent on drag end
    if (dragState) {
      const { brickId, originalParentId } = dragState;
      setState((cur) => {
        const b = cur.bricksById[brickId];
        if (!b) return cur;
        const g  = resolveGlobal(cur.bricksById, brickId);
        const cx = g.x + b.size.w / 2;
        const cy = g.y + b.size.h / 2;
        const newParent = boardAt(cur.bricksById, cx, cy, brickId)?.id ?? null;
        if (newParent === originalParentId) return cur;

        let by   = { ...cur.bricksById };
        let root = cur.rootOrder;

        if (originalParentId && by[originalParentId])
          by[originalParentId] = withChildOrder(by[originalParentId], childOrder(by[originalParentId]).filter((i) => i !== brickId));
        else
          root = root.filter((i) => i !== brickId);

        let newPos = { x: g.x, y: g.y };
        if (newParent) { const pg = resolveGlobal(by, newParent); newPos = { x: g.x - pg.x, y: g.y - pg.y }; }

        by[brickId] = { ...b, parentId: newParent, position: newPos };
        if (newParent && by[newParent]) by[newParent] = withChildOrder(by[newParent], [...childOrder(by[newParent]), brickId]);
        else root = [...root, brickId];

        return { ...cur, bricksById: by, rootOrder: root };
      });
    }
    // Rubber-band finalization
    if (selRect) {
      const rx1 = Math.min(selRect.x1, selRect.x2), ry1 = Math.min(selRect.y1, selRect.y2);
      const rx2 = Math.max(selRect.x1, selRect.x2), ry2 = Math.max(selRect.y1, selRect.y2);
      if (rx2 - rx1 > 4 || ry2 - ry1 > 4) {
        const ids = new Set<string>();
        Object.values(state.bricksById).forEach((b) => {
          const g = resolveGlobal(state.bricksById, b.id);
          if (g.x < rx2 && g.x + b.size.w > rx1 && g.y < ry2 && g.y + b.size.h > ry1) ids.add(b.id);
        });
        setSelectedIds(ids);
        setSelectedId(null);
      }
      setSelRect(null);
    }

    setDragState(null);
    setResizeState(null);
    setVecDragState(null);
  }, [panDragState, toolMode, activePen, dragState, selRect, state.bricksById, accessToken, connPreset]);

  // ── Drag start ─────────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, brickId: string) => {
    if (toolMode !== "select") return;
    if (editingBrickId === brickId) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    const { x, y } = fromEv(e);
    const b = state.bricksById[brickId];
    if (!b) return;
    setDragState({ brickId, startMouse: { x, y }, startPosition: { ...b.position }, originalParentId: b.parentId });
    setSelectedId(brickId);
    setSelectedConnId(null);
  }, [toolMode, fromEv, state.bricksById, editingBrickId]);

  const startResize = useCallback((e: React.MouseEvent, brickId: string) => {
    e.stopPropagation();
    const { x, y } = fromEv(e);
    const b = state.bricksById[brickId];
    if (!b) return;
    setResizeState({ brickId, startMouse: { x, y }, startSize: { ...b.size } });
  }, [fromEv, state.bricksById]);

  const startVecDrag = useCallback((e: React.MouseEvent, brickId: string, idx: number) => {
    e.stopPropagation();
    setVecDragState({ brickId, pointIndex: idx, startMouse: fromEv(e) });
  }, [fromEv]);

  // ── Canvas mouse down ────────────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (toolMode === "pan") {
      const el = canvasRef.current!;
      setPanDragState({ startMouse: { x: e.clientX, y: e.clientY }, startScroll: { x: el.scrollLeft, y: el.scrollTop } });
      return;
    }
    if (toolMode === "pen") {
      const { x, y } = fromEv(e);
      setActivePen([{ x, y, t: Date.now() }]);
      return;
    }
    if (toolMode === "select" && e.button === 0) {
      const { x, y } = fromEv(e);
      setSelRect({ x1: x, y1: y, x2: x, y2: y });
      setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
    }
  }, [toolMode, fromEv]);

  // ── Canvas clicks ────────────────────────────────────────────────────────────
  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    if (toolMode === "conn" && connSrcId) {
      if (snapTarget) {
        addConn(connSrcId, snapTarget.brickId, connSrcPort ?? undefined, snapTarget.port);
        setConnSrcId(null); setConnSrcPort(null); setSnapTarget(null);
        toast("Conexión creada.", "success");
        return;
      }
      const { x, y } = fromEv(e);
      let nearId: string | null = null, nd = Infinity;
      Object.values(state.bricksById).forEach((b) => {
        if (b.id === connSrcId) return;
        const g = gPos(b.id);
        const d = Math.hypot(g.x + b.size.w / 2 - x, g.y + b.size.h / 2 - y);
        if (d < nd) { nd = d; nearId = b.id; }
      });
      if (nearId && nd <= 160) { addConn(connSrcId, nearId, connSrcPort ?? undefined); setConnSrcId(null); setConnSrcPort(null); toast("Conexión creada.", "success"); }
      return;
    }
    if (toolMode !== "select") return;
    if (editingConnId) setEditingConnId(null);
    if (editingBrickId) setEditingBrickId(null);
    setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
  }, [toolMode, connSrcId, connSrcPort, snapTarget, fromEv, state.bricksById, gPos, addConn, editingBrickId, editingConnId]);

  const onBrickClick = useCallback((e: React.MouseEvent, brickId: string) => {
    e.stopPropagation();
    if (editingBrickId && editingBrickId !== brickId) {
      setEditingBrickId(null);
    }
    if (editingConnId) {
      setEditingConnId(null);
    }
    if (toolMode === "conn") {
      if (!connSrcId) { setConnSrcId(brickId); setConnSrcPort(null); return; }
      if (connSrcId !== brickId) {
        if (snapTarget?.brickId === brickId) {
          addConn(connSrcId, brickId, connSrcPort ?? undefined, snapTarget.port);
        } else {
          addConn(connSrcId, brickId, connSrcPort ?? undefined);
        }
        setConnSrcId(null); setConnSrcPort(null); setSnapTarget(null);
        toast("Conexión creada.", "success");
      }
      return;
    }
    if (toolMode !== "select" && toolMode !== "vec") return;
    setSelectedId(brickId);
    setSelectedIds(new Set());
    setSelectedConnId(null);
  }, [toolMode, connSrcId, connSrcPort, snapTarget, addConn, editingBrickId, editingConnId]);

  const onBrickDblClick = useCallback((e: React.MouseEvent, brickId: string) => {
    e.stopPropagation();
    if (toolMode !== "select") return;
    startEdit(brickId);
  }, [toolMode, startEdit]);

  // ── Bricks connected to at least one connector ─────────────────────────────
  const connectedBrickIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(state.connectionsById).forEach((c) => {
      s.add(c.cons[0]);
      s.add(c.cons[1]);
    });
    return s;
  }, [state.connectionsById]);

  if (!meshId) return null;

  // ── Brick renderer ────────────────────────────────────────────────────────────
  function renderBrick(brick: MeshBrick): React.ReactNode {
    // Treat legacy "decision" kind as draw+diamond shape with text
    if (brick.kind === "decision") {
      brick = { ...brick, kind: "draw", content: { ...asRec(brick.content), shapePreset: "diamond", isContainer: false,
        style: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.09)", strokeWidth: 2 } } } as MeshBrick;
    }
    const isBoard   = brick.kind === "board_empty";
    const isSel     = selectedId === brick.id;
    const isEditing = editingBrickId === brick.id;
    const isConnSrc = connSrcId === brick.id;
    const c         = asRec(brick.content);
    const shapeP    = c.shapePreset as ShapePreset | undefined;
    const vecPts    = c.vectorPoints as { x: number; y: number }[] | undefined;
    const styleR    = asRec(c.style);
    const sStroke   = typeof styleR.stroke === "string" ? styleR.stroke : "#22d3ee";
    const sFill     = typeof styleR.fill   === "string" ? styleR.fill   : "rgba(34,211,238,0.07)";
    const sSW       = typeof styleR.strokeWidth === "number" ? styleR.strokeWidth : 2;
    const uKind     = typeof c.unifierKind === "string" ? c.unifierKind : null;
    const isUnifier = brick.kind === "text" || ((brick.kind === "portal" || brick.kind === "mirror") && !!uKind);
    const unifierKindFinal = uKind ?? (brick.kind === "mirror" ? "callout" : "text");
    const docBrick  = (isUnifier) ? toDocBrick(brick, unifierKindFinal) : null;
    const isShape     = (brick.kind === "draw" || brick.kind === "frame") && !!shapeP;
    const isDrawBrick = brick.kind === "draw";
    const isCont      = isBoard || !!c.isContainer;
    const kids        = isCont ? Object.values(state.bricksById).filter((b) => b.parentId === brick.id) : [];
    const isMultiSel  = selectedIds.has(brick.id);
    const isConnected = connectedBrickIds.has(brick.id);
    const ring        = (isSel || isMultiSel) ? " ring-2 ring-white/70" : isConnSrc ? " ring-2 ring-cyan-300" : "";

    // Magnet port dots rendered inside each brick when conn mode is active
    const magnetDots = toolMode === "conn" ? (
      <div className="pointer-events-none absolute inset-0 z-50">
        {ALL_PORTS.map((port) => {
          const style: React.CSSProperties = {
            position: "absolute",
            left: port === "left" ? 0 : port === "right" ? "100%" : "50%",
            top:  port === "top"  ? 0 : port === "bottom" ? "100%" : "50%",
            transform: "translate(-50%,-50%)",
          };
          const isSnap = snapTarget?.brickId === brick.id && snapTarget.port === port;
          const isSrc  = connSrcId === brick.id && connSrcPort === port;
          return (
            <div key={port} style={style}
              className={`pointer-events-auto rounded-full border-2 cursor-crosshair transition-all duration-100
                ${isSnap || isSrc
                  ? "h-4 w-4 border-white bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.7)]"
                  : "h-2.5 w-2.5 border-cyan-500 bg-slate-900/80 hover:h-3.5 hover:w-3.5 hover:border-cyan-300 hover:bg-cyan-400/60"}`}
              onMouseDown={(e) => { e.stopPropagation(); startConnFromPort(brick.id, port); }}
              onMouseUp={(e) => { e.stopPropagation(); if (connSrcId && connSrcId !== brick.id) finishConnAtPort(brick.id, port); }}
              onMouseEnter={() => { if (connSrcId && connSrcId !== brick.id) setSnapTarget({ brickId: brick.id, port }); }}
              onMouseLeave={() => setSnapTarget((s) => (s?.brickId === brick.id && s.port === port) ? null : s)}
            />
          );
        })}
      </div>
    ) : null;

    // ─ Board ─
    if (isBoard) {
      const collapsed = collapsedBoards.has(brick.id);
      const boardH = collapsed ? 28 : brick.size.h;
      const toggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedBoards((prev) => {
          const next = new Set(prev);
          next.has(brick.id) ? next.delete(brick.id) : next.add(brick.id);
          return next;
        });
      };
      return (
        <div
          key={brick.id}
          className={`group/board absolute rounded-xl border bg-cyan-950/10 transition-[height] duration-150${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: boardH,
            borderColor: isSel ? "rgba(255,255,255,0.5)" : "rgba(34,211,238,0.6)", borderWidth: 2,
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab", overflow: collapsed ? "hidden" : "visible" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
        >
          {/* Board header */}
          <div className="relative z-20 flex h-7 items-center justify-between border-b border-cyan-400/20 px-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200 select-none">
            <span className="truncate">{(asRec(brick.content).label as string) || "Board"}</span>
            <div className="flex items-center gap-1">
              <span className="opacity-20">{brick.id.slice(-4)}</span>
              <button
                type="button"
                className="ml-1 flex h-4 w-4 items-center justify-center rounded text-cyan-300 opacity-50 hover:opacity-100 hover:bg-cyan-400/20 transition-opacity"
                onClick={toggleCollapse}
                title={collapsed ? "Expandir" : "Minimizar"}
              >
                <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
              </button>
            </div>
          </div>
          {/* Children – positions are local to the board div */}
          {!collapsed && kids.map((child) => renderBrick(child))}
          {!collapsed && isSel && (
            <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50"
              onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />
          )}
          {/* Quick-add bar for selected board */}
          {isSel && !collapsed && (
            <div className="absolute -bottom-7 left-0 z-40 flex items-center gap-1 rounded-md border border-cyan-400/30 bg-slate-900/90 px-1.5 py-0.5 shadow-lg"
              onMouseDown={(e) => e.stopPropagation()}>
              <span className="mr-1 text-[8px] text-cyan-400/60">+ Añadir:</span>
              {BASIC_BRICKS.slice(0, 3).map((entry) => (
                <button key={entry.kind} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 40 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
              {CONTENT_BRICKS.slice(0, 2).map((entry, i) => (
                <button key={i} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 40 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
            </div>
          )}
          {magnetDots}
        </div>
      );
    }

    // ─ Shape (draw/frame with shapePreset) ─ also a container if isContainer flag is set
    if (isShape) {
      const collapsed    = collapsedBoards.has(brick.id);
      const shapeH       = collapsed ? 28 : brick.size.h;
      const shapeLabel   = typeof c.label === "string" ? c.label : "";
      const shapeStroke = sStroke;
      const shapeFill = isDrawBrick ? "transparent" : sFill;
      const toggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedBoards((prev) => { const n = new Set(prev); n.has(brick.id) ? n.delete(brick.id) : n.add(brick.id); return n; });
      };
      return (
        <div key={brick.id}
          className={`group absolute${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: shapeH,
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab", overflow: isCont && !collapsed ? "visible" : "hidden" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") startEdit(brick.id); }}
        >
          {!collapsed && <ShapeSvg preset={shapeP!} w={brick.size.w} h={brick.size.h} pts={vecPts} stroke={shapeStroke} fill={shapeFill} sw={sSW} />}
          {/* Header – only shown when collapsed OR when there's a label OR when it has children */}
          {(collapsed || shapeLabel || kids.length > 0) && (
            <div className="relative z-20 flex h-7 items-center justify-between border-b border-white/10 px-2 text-[10px] text-white/60 select-none"
              style={{ background: "rgba(0,0,0,0.28)", backdropFilter: "blur(4px)" }}>
              {isEditing ? (
                <input
                  autoFocus
                  type="text"
                  className="pointer-events-auto min-w-0 flex-1 bg-transparent text-[10px] text-white/90 outline-none border-b border-cyan-400/50 pr-1"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }}
                />
              ) : (
                <span className="truncate opacity-70">
                  <RichText content={shapeLabel || String(shapeP)} context={MESH_RICH_TEXT_CONTEXT} className="inline text-[10px] leading-none" />
                </span>
              )}
              <button type="button" className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/10"
                onClick={toggleCollapse} title={collapsed ? "Expandir" : "Minimizar"}>
                <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
              </button>
            </div>
          )}
          {/* Inline text centered in shape (like decision diamond) */}
          {!collapsed && (() => {
            const md = getMd(brick);
            const label = typeof c.label === "string" ? c.label : "";
            const hasText = md.trim() || (isEditing && !kids.length);
            if (!hasText && !isEditing) return null;
            return (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{ padding: `${Math.round(brick.size.h * 0.18)}px ${Math.round(brick.size.w * 0.18)}px`, zIndex: 10 }}>
                {isEditing && !label ? (
                  <div className="pointer-events-none w-full text-center text-[11px] leading-snug text-white/90 break-words drop-shadow-sm [&_*]:text-inherit">
                    <RichText content={md} context={MESH_RICH_TEXT_CONTEXT} className="inline" />
                  </div>
                ) : (
                  <div className="pointer-events-none w-full text-center text-[11px] leading-snug text-white/90 break-words drop-shadow-sm [&_*]:text-inherit">
                    <RichText content={md} context={MESH_RICH_TEXT_CONTEXT} className="inline" />
                  </div>
                )}
              </div>
            );
          })()}
          {!collapsed && isEditing && !shapeLabel && (
            <div
              className="absolute inset-0 z-20"
              style={{ padding: `${Math.round(brick.size.h * 0.18)}px ${Math.round(brick.size.w * 0.18)}px` }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="h-full w-full overflow-auto rounded bg-slate-950/75 px-1 py-0.5">
                <UnifiedTextBrick
                  id={`shape-text-${brick.id}`}
                  text={getMd(brick)}
                  onUpdate={(nextMd) => {
                    setState((cur) => {
                      const b = cur.bricksById[brick.id];
                      if (!b) return cur;
                      return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: setMd(b, nextMd) } };
                    });
                  }}
                  readonly={false}
                  documents={[]}
                  boards={[]}
                  activeBricks={[]}
                  users={[]}
                />
              </div>
            </div>
          )}
          {/* Children when container */}
          {isCont && !collapsed && kids.map((child) => renderBrick(child))}
          {/* Quick-add bar when selected container */}
          {isSel && isCont && !collapsed && (
            <div className="absolute -bottom-7 left-0 z-40 flex items-center gap-1 rounded-md border border-cyan-400/30 bg-slate-900/90 px-1.5 py-0.5 shadow-lg"
              onMouseDown={(e) => e.stopPropagation()}>
              <span className="mr-1 text-[8px] text-cyan-400/60">+ Añadir:</span>
              {BASIC_BRICKS.slice(0, 3).map((entry) => (
                <button key={entry.kind} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 36 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
            </div>
          )}
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {isSel && toolMode === "vec" && vecPts?.map((pt, i) => (
            <div key={i} className="absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full bg-yellow-300 ring-1 ring-black/60"
              style={{ left: pt.x * brick.size.w, top: pt.y * brick.size.h }}
              onMouseDown={(e) => startVecDrag(e, brick.id, i)} />
          ))}
          {magnetDots}
        </div>
      );
    }

    // ─ Raw draw area (no shape preset): transparent area, only border on hover/connected ─
    if (brick.kind === "draw" && !shapeP) {
      const isHoverRaw = hoveredRawDrawId === brick.id;
      const manualStrokes = Array.isArray(c.manualStrokes) ? (c.manualStrokes as Array<Array<{ x: number; y: number }>>) : [];
      const rawOutline = isConnected
        ? "2px solid rgba(34,211,238,0.55)"
        : isHoverRaw
          ? "1px solid rgba(34,211,238,0.35)"
          : "1px solid transparent";

      return (
        <div
          key={brick.id}
          className={`group absolute${ring}`}
          style={{
            left: brick.position.x,
            top: brick.position.y,
            width: brick.size.w,
            height: brick.size.h,
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab",
            outline: rawOutline,
            borderRadius: 10,
            background: "transparent",
          }}
          onMouseEnter={() => setHoveredRawDrawId(brick.id)}
          onMouseLeave={() => setHoveredRawDrawId((cur) => (cur === brick.id ? null : cur))}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
        >
          {manualStrokes.length > 0 && (
            <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${brick.size.w} ${brick.size.h}`}>
              {manualStrokes.map((strokePts, idx) => {
                if (!Array.isArray(strokePts) || strokePts.length < 2) return null;
                const d = strokePts
                  .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * brick.size.w).toFixed(1)},${(p.y * brick.size.h).toFixed(1)}`)
                  .join(" ");
                return (
                  <path
                    key={idx}
                    d={d}
                    fill="none"
                    stroke="#67e8f9"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                );
              })}
            </svg>
          )}
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
        </div>
      );
    }

    // ─ Portal (navigable link to another board/document) ─
    if (brick.kind === "portal" && !uKind) {
      const targetType = typeof c.targetType === "string" ? c.targetType as string : "mesh";
      const targetId   = typeof c.targetId   === "string" ? c.targetId   : "";
      const targetLabel = typeof c.targetLabel === "string" ? c.targetLabel : "";
      return (
        <div key={brick.id}
          className={`group absolute overflow-hidden rounded-xl border-2${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            borderColor: isSel ? "rgba(255,255,255,0.5)" : "rgba(59,130,246,0.55)",
            background: "rgba(15,23,42,0.92)",
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") startEdit(brick.id); }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-blue-500/20 bg-blue-950/50 px-2.5 select-none">
            <ExternalLink className="h-3 w-3 shrink-0 text-blue-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Portal</span>
            {targetLabel && <span className="ml-auto truncate text-[9px] text-blue-400/50">{targetLabel}</span>}
          </div>
          <div className="flex h-[calc(100%-28px)] flex-col items-center justify-center gap-2.5 p-4">
            {isEditing ? (
              <div className="flex w-full flex-col gap-2" onMouseDown={(e) => e.stopPropagation()}>
                <select className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground pointer-events-auto"
                  defaultValue={targetType}
                  onChange={(e) => setState((cur) => {
                    const b = cur.bricksById[brick.id]; if (!b) return cur;
                    return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), targetType: e.target.value } } } };
                  })}
                  onKeyDown={(e) => e.stopPropagation()}>
                  <option value="mesh">Mesh Board</option>
                  <option value="document">Documento</option>
                </select>
                <input autoFocus type="text" placeholder="Nombre del destino…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none pointer-events-auto"
                  value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }} />
                <input type="text" placeholder="ID (meshId / docId)…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={targetId}
                  onBlur={(e) => { const v = e.target.value.trim(); setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), targetId: v } } } }; }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
              </div>
            ) : targetId ? (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
                  <ExternalLink className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-center text-[11px] font-medium text-blue-200">{targetLabel || targetId.slice(0, 20)}</p>
                <p className="text-[9px] text-muted-foreground/50">{targetType === "mesh" ? "Mesh Board" : "Documento"}</p>
                <a href={targetType === "mesh" ? `/m/${targetId}` : `/d/${targetId}`}
                  className="pointer-events-auto mt-1 inline-flex items-center gap-1 rounded-md bg-blue-600/30 px-3 py-1 text-[10px] font-medium text-blue-300 hover:bg-blue-600/50 transition-colors"
                  onClick={(e) => e.stopPropagation()}>
                  Entrar <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </>
            ) : (
              <p className="text-center text-[10px] text-muted-foreground/40">Doble clic para configurar el portal</p>
            )}
          </div>
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
        </div>
      );
    }

    // ─ Mirror (read-only window into a brick from another document) ─
    if (brick.kind === "mirror" && !uKind) {
      const sourceId       = typeof c.sourceId       === "string" ? c.sourceId       : "";
      const sourceLabel    = typeof c.sourceLabel    === "string" ? c.sourceLabel    : "";
      const previewMd      = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";
      return (
        <div key={brick.id}
          className={`group absolute overflow-hidden rounded-xl border-2${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            borderColor: isSel ? "rgba(255,255,255,0.5)" : "rgba(168,85,247,0.55)",
            background: "rgba(15,23,42,0.92)",
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") startEdit(brick.id); }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-purple-500/20 bg-purple-950/50 px-2.5 select-none">
            <Eye className="h-3 w-3 shrink-0 text-purple-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-purple-300">Mirror</span>
            {sourceLabel && <span className="ml-auto truncate text-[9px] text-purple-400/50">{sourceLabel}</span>}
            <span className="ml-1 text-[7px] text-purple-400/30">read-only</span>
          </div>
          <div className="flex h-[calc(100%-28px)] flex-col overflow-hidden">
            {isEditing ? (
              <div className="flex flex-col gap-2 p-3" onMouseDown={(e) => e.stopPropagation()}>
                <input autoFocus type="text" placeholder="Nombre de la fuente…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none pointer-events-auto"
                  value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }} />
                <input type="text" placeholder="ID del brick fuente…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={sourceId}
                  onBlur={(e) => { const v = e.target.value.trim(); setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), sourceId: v } } } }; }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
                <textarea rows={3} placeholder="Preview markdown (cache local)…"
                  className="resize-none rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={previewMd}
                  onBlur={(e) => { const v = e.target.value; setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), previewMarkdown: v } } } }; }); }}
                  onKeyDown={(e) => e.stopPropagation()} />
              </div>
            ) : (previewMd || sourceId) ? (
              <div className="pointer-events-none overflow-auto p-3 opacity-80">
                {previewMd ? (
                  previewMd.split("\n").map((line, i) => (
                    <p key={i} className="text-[10px] leading-relaxed text-slate-300">{line || " "}</p>
                  ))
                ) : (
                  <p className="text-[10px] text-muted-foreground/50">Fuente: {sourceId.slice(0, 30)}</p>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-[10px] text-muted-foreground/40">Doble clic para configurar el mirror</p>
              </div>
            )}
          </div>
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
        </div>
      );
    }

    // ─ Text / Portal-with-unifierKind / Mirror-with-unifierKind (unified renderer) ─
    if (docBrick) {
      return (
        <div
          key={brick.id}
          className={`group absolute overflow-hidden transition-[outline-color] duration-100${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab",
            outline: isSel ? "2px solid rgba(255,255,255,0.5)" : isConnected ? "2px solid rgba(34,211,238,0.55)" : "1px solid transparent",
            borderRadius: 6 }}
          onMouseEnter={(e) => { if (!isSel && !isConnected) (e.currentTarget as HTMLElement).style.outlineColor = "rgba(34,211,238,0.35)"; }}
          onMouseLeave={(e) => { if (!isSel && !isConnected) (e.currentTarget as HTMLElement).style.outlineColor = "transparent"; }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => { if (isEditing) { e.stopPropagation(); return; } startDrag(e, brick.id); }}
          onDoubleClick={(e) => onBrickDblClick(e, brick.id)}
        >
          <div className={`h-full w-full overflow-auto ${isEditing ? "pointer-events-auto" : "pointer-events-none"}`}>
            <UnifiedBrickRenderer
              brick={docBrick}
              canEdit={isEditing}
              onUpdate={handleUnifierUpdate(brick.id)}
              documents={[]}
              boards={[]}
              activeBricks={[docBrick]}
              users={[]}
              isCompact
            />
          </div>
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
        </div>
      );
    }

    // ─ Generic fallback ─
    return (
      <div
        key={brick.id}
        className={`absolute rounded-md border bg-slate-900/70${ring}`}
        style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
          borderColor: "rgba(100,180,255,0.25)", borderWidth: 1,
          cursor: dragState?.brickId === brick.id ? "grabbing" : "grab" }}
        onClick={(e) => onBrickClick(e, brick.id)}
        onMouseDown={(e) => startDrag(e, brick.id)}
      >
        <div className="p-2">
          <p className="text-[10px] font-bold uppercase text-cyan-100">{brick.kind}</p>
          <p className="text-[9px] opacity-30">{brick.id.slice(-8)}</p>
        </div>
        {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
      </div>
    );
  }

  const rootBricks = Object.values(state.bricksById).filter((b) => !b.parentId);
  const anyDrag    = !!(dragState || resizeState || vecDragState || panDragState || selRect);

  return (
    <>
    <div className="flex h-full flex-col" style={{ userSelect: anyDrag ? "none" : undefined }}>
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 py-1.5">
        <span className="text-sm font-semibold text-foreground">Mesh</span>
        <span className="text-[10px] text-muted-foreground">rev {revision}</span>
        <div className="ml-auto flex items-center gap-2">
          {selectedConnId && <span className="text-[10px] text-muted-foreground">Doble clic en label de conector para editar con toolbar</span>}
          {(selectedId || selectedConnId || selectedIds.size > 0) && (
            <button type="button" onClick={() => {
              if (selectedIds.size > 0) {
                setState((c) => { let s = c; selectedIds.forEach((id) => { s = deleteBrick(s, id); }); return s; });
                setSelectedIds(new Set()); toast(`${selectedIds.size} eliminado(s).`, "success");
              } else {
                if (selectedId) { setState((c) => deleteBrick(c, selectedId)); setSelectedId(null); toast("Eliminado.", "success"); }
                if (selectedConnId) { setState((c) => deleteConn(c, selectedConnId)); setSelectedConnId(null); }
              }
            }} className="inline-flex h-7 items-center gap-1 rounded-md border border-red-500/40 bg-red-950/30 px-2 text-xs text-red-300 hover:bg-red-900/40">
              <Trash2 className="h-3 w-3" /> {selectedIds.size > 1 ? `${selectedIds.size} sel.` : "Eliminar"}
            </button>
          )}
          <button type="button" onClick={handleSave} disabled={isSaving || isLoading}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left toolbar ── */}
        <div className="flex w-[180px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card/80 py-2 text-[10px]">

          {/* Modos */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Modo</p>
            <div className="grid grid-cols-3 gap-1">
              {([
                ["select", "Select", <MousePointer className="h-3.5 w-3.5" />, "S"],
                ["pan",    "Pan",    <Hand          className="h-3.5 w-3.5" />, "H"],
                ["pen",    "Pen",    <Pencil        className="h-3.5 w-3.5" />, "P"],
                ["conn",   "Conn",   <Link2         className="h-3.5 w-3.5" />, "C"],
                ["vec",    "Vec",    <Edit3         className="h-3.5 w-3.5" />, ""],
              ] as [ToolMode, string, React.ReactNode, string][]).map(([m, label, icon, key]) => (
                <button key={m} type="button" title={`${label}${key ? ` (${key})` : ""}`}
                  onClick={() => { setToolMode(m); if (m !== "conn") setConnSrcId(null); }}
                  className={`flex h-8 flex-col items-center justify-center gap-0.5 rounded-lg text-[8px] transition-colors ${toolMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/20"}`}>
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            {toolMode === "conn" && (
              <select value={connPreset} onChange={(e) => setConnPreset(e.target.value as ConnStyle)}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-1.5 py-1 text-[9px] text-foreground">
                <option value="technical">─ Technical</option>
                <option value="dashed">- - Dashed</option>
                <option value="handdrawn">~ Handdrawn</option>
              </select>
            )}
          </section>

          <div className="mx-2 mb-2 h-px bg-border/50" />

          {/* Básicos */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Básicos</p>
            <div className="grid grid-cols-2 gap-1">
              {BASIC_BRICKS.map((entry, i) => (
                <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                  onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                  onClick={() => addMeta(entry)} />
              ))}
            </div>
          </section>

          <div className="mx-2 mb-2 h-px bg-border/50" />

          {/* Contenido */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Contenido</p>
            <div className="grid grid-cols-2 gap-1">
              {CONTENT_BRICKS.map((entry, i) => (
                <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                  onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                  onClick={() => addMeta(entry)} />
              ))}
            </div>
          </section>

          <div className="mx-2 mb-2 h-px bg-border/50" />

          {/* Formas */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Formas</p>
            <div className="grid grid-cols-3 gap-1">
              {SHAPES.map(({ preset, label }) => (
                <button key={preset} type="button" title={label} draggable
                  onClick={() => addShape(preset)}
                  onDragStart={(e) => onToolDragStart(e, { type: "shape", preset })}
                  className="flex flex-col items-center gap-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground">
                  <div className="h-[18px] w-[32px] relative">
                    <ShapeSvg preset={preset} w={32} h={18} stroke="currentColor" fill="none" sw={1.5} />
                  </div>
                  <span className="text-[7px] leading-none truncate max-w-[36px]">{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Pen status */}
          {toolMode === "pen" && (
            <div className="mx-2 mt-auto rounded-lg bg-purple-500/20 p-2 text-center text-[8px] text-purple-200">
              {recognizing ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : <Pencil className="mx-auto h-3 w-3" />}
              <p className="mt-1">{penStrokes.length > 0 ? `${penStrokes.length} trazos` : "Dibuja en el canvas"}</p>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div className="relative flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <div
              ref={canvasRef}
              className={`absolute inset-0 overflow-auto bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:20px_20px] ${toolMode === "pan" ? "cursor-grab" : toolMode === "pen" || toolMode === "conn" ? "cursor-crosshair" : selRect ? "cursor-crosshair" : ""}`}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { setActivePen(null); setDragState(null); setResizeState(null); setPanDragState(null); setSelRect(null); }}
              onClick={onCanvasClick}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
            >
              <div className="relative min-h-[1000px] min-w-[1800px]">
                {rootBricks.length === 0 && (
                  <div className="pointer-events-none absolute left-8 top-8 flex items-center gap-2 rounded border border-dashed border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground/60">
                    <AlertTriangle className="h-4 w-4" /> Arrastra del panel izquierdo · Lápiz (P) para iinkTS · Doble clic en brick para editar
                  </div>
                )}

                {/* Connections + pen strokes SVG overlay */}
                <svg className="pointer-events-none absolute inset-0 overflow-visible" style={{ width: "100%", height: "100%" }}>
                  <defs>
                    <marker id="arr-norm" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                      <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#22d3ee" opacity="0.9" />
                    </marker>
                    <marker id="arr-sel" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                      <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#ffffff" />
                    </marker>
                  </defs>
                  {Object.values(state.connectionsById).map((conn) => {
                    const src = state.bricksById[conn.cons[0]];
                    const tgt = state.bricksById[conn.cons[1]];
                    if (!src || !tgt) return null;
                    const sg = gPos(src.id); const tg = gPos(tgt.id);
                    const st = asRec(conn.style);
                    const stroke  = typeof st.stroke === "string" ? st.stroke : "#22d3ee";
                    const width   = typeof st.width  === "number" ? st.width  : 2;
                    const dashed  = st.pattern === "dashed";
                    const isSC    = selectedConnId === conn.id;
                    const cs      = isSC ? "#fff" : stroke;
                    const cw      = isSC ? width + 1 : width;
                    const srcH = collapsedBoards.has(src.id) ? 28 : src.size.h;
                    const tgtH = collapsedBoards.has(tgt.id) ? 28 : tgt.size.h;
                    const srcR = { x: sg.x, y: sg.y, w: src.size.w, h: srcH };
                    const tgtR = { x: tg.x, y: tg.y, w: tgt.size.w, h: tgtH };
                    const obs = Object.values(state.bricksById)
                      .filter((b) => b.id !== src.id && b.id !== tgt.id)
                      .map((b) => { const g = gPos(b.id); return { x: g.x, y: g.y, w: b.size.w, h: b.size.h }; });
                    const sp = typeof st.srcPort === "string" ? st.srcPort as Port : undefined;
                    const tp = typeof st.tgtPort === "string" ? st.tgtPort as Port : undefined;
                    const routePts = buildConnPolyline(srcR, tgtR, obs, sp, tp);
                    const d = smoothPoly(routePts, CORNER_R);
                    const labelPt = pointAtPolylineFraction(routePts, 0.5);
                    const markerId = isSC ? "url(#arr-sel)" : "url(#arr-norm)";
                    const connLabel = typeof st.label === "string" ? st.label : "";
                    const isEditingConnLabel = editingConnId === conn.id;
                    const labelW = isEditingConnLabel ? 260 : 180;
                    const labelH = isEditingConnLabel ? 82 : 28;
                    const labelLift = Math.max(2, labelH * 0.08);
                    return (
                      <g key={conn.id} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); setSelectedConnId(conn.id); setSelectedId(null); setSelectedIds(new Set()); }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedConnId(conn.id);
                          setEditingConnId(conn.id);
                          if (!connLabel) {
                            setState((cur) => {
                              const co = cur.connectionsById[conn.id];
                              if (!co) return cur;
                              return {
                                ...cur,
                                connectionsById: {
                                  ...cur.connectionsById,
                                  [conn.id]: { ...co, style: { ...asRec(co.style), label: "" } },
                                },
                              };
                            });
                          }
                        }}>
                        {/* fat transparent hit area */}
                        <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke" }} />
                        <path d={d} fill="none" stroke={cs} strokeWidth={cw}
                          strokeDasharray={dashed ? "6 4" : undefined}
                          markerEnd={markerId} opacity={0.9} />
                        {(connLabel || isEditingConnLabel) && (
                          <foreignObject
                            x={labelPt.x - labelW / 2}
                            y={labelPt.y - labelH / 2 - labelLift}
                            width={labelW}
                            height={labelH}
                            style={{ pointerEvents: "auto", overflow: "visible" }}
                          >
                            {isEditingConnLabel ? (
                              <div className="rounded border border-cyan-400/50 bg-slate-950/85 p-1 shadow-xl"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}>
                                <UnifiedTextBrick
                                  id={`conn-label-${conn.id}`}
                                  text={connLabel}
                                  onUpdate={(nextLabel) => {
                                    setState((cur) => {
                                      const co = cur.connectionsById[conn.id];
                                      if (!co) return cur;
                                      return {
                                        ...cur,
                                        connectionsById: {
                                          ...cur.connectionsById,
                                          [conn.id]: { ...co, style: { ...asRec(co.style), label: nextLabel } },
                                        },
                                      };
                                    });
                                  }}
                                  readonly={false}
                                  documents={[]}
                                  boards={[]}
                                  activeBricks={[]}
                                  users={[]}
                                />
                              </div>
                            ) : (
                              <div className="flex w-full justify-center" style={{ userSelect: "none" }} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => {
                                e.stopPropagation();
                                setSelectedConnId(conn.id);
                                setEditingConnId(conn.id);
                              }}>
                                <div className={`max-w-[180px] truncate rounded px-1.5 py-0.5 text-[10px] leading-tight ${isSC ? "text-white" : "text-slate-300"} bg-slate-950/55 border border-white/10 shadow-sm [&_*]:text-inherit`}>
                                  <RichText content={connLabel} context={MESH_RICH_TEXT_CONTEXT} className="inline" />
                                </div>
                              </div>
                            )}
                          </foreignObject>
                        )}
                      </g>
                    );
                  })}

                  {/* Ghost connection line */}
                  {toolMode === "conn" && connSrcId && pointer && (() => {
                    const src = state.bricksById[connSrcId];
                    if (!src) return null;
                    const sg = gPos(connSrcId);
                    const st = connStyle(connPreset);
                    const srcH2 = collapsedBoards.has(connSrcId) ? 28 : src.size.h;
                    const e = connSrcPort
                      ? portAbsPos(sg.x, sg.y, src.size.w, srcH2, connSrcPort)
                      : edgeExit(sg.x, sg.y, src.size.w, srcH2, pointer.x, pointer.y);
                    const end = snapTarget
                      ? (() => { const b = state.bricksById[snapTarget.brickId]; if (!b) return pointer; const g = gPos(snapTarget.brickId); return portAbsPos(g.x, g.y, b.size.w, b.size.h, snapTarget.port); })()
                      : pointer;
                    return <>
                      <line x1={e.x} y1={e.y} x2={end.x} y2={end.y} stroke={String(st.stroke)} strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
                      {snapTarget && <circle cx={end.x} cy={end.y} r={7} fill="#22d3ee" opacity={0.7} />}
                    </>;
                  })()}

                  {/* Pen strokes */}
                  {toolMode === "pen" && <>
                    {penStrokes.map((s, i) => <path key={i} d={strokeToPath(s)} fill="none" stroke="#a78bfa" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.65} />)}
                    {activePen && activePen.length > 1 && <path d={strokeToPath({ points: activePen })} fill="none" stroke="#c4b5fd" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
                  </>}

                  {/* Rubber-band selection rect */}
                  {selRect && (
                    <rect
                      x={Math.min(selRect.x1, selRect.x2)} y={Math.min(selRect.y1, selRect.y2)}
                      width={Math.abs(selRect.x2 - selRect.x1)} height={Math.abs(selRect.y2 - selRect.y1)}
                      fill="rgba(34,211,238,0.06)" stroke="rgba(34,211,238,0.5)"
                      strokeWidth={1} strokeDasharray="4 2" style={{ pointerEvents: "none" }}
                    />
                  )}
                </svg>

                {/* Root bricks */}
                {rootBricks.map((b) => renderBrick(b))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex shrink-0 items-center gap-4 border-t border-border bg-card/40 px-4 py-1 text-[10px] text-muted-foreground">
        <span>Bricks: {Object.keys(state.bricksById).length}</span>
        <span>Conns: {Object.keys(state.connectionsById).length}</span>
        {updatedAt && <span>Saved: {new Date(updatedAt).toLocaleTimeString()}</span>}
        {toolMode === "vec"  && <span className="text-yellow-400">● Vec edit</span>}
        {toolMode === "conn" && <span className="text-cyan-400">● {connSrcId ? "Conectando…" : "Conn"}</span>}
        {toolMode === "pen"  && <span className="text-purple-400">● Pen{recognizing ? " (reconociendo…)" : ""}</span>}
        {selectedIds.size > 1 && <span className="text-white/50">● {selectedIds.size} sel.</span>}
        {(selectedId || selectedConnId || selectedIds.size > 0) && <span className="ml-auto opacity-40">Del = eliminar</span>}
      </div>
    </div>

    {/* ── Entity selector modal (portal / mirror double-click) ──────────────────────── */}
    {activeTeamId && accessToken && (
      <EntitySelectorModal
        isOpen={selectorModalBrickId !== null}
        onClose={() => setSelectorModalBrickId(null)}
        teamId={activeTeamId}
        accessToken={accessToken}
        allowedTypes={selectorModalBrickKind === "portal" ? ["mesh", "board", "document", "card"] : ["document", "card"]}
        onSelect={(result: EntitySelectorResult) => {
          if (!selectorModalBrickId) return;
          setState((cur) => {
            const b = cur.bricksById[selectorModalBrickId];
            if (!b) return cur;
            let updated: MeshBrick;
            if (selectorModalBrickKind === "portal") {
              updated = { ...b, content: { ...asRec(b.content),
                targetId: result.id,
                targetType: result.type,
                targetLabel: result.label,
              } };
            } else {
              updated = { ...b, content: { ...asRec(b.content),
                sourceId: result.id,
                sourceLabel: result.label + (result.context ? ` (${result.context})` : ""),
              } };
            }
            return { ...cur, bricksById: { ...cur.bricksById, [selectorModalBrickId]: updated } };
          });
          setSelectorModalBrickId(null);
        }}
      />
    )}
    </>
  );
}
