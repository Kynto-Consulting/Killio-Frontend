"use client";

// ─── Mesh Board – Miro/Excalidraw-style canvas ────────────────────────────────
// Modes: select · pan · pen (iinkTS → bricks)
// Features: inline editing, delete, diamond-decision, board-relative children,
//   reparent drag-drop, resize, vector edit, connections, realtime (Ably).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle, BarChart2, CheckSquare, ChevronDown, Code2,
  Bot, Copy, Edit3, ExternalLink, Eye, FileText, Film, GitBranch, Hand, History,
  Download, Image, Layers, LayoutGrid, Link2, Loader2, MessageSquare,
  Minus, MoreHorizontal, MousePointer, Pencil, Save, Send, Sparkles, Square, Trash2, Type, Wand2, X,
  Share2, ZoomIn, ZoomOut, Grid3X3, Maximize2,
} from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import { UnifiedTextBrick } from "@/components/bricks/unified-text-brick";
import { RichText } from "@/components/ui/rich-text";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import { useBoardPresence } from "@/hooks/useBoardPresence";
import { DocumentBrick } from "@/lib/api/documents";
import type { ResolverContext } from "@/lib/reference-resolver";
import { EntitySelectorModal, type EntitySelectorResult } from "@/components/ui/entity-selector-modal";
import { PenToolbar } from "@/components/ui/pen-toolbar";
import { BoardChatDrawer } from "@/components/ui/board-chat-drawer";
import { MeshShareModal } from "@/components/ui/mesh-share-modal";
import { getUserAvatarUrl } from "@/lib/gravatar";
import {
  MeshBrick, MeshBrickKind, MeshConnection, MeshState,
  getBoard, getMesh, updateMeshState, buildMeshAiContext, streamAiChat,
} from "@/lib/api/contracts";
import { getAblyClient } from "@/lib/ably";
import { getDocument } from "@/lib/api/documents";
import { toast } from "@/lib/toast";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────

type ToolMode = "select" | "pan" | "pen" | "conn" | "vec";
type Port = "top" | "right" | "bottom" | "left";

type ShapePreset =
  | "rect" | "rounded-rect" | "circle" | "ellipse" | "diamond"
  | "triangle" | "hexagon" | "star" | "arrow" | "note" | "frame-vector" | "flow-terminator";

type ConnStyle = "technical" | "dashed" | "handdrawn" | "bezier" | "curved";

type DragState    = { brickId: string; startMouse: { x: number; y: number }; startPosition: { x: number; y: number }; originalParentId: string | null };
type ResizeState  = { brickId: string; startMouse: { x: number; y: number }; startSize: { w: number; h: number } };
type VecDragState = { brickId: string; pointIndex: number; startMouse: { x: number; y: number } };
type PanDragState = { startMouse: { x: number; y: number }; startViewport: { x: number; y: number } };
type PinchGestureState = {
  startDistance: number;
  startViewport: { x: number; y: number; zoom: number };
  centerScreen: { x: number; y: number };
};
type PenPoint     = { x: number; y: number; t: number };
type PenStroke    = { points: PenPoint[]; color?: string; width?: number };

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

function mkPreviewBrick(idSeed: string, kind: string, markdown: string, contentOverride?: Record<string, unknown> | null): DocumentBrick {
  const safeKind = kind.trim() || "text";
  const content = contentOverride && typeof contentOverride === "object"
    ? { ...contentOverride, kind: typeof contentOverride.kind === "string" ? contentOverride.kind : safeKind }
    : { kind: safeKind, markdown, text: markdown };
  return {
    id: `preview_${idSeed}`,
    documentId: `preview:${idSeed}`,
    kind: safeKind,
    position: 0,
    content,
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

function polylineLength(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++)
    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return len;
}

type AnchorNorm = { x: number; y: number };

function resolveConnEndpoint(
  rect: { x: number; y: number; w: number; h: number },
  port: Port | undefined,
  preset: ShapePreset | undefined,
  anchor: AnchorNorm | undefined,
  fallback: { x: number; y: number },
  vecPts?: { x: number; y: number }[],  // user-modified normalized vec points for this brick
): { x: number; y: number; nx: number; ny: number } {
  if (anchor) {
    const ax = rect.x + anchor.x * rect.w, ay = rect.y + anchor.y * rect.h;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const ddx = ax - cx, ddy = ay - cy, dlen = Math.hypot(ddx, ddy) || 1;
    return { x: ax, y: ay, nx: ddx / dlen, ny: ddy / dlen };
  }
  if (port) return shapePortAbsPos(rect.x, rect.y, rect.w, rect.h, preset, port, vecPts);
  return shapeEdgeExit(rect.x, rect.y, rect.w, rect.h, preset, fallback.x, fallback.y, vecPts);
}

type VecPts = { x: number; y: number }[];

function buildConnPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: Array<{ x: number; y: number; w: number; h: number }>,
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): string {
  return smoothPoly(buildConnPolyline(srcRect, tgtRect, obs, srcPort, tgtPort, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts), CORNER_R);
}

function buildConnPolyline(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: Array<{ x: number; y: number; w: number; h: number }>,
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): Array<{ x: number; y: number }> {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const s1 = { x: e1.x + e1.nx * STUB, y: e1.y + e1.ny * STUB };
  const s2 = { x: e2.x + e2.nx * STUB, y: e2.y + e2.ny * STUB };

  // Direct routes: HV and VH
  const hvPts: Array<{ x: number; y: number }> = [e1, s1, { x: s2.x, y: s1.y }, s2, e2];
  const vhPts: Array<{ x: number; y: number }> = [e1, s1, { x: s1.x, y: s2.y }, s2, e2];
  const hvSc = collisionScore(hvPts, obs), vhSc = collisionScore(vhPts, obs);
  // Early exit — skip bypass generation if a direct route is already clean
  if (hvSc === 0 && vhSc === 0) return polylineLength(hvPts) <= polylineLength(vhPts) ? hvPts : vhPts;
  if (hvSc === 0) return hvPts;
  if (vhSc === 0) return vhPts;

  // Both blocked: try corner-hugging bypass routes around each obstacle
  const M = 36;
  let best = hvSc <= vhSc ? hvPts : vhPts;
  let bestSc = Math.min(hvSc, vhSc), bestLen = polylineLength(best);

  const consider = (cand: Array<{ x: number; y: number }>) => {
    const cs = collisionScore(cand, obs), cl = polylineLength(cand);
    if (cs < bestSc || (cs === bestSc && cl < bestLen)) { best = cand; bestSc = cs; bestLen = cl; }
  };

  for (const ob of obs) {
    const top = ob.y - M, bot = ob.y + ob.h + M;
    const lft = ob.x - M,  rgt = ob.x + ob.w + M;
    // Simple axis-aligned detours
    consider([e1, s1, { x: s1.x, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: s2.y }, s2, e2]);
    // Corner-hugging routes (reliable for large obstacles like draw bricks / boards)
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: top }, { x: lft, y: top }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: top }, { x: rgt, y: top }, { x: rgt, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: lft, y: bot }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: rgt, y: bot }, { x: rgt, y: s2.y }, s2, e2]);
  }
  return best;
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

/** Analytical ellipse exit: ray from (cx,cy) in direction (dx,dy) hitting ellipse with semi-axes (a,b). */
function ellipseExit(
  cx: number, cy: number, a: number, b: number,
  dx: number, dy: number,
): { x: number; y: number; nx: number; ny: number } {
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: cx, y: cy - b, nx: 0, ny: -1 };
  const ndx = dx / len, ndy = dy / len;
  const t = 1 / Math.sqrt((ndx / a) ** 2 + (ndy / b) ** 2);
  const ex = cx + ndx * t, ey = cy + ndy * t;
  // Cardinal-snap outward normal
  const nx = Math.abs(ndx) >= Math.abs(ndy) ? (ndx > 0 ? 1 : -1) : 0;
  const ny = Math.abs(ndx) >= Math.abs(ndy) ? 0 : (ndy > 0 ? 1 : -1);
  return { x: ex, y: ey, nx, ny };
}

/** Ray–polygon intersection. Returns first point where ray (cx,cy)→(dx,dy) exits the polygon. */
function rayPolygonExit(
  cx: number, cy: number,
  pts: Array<{ x: number; y: number }>,
  dx: number, dy: number,
): { x: number; y: number; nx: number; ny: number } {
  const n = pts.length;
  let bestT = Infinity, bestX = cx, bestY = cy, bestNx = 0, bestNy = -1;
  for (let i = 0; i < n; i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    const edx = B.x - A.x, edy = B.y - A.y;
    const denom = edx * dy - edy * dx;
    if (Math.abs(denom) < 1e-10) continue;
    const ox = cx - A.x, oy = cy - A.y;
    const u = (ox * dy - oy * dx) / denom;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const t = (ox * edy - oy * edx) / denom;
    if (t < 1e-6 || t >= bestT) continue;
    bestT = t; bestX = cx + t * dx; bestY = cy + t * dy;
    const el = Math.hypot(edx, edy) || 1;
    let nx = edy / el, ny = -edx / el;
    if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
    bestNx = nx; bestNy = ny;
  }
  return { x: bestX, y: bestY, nx: bestNx, ny: bestNy };
}

/** Where a line from brick center exits its actual shape border (polygon-aware). */
function shapeEdgeExit(
  bx: number, by: number, bw: number, bh: number,
  preset: ShapePreset | undefined,
  tcx: number, tcy: number,
  customPts?: { x: number; y: number }[],  // user-modified normalized vec points
): { x: number; y: number; nx: number; ny: number } {
  if (preset === "circle" || preset === "ellipse")
    return ellipseExit(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, tcx - (bx + bw / 2), tcy - (by + bh / 2));
  if (preset === "flow-terminator") {
    const r = Math.min(bw, bh) / 2;
    return ellipseExit(bx + bw / 2, by + bh / 2, r, r, tcx - (bx + bw / 2), tcy - (by + bh / 2));
  }
  // Prefer user-modified vec points, fall back to preset template, then bounding-box
  const rawPts = customPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  if (!rawPts) return edgeExit(bx, by, bw, bh, tcx, tcy);
  const cx = bx + bw / 2, cy = by + bh / 2;
  const dx = tcx - cx, dy = tcy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: cx, y: cy - bh / 2, nx: 0, ny: -1 };
  const result = rayPolygonExit(cx, cy, rawPts.map(p => ({ x: bx + p.x * bw, y: by + p.y * bh })), dx / len, dy / len);
  const nx = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0;
  const ny = Math.abs(dx) >= Math.abs(dy) ? 0 : (dy > 0 ? 1 : -1);
  return { x: result.x, y: result.y, nx, ny };
}

/** Magnet port position on the actual shape border (polygon-aware). */
function shapePortAbsPos(
  gx: number, gy: number, bw: number, bh: number,
  preset: ShapePreset | undefined,
  port: Port,
  customPts?: { x: number; y: number }[],  // user-modified normalized vec points
): { x: number; y: number; nx: number; ny: number } {
  const dirs: Record<Port, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
  const [dx, dy] = dirs[port];
  if (preset === "circle" || preset === "ellipse")
    return { ...ellipseExit(gx + bw / 2, gy + bh / 2, bw / 2, bh / 2, dx, dy), nx: dx, ny: dy };
  if (preset === "flow-terminator") {
    const r = Math.min(bw, bh) / 2;
    return { ...ellipseExit(gx + bw / 2, gy + bh / 2, r, r, dx, dy), nx: dx, ny: dy };
  }
  const rawPts = customPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  if (!rawPts) return portAbsPos(gx, gy, bw, bh, port);
  const result = rayPolygonExit(gx + bw / 2, gy + bh / 2, rawPts.map(p => ({ x: gx + p.x * bw, y: gy + p.y * bh })), dx, dy);
  return { x: result.x, y: result.y, nx: dx, ny: dy };
}

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
  // Fixed viewBox preserves 1:1 mapping so dots and polygon always align.
  // overflow:visible lets points dragged outside the brick bounds render cleanly.
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0"
      style={{ overflow: "visible" }}>
      <polygon points={pStr} stroke={stroke} fill={fill} strokeWidth={sw} />
    </svg>
  );
}


function defaultMeshState(): MeshState {
  return { version: "1.0.0", viewport: { x: 0, y: 0, zoom: 1 }, rootOrder: [], bricksById: {}, connectionsById: {} };
}

function connStyle(preset: ConnStyle): Record<string, unknown> {
  if (preset === "dashed")    return { stroke: "#7dd3fc", width: 2,   pattern: "dashed", connType: "technical" };
  if (preset === "handdrawn") return { stroke: "#c4b5fd", width: 2.5, pattern: "solid",  connType: "handdrawn" };
  if (preset === "bezier")    return { stroke: "#6ee7b7", width: 2,   pattern: "solid",  connType: "bezier"    };
  if (preset === "curved")    return { stroke: "#fbbf24", width: 2,   pattern: "solid",  connType: "curved"    };
  return                             { stroke: "#22d3ee", width: 2,   pattern: "solid",  connType: "technical" };
}

/** Deterministic pseudo-random based on string seed. */
function seedRand(seed: string, i: number): number {
  let h = 5381;
  for (let j = 0; j < seed.length; j++) h = (h * 33 ^ seed.charCodeAt(j)) >>> 0;
  h = (h * 1664525 + i * 1013904223) >>> 0;
  return (h / 4294967296);
}

/** Hand-drawn wavy path using cubic beziers with seeded offsets. */
function handDrawnPath(pts: Array<{ x: number; y: number }>, seed: string): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const px = -dy / len, py = dx / len;
    const amp = Math.min(6, len * 0.12);
    const w1 = (seedRand(seed, i * 4)     - 0.5) * 2 * amp;
    const w2 = (seedRand(seed, i * 4 + 1) - 0.5) * 2 * amp;
    const cp1x = (a.x + dx / 3 + px * w1).toFixed(1);
    const cp1y = (a.y + dy / 3 + py * w1).toFixed(1);
    const cp2x = (a.x + dx * 2 / 3 + px * w2).toFixed(1);
    const cp2y = (a.y + dy * 2 / 3 + py * w2).toFixed(1);
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

/** Cubic bezier from src edge to tgt edge with explicit control points. */
function buildBezierPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  cp1?: { x: number; y: number },
  cp2?: { x: number; y: number },
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): { d: string; e1x: number; e1y: number; e2x: number; e2y: number; cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const stubLen = Math.max(60, Math.hypot(e2.x - e1.x, e2.y - e1.y) * 0.35);
  const defaultCp1 = cp1 ?? { x: e1.x + e1.nx * stubLen, y: e1.y + e1.ny * stubLen };
  const defaultCp2 = cp2 ?? { x: e2.x + e2.nx * stubLen, y: e2.y + e2.ny * stubLen };
  const d = `M${e1.x.toFixed(1)},${e1.y.toFixed(1)} C${defaultCp1.x.toFixed(1)},${defaultCp1.y.toFixed(1)} ${defaultCp2.x.toFixed(1)},${defaultCp2.y.toFixed(1)} ${e2.x.toFixed(1)},${e2.y.toFixed(1)}`;
  return { d, e1x: e1.x, e1y: e1.y, e2x: e2.x, e2y: e2.y, cp1: defaultCp1, cp2: defaultCp2 };
}

/** Organic curved path (quadratic bezier through midpoint). */
function buildCurvedPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): string {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const mx = (e1.x + e2.x) / 2 + (e2.y - e1.y) * 0.25;
  const my = (e1.y + e2.y) / 2 - (e2.x - e1.x) * 0.25;
  return `M${e1.x.toFixed(1)},${e1.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${e2.x.toFixed(1)},${e2.y.toFixed(1)}`;
}

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

type MeshBoardPageProps = {
  mobileMode?: boolean;
};

export default function MeshBoardPage({ mobileMode = false }: MeshBoardPageProps) {
  const params  = useParams<{ meshId: string }>();
  const meshId  = params?.meshId;
  const { accessToken, activeTeamId, user } = useSession();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const presenceMembers = useBoardPresence(meshId ?? null, user, accessToken);

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
  const [connSrcAnchor,  setConnSrcAnchor]  = useState<AnchorNorm | null>(null);
  const [connPreset,     setConnPreset]     = useState<ConnStyle>("technical");
  const [toolbarPanel,   setToolbarPanel]   = useState<"mode" | "basics" | "content" | "shapes" | "conn" | "status" | null>(null);

  // drag state
  const [dragState,    setDragState]    = useState<DragState | null>(null);
  const [resizeState,  setResizeState]  = useState<ResizeState | null>(null);
  const [vecDragState, setVecDragState] = useState<VecDragState | null>(null);
  const [panDragState, setPanDragState] = useState<PanDragState | null>(null);
  const [selRect,      setSelRect]      = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Ref mirrors selRect so event-handler closures always see the latest value (avoids stale-closure bug in onMouseMove/onMouseUp)
  const selRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pointer,      setPointer]      = useState<{ x: number; y: number } | null>(null);

  // pen state
  const [penStrokes,    setPenStrokes]    = useState<PenStroke[]>([]);
  const [activePen,     setActivePen]     = useState<PenPoint[] | null>(null);
  const [recognizing,   setRecognizing]   = useState(false);
  const [penColor, setPenColor] = useState<string>("#ffffff");
  const [penStrokeWidth, setPenStrokeWidth] = useState<number>(2);
  const [collapsedBoards, setCollapsedBoards] = useState<Set<string>>(new Set());
  const [hoveredRawDrawId, setHoveredRawDrawId] = useState<string | null>(null);
  const [connSrcPort,  setConnSrcPort]  = useState<Port | null>(null);
  const [snapTarget,   setSnapTarget]   = useState<{ brickId: string; port: Port } | null>(null);
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const [showGrid,     setShowGrid]     = useState(true);
  // bezier cp drag: { connId, cp: 1|2, startMouse, startCp }
  const [bezierCpDrag, setBezierCpDrag] = useState<{ connId: string; cp: 1 | 2; startMouse: { x: number; y: number }; startCp: { x: number; y: number } } | null>(null);
  const penTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penStrokesRef  = useRef<PenStroke[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<PinchGestureState | null>(null);

  // Restore pen settings from localStorage safely on client.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedColor = window.localStorage.getItem("mesh:pen:color");
    const storedWidth = window.localStorage.getItem("mesh:pen:width");
    if (storedColor) setPenColor(storedColor);
    const parsed = storedWidth ? Number.parseFloat(storedWidth) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) setPenStrokeWidth(parsed);
  }, []);

  // Persist pen settings to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mesh:pen:color", penColor);
    window.localStorage.setItem("mesh:pen:width", penStrokeWidth.toString());
  }, [penColor, penStrokeWidth]);

  useEffect(() => {
    if (!mobileMode) return;
    setToolMode("pan");
  }, [mobileMode]);

  // Block browser-level pinch/ctrl+scroll zoom over the canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

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
        const vp = asRec(s.state.viewport);
        const vx = typeof vp.x === "number" ? vp.x : 0;
        const vy = typeof vp.y === "number" ? vp.y : 0;
        const vz = typeof vp.zoom === "number" && vp.zoom > 0 ? vp.zoom : 1;
        setViewport({ x: vx, y: vy, zoom: vz });
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
    const vp = asRec(ns.viewport);
    const vx = typeof vp.x === "number" ? vp.x : 0;
    const vy = typeof vp.y === "number" ? vp.y : 0;
    const vz = typeof vp.zoom === "number" && vp.zoom > 0 ? vp.zoom : 1;
    setViewport({ x: vx, y: vy, zoom: vz });
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

    const payloadState: MeshState = {
      ...nextState,
      viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    };
    const snapshotHash = JSON.stringify(payloadState);
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const s = await updateMeshState(meshId, { state: payloadState, expectedRevision: revisionRef.current }, accessToken);
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
  }, [meshId, accessToken, viewport.x, viewport.y, viewport.zoom]);

  // ── Canvas coords ────────────────────────────────────────────────────────────
  const toCanvas = useCallback((cx: number, cy: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sx = cx - r.left;
    const sy = cy - r.top;
    return {
      x: (sx - viewport.x) / viewport.zoom,
      y: (sy - viewport.y) / viewport.zoom,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  const fromEv = useCallback((e: { clientX: number; clientY: number }) => toCanvas(e.clientX, e.clientY), [toCanvas]);

  const onCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    setViewport((current) => {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = Math.max(0.2, Math.min(2.8, current.zoom * zoomFactor));
      const worldX = (sx - current.x) / current.zoom;
      const worldY = (sy - current.y) / current.zoom;
      return {
        x: sx - worldX * nextZoom,
        y: sy - worldY * nextZoom,
        zoom: nextZoom,
      };
    });
  }, []);

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileMode || e.pointerType !== "touch") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = touchPointersRef.current;
    next.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (next.size === 1) {
      pinchStateRef.current = null;
      setPanDragState({
        startMouse: { x: e.clientX, y: e.clientY },
        startViewport: { x: viewport.x, y: viewport.y },
      });
      return;
    }

    if (next.size === 2) {
      setPanDragState(null);
      const [p1, p2] = Array.from(next.values());
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      pinchStateRef.current = {
        startDistance: Math.max(1, Math.hypot(dx, dy)),
        startViewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
        centerScreen: { x: centerX, y: centerY },
      };
    }
  }, [mobileMode, viewport.x, viewport.y, viewport.zoom]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileMode || e.pointerType !== "touch") return;
    const next = touchPointersRef.current;
    if (!next.has(e.pointerId)) return;
    next.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (next.size >= 2) {
      const pinch = pinchStateRef.current;
      if (!pinch) return;
      const [p1, p2] = Array.from(next.values());
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const ratio = distance / pinch.startDistance;
      const nextZoom = Math.max(0.2, Math.min(2.8, pinch.startViewport.zoom * ratio));
      const worldX = (pinch.centerScreen.x - pinch.startViewport.x) / pinch.startViewport.zoom;
      const worldY = (pinch.centerScreen.y - pinch.startViewport.y) / pinch.startViewport.zoom;
      setViewport({
        x: pinch.centerScreen.x - worldX * nextZoom,
        y: pinch.centerScreen.y - worldY * nextZoom,
        zoom: nextZoom,
      });
      return;
    }

    if (next.size === 1 && panDragState) {
      setViewport({
        x: panDragState.startViewport.x + (e.clientX - panDragState.startMouse.x),
        y: panDragState.startViewport.y + (e.clientY - panDragState.startMouse.y),
        zoom: viewport.zoom,
      });
    }
  }, [mobileMode, panDragState, viewport.zoom]);

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileMode || e.pointerType !== "touch") return;
    const next = touchPointersRef.current;
    next.delete(e.pointerId);

    if (next.size === 0) {
      pinchStateRef.current = null;
      setPanDragState(null);
      return;
    }

    if (next.size === 1) {
      pinchStateRef.current = null;
      const [remaining] = Array.from(next.values());
      setPanDragState({
        startMouse: { x: remaining.x, y: remaining.y },
        startViewport: { x: viewport.x, y: viewport.y },
      });
    }
  }, [mobileMode, viewport.x, viewport.y]);

  const gPos = useCallback((id: string) => resolveGlobal(state.bricksById, id), [state.bricksById]);

  // Phase 1: Context for mentions resolution inside mesh
  const MESH_CONTEXT = useMemo<ResolverContext>(() => ({
    documents: [],
    boards: [],
    users: [],
    activeBricks: [],
  }), []);

  // Phase 2: Build AI context summary from mesh state
  const meshAiContext = useMemo(() => buildMeshAiContext(state), [state]);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [meshAiTab, setMeshAiTab] = useState<"copilot" | "history">("copilot");
  const [meshAiInput, setMeshAiInput] = useState("");
  const [meshAiLoading, setMeshAiLoading] = useState(false);
  const [meshAiMessages, setMeshAiMessages] = useState<Array<{
    id: number;
    role: "user" | "bot";
    content: string;
    loading?: boolean;
    timestamp: string;
  }>>([]);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"copilot" | "chat" | "activity">("chat");
  const aiAbortRef = useRef<(() => void) | null>(null);
  const [portalPreview, setPortalPreview] = useState<{ url: string; title: string } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const portalHydrationInFlightRef = useRef<Set<string>>(new Set());
  const portalHydrationAttemptRef = useRef<Record<string, string>>({});
  const portalScreenshotInFlightRef = useRef<Set<string>>(new Set());
  const portalScreenshotAttemptRef = useRef<Record<string, string>>({});
  // Live list of portals to refresh periodically — updated from state without restarting the interval
  const portalsForRefreshRef = useRef<Array<{ brickId: string; portalHref: string }>>([]);
  const floatingToolbarRef = useRef<HTMLDivElement | null>(null);

  const buildPortalHref = useCallback((
    targetType: string,
    targetId: string,
    opts?: { layout?: boolean },
  ) => {
    if (!targetId) return "";
    const layoutEnabled = opts?.layout ?? true;
    const base = targetType === "mesh" ? `/m/${targetId}` : targetType === "board" ? `/b/${targetId}` : `/d/${targetId}`;
    if (layoutEnabled) return base;
    const params = new URLSearchParams();
    params.set("layout", "false");
    return `${base}?${params.toString()}`;
  }, []);

  const buildPortalFallbackImageDataUrl = useCallback((
    title: string,
    subtitle: string,
    targetType: string,
  ): string => {
    const esc = (value: string) => value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const safeTitle = esc((title || "Portal").slice(0, 48));
    const safeSubtitle = esc((subtitle || targetType || "Preview").slice(0, 64));
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="100%" stop-color="#1e3a8a"/>
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#g)"/>
        <g fill="none" stroke="rgba(255,255,255,0.08)">
          <rect x="90" y="110" width="1100" height="500" rx="20"/>
          <rect x="120" y="150" width="1040" height="52" rx="12"/>
          <rect x="120" y="224" width="720" height="300" rx="16"/>
          <rect x="862" y="224" width="298" height="300" rx="16"/>
        </g>
        <text x="130" y="186" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="22" letter-spacing="2">${safeSubtitle.toUpperCase()}</text>
        <text x="130" y="300" fill="#ffffff" font-family="Arial, sans-serif" font-size="48" font-weight="700">${safeTitle}</text>
        <text x="130" y="350" fill="#94a3b8" font-family="Arial, sans-serif" font-size="26">Vista cacheada del portal</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, []);

  const capturePortalScreenshot = useCallback(async (portalHref: string): Promise<string | null> => {
    if (typeof window === "undefined" || !portalHref) return null;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.style.width = "1280px";
    iframe.style.height = "720px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("portal screenshot timeout")), 20000);
        iframe.onload = () => {
          window.clearTimeout(timeoutId);
          resolve();
        };
        iframe.onerror = () => {
          window.clearTimeout(timeoutId);
          reject(new Error("portal screenshot load failed"));
        };
        iframe.src = portalHref;
      });

      // Wait for JS/data to finish loading — Next.js apps need a few seconds to hydrate
      await new Promise((resolve) => window.setTimeout(resolve, 3500));

      const frameDoc = iframe.contentDocument;
      if (!frameDoc) return null;
      if (frameDoc.readyState !== "complete") {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }

      const root = (frameDoc.querySelector("main") as HTMLElement | null) ?? frameDoc.body;
      if (!root) return null;

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(root, {
        backgroundColor: "#020617",
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: true,
        logging: false,
        width: 1280,
        height: 720,
      });
      try {
        return canvas.toDataURL("image/webp", 0.85);
      } catch {
        return canvas.toDataURL("image/jpeg", 0.85);
      }
    } catch {
      return null;
    } finally {
      cleanup();
    }
  }, []);

  const loadPortalArtifact = useCallback(async (
    targetType: string,
    targetId: string,
    fallbackLabel?: string,
  ): Promise<{ markdown: string; kind: string; subtitle: string; title: string } | null> => {
    if (!accessToken || !targetId) return null;

    const extractMarkdown = (input: unknown): string => {
      if (typeof input === "string") return input;
      if (input && typeof input === "object") {
        const rec = input as Record<string, unknown>;
        if (typeof rec.markdown === "string") return rec.markdown;
        if (typeof rec.text === "string") return rec.text;
        if (typeof rec.summary === "string") return rec.summary;
        if (typeof rec.label === "string") return rec.label;
      }
      return "";
    };

    try {
      if (targetType === "document") {
        const doc = await getDocument(targetId, accessToken);
        const firstBrick = (doc.bricks || []).find((b) => extractMarkdown(b.content).trim().length > 0) ?? (doc.bricks || [])[0];
        const markdown = firstBrick ? extractMarkdown(firstBrick.content).trim() : "";
        return {
          markdown: markdown || "Sin contenido visible en el documento.",
          kind: firstBrick?.kind ?? "text",
          subtitle: "Documento",
          title: doc.title || fallbackLabel || targetId,
        };
      }

      if (targetType === "board") {
        const board = await getBoard(targetId, accessToken);
        const firstCard = board.lists.flatMap((l) => l.cards || [])[0];
        const firstBlock = firstCard?.blocks?.find((blk) => extractMarkdown(blk).trim().length > 0) ?? firstCard?.blocks?.[0];
        const markdown = extractMarkdown(firstBlock).trim() || firstCard?.summary?.trim() || firstCard?.title || "";
        return {
          markdown: markdown || "Sin cards con contenido visible.",
          kind: firstBlock?.kind ?? "text",
          subtitle: `Board${firstCard?.title ? ` · ${firstCard.title}` : ""}`,
          title: board.name || fallbackLabel || targetId,
        };
      }

      const mesh = await getMesh(targetId, accessToken);
      const byId = mesh.state.bricksById;
      const orderedIds = [
        ...mesh.state.rootOrder,
        ...Object.keys(byId).filter((id) => !mesh.state.rootOrder.includes(id)),
      ];
      const firstBrick = orderedIds
        .map((id) => byId[id])
        .find((b) => b && extractMarkdown(b.content).trim().length > 0) ?? orderedIds.map((id) => byId[id]).find(Boolean);
      const markdown = firstBrick ? extractMarkdown(firstBrick.content).trim() : "";
      return {
        markdown: markdown || "Sin contenido visible en la mesh.",
        kind: firstBrick?.kind ?? "text",
        subtitle: "Mesh",
        title: fallbackLabel || targetId,
      };
    } catch {
      return null;
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;

    const portals = Object.values(state.bricksById).filter((b) => {
      if (b.kind !== "portal") return false;
      const content = asRec(b.content);
      if (typeof content.unifierKind === "string") return false;
      return typeof content.targetId === "string" && content.targetId.trim().length > 0;
    });

    portals.forEach((portalBrick) => {
      const content = asRec(portalBrick.content);
      const targetType = typeof content.targetType === "string" ? content.targetType : "mesh";
      const targetId = typeof content.targetId === "string" ? content.targetId.trim() : "";
      const targetLabel = typeof content.targetLabel === "string" ? content.targetLabel : "";
      const hasPreview = typeof content.previewMarkdown === "string" && content.previewMarkdown.trim().length > 0;
      const hasPreviewImage = typeof content.previewImageDataUrl === "string" && content.previewImageDataUrl.startsWith("data:image/");
      const previewImageSource = typeof content.previewImageSource === "string" ? content.previewImageSource : "";
      const hasScreenshotImage = hasPreviewImage && previewImageSource === "screenshot";
      if (!targetId) {
        delete portalHydrationAttemptRef.current[portalBrick.id];
        delete portalScreenshotAttemptRef.current[portalBrick.id];
        return;
      }

      const screenshotSignature = `${targetType}:${targetId}`;
      if (!hasScreenshotImage && !portalScreenshotInFlightRef.current.has(portalBrick.id) && portalScreenshotAttemptRef.current[portalBrick.id] !== screenshotSignature) {
        portalScreenshotAttemptRef.current[portalBrick.id] = screenshotSignature;
        portalScreenshotInFlightRef.current.add(portalBrick.id);
        const portalHref = buildPortalHref(targetType, targetId, { layout: false });
        const fallbackImageDataUrl = buildPortalFallbackImageDataUrl(
          targetLabel || targetId,
          targetType === "mesh" ? "Mesh Board" : targetType === "board" ? "Kanban Board" : "Documento",
          targetType,
        );

        // Set fallback immediately so the portal shows something right away
        if (!hasPreviewImage) {
          setState((cur) => {
            const live = cur.bricksById[portalBrick.id];
            if (!live || live.kind !== "portal") return cur;
            const liveContent = asRec(live.content);
            if (typeof liveContent.previewImageDataUrl === "string" && liveContent.previewImageDataUrl.startsWith("data:image/")) return cur;
            return {
              ...cur,
              bricksById: {
                ...cur.bricksById,
                [portalBrick.id]: {
                  ...live,
                  content: { ...liveContent, previewImageDataUrl: fallbackImageDataUrl, previewImageSource: "fallback", previewImageCapturedAt: new Date().toISOString() },
                },
              },
            };
          });
        }

        void capturePortalScreenshot(portalHref)
          .then((screenshotDataUrl) => {
            if (!screenshotDataUrl) return; // keep the fallback already set
            setState((cur) => {
              const live = cur.bricksById[portalBrick.id];
              if (!live || live.kind !== "portal") return cur;
              const liveContent = asRec(live.content);
              return {
                ...cur,
                bricksById: {
                  ...cur.bricksById,
                  [portalBrick.id]: {
                    ...live,
                    content: {
                      ...liveContent,
                      previewImageDataUrl: screenshotDataUrl,
                      previewImageSource: "screenshot",
                      previewImageCapturedAt: new Date().toISOString(),
                    },
                  },
                },
              };
            });
          })
          .finally(() => {
            portalScreenshotInFlightRef.current.delete(portalBrick.id);
          });
      }

      if (hasPreview) return;

      const signature = `${targetType}:${targetId}`;
      if (portalHydrationAttemptRef.current[portalBrick.id] === signature) return;
      if (portalHydrationInFlightRef.current.has(portalBrick.id)) return;

      portalHydrationAttemptRef.current[portalBrick.id] = signature;
      portalHydrationInFlightRef.current.add(portalBrick.id);
      void loadPortalArtifact(targetType, targetId, targetLabel)
        .then((artifact) => {
          if (!artifact) return;
          setState((cur) => {
            const live = cur.bricksById[portalBrick.id];
            if (!live || live.kind !== "portal") return cur;
            const liveContent = asRec(live.content);
            const alreadyHasPreview = typeof liveContent.previewMarkdown === "string" && liveContent.previewMarkdown.trim().length > 0;
            if (alreadyHasPreview) return cur;
            return {
              ...cur,
              bricksById: {
                ...cur.bricksById,
                [portalBrick.id]: {
                  ...live,
                  content: {
                    ...liveContent,
                    previewMarkdown: artifact.markdown,
                    previewKind: artifact.kind,
                    previewSubtitle: artifact.subtitle,
                    previewTitle: artifact.title,
                  },
                },
              },
            };
          });
        })
        .finally(() => {
          portalHydrationInFlightRef.current.delete(portalBrick.id);
        });
    });
  }, [accessToken, buildPortalFallbackImageDataUrl, buildPortalHref, capturePortalScreenshot, loadPortalArtifact, state.bricksById]);

  // Keep the refresh-ref in sync whenever bricks change (no interval restart needed)
  useEffect(() => {
    portalsForRefreshRef.current = Object.values(state.bricksById)
      .filter((b) => {
        if (b.kind !== "portal") return false;
        const c = asRec(b.content);
        if (typeof c.unifierKind === "string") return false;
        return typeof c.targetId === "string" && (c.targetId as string).trim().length > 0;
      })
      .map((b) => {
        const c = asRec(b.content);
        const targetType = typeof c.targetType === "string" ? c.targetType : "mesh";
        const targetId = typeof c.targetId === "string" ? c.targetId.trim() : "";
        return { brickId: b.id, portalHref: buildPortalHref(targetType, targetId, { layout: false }) };
      })
      .filter((p) => !!p.portalHref);
  }, [state.bricksById, buildPortalHref]);

  // Periodic portal screenshot refresh — stable interval, reads from ref to avoid restarts
  useEffect(() => {
    const REFRESH_MS = 5000;
    const id = window.setInterval(() => {
      portalsForRefreshRef.current.forEach(({ brickId, portalHref }) => {
        if (portalScreenshotInFlightRef.current.has(brickId)) return;
        portalScreenshotInFlightRef.current.add(brickId);
        void capturePortalScreenshot(portalHref)
          .then((screenshotDataUrl) => {
            if (!screenshotDataUrl) return;
            setState((cur) => {
              const live = cur.bricksById[brickId];
              if (!live || live.kind !== "portal") return cur;
              const liveContent = asRec(live.content);
              return {
                ...cur,
                bricksById: {
                  ...cur.bricksById,
                  [brickId]: {
                    ...live,
                    content: { ...liveContent, previewImageDataUrl: screenshotDataUrl, previewImageSource: "screenshot", previewImageCapturedAt: new Date().toISOString() },
                  },
                },
              };
            });
          })
          .finally(() => { portalScreenshotInFlightRef.current.delete(brickId); });
      });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [capturePortalScreenshot]);

  // ── Mirror hydration (option 1: fetch on mount / when brick is added) ─────────
  const mirrorHydrationAttemptRef = useRef<Record<string, string>>({});
  const mirrorHydrationInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!accessToken) return;
    const mirrors = Object.values(state.bricksById).filter((b) => {
      if (b.kind !== "mirror") return false;
      const c = asRec(b.content);
      return typeof c.sourceScopeId === "string" && (c.sourceScopeId as string).trim().length > 0
          && typeof c.sourceId === "string" && (c.sourceId as string).trim().length > 0;
    });

    mirrors.forEach((mirrorBrick) => {
      const c = asRec(mirrorBrick.content);
      const sourceType   = typeof c.sourceType   === "string" ? c.sourceType   : "mesh";
      const sourceScopeId = (c.sourceScopeId as string).trim();
      const sourceId     = (c.sourceId as string).trim();
      const sig = `${sourceType}:${sourceScopeId}:${sourceId}`;
      if (mirrorHydrationAttemptRef.current[mirrorBrick.id] === sig) return;
      if (mirrorHydrationInFlightRef.current.has(mirrorBrick.id)) return;
      mirrorHydrationAttemptRef.current[mirrorBrick.id] = sig;
      mirrorHydrationInFlightRef.current.add(mirrorBrick.id);

      void (async () => {
        try {
          let previewMarkdown = "";
          let previewContent: Record<string, unknown> | null = null;
          if (sourceType === "mesh") {
            const mesh = await getMesh(sourceScopeId, accessToken);
            const brick = mesh.state.bricksById[sourceId];
            if (brick) {
              const bc = asRec(brick.content);
              previewMarkdown = typeof bc.markdown === "string" ? bc.markdown
                : typeof bc.text === "string" ? bc.text : "";
              previewContent = bc as Record<string, unknown>;
            }
          } else if (sourceType === "board") {
            const board = await getBoard(sourceScopeId, accessToken);
            const card = board.lists.flatMap((l) => l.cards || []).find((card) => card.id === sourceId || card.blocks?.some((blk: Record<string, unknown>) => blk.id === sourceId));
            if (card) {
              previewMarkdown = card.summary?.trim() || card.title || "";
            }
          } else if (sourceType === "document") {
            const doc = await getDocument(sourceScopeId, accessToken);
            const brick = (doc.bricks || []).find((b) => b.id === sourceId);
            if (brick) {
              const bc = asRec(brick.content);
              previewMarkdown = typeof bc.markdown === "string" ? bc.markdown : typeof bc.text === "string" ? bc.text : "";
            }
          }
          if (!previewMarkdown && !previewContent) return;
          setState((cur) => {
            const live = cur.bricksById[mirrorBrick.id];
            if (!live || live.kind !== "mirror") return cur;
            return { ...cur, bricksById: { ...cur.bricksById, [mirrorBrick.id]: { ...live, content: { ...asRec(live.content), previewMarkdown, previewContent } } } };
          });
        } catch { /* silent */ } finally {
          mirrorHydrationInFlightRef.current.delete(mirrorBrick.id);
        }
      })();
    });
  }, [accessToken, state.bricksById]);

  // ── Mirror WS refresh (option 3: subscribe to source mesh channel) ────────────
  useEffect(() => {
    if (!accessToken) return;
    // Collect distinct source scope IDs and which mirror bricks watch them
    const scopeMap = new Map<string, { scopeId: string; brickIds: Set<string> }>();
    Object.values(state.bricksById).forEach((b) => {
      if (b.kind !== "mirror") return;
      const c = asRec(b.content);
      const sourceType    = typeof c.sourceType    === "string" ? c.sourceType    : "mesh";
      const sourceScopeId = typeof c.sourceScopeId === "string" ? (c.sourceScopeId as string).trim() : "";
      if (!sourceScopeId || sourceType !== "mesh") return;
      if (!scopeMap.has(sourceScopeId)) scopeMap.set(sourceScopeId, { scopeId: sourceScopeId, brickIds: new Set() });
      scopeMap.get(sourceScopeId)!.brickIds.add(b.id);
    });
    if (scopeMap.size === 0) return;

    const ably = getAblyClient(accessToken);
    const subscriptions: Array<{ channel: ReturnType<typeof ably.channels.get>; listener: (msg: unknown) => void }> = [];

    scopeMap.forEach(({ scopeId, brickIds }) => {
      const channel = ably.channels.get(`board:${scopeId}`);
      const listener = async (message: unknown) => {
        const data = ((message as { data?: unknown }).data ?? {}) as Record<string, unknown>;
        const eventType = (message as { name?: string }).name ?? "";
        if (eventType !== "mesh.brick.updated" && eventType !== "mesh.state.updated") return;
        // Re-fetch the source mesh and update all mirrors watching this scope
        try {
          const mesh = await getMesh(scopeId, accessToken);
          setState((cur) => {
            let next = cur;
            brickIds.forEach((mirrorId) => {
              const mirrorBrick = cur.bricksById[mirrorId];
              if (!mirrorBrick || mirrorBrick.kind !== "mirror") return;
              const mc = asRec(mirrorBrick.content);
              const sourceId = typeof mc.sourceId === "string" ? mc.sourceId : "";
              if (!sourceId) return;
              // Only update if this specific brick changed (if brickId is in payload)
              const payloadBrickId = typeof data.brickId === "string" ? data.brickId : null;
              if (payloadBrickId && payloadBrickId !== sourceId) return;
              const sourceBrick = mesh.state.bricksById[sourceId];
              if (!sourceBrick) return;
              const bc = asRec(sourceBrick.content);
              const previewMarkdown = typeof bc.markdown === "string" ? bc.markdown : typeof bc.text === "string" ? bc.text : "";
              next = { ...next, bricksById: { ...next.bricksById, [mirrorId]: { ...mirrorBrick, content: { ...mc, previewMarkdown, previewContent: bc as Record<string, unknown> } } } };
            });
            return next;
          });
        } catch { /* silent */ }
      };
      channel.subscribe("mesh.brick.updated", listener);
      channel.subscribe("mesh.state.updated", listener);
      subscriptions.push({ channel, listener });
    });

    return () => {
      subscriptions.forEach(({ channel, listener }) => {
        channel.unsubscribe("mesh.brick.updated", listener);
        channel.unsubscribe("mesh.state.updated", listener);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, meshId]);

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

  useEffect(() => {
    if (!toolbarPanel) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!floatingToolbarRef.current?.contains(target)) {
        setToolbarPanel(null);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [toolbarPanel]);

  const dockBtnClass = useCallback((active: boolean) => (
    `inline-flex ${mobileMode ? "h-10 w-10" : "h-9 w-9"} items-center justify-center rounded-xl border transition-colors ${
      active
        ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100"
        : "border-white/10 bg-slate-900/85 text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100"
    }`
  ), [mobileMode]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    await saveMeshState(state, { silent: false });
  }, [saveMeshState, state]);

  const handleDownloadMesh = useCallback(() => {
    if (!meshId) return;
    try {
      const payload = {
        meshId,
        revision,
        updatedAt,
        state: {
          ...state,
          viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mesh-${meshId}-rev-${revision}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast("Mesh descargada.", "success");
    } catch {
      toast("No se pudo descargar la mesh.", "error");
    }
  }, [meshId, revision, updatedAt, state, viewport.x, viewport.y, viewport.zoom]);

  const handleShareMesh = useCallback(() => {
    setIsShareModalOpen(true);
  }, []);

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

  useEffect(() => {
    return () => {
      aiAbortRef.current?.();
      aiAbortRef.current = null;
    };
  }, []);

  const handleMeshAiSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = meshAiInput.trim();
    if (!prompt || meshAiLoading || !accessToken || !activeTeamId || !meshId) return;

    const userMsg = { id: Date.now(), role: "user" as const, content: prompt, timestamp: new Date().toISOString() };
    const loadingId = Date.now() + 1;
    setMeshAiMessages((prev) => [
      ...prev,
      userMsg,
      { id: loadingId, role: "bot", content: "", loading: true, timestamp: new Date().toISOString() },
    ]);
    setMeshAiInput("");
    setMeshAiLoading(true);

    let acc = "";
    aiAbortRef.current?.();
    aiAbortRef.current = streamAiChat(
      {
        scope: "team",
        scopeId: activeTeamId,
        message: `Mesh ${meshId}: ${prompt}`,
        contextSummary: meshAiContext,
        history: meshAiMessages
          .filter((m) => !m.loading)
          .slice(-16)
          .map((m) => ({ role: m.role === "bot" ? "assistant" as const : "user" as const, content: m.content })),
      },
      accessToken,
      (event) => {
        if (event.type === "delta") {
          acc += event.text;
          setMeshAiMessages((prev) => prev.map((m) => m.id === loadingId ? { ...m, loading: false, content: acc } : m));
          return;
        }
        if (event.type === "done") {
          const finalText = event.text || acc || "No hubo respuesta de IA.";
          setMeshAiMessages((prev) => prev.map((m) => m.id === loadingId ? { ...m, loading: false, content: finalText } : m));
          aiAbortRef.current = null;
          setMeshAiLoading(false);
          return;
        }
        if (event.type === "error") {
          setMeshAiMessages((prev) => prev.map((m) => m.id === loadingId ? { ...m, loading: false, content: "Error al consultar IA." } : m));
          aiAbortRef.current = null;
          setMeshAiLoading(false);
        }
      },
    );
  }, [meshAiInput, meshAiLoading, accessToken, activeTeamId, meshId, meshAiContext, meshAiMessages]);

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
  const addConn = useCallback((src: string, tgt: string, sp?: Port, tp?: Port, sa?: AnchorNorm, ta?: AnchorNorm) => {
    if (src === tgt) return;
    setState((cur) => {
      if (Object.values(cur.connectionsById).some((c) => c.cons[0] === src && c.cons[1] === tgt)) return cur;
      const style: Record<string, unknown> = { ...connStyle(connPreset) };
      if (sp) style.srcPort = sp;
      if (tp) style.tgtPort = tp;
      if (sa) style.srcAnchorNorm = sa;
      if (ta) style.tgtAnchorNorm = ta;
      const conn: MeshConnection = { id: mkId("conn"), cons: [src, tgt], label: { type: "doc", content: [] }, style };
      return { ...cur, connectionsById: { ...cur.connectionsById, [conn.id]: conn } };
    });
  }, [connPreset]);

  const startConnFromPort = useCallback((brickId: string, port: Port) => {
    if (toolMode !== "conn") return;
    setConnSrcId(brickId); setConnSrcPort(port); setConnSrcAnchor(null);
  }, [toolMode]);

  const startConnFromAnchor = useCallback((brickId: string, anchor: AnchorNorm) => {
    if (toolMode !== "conn") return;
    setConnSrcId(brickId); setConnSrcPort(null); setConnSrcAnchor(anchor);
  }, [toolMode]);

  const finishConnAtPort = useCallback((brickId: string, port: Port) => {
    if (!connSrcId || connSrcId === brickId) return;
    addConn(connSrcId, brickId, connSrcPort ?? undefined, port, connSrcAnchor ?? undefined);
    setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); setSnapTarget(null);
    toast("Conexión creada.", "success");
  }, [connSrcId, connSrcPort, connSrcAnchor, addConn]);

  const finishConnAtAnchor = useCallback((brickId: string, anchor: AnchorNorm) => {
    if (!connSrcId || connSrcId === brickId) return;
    addConn(connSrcId, brickId, connSrcPort ?? undefined, undefined, connSrcAnchor ?? undefined, anchor);
    setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); setSnapTarget(null);
    toast("Conexión creada.", "success");
  }, [connSrcId, connSrcPort, connSrcAnchor, addConn]);

  // ── Mouse move ────────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = fromEv(e);
    setPointer({ x, y });

    // Rubber-band selection rect — use ref so the check is never stale
    if (toolMode === "select" && selRectRef.current) {
      const updated = { ...selRectRef.current, x2: x, y2: y };
      selRectRef.current = updated;
      setSelRect(updated);
    }

    // Update snap target when mid-connection
    if (toolMode === "conn" && connSrcId) {
      let bestId: string | null = null, bestPort: Port | null = null, bestDist = SNAP_R;
      Object.values(state.bricksById).forEach((b) => {
        if (b.id === connSrcId) return;
        const g = gPos(b.id);
        const bPreset = asRec(b.content).shapePreset as ShapePreset | undefined;
        const bVecPts = Array.isArray(asRec(b.content).vectorPoints) ? asRec(b.content).vectorPoints as VecPts : undefined;
        ALL_PORTS.forEach((port) => {
          const mp = shapePortAbsPos(g.x, g.y, b.size.w, b.size.h, bPreset, port, bVecPts);
          const d = Math.hypot(x - mp.x, y - mp.y);
          if (d < bestDist) { bestDist = d; bestId = b.id; bestPort = port; }
        });
      });
      setSnapTarget(bestId && bestPort ? { brickId: bestId, port: bestPort } : null);
    }

    if (toolMode === "pan" && panDragState) {
      setViewport((current) => ({
        ...current,
        x: panDragState.startViewport.x + (e.clientX - panDragState.startMouse.x),
        y: panDragState.startViewport.y + (e.clientY - panDragState.startMouse.y),
      }));
      return;
    }

    if (toolMode === "pen" && activePen) {
      setActivePen((p) => p ? [...p, { x, y, t: Date.now() }] : p);
      return;
    }

    // Bezier control point drag
    if (bezierCpDrag) {
      const dx = x - bezierCpDrag.startMouse.x;
      const dy = y - bezierCpDrag.startMouse.y;
      const newCp = { x: bezierCpDrag.startCp.x + dx, y: bezierCpDrag.startCp.y + dy };
      setState((cur) => {
        const co = cur.connectionsById[bezierCpDrag.connId];
        if (!co) return cur;
        const key = bezierCpDrag.cp === 1 ? "cp1" : "cp2";
        return { ...cur, connectionsById: { ...cur.connectionsById, [bezierCpDrag.connId]: { ...co, style: { ...asRec(co.style), [key]: newCp } } } };
      });
      return;
    }

    if (toolMode !== "select" && toolMode !== "vec") return;

    if (vecDragState) {
      setState((cur) => {
        const b = cur.bricksById[vecDragState.brickId];
        if (!b) return cur;
        const g = resolveGlobal(cur.bricksById, b.id);
        const nx = (x - g.x) / Math.max(b.size.w, 1);
        const ny = (y - g.y) / Math.max(b.size.h, 1);
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
  }, [toolMode, fromEv, panDragState, activePen, vecDragState, resizeState, dragState, connSrcId, bezierCpDrag]);

  // ── Mouse up ──────────────────────────────────────────────────────────────────
  const onMouseUp = useCallback(() => {
    if (bezierCpDrag) { setBezierCpDrag(null); return; }
    if (panDragState) { setPanDragState(null); return; }

    // pen flush — use ref to avoid React Strict Mode double-invoke
    if (toolMode === "pen" && activePen && activePen.length > 1) {
      const stroke: PenStroke = { points: activePen, color: penColor, width: penStrokeWidth };
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
            const normalizedBatch = strokes.map((s) => ({
              points: s.points.map((p) => ({
                x: +Math.max(0, Math.min(1, (p.x - g.x) / Math.max(b.size.w, 1))).toFixed(4),
                y: +Math.max(0, Math.min(1, (p.y - g.y) / Math.max(b.size.h, 1))).toFixed(4),
              })),
              color: s.color ?? penColor,
              width: s.width ?? penStrokeWidth,
            }));
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
        const cw = el ? el.clientWidth / Math.max(viewport.zoom, 0.01) : 1600;
        const ch = el ? el.clientHeight / Math.max(viewport.zoom, 0.01) : 900;
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
              if (mapped.meshKind === "draw" || mapped.meshKind === "frame") {
                const content = asRec(nb.content);
                const style = asRec(content.style);
                nb = {
                  ...nb,
                  content: {
                    ...content,
                    style: {
                      ...style,
                      stroke: penColor,
                      strokeWidth: penStrokeWidth,
                    },
                    strokeColor: penColor,
                    strokeWidth: penStrokeWidth,
                  },
                };
              }
            } else {
              // Phase 4: Derive size from bbox height, bold from stroke width, color from pen
              const baseText = text!.trim();
              // bbox height (canvas px) → rem: ~40px = 1rem, clamped 0.6–5
              const sizeRem = Math.max(0.6, Math.min(5, bbox.h / 40)).toFixed(2);
              // stroke width ≥ 3 → bold markdown
              const styledText = penStrokeWidth >= 3 ? `**${baseText}**` : baseText;
              // wrap with properly-closed tags
              const isDefaultColor = penColor === "#ffffff" || penColor === "#fff" || !penColor;
              const textWithTokens = isDefaultColor
                ? `[size:${sizeRem}rem]${styledText}[/size]`
                : `[size:${sizeRem}rem][color:${penColor}]${styledText}[/color][/size]`;
              nb = setMd(mkBrick("text", Object.keys(cur.bricksById).length, parentId, pos), textWithTokens);
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
    // Rubber-band finalization — always read from ref (never stale)
    const currentSelRect = selRectRef.current;
    if (currentSelRect) {
      selRectRef.current = null;
      setSelRect(null);
      const rx1 = Math.min(currentSelRect.x1, currentSelRect.x2), ry1 = Math.min(currentSelRect.y1, currentSelRect.y2);
      const rx2 = Math.max(currentSelRect.x1, currentSelRect.x2), ry2 = Math.max(currentSelRect.y1, currentSelRect.y2);
      if (rx2 - rx1 > 4 || ry2 - ry1 > 4) {
        const ids = new Set<string>();
        Object.values(state.bricksById).forEach((b) => {
          const g = resolveGlobal(state.bricksById, b.id);
          if (g.x < rx2 && g.x + b.size.w > rx1 && g.y < ry2 && g.y + b.size.h > ry1) ids.add(b.id);
        });
        setSelectedIds(ids);
        setSelectedId(null);
      }
    }

    setDragState(null);
    setResizeState(null);
    setVecDragState(null);
  }, [bezierCpDrag, panDragState, toolMode, activePen, dragState, selRect, state.bricksById, accessToken, connPreset, penColor, penStrokeWidth, viewport.zoom]);

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

  const deleteVecPoint = useCallback((brickId: string, idx: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const pts = Array.isArray(c.vectorPoints) ? [...(c.vectorPoints as { x: number; y: number }[])] : [];
      if (pts.length <= 3) return cur; // keep minimum triangle
      pts.splice(idx, 1);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, vectorPoints: pts } } } };
    });
  }, []);

  const insertVecPoint = useCallback((brickId: string, nx: number, ny: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const pts = Array.isArray(c.vectorPoints) ? [...(c.vectorPoints as { x: number; y: number }[])] : [];
      if (!pts.length) return cur;
      const newPt = { x: +Math.max(0, Math.min(1, nx)).toFixed(4), y: +Math.max(0, Math.min(1, ny)).toFixed(4) };
      let bestEdge = 0, bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length];
        const edx = B.x - A.x, edy = B.y - A.y, lenSq = edx * edx + edy * edy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((newPt.x - A.x) * edx + (newPt.y - A.y) * edy) / lenSq)) : 0;
        const dist = Math.hypot(newPt.x - A.x - t * edx, newPt.y - A.y - t * edy);
        if (dist < bestDist) { bestDist = dist; bestEdge = i; }
      }
      pts.splice(bestEdge + 1, 0, newPt);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, vectorPoints: pts } } } };
    });
  }, []);

  const addCustomPort = useCallback((brickId: string, nx: number, ny: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const current = Array.isArray(c.customPorts) ? [...(c.customPorts as AnchorNorm[])] : [];
      current.push({ x: +Math.max(0, Math.min(1, nx)).toFixed(4) as unknown as number, y: +Math.max(0, Math.min(1, ny)).toFixed(4) as unknown as number });
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, customPorts: current } } } };
    });
  }, []);

  const deleteCustomPort = useCallback((brickId: string, idx: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const current = Array.isArray(c.customPorts) ? [...(c.customPorts as AnchorNorm[])] : [];
      current.splice(idx, 1);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, customPorts: current } } } };
    });
  }, []);

  const clearDrawStrokes = useCallback((brickId: string) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, manualStrokes: [] } } } };
    });
  }, []);

  const startVecDrag = useCallback((e: React.MouseEvent, brickId: string, idx: number) => {
    e.stopPropagation();
    setVecDragState({ brickId, pointIndex: idx, startMouse: fromEv(e) });
  }, [fromEv]);

  // ── Canvas mouse down ────────────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (toolMode === "pan") {
      setPanDragState({ startMouse: { x: e.clientX, y: e.clientY }, startViewport: { x: viewport.x, y: viewport.y } });
      return;
    }
    if (toolMode === "pen") {
      const { x, y } = fromEv(e);
      setActivePen([{ x, y, t: Date.now() }]);
      return;
    }
    if (toolMode === "select" && e.button === 0) {
      const { x, y } = fromEv(e);
      const rect = { x1: x, y1: y, x2: x, y2: y };
      selRectRef.current = rect;
      setSelRect(rect);
      setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
    }
  }, [toolMode, fromEv, viewport.x, viewport.y]);

  // ── Canvas clicks ────────────────────────────────────────────────────────────
  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    if (toolMode === "conn" && connSrcId) {
      if (snapTarget) {
        addConn(connSrcId, snapTarget.brickId, connSrcPort ?? undefined, snapTarget.port, connSrcAnchor ?? undefined);
        setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); setSnapTarget(null);
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
      if (nearId && nd <= 160) { addConn(connSrcId, nearId, connSrcPort ?? undefined, undefined, connSrcAnchor ?? undefined); setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); toast("Conexión creada.", "success"); }
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
    const brickShapePreset = asRec(brick.content).shapePreset as ShapePreset | undefined;
    const brickVecPts = Array.isArray(asRec(brick.content).vectorPoints) ? asRec(brick.content).vectorPoints as VecPts : undefined;
    const brickCustomPorts = Array.isArray(asRec(brick.content).customPorts)
      ? (asRec(brick.content).customPorts as AnchorNorm[]) : [];
    const magnetDots = toolMode === "conn" ? (
      <div className="pointer-events-none absolute inset-0 z-50">
        {ALL_PORTS.map((port) => {
          const mp = shapePortAbsPos(0, 0, brick.size.w, brick.size.h, brickShapePreset, port, brickVecPts);
          const isSnap = snapTarget?.brickId === brick.id && snapTarget.port === port;
          const isSrc  = connSrcId === brick.id && connSrcPort === port;
          return (
            <div key={port} style={{ position: "absolute", left: mp.x, top: mp.y, transform: "translate(-50%,-50%)" }}
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
        {/* Custom user-defined magnet ports */}
        {brickCustomPorts.map((cp, i) => (
          <div key={`cp-${i}`}
            style={{ position: "absolute", left: cp.x * brick.size.w, top: cp.y * brick.size.h, transform: "translate(-50%,-50%)" }}
            className="pointer-events-auto h-3 w-3 rounded-full border-2 border-yellow-400 bg-yellow-900/60 cursor-crosshair hover:h-4 hover:w-4 hover:bg-yellow-400/70 transition-all duration-100"
            title="Puerto personalizado · Clic der. para eliminar en modo vec"
            onMouseDown={(e) => { e.stopPropagation(); startConnFromAnchor(brick.id, cp); }}
            onMouseUp={(e) => { e.stopPropagation(); if (connSrcId && connSrcId !== brick.id) finishConnAtAnchor(brick.id, cp); }}
          />
        ))}
      </div>
    ) : null;
    // Custom port dots in vec mode (for editing)
    const vecCustomPortDots = toolMode === "vec" && isSel ? (
      <div className="pointer-events-none absolute inset-0 z-50">
        {brickCustomPorts.map((cp, i) => (
          <div key={`vcp-${i}`}
            style={{ position: "absolute", left: cp.x * brick.size.w, top: cp.y * brick.size.h, transform: "translate(-50%,-50%)" }}
            className="pointer-events-auto h-3.5 w-3.5 rounded-full border-2 border-yellow-400 bg-yellow-500 cursor-pointer"
            title="Puerto personalizado · Clic der. para eliminar"
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteCustomPort(brick.id, i); }}
          />
        ))}
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
      const shapeFill = isDrawBrick ? "rgba(0,0,0,0)" : sFill;
      const toggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedBoards((prev) => { const n = new Set(prev); n.has(brick.id) ? n.delete(brick.id) : n.add(brick.id); return n; });
      };
      return (
        <div key={brick.id}
          className={`group absolute${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: shapeH,
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab", overflow: "visible" }}
          onClick={(e) => { if (e.altKey && toolMode === "vec" && isSel) { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); addCustomPort(brick.id, (e.clientX - r.left) / brick.size.w, (e.clientY - r.top) / brick.size.h); return; } onBrickClick(e, brick.id); }}
          onMouseDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "vec" && isSel && vecPts) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); insertVecPoint(brick.id, (e.clientX - r.left) / brick.size.w, (e.clientY - r.top) / brick.size.h); return; } if (toolMode === "select") startEdit(brick.id); }}
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
                  <RichText content={shapeLabel || String(shapeP)} context={MESH_CONTEXT} className="inline text-[10px] leading-none" />
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
                    <RichText content={md} context={MESH_CONTEXT} className="inline" />
                  </div>
                ) : (
                  <div className="pointer-events-none w-full text-center text-[11px] leading-snug text-white/90 break-words drop-shadow-sm [&_*]:text-inherit">
                    <RichText content={md} context={MESH_CONTEXT} className="inline" />
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
              title="Arrastrar para mover · Clic derecho para eliminar"
              onMouseDown={(e) => startVecDrag(e, brick.id, i)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteVecPoint(brick.id, i); }} />
          ))}
          {vecCustomPortDots}
          {magnetDots}
        </div>
      );
    }

    // ─ Raw draw area (no shape preset): transparent area, only border on hover/connected ─
    if (brick.kind === "draw" && !shapeP) {
      const isHoverRaw = hoveredRawDrawId === brick.id;
      const manualStrokes = Array.isArray(c.manualStrokes)
        ? (c.manualStrokes as Array<Array<{ x: number; y: number }> | { points: Array<{ x: number; y: number }>; color?: string; width?: number }>)
        : [];
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
              {manualStrokes.map((strokeEntry, idx) => {
                const strokePts = Array.isArray(strokeEntry) ? strokeEntry : strokeEntry.points;
                const strokeColor = Array.isArray(strokeEntry) ? "#67e8f9" : (strokeEntry.color ?? "#67e8f9");
                const strokeWidth = Array.isArray(strokeEntry) ? 2 : (strokeEntry.width ?? 2);
                if (!Array.isArray(strokePts) || strokePts.length < 2) return null;
                const d = strokePts
                  .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * brick.size.w).toFixed(1)},${(p.y * brick.size.h).toFixed(1)}`)
                  .join(" ");
                return (
                  <path
                    key={idx}
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                );
              })}
            </svg>
          )}
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-3 w-3 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" onMouseDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {vecCustomPortDots}
          {magnetDots}
        </div>
      );
    }

    // ─ Portal (navigable link to another board/document) ─
    if (brick.kind === "portal" && !uKind) {
      const targetType = typeof c.targetType === "string" ? c.targetType as string : "mesh";
      const targetId   = typeof c.targetId   === "string" ? c.targetId   : "";
      const targetLabel = typeof c.targetLabel === "string" ? c.targetLabel : "";
      const portalRenderMode = typeof c.portalRenderMode === "string" ? c.portalRenderMode : "artifact";
      const previewMd = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";
      const previewKind = typeof c.previewKind === "string" ? c.previewKind : "text";
      const previewSubtitle = typeof c.previewSubtitle === "string" ? c.previewSubtitle : "";
      const previewImageDataUrl = typeof c.previewImageDataUrl === "string" ? c.previewImageDataUrl : "";
      const portalPreviewBrick = previewMd.trim()
        ? mkPreviewBrick(`portal_${brick.id}`, previewKind, previewMd)
        : null;
      const portalHref = buildPortalHref(targetType, targetId, { layout: false });
      return (
        <div key={brick.id}
          className={`group absolute overflow-hidden rounded-xl border-2${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            borderColor: isSel ? "rgba(255,255,255,0.5)" : "rgba(59,130,246,0.55)",
            background: "rgba(15,23,42,0.92)",
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (toolMode !== "select") return;
            if (portalHref) {
              setPortalPreview({ url: portalHref, title: targetLabel || targetId });
              return;
            }
            startEdit(brick.id);
          }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-blue-500/20 bg-blue-950/50 px-2.5 select-none">
            <ExternalLink className="h-3 w-3 shrink-0 text-blue-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Portal</span>
            {targetLabel && <span className="ml-1 truncate text-[9px] text-blue-200/70">{targetLabel}</span>}
            {portalHref && !isEditing && (
              <div className="pointer-events-auto ml-auto flex items-center gap-0.5">
                <button type="button" className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-blue-400/60 hover:text-blue-200 hover:bg-blue-500/20 transition-colors" onClick={(e) => { e.stopPropagation(); setPortalPreview({ url: portalHref, title: targetLabel || targetId }); }} title="Ver en pantalla completa">
                  <Maximize2 className="h-2.5 w-2.5" />
                </button>
                <a href={portalHref} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-blue-400/60 hover:text-blue-200 hover:bg-blue-500/20 transition-colors" onClick={(e) => e.stopPropagation()} title="Abrir en nueva pestaña" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
          </div>
          <div className="h-[calc(100%-28px)]">
            {isEditing ? (
              <div className="flex w-full flex-col gap-2 p-2.5" onMouseDown={(e) => e.stopPropagation()}>
                <select className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground pointer-events-auto"
                  defaultValue={targetType}
                  onChange={(e) => setState((cur) => {
                    const b = cur.bricksById[brick.id]; if (!b) return cur;
                    return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), targetType: e.target.value, previewMarkdown: "", previewKind: "", previewSubtitle: "", previewTitle: "", previewImageDataUrl: "", previewImageSource: "", previewImageCapturedAt: "" } } } };
                  })}
                  onKeyDown={(e) => e.stopPropagation()}>
                  <option value="mesh">Mesh Board</option>
                  <option value="board">Kanban Board</option>
                  <option value="document">Documento</option>
                </select>
                <select className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground pointer-events-auto"
                  defaultValue={portalRenderMode}
                  onChange={(e) => setState((cur) => {
                    const b = cur.bricksById[brick.id]; if (!b) return cur;
                    return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), portalRenderMode: e.target.value } } } };
                  })}
                  onKeyDown={(e) => e.stopPropagation()}>
                  <option value="artifact">Artifact / screenshot</option>
                  <option value="live">Live mini preview</option>
                </select>
                <input autoFocus type="text" placeholder="Nombre del destino…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none pointer-events-auto"
                  value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }} />
                <input type="text" placeholder="ID (meshId / docId)…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={targetId}
                  onBlur={(e) => { const v = e.target.value.trim(); setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), targetId: v, previewMarkdown: "", previewKind: "", previewSubtitle: "", previewTitle: "", previewImageDataUrl: "", previewImageSource: "", previewImageCapturedAt: "" } } } }; }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
              </div>
            ) : targetId ? (
              /* Preview fills full body — double-click on brick opens the iframe overlay */
              <div className="relative h-full w-full overflow-hidden bg-slate-900/60">
                {portalRenderMode === "live" && portalHref ? (
                  <iframe
                    src={portalHref}
                    title={`portal-live-${brick.id}`}
                    className="h-full w-full pointer-events-none"
                  />
                ) : previewImageDataUrl ? (
                  <img
                    src={previewImageDataUrl}
                    alt="Portal preview"
                    className="w-full"
                    style={{ display: "block" }}
                    loading="lazy"
                  />
                ) : portalPreviewBrick ? (
                  <div className="pointer-events-none h-full overflow-hidden p-1.5">
                    <UnifiedBrickRenderer
                      brick={portalPreviewBrick}
                      canEdit={false}
                      onUpdate={() => undefined}
                      documents={[]}
                      boards={[]}
                      activeBricks={[portalPreviewBrick]}
                      users={[]}
                      isCompact
                    />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    <ExternalLink className="h-8 w-8 text-blue-400/25" />
                    <p className="text-[9px] text-blue-400/40">Doble clic para previsualizar</p>
                  </div>
                )}
                {/* Hover overlay with subtitle info */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-2 py-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <p className="truncate text-[10px] font-medium text-blue-100">{targetLabel || targetId.slice(0, 24)}</p>
                  <p className="text-[8px] text-blue-400/60">{previewSubtitle || (targetType === "mesh" ? "Mesh Board" : targetType === "board" ? "Kanban Board" : "Documento")}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-[10px] text-muted-foreground/40">Doble clic para configurar el portal</p>
              </div>
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
      const previewContent = c.previewContent && typeof c.previewContent === "object" ? c.previewContent as Record<string, unknown> : null;
      const sourceKind     = typeof c.sourceType === "string" ? c.sourceType : "";
      const sourceBrickKind = typeof c.sourceBrickKind === "string" ? c.sourceBrickKind : "text";
      const sourcePath     = typeof c.sourcePath === "string" ? c.sourcePath : "";
      const previewKind = !previewContent && ["beautiful_table", "bountiful_table", "database", "tabs", "columns", "accordion"].includes(sourceBrickKind)
        ? "text"
        : sourceBrickKind;
      const mirrorPreviewBrick = (previewContent || previewMd.trim())
        ? mkPreviewBrick(`mirror_${brick.id}`, previewKind, previewMd, previewContent)
        : null;
      return (
        <div key={brick.id}
          className={`group absolute overflow-hidden rounded-xl border${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            borderColor: isSel ? "rgba(255,255,255,0.45)" : "rgba(168,85,247,0.35)",
            background: "transparent",
            cursor: dragState?.brickId === brick.id ? "grabbing" : "grab" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onMouseDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") startEdit(brick.id); }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-slate-900/45 px-2.5 backdrop-blur-md select-none">
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
              <div className="pointer-events-none overflow-auto p-2 opacity-95">
                {mirrorPreviewBrick ? (
                  <div className="h-full w-full overflow-hidden rounded-md border border-white/10 bg-transparent">
                    <UnifiedBrickRenderer
                      brick={mirrorPreviewBrick}
                      canEdit={false}
                      onUpdate={() => undefined}
                      documents={[]}
                      boards={[]}
                      activeBricks={[mirrorPreviewBrick]}
                      users={[]}
                      isCompact
                    />
                  </div>
                ) : (
                  <>
                    <p className="truncate text-[9px] uppercase tracking-wide text-purple-300/60">{sourceKind || "source"}{sourcePath ? ` · ${sourcePath}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground/60">Fuente: {sourceLabel || sourceId.slice(0, 30)}</p>
                  </>
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
            outline: (isSel || isMultiSel) ? "2px solid rgba(255,255,255,0.5)" : isConnected ? "2px solid rgba(34,211,238,0.55)" : "1px solid transparent",
            borderRadius: 6 }}
          onMouseEnter={(e) => { if (!isSel && !isMultiSel && !isConnected) (e.currentTarget as HTMLElement).style.outlineColor = "rgba(34,211,238,0.35)"; }}
          onMouseLeave={(e) => { if (!isSel && !isMultiSel && !isConnected) (e.currentTarget as HTMLElement).style.outlineColor = "transparent"; }}
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
    <div className="relative flex h-full flex-col" style={{ userSelect: anyDrag ? "none" : undefined }}>
      {/* Phase 4: Pen Toolbar */}
      {toolMode === "pen" && (
        <PenToolbar
          color={penColor}
          strokeWidth={penStrokeWidth}
          onColorChange={setPenColor}
          onStrokeWidthChange={setPenStrokeWidth}
        />
      )}

      {isAiDrawerOpen && (
        <div className={`absolute right-0 top-0 z-40 h-full ${mobileMode ? "w-full max-w-full" : "w-[360px] max-w-[90vw]"} border-l border-border/60 bg-card shadow-2xl`}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mesh Copilot</span>
              <button type="button" onClick={() => setIsAiDrawerOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent/15 hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex border-b border-border/40 px-2 pt-1">
              <button
                type="button"
                onClick={() => setMeshAiTab("copilot")}
                className={`flex-1 rounded-t-md px-2 py-2 text-[10px] font-bold uppercase tracking-wide ${meshAiTab === "copilot" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" /> Copilot</span>
              </button>
              <button
                type="button"
                onClick={() => setMeshAiTab("history")}
                className={`flex-1 rounded-t-md px-2 py-2 text-[10px] font-bold uppercase tracking-wide ${meshAiTab === "history" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="inline-flex items-center gap-1"><History className="h-3 w-3" /> History</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {meshAiTab === "copilot" ? (
                <div className="space-y-3">
                  {meshAiMessages.length === 0 && (
                    <div className="rounded border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
                      Pregunta sobre esta mesh. El contexto actual de bricks y conexiones se envia automaticamente.
                    </div>
                  )}
                  {meshAiMessages.map((msg) => (
                    <div key={msg.id} className={`rounded-lg border p-2 text-[12px] ${msg.role === "user" ? "border-blue-500/40 bg-blue-500/10 text-blue-100" : "border-border/60 bg-muted/20 text-foreground"}`}>
                      <div className="mb-1 text-[9px] uppercase tracking-wider opacity-60">{msg.role === "user" ? "Tu" : "Copilot"}</div>
                      <div className="whitespace-pre-wrap">{msg.loading ? "..." : msg.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {meshAiMessages.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Sin historial todavia.</p>
                  ) : (
                    meshAiMessages.map((msg) => (
                      <div key={`h-${msg.id}`} className="rounded border border-border/60 bg-muted/10 px-2 py-1.5 text-[11px]">
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{msg.role} • {new Date(msg.timestamp).toLocaleTimeString()}</div>
                        <div className="truncate">{msg.content || "..."}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {meshAiTab === "copilot" && (
              <form onSubmit={handleMeshAiSubmit} className="border-t border-border/50 p-2">
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                  <input
                    value={meshAiInput}
                    onChange={(e) => setMeshAiInput(e.target.value)}
                    placeholder="Pregunta a IA sobre esta mesh..."
                    className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <button type="submit" disabled={meshAiLoading || !meshAiInput.trim()} className="rounded bg-blue-600 p-1 text-white disabled:opacity-40">
                    {meshAiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {!mobileMode && (
      <>
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/70 px-4 py-1.5">
        <span className="text-sm font-semibold text-foreground">Mesh</span>
        <span className="text-[10px] text-muted-foreground">rev {revision}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center -space-x-1.5 pr-1 sm:flex">
            {presenceMembers.slice(0, 5).map((member) => (
              <img
                key={member.clientId}
                src={getUserAvatarUrl(member.data.avatar_url, member.data.email, 24)}
                alt={member.data.displayName}
                title={member.data.displayName}
                className="h-6 w-6 rounded-full border border-background ring-1 ring-border/50 object-cover bg-muted"
              />
            ))}
            {presenceMembers.length > 5 && (
              <div className="h-6 min-w-6 rounded-full border border-background bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground inline-flex items-center justify-center">
                +{presenceMembers.length - 5}
              </div>
            )}
            {presenceMembers.length === 0 && (
              <div className="h-6 min-w-6 rounded-full border border-background bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground inline-flex items-center justify-center">
                ...
              </div>
            )}
          </div>

          {selectedConnId && <span className="text-[10px] text-muted-foreground">Doble clic en label de conector para editar con toolbar</span>}
          {selectedId && (() => {
            const selB = state.bricksById[selectedId];
            const hasStrokes = selB?.kind === "draw" && !asRec(selB.content).shapePreset &&
              Array.isArray(asRec(selB.content).manualStrokes) &&
              (asRec(selB.content).manualStrokes as unknown[]).length > 0;
            return hasStrokes ? (
              <button type="button" onClick={() => clearDrawStrokes(selectedId)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-500/40 bg-orange-950/30 px-2 text-xs text-orange-300 hover:bg-orange-900/40">
                <Trash2 className="h-3 w-3" /> Borrar trazos
              </button>
            ) : null;
          })()}
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

          <button
            type="button"
            onClick={() => {
              setSidebarTab("copilot");
              setIsAiDrawerOpen(false);
              setIsCommentsOpen(true);
            }}
            className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
              isCommentsOpen && sidebarTab === "copilot"
                ? "border-accent/20 bg-accent/10 text-accent"
                : "border-border bg-card text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            }`}
            title="Copilot"
          >
            <Sparkles className="h-3 w-3" /> Copilot
          </button>

          <button
            type="button"
            onClick={() => {
              setSidebarTab("chat");
              setIsAiDrawerOpen(false);
              setIsCommentsOpen(true);
            }}
            className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
              isCommentsOpen && sidebarTab === "chat"
                ? "border-accent/20 bg-accent/10 text-accent"
                : "border-border bg-card text-muted-foreground hover:bg-accent/10 hover:text-foreground"
            }`}
            title="Comments"
          >
            <MessageSquare className="h-3 w-3" /> Comments
          </button>

          <button
            type="button"
            onClick={handleDownloadMesh}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          >
            <Download className="h-3 w-3" /> Descargar
          </button>

          <button
            type="button"
            onClick={handleShareMesh}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          >
            <Share2 className="h-3 w-3" /> Share
          </button>

          <button type="button" onClick={handleSave} disabled={isSaving || isLoading}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
          </button>

          <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={user?.alias || user?.name || "Usuario"}>
            {(user?.alias || user?.name || "U").charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
      </>
      )}

      {mobileMode && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-slate-950/72 px-3 py-2 text-[10px] text-slate-100 shadow-[0_12px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <span className="font-semibold tracking-wide">Mesh</span>
            <span className="text-slate-400">rev {revision}</span>
            <span className="text-slate-400">{Object.keys(state.bricksById).length} bricks</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-500/15 text-cyan-100 disabled:opacity-50"
              title="Guardar"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left toolbar ── */}
        <div className="hidden w-[180px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card/80 py-2 text-[10px]">

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
                <option value="handdrawn">∿ Hand</option>
                <option value="bezier">⌒ Bezier</option>
                <option value="curved">◡ Curved</option>
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
              className={`absolute inset-0 overflow-hidden touch-none ${toolMode === "pan" ? "cursor-grab" : toolMode === "pen" || toolMode === "conn" ? "cursor-crosshair" : selRect ? "cursor-crosshair" : ""}`}
              style={{
                backgroundImage: showGrid
                  ? "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)"
                  : "none",
                backgroundSize: showGrid ? `${Math.max(10, 20 * viewport.zoom)}px ${Math.max(10, 20 * viewport.zoom)}px` : undefined,
                backgroundPosition: showGrid ? `${viewport.x}px ${viewport.y}px` : undefined,
              }}
              onMouseDown={mobileMode ? undefined : onCanvasMouseDown}
              onMouseMove={mobileMode ? undefined : onMouseMove}
              onMouseUp={mobileMode ? undefined : onMouseUp}
              onMouseLeave={() => { setActivePen(null); setDragState(null); setResizeState(null); setPanDragState(null); selRectRef.current = null; setSelRect(null); }}
              onPointerDown={mobileMode ? onCanvasPointerDown : undefined}
              onPointerMove={mobileMode ? onCanvasPointerMove : undefined}
              onPointerUp={mobileMode ? onCanvasPointerUp : undefined}
              onPointerCancel={mobileMode ? onCanvasPointerUp : undefined}
              onClick={onCanvasClick}
              onWheel={onCanvasWheel}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
            >
              {rootBricks.length === 0 && (
                <div className="pointer-events-none absolute left-8 top-8 z-10 flex items-center gap-2 rounded border border-dashed border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground/60">
                  <AlertTriangle className="h-4 w-4" /> Usa el toolbar inferior · Lápiz (P) para iinkTS · Doble clic en brick para editar
                </div>
              )}

              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                  transformOrigin: "0 0",
                }}
              >

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
                    const stroke    = typeof st.stroke === "string" ? st.stroke : "#22d3ee";
                    const width     = typeof st.width  === "number" ? st.width  : 2;
                    const dashed    = st.pattern === "dashed";
                    const cType     = typeof st.connType === "string" ? st.connType : "technical";
                    const isSC      = selectedConnId === conn.id;
                    const cs        = isSC ? "#fff" : stroke;
                    const cw        = isSC ? width + 1 : width;
                    const srcH      = collapsedBoards.has(src.id) ? 28 : src.size.h;
                    const tgtH      = collapsedBoards.has(tgt.id) ? 28 : tgt.size.h;
                    const srcR      = { x: sg.x, y: sg.y, w: src.size.w, h: srcH };
                    const tgtR      = { x: tg.x, y: tg.y, w: tgt.size.w, h: tgtH };
                    const sp        = typeof st.srcPort === "string" ? st.srcPort as Port : undefined;
                    const tp        = typeof st.tgtPort === "string" ? st.tgtPort as Port : undefined;
                    const srcPreset = asRec(src.content).shapePreset as ShapePreset | undefined;
                    const tgtPreset = asRec(tgt.content).shapePreset as ShapePreset | undefined;
                    const srcAnchor = st.srcAnchorNorm as AnchorNorm | undefined;
                    const tgtAnchor = st.tgtAnchorNorm as AnchorNorm | undefined;
                    // User-modified vector points — used so connections track edited polygon borders
                    const srcVecPts = Array.isArray(asRec(src.content).vectorPoints) ? asRec(src.content).vectorPoints as VecPts : undefined;
                    const tgtVecPts = Array.isArray(asRec(tgt.content).vectorPoints) ? asRec(tgt.content).vectorPoints as VecPts : undefined;
                    const markerId  = isSC ? "url(#arr-sel)" : "url(#arr-norm)";
                    const connLabel = typeof st.label === "string" ? st.label : "";
                    const isEditingConnLabel = editingConnId === conn.id;
                    const labelW    = isEditingConnLabel ? 260 : 180;
                    const labelH    = isEditingConnLabel ? 82 : 28;
                    const labelLift = Math.max(2, labelH * 0.08);

                    // Build path based on connType
                    let d = "";
                    let labelPt = { x: 0, y: 0 };
                    let bezierInfo: ReturnType<typeof buildBezierPath> | null = null;

                    if (cType === "bezier") {
                      const cp1 = st.cp1 as { x: number; y: number } | undefined;
                      const cp2 = st.cp2 as { x: number; y: number } | undefined;
                      bezierInfo = buildBezierPath(srcR, tgtR, cp1, cp2, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      d = bezierInfo.d;
                      labelPt = {
                        x: 0.125 * bezierInfo.e1x + 0.375 * bezierInfo.cp1.x + 0.375 * bezierInfo.cp2.x + 0.125 * bezierInfo.e2x,
                        y: 0.125 * bezierInfo.e1y + 0.375 * bezierInfo.cp1.y + 0.375 * bezierInfo.cp2.y + 0.125 * bezierInfo.e2y,
                      };
                    } else if (cType === "curved") {
                      d = buildCurvedPath(srcR, tgtR, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      const obs2 = Object.values(state.bricksById)
                        .filter((b) => b.id !== src.id && b.id !== tgt.id)
                        .map((b) => { const g = gPos(b.id); return { x: g.x, y: g.y, w: b.size.w, h: b.size.h }; });
                      const rp2 = buildConnPolyline(srcR, tgtR, obs2, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      labelPt = pointAtPolylineFraction(rp2, 0.5);
                    } else {
                      const obs = Object.values(state.bricksById)
                        .filter((b) => b.id !== src.id && b.id !== tgt.id)
                        .map((b) => { const g = gPos(b.id); return { x: g.x, y: g.y, w: b.size.w, h: b.size.h }; });
                      const routePts = buildConnPolyline(srcR, tgtR, obs, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      d = cType === "handdrawn" ? handDrawnPath(routePts, conn.id) : smoothPoly(routePts, CORNER_R);
                      labelPt = pointAtPolylineFraction(routePts, 0.5);
                    }

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
                        <path d={d} fill="none" stroke={cs} strokeWidth={cType === "handdrawn" ? cw + 0.5 : cw}
                          strokeDasharray={dashed ? "6 4" : undefined}
                          strokeLinecap={cType === "handdrawn" ? "round" : "butt"}
                          strokeLinejoin={cType === "handdrawn" ? "round" : "miter"}
                          markerEnd={markerId} opacity={0.9} />

                        {/* Bezier control point handles (vec mode + selected) */}
                        {cType === "bezier" && isSC && toolMode === "vec" && bezierInfo && (
                          <g style={{ pointerEvents: "auto" }}>
                            <line x1={bezierInfo.e1x} y1={bezierInfo.e1y} x2={bezierInfo.cp1.x} y2={bezierInfo.cp1.y} stroke={stroke} strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
                            <line x1={bezierInfo.e2x} y1={bezierInfo.e2y} x2={bezierInfo.cp2.x} y2={bezierInfo.cp2.y} stroke={stroke} strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
                            <circle cx={bezierInfo.cp1.x} cy={bezierInfo.cp1.y} r={6} fill={stroke} opacity={0.85} className="cursor-move"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                const pt = fromEv(e as unknown as React.MouseEvent);
                                setBezierCpDrag({ connId: conn.id, cp: 1, startMouse: pt, startCp: { ...bezierInfo!.cp1 } });
                              }} />
                            <circle cx={bezierInfo.cp2.x} cy={bezierInfo.cp2.y} r={6} fill={stroke} opacity={0.85} className="cursor-move"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                const pt = fromEv(e as unknown as React.MouseEvent);
                                setBezierCpDrag({ connId: conn.id, cp: 2, startMouse: pt, startCp: { ...bezierInfo!.cp2 } });
                              }} />
                          </g>
                        )}
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
                                  <RichText content={connLabel} context={MESH_CONTEXT} className="inline" />
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
                    const srcPresetGhost = asRec(src.content).shapePreset as ShapePreset | undefined;
                    const srcVecPtsGhost = Array.isArray(asRec(src.content).vectorPoints) ? asRec(src.content).vectorPoints as VecPts : undefined;
                    const e = resolveConnEndpoint(
                      { x: sg.x, y: sg.y, w: src.size.w, h: srcH2 },
                      connSrcPort ?? undefined, srcPresetGhost, connSrcAnchor ?? undefined,
                      pointer, srcVecPtsGhost,
                    );
                    const end = snapTarget
                      ? (() => { const b = state.bricksById[snapTarget.brickId]; if (!b) return pointer; const g = gPos(snapTarget.brickId); const bp = asRec(b.content).shapePreset as ShapePreset | undefined; const bvp = Array.isArray(asRec(b.content).vectorPoints) ? asRec(b.content).vectorPoints as VecPts : undefined; return shapePortAbsPos(g.x, g.y, b.size.w, b.size.h, bp, snapTarget.port, bvp); })()
                      : pointer;
                    return <>
                      <line x1={e.x} y1={e.y} x2={end.x} y2={end.y} stroke={String(st.stroke)} strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
                      {snapTarget && <circle cx={end.x} cy={end.y} r={7} fill="#22d3ee" opacity={0.7} />}
                    </>;
                  })()}

                  {/* Pen strokes */}
                  {toolMode === "pen" && <>
                    {penStrokes.map((s, i) => <path key={i} d={strokeToPath(s)} fill="none" stroke={s.color ?? penColor} strokeWidth={s.width ?? penStrokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />)}
                    {activePen && activePen.length > 1 && <path d={strokeToPath({ points: activePen, color: penColor, width: penStrokeWidth })} fill="none" stroke={penColor} strokeWidth={penStrokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
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

          {/* ── Zoom + Grid toolbar (bottom-right) ── */}
          <div className="pointer-events-none absolute bottom-4 right-3 z-30 flex flex-col items-end gap-1.5">
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-cyan-300/20 bg-slate-950/88 px-1.5 py-1 shadow-lg backdrop-blur-md">
              <button
                type="button"
                title="Mostrar/ocultar grilla"
                onClick={() => setShowGrid((v) => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] transition-colors ${showGrid ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>

              <div className="mx-0.5 h-4 w-px bg-white/10" />

              <button
                type="button"
                title="Alejar (Ctrl+scroll)"
                onClick={() => {
                  const el = canvasRef.current;
                  const cx = el ? el.clientWidth / 2 : 0;
                  const cy = el ? el.clientHeight / 2 : 0;
                  setViewport((v) => {
                    const nz = Math.max(0.2, v.zoom * 0.8);
                    const wx = (cx - v.x) / v.zoom;
                    const wy = (cy - v.y) / v.zoom;
                    return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz };
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                title="Restablecer zoom (100%)"
                onClick={() => {
                  const el = canvasRef.current;
                  const cx = el ? el.clientWidth / 2 : 0;
                  const cy = el ? el.clientHeight / 2 : 0;
                  setViewport((v) => {
                    const nz = 1;
                    const wx = (cx - v.x) / v.zoom;
                    const wy = (cy - v.y) / v.zoom;
                    return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz };
                  });
                }}
                className="min-w-[36px] rounded-md px-1.5 py-0.5 text-center text-[9px] font-semibold tabular-nums text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {Math.round(viewport.zoom * 100)}%
              </button>

              <button
                type="button"
                title="Acercar (Ctrl+scroll)"
                onClick={() => {
                  const el = canvasRef.current;
                  const cx = el ? el.clientWidth / 2 : 0;
                  const cy = el ? el.clientHeight / 2 : 0;
                  setViewport((v) => {
                    const nz = Math.min(2.8, v.zoom * 1.25);
                    const wx = (cx - v.x) / v.zoom;
                    const wy = (cy - v.y) / v.zoom;
                    return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz };
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={floatingToolbarRef}
            className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3 ${mobileMode ? "bottom-3 pb-[max(env(safe-area-inset-bottom),0px)]" : "bottom-4"}`}
          >
            <div className="pointer-events-auto flex max-w-full flex-col items-center gap-2">
              {toolbarPanel && (
                <div className={`rounded-2xl border border-cyan-300/20 bg-slate-950/88 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.55)] backdrop-blur-md ${mobileMode ? "w-[min(96vw,640px)]" : "w-[min(92vw,780px)]"}`}>
                  {toolbarPanel === "mode" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Modo</p>
                      <div className="grid grid-cols-5 gap-2">
                        {([
                          ["select", "Select", <MousePointer className="h-3.5 w-3.5" />],
                          ["pan", "Pan", <Hand className="h-3.5 w-3.5" />],
                          ["pen", "Pen", <Pencil className="h-3.5 w-3.5" />],
                          ["conn", "Conn", <Link2 className="h-3.5 w-3.5" />],
                          ["vec", "Vec", <Edit3 className="h-3.5 w-3.5" />],
                        ] as [ToolMode, string, React.ReactNode][]).map(([modeKey, label, icon]) => (
                          <button
                            key={modeKey}
                            type="button"
                            onClick={() => {
                              setToolMode(modeKey);
                              if (modeKey !== "conn") setConnSrcId(null);
                              setToolbarPanel(null);
                            }}
                            className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] transition-colors ${toolMode === modeKey ? "bg-cyan-400/20 text-cyan-100" : "bg-slate-900/80 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-100"}`}
                          >
                            {icon}
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "conn" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Conectores</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {([
                          ["technical", "Technical", "─",   "#22d3ee"],
                          ["dashed",    "Dashed",    "- -", "#7dd3fc"],
                          ["handdrawn", "Hand",      "∿",   "#c4b5fd"],
                          ["bezier",    "Bezier",    "⌒",   "#6ee7b7"],
                          ["curved",    "Curved",    "◡",   "#fbbf24"],
                        ] as [ConnStyle, string, string, string][]).map(([presetKey, label, glyph, color]) => (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() => {
                              setConnPreset(presetKey);
                              setToolMode("conn");
                            }}
                            className={`h-12 rounded-lg border flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${connPreset === presetKey ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-100" : "border-white/10 bg-slate-900/80 text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"}`}
                          >
                            <span className="text-base leading-none" style={{ color: connPreset === presetKey ? "#fff" : color }}>{glyph}</span>
                            <span className="text-[9px]">{label}</span>
                          </button>
                        ))}
                      </div>
                      {connPreset === "bezier" && (
                        <p className="mt-2 text-[9px] text-slate-400">Selecciona la conexión y activa modo Vec para editar los puntos de control.</p>
                      )}
                    </div>
                  )}

                  {toolbarPanel === "basics" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Básicos</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {BASIC_BRICKS.map((entry, i) => (
                          <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                            onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                            onClick={() => { addMeta(entry); setToolbarPanel(null); }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "content" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Contenido</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CONTENT_BRICKS.map((entry, i) => (
                          <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                            onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                            onClick={() => { addMeta(entry); setToolbarPanel(null); }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "shapes" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Formas</p>
                      <div className="grid grid-cols-5 gap-1">
                        {SHAPES.map(({ preset, label }) => (
                          <button key={preset} type="button" title={label} draggable
                            onClick={() => { addShape(preset); setToolbarPanel(null); }}
                            onDragStart={(e) => onToolDragStart(e, { type: "shape", preset })}
                            className="flex flex-col items-center gap-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground">
                            <div className="relative h-[18px] w-[32px]">
                              <ShapeSvg preset={preset} w={32} h={18} stroke="currentColor" fill="none" sw={1.5} />
                            </div>
                            <span className="max-w-[40px] truncate text-[7px] leading-none">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "status" && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 sm:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Bricks: <span className="font-semibold text-cyan-100">{Object.keys(state.bricksById).length}</span></div>
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Conns: <span className="font-semibold text-cyan-100">{Object.keys(state.connectionsById).length}</span></div>
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Modo: <span className="font-semibold text-cyan-100">{toolMode}</span></div>
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Sel: <span className="font-semibold text-cyan-100">{selectedIds.size || (selectedId ? 1 : 0)}</span></div>
                    </div>
                  )}
                </div>
              )}

              <div className={`flex max-w-full items-center gap-1 border px-2 shadow-[0_18px_36px_rgba(0,0,0,0.5)] backdrop-blur-md ${mobileMode ? "rounded-3xl border-cyan-200/35 bg-slate-950/70 py-2" : "rounded-2xl border-cyan-300/20 bg-slate-950/88 py-1"}`}>
                <button type="button" title="Select (S)" onClick={() => { setToolMode("select"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "select")}><MousePointer className="h-4 w-4" /></button>
                <button type="button" title="Pan (H)" onClick={() => { setToolMode("pan"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "pan")}><Hand className="h-4 w-4" /></button>
                <button type="button" title="Pen (P)" onClick={() => { setToolMode("pen"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "pen")}><Pencil className="h-4 w-4" /></button>
                <button type="button" title="Conectores" onClick={() => setToolbarPanel((current) => current === "conn" ? null : "conn")} className={dockBtnClass(toolMode === "conn" || toolbarPanel === "conn")}><Link2 className="h-4 w-4" /></button>
                <button type="button" title="Vector" onClick={() => { setToolMode("vec"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "vec")}><Edit3 className="h-4 w-4" /></button>

                <div className="mx-1 h-6 w-px bg-white/10" />

                <button type="button" title="Modos" onClick={() => setToolbarPanel((current) => current === "mode" ? null : "mode")} className={dockBtnClass(toolbarPanel === "mode")}><Wand2 className="h-4 w-4" /></button>
                <button type="button" title="Básicos" onClick={() => setToolbarPanel((current) => current === "basics" ? null : "basics")} className={dockBtnClass(toolbarPanel === "basics")}><LayoutGrid className="h-4 w-4" /></button>
                <button type="button" title="Contenido" onClick={() => setToolbarPanel((current) => current === "content" ? null : "content")} className={dockBtnClass(toolbarPanel === "content")}><FileText className="h-4 w-4" /></button>
                <button type="button" title="Formas" onClick={() => setToolbarPanel((current) => current === "shapes" ? null : "shapes")} className={dockBtnClass(toolbarPanel === "shapes")}><Square className="h-4 w-4" /></button>
                <button type="button" title="Más" onClick={() => setToolbarPanel((current) => current === "status" ? null : "status")} className={dockBtnClass(toolbarPanel === "status")}><MoreHorizontal className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!mobileMode && (
      <>
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
      </>
      )}

      {/* BoardChatDrawer — inside the mesh container so absolute positioning is bounded here */}
      <BoardChatDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        boardId={meshId}
        initialTab={sidebarTab}
      />
    </div>

    {/* ── Share modal ──────────────────────────────────────────────────────────────── */}
    <MeshShareModal
      isOpen={isShareModalOpen}
      onClose={() => setIsShareModalOpen(false)}
      meshId={meshId ?? ""}
      meshName={`Mesh ${(meshId ?? "").slice(0, 8)}`}
      accessToken={accessToken ?? ""}
    />

    {/* ── Entity selector modal (portal / mirror double-click) ──────────────────────── */}
    {portalPreview && (
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPortalPreview(null); }}>
        <div className="flex h-[85vh] w-[95vw] max-w-[1300px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{portalPreview.title || "Portal preview"}</p>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent/20 hover:text-foreground" onClick={() => setPortalPreview(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <iframe src={portalPreview.url} title="portal-preview-iframe" className="h-full w-full" />
        </div>
      </div>
    )}

    {activeTeamId && accessToken && (
      <EntitySelectorModal
        isOpen={selectorModalBrickId !== null}
        onClose={() => setSelectorModalBrickId(null)}
        teamId={activeTeamId}
        accessToken={accessToken}
        selectionMode={selectorModalBrickKind === "portal" ? "portal" : "mirror"}
        allowedTypes={selectorModalBrickKind === "portal" ? ["mesh", "board", "document"] : ["mesh", "board", "document"]}
        onSelect={(result: EntitySelectorResult) => {
          if (!selectorModalBrickId) return;
          if (selectorModalBrickKind === "portal" && result.type === "mesh" && result.id === meshId) {
            toast("El portal no puede apuntar a esta misma mesh.", "error");
            return;
          }
          void (async () => {
            let portalArtifact: { markdown: string; kind: string; subtitle: string; title: string } | null = null;
            if (selectorModalBrickKind === "portal") {
              portalArtifact = await loadPortalArtifact(result.type, result.id, result.label);
            }
            setState((cur) => {
              const b = cur.bricksById[selectorModalBrickId];
              if (!b) return cur;
              let updated: MeshBrick;
              if (selectorModalBrickKind === "portal") {
                updated = { ...b, content: { ...asRec(b.content),
                  targetId: result.id,
                  targetType: result.type,
                  targetLabel: result.label,
                  portalRenderMode: "artifact",
                  previewMarkdown: portalArtifact?.markdown ?? "",
                  previewKind: portalArtifact?.kind ?? "text",
                  previewSubtitle: portalArtifact?.subtitle ?? "",
                  previewTitle: portalArtifact?.title ?? result.label,
                  previewImageDataUrl: "",
                  previewImageSource: "",
                  previewImageCapturedAt: "",
                } };
              } else {
                updated = { ...b, content: { ...asRec(b.content),
                  sourceId: result.id,
                  sourceLabel: result.label + (result.context ? ` (${result.context})` : ""),
                  sourceType: result.sourceScopeType ?? result.type,
                  sourceScopeId: result.sourceScopeId,
                  sourceCardId: result.sourceCardId,
                  sourceListId: result.sourceListId,
                  sourcePath: result.context,
                  sourceBrickKind: result.brickKind,
                  previewMarkdown: result.previewMarkdown,
                  previewContent: result.previewContent,
                } };
              }

              return { ...cur, bricksById: { ...cur.bricksById, [selectorModalBrickId]: updated } };
            });
            setSelectorModalBrickId(null);
          })();
        }}
      />
    )}
    </>
  );
}
