"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import type { DocumentBrick } from "@/lib/api/documents";

// ─── Types (from mesh-schema / page.web.tsx) ─────────────────────────────────

export type MeshBrickKind = "board_empty" | "text" | "frame" | "script" | "mirror" | "portal" | "decision" | "draw";

export type MeshBrick = {
  id: string;
  kind: MeshBrickKind;
  parentId: string | null;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation?: number;
  metadata?: Record<string, unknown>;
  content?: Record<string, unknown>;
};

export type MeshConnection = {
  id: string;
  cons: [string, string];
  label?: { type: string; content?: unknown[] };
  style?: Record<string, unknown>;
};

export type MeshState = {
  version: string;
  viewport: { x: number; y: number; zoom: number };
  rootOrder: string[];
  bricksById: Record<string, MeshBrick>;
  connectionsById: Record<string, MeshConnection>;
};

type ShapePreset =
  | "rect" | "rounded-rect" | "circle" | "ellipse" | "diamond"
  | "triangle" | "hexagon" | "star" | "arrow" | "note"
  | "frame-vector" | "flow-terminator";

type Port = "top" | "right" | "bottom" | "left";
type AnchorNorm = { x: number; y: number };
type VecPts = { x: number; y: number }[];
type ObstaclePoly = { x: number; y: number; w: number; h: number; polyPts?: Array<{ x: number; y: number }> };

type ManualStroke = {
  points: Array<{ x: number; y: number }>;
  color: string | undefined;
  width: number | undefined;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function childOrder(b: MeshBrick): string[] {
  const co = asRec(b.content).childOrder;
  return Array.isArray(co) ? (co as string[]).filter((v) => typeof v === "string") : [];
}

function getMd(b: MeshBrick): string {
  const md = asRec(b.content).markdown;
  return typeof md === "string" ? md : "";
}

function normalizeManualStrokes(raw: unknown): ManualStroke[] {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .map((entry) => {
      const rec = asRec(entry);
      const rawPoints = Array.isArray(entry)
        ? (entry as unknown[])
        : Array.isArray(rec.points)
          ? (rec.points as unknown[])
          : [];
      const points = rawPoints
        .map((point) => {
          const p = asRec(point);
          const x = typeof p.x === "number" ? p.x : NaN;
          const y = typeof p.y === "number" ? p.y : NaN;
          return { x, y };
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

      if (points.length === 0) return null;

      const legacyEntry = Array.isArray(entry);

      return {
        points,
        color: legacyEntry
          ? "#67e8f9"
          : typeof rec.color === "string"
            ? rec.color
            : undefined,
        width: legacyEntry
          ? 2
          : typeof rec.width === "number" && Number.isFinite(rec.width)
            ? rec.width
            : undefined,
      } satisfies ManualStroke;
    })
    .filter((stroke): stroke is ManualStroke => stroke !== null);

  return normalized;
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
    createdByUserId: "preview",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
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

// ─── ShapeSvg ─────────────────────────────────────────────────────────────────

function ShapeSvg({
  preset, w, h, pts,
  stroke = "#22d3ee", fill = "rgba(34,211,238,0.07)", sw = 2, cr = 10,
}: {
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0"
      style={{ overflow: "visible" }}>
      <polygon points={pStr} stroke={stroke} fill={fill} strokeWidth={sw} />
    </svg>
  );
}

// ─── Connector pathfinding (from page.web.tsx) ───────────────────────────────

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

function portAbsPos(gx: number, gy: number, bw: number, bh: number, port: Port) {
  switch (port) {
    case "top":    return { x: gx + bw / 2, y: gy,          nx: 0,  ny: -1 };
    case "right":  return { x: gx + bw,     y: gy + bh / 2, nx: 1,  ny: 0  };
    case "bottom": return { x: gx + bw / 2, y: gy + bh,     nx: 0,  ny: 1  };
    case "left":   return { x: gx,          y: gy + bh / 2, nx: -1, ny: 0  };
  }
}

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

function pointInPolygon(px: number, py: number, pts: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segHitsPolyPts(
  ax: number, ay: number, bx: number, by: number,
  pts: Array<{ x: number; y: number }>,
): boolean {
  if (pointInPolygon((ax + bx) / 2, (ay + by) / 2, pts)) return true;
  const n = pts.length;
  const d1x = bx - ax, d1y = by - ay;
  for (let i = 0; i < n; i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    const d2x = B.x - A.x, d2y = B.y - A.y;
    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) continue;
    const t = ((A.x - ax) * d2y - (A.y - ay) * d2x) / cross;
    const u = ((A.x - ax) * d1y - (A.y - ay) * d1x) / cross;
    if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) return true;
  }
  return false;
}

function mkObstaclePoly(b: MeshBrick, g: { x: number; y: number }): ObstaclePoly {
  const preset = (asRec(b.content).shapePreset as ShapePreset | undefined);
  const bvp = Array.isArray(asRec(b.content).vectorPoints) ? asRec(b.content).vectorPoints as VecPts : undefined;
  const rawNorm = bvp ?? (preset ? SHAPE_PTS[preset] : undefined);
  let polyPts: Array<{ x: number; y: number }> | undefined;
  if (rawNorm) {
    polyPts = rawNorm.map((p) => ({ x: g.x + p.x * b.size.w, y: g.y + p.y * b.size.h }));
  } else if (preset === "circle" || preset === "ellipse" || preset === "flow-terminator") {
    const a = b.size.w / 2, bh = b.size.h / 2, cx = g.x + a, cy = g.y + bh;
    polyPts = Array.from({ length: 16 }, (_, i) => {
      const theta = (i / 16) * Math.PI * 2;
      return { x: cx + a * Math.cos(theta), y: cy + bh * Math.sin(theta) };
    });
  }
  return { x: g.x, y: g.y, w: b.size.w, h: b.size.h, polyPts };
}

function mkPolyFromRect(
  rect: { x: number; y: number; w: number; h: number },
  preset?: ShapePreset,
  vecPts?: VecPts,
): ObstaclePoly {
  const rawNorm = vecPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  let polyPts: Array<{ x: number; y: number }> | undefined;
  if (rawNorm) {
    polyPts = rawNorm.map((p) => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h }));
  } else if (preset === "circle" || preset === "ellipse" || preset === "flow-terminator") {
    const a = rect.w / 2, bh = rect.h / 2, cx = rect.x + a, cy = rect.y + bh;
    polyPts = Array.from({ length: 16 }, (_, i) => {
      const theta = (i / 16) * Math.PI * 2;
      return { x: cx + a * Math.cos(theta), y: cy + bh * Math.sin(theta) };
    });
  }
  return { ...rect, polyPts };
}

function collisionScore(
  pts: Array<{ x: number; y: number }>,
  obs: ObstaclePoly[],
  skipFirst = 0,
  skipLast = 0,
): number {
  let n = 0;
  const end = pts.length - 1 - skipLast;
  for (let i = skipFirst; i < end; i++) {
    const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
    for (const o of obs) {
      if (o.polyPts) {
        if (segHitsPolyPts(ax, ay, bx, by, o.polyPts)) n++;
      } else if (segHitsRect(ax, ay, bx, by, o.x + 4, o.y + 4, o.w - 8, o.h - 8)) {
        n++;
      }
    }
  }
  return n;
}

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

const STUB = 28, CORNER_R = 10;

function polylineLength(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  return len;
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

function seedRand(seed: string, i: number): number {
  let h = 5381;
  for (let j = 0; j < seed.length; j++) h = (h * 33 ^ seed.charCodeAt(j)) >>> 0;
  h = (h * 1664525 + i * 1013904223) >>> 0;
  return h / 4294967296;
}

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
    const w1 = (seedRand(seed, i * 4) - 0.5) * 2 * amp;
    const w2 = (seedRand(seed, i * 4 + 1) - 0.5) * 2 * amp;
    const cp1x = (a.x + dx / 3 + px * w1).toFixed(1);
    const cp1y = (a.y + dy / 3 + py * w1).toFixed(1);
    const cp2x = (a.x + dx * 2 / 3 + px * w2).toFixed(1);
    const cp2y = (a.y + dy * 2 / 3 + py * w2).toFixed(1);
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

function ellipseExit(
  cx: number, cy: number, a: number, b: number,
  dx: number, dy: number,
): { x: number; y: number; nx: number; ny: number } {
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: cx, y: cy - b, nx: 0, ny: -1 };
  const ndx = dx / len, ndy = dy / len;
  const t = 1 / Math.sqrt((ndx / a) ** 2 + (ndy / b) ** 2);
  const ex = cx + ndx * t, ey = cy + ndy * t;
  const nx = Math.abs(ndx) >= Math.abs(ndy) ? (ndx > 0 ? 1 : -1) : 0;
  const ny = Math.abs(ndx) >= Math.abs(ndy) ? 0 : (ndy > 0 ? 1 : -1);
  return { x: ex, y: ey, nx, ny };
}

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
    bestT = t;
    bestX = cx + t * dx;
    bestY = cy + t * dy;
    const el = Math.hypot(edx, edy) || 1;
    let nx = edy / el, ny = -edx / el;
    if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
    bestNx = nx;
    bestNy = ny;
  }
  return { x: bestX, y: bestY, nx: bestNx, ny: bestNy };
}

function shapeEdgeExit(
  bx: number, by: number, bw: number, bh: number,
  preset: ShapePreset | undefined,
  tcx: number, tcy: number,
  customPts?: VecPts,
): { x: number; y: number; nx: number; ny: number } {
  if (preset === "circle" || preset === "ellipse") {
    return ellipseExit(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, tcx - (bx + bw / 2), tcy - (by + bh / 2));
  }
  if (preset === "flow-terminator") {
    const r = Math.min(bw, bh) / 2;
    return ellipseExit(bx + bw / 2, by + bh / 2, r, r, tcx - (bx + bw / 2), tcy - (by + bh / 2));
  }
  const rawPts = customPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  if (!rawPts) return edgeExit(bx, by, bw, bh, tcx, tcy);
  const cx = bx + bw / 2, cy = by + bh / 2;
  const dx = tcx - cx, dy = tcy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: cx, y: cy - bh / 2, nx: 0, ny: -1 };
  const result = rayPolygonExit(cx, cy, rawPts.map((p) => ({ x: bx + p.x * bw, y: by + p.y * bh })), dx / len, dy / len);
  const nx = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0;
  const ny = Math.abs(dx) >= Math.abs(dy) ? 0 : (dy > 0 ? 1 : -1);
  return { x: result.x, y: result.y, nx, ny };
}

function shapePortAbsPos(
  gx: number, gy: number, bw: number, bh: number,
  preset: ShapePreset | undefined,
  port: Port,
  customPts?: VecPts,
): { x: number; y: number; nx: number; ny: number } {
  const dirs: Record<Port, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
  const [dx, dy] = dirs[port];
  if (preset === "circle" || preset === "ellipse") {
    return { ...ellipseExit(gx + bw / 2, gy + bh / 2, bw / 2, bh / 2, dx, dy), nx: dx, ny: dy };
  }
  if (preset === "flow-terminator") {
    const r = Math.min(bw, bh) / 2;
    return { ...ellipseExit(gx + bw / 2, gy + bh / 2, r, r, dx, dy), nx: dx, ny: dy };
  }
  const rawPts = customPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  if (!rawPts) return portAbsPos(gx, gy, bw, bh, port);
  const result = rayPolygonExit(gx + bw / 2, gy + bh / 2, rawPts.map((p) => ({ x: gx + p.x * bw, y: gy + p.y * bh })), dx, dy);
  return { x: result.x, y: result.y, nx: dx, ny: dy };
}

function resolveConnEndpoint(
  rect: { x: number; y: number; w: number; h: number },
  port: Port | undefined,
  preset: ShapePreset | undefined,
  anchor: AnchorNorm | undefined,
  fallback: { x: number; y: number },
  vecPts?: VecPts,
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

function buildConnPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: ObstaclePoly[],
  srcPort?: Port,
  tgtPort?: Port,
  srcPreset?: ShapePreset,
  tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm,
  tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts,
  tgtVecPts?: VecPts,
): string {
  return smoothPoly(
    buildConnPolyline(srcRect, tgtRect, obs, srcPort, tgtPort, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts),
    CORNER_R,
  );
}

function buildConnPolyline(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: ObstaclePoly[],
  srcPort?: Port,
  tgtPort?: Port,
  srcPreset?: ShapePreset,
  tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm,
  tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts,
  tgtVecPts?: VecPts,
): Array<{ x: number; y: number }> {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const s1 = { x: e1.x + e1.nx * STUB, y: e1.y + e1.ny * STUB };
  const s2 = { x: e2.x + e2.nx * STUB, y: e2.y + e2.ny * STUB };

  const srcOb = mkPolyFromRect(srcRect, srcPreset, srcVecPts);
  const tgtOb = mkPolyFromRect(tgtRect, tgtPreset, tgtVecPts);
  const allObs = [srcOb, tgtOb, ...obs];
  const score = (pts: Array<{ x: number; y: number }>) => collisionScore(pts, allObs, 1, 1);

  const hvPts: Array<{ x: number; y: number }> = [e1, s1, { x: s2.x, y: s1.y }, s2, e2];
  const vhPts: Array<{ x: number; y: number }> = [e1, s1, { x: s1.x, y: s2.y }, s2, e2];
  const hvSc = score(hvPts), vhSc = score(vhPts);

  if (hvSc === 0 && vhSc === 0) return polylineLength(hvPts) <= polylineLength(vhPts) ? hvPts : vhPts;
  if (hvSc === 0) return hvPts;
  if (vhSc === 0) return vhPts;

  const M = 36;
  let best = hvSc <= vhSc ? hvPts : vhPts;
  let bestSc = Math.min(hvSc, vhSc), bestLen = polylineLength(best);

  const consider = (cand: Array<{ x: number; y: number }>) => {
    const cs = score(cand), cl = polylineLength(cand);
    if (cs < bestSc || (cs === bestSc && cl < bestLen)) { best = cand; bestSc = cs; bestLen = cl; }
  };

  for (const ob of allObs) {
    const top = ob.y - M, bot = ob.y + ob.h + M;
    const lft = ob.x - M, rgt = ob.x + ob.w + M;
    consider([e1, s1, { x: s1.x, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: s2.y }, s2, e2]);
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

function buildBezierPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  cp1?: { x: number; y: number },
  cp2?: { x: number; y: number },
  srcPort?: Port,
  tgtPort?: Port,
  srcPreset?: ShapePreset,
  tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm,
  tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts,
  tgtVecPts?: VecPts,
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

function buildCurvedPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  srcPort?: Port,
  tgtPort?: Port,
  srcPreset?: ShapePreset,
  tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm,
  tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts,
  tgtVecPts?: VecPts,
): string {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const mx = (e1.x + e2.x) / 2 + (e2.y - e1.y) * 0.25;
  const my = (e1.y + e2.y) / 2 - (e2.x - e1.x) * 0.25;
  return `M${e1.x.toFixed(1)},${e1.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${e2.x.toFixed(1)},${e2.y.toFixed(1)}`;
}

// ─── Fit-to-screen helper ─────────────────────────────────────────────────────

function fitViewport(
  bricksById: Record<string, MeshBrick>,
  containerW: number,
  containerH: number,
): { x: number; y: number; zoom: number } {
  const bricks = Object.values(bricksById);
  if (bricks.length === 0) return { x: 0, y: 0, zoom: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  bricks.forEach((b) => {
    const g = resolveGlobal(bricksById, b.id);
    minX = Math.min(minX, g.x);
    minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + b.size.w);
    maxY = Math.max(maxY, g.y + b.size.h);
  });
  const PAD = 60;
  const worldW = maxX - minX + PAD * 2;
  const worldH = maxY - minY + PAD * 2;
  const zoom = Math.max(0.1, Math.min(1.5, Math.min(containerW / worldW, containerH / worldH)));
  const x = (containerW - worldW * zoom) / 2 - (minX - PAD) * zoom;
  const y = (containerH - worldH * zoom) / 2 - (minY - PAD) * zoom;
  return { x, y, zoom };
}

// ─── Markdown renderer (minimal, no deps) ────────────────────────────────────

function renderMd(text: string): string {
  if (!text) return "";
  // bold
  let out = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // strikethrough
  out = out.replace(/~~(.*?)~~/g, "<del>$1</del>");
  // inline code
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1 text-[0.8em]">$1</code>');
  // strip color/size tokens (visual only in editor)
  out = out.replace(/\[(?:color|size):[^\]]*\](.*?)\[\/(?:color|size)\]/gs, "$1");
  return out;
}

// ─── Brick Renderer (read-only) ───────────────────────────────────────────────

function RenderBrick({
  brick,
  bricksById,
  connectedIds,
}: {
  brick: MeshBrick;
  bricksById: Record<string, MeshBrick>;
  connectedIds: Set<string>;
}) {
  const g = resolveGlobal(bricksById, brick.id);
  const c = asRec(brick.content);

  // Treat "decision" as a diamond draw brick
  const effectiveKind: MeshBrickKind =
    brick.kind === "decision" ? "draw" : brick.kind;
  const shapeP: ShapePreset | undefined =
    brick.kind === "decision"
      ? "diamond"
      : (c.shapePreset as ShapePreset | undefined);

  const styleR = asRec(c.style);
  const sStroke = typeof styleR.stroke === "string" ? styleR.stroke : "#22d3ee";
  const sFill   = typeof styleR.fill   === "string" ? styleR.fill   : "rgba(34,211,238,0.07)";
  const sSW     = typeof styleR.strokeWidth === "number" ? styleR.strokeWidth : 2;
  const vecPts  = Array.isArray(c.vectorPoints)
    ? (c.vectorPoints as { x: number; y: number }[])
    : undefined;

  const isConnected = connectedIds.has(brick.id);
  const uKind = typeof c.unifierKind === "string" ? c.unifierKind : null;
  const isUnifier = brick.kind === "text" || ((brick.kind === "portal" || brick.kind === "mirror") && !!uKind);
  const unifierKindFinal = uKind ?? (brick.kind === "mirror" ? "callout" : "text");
  const docBrick = isUnifier ? toDocBrick(brick, unifierKindFinal) : null;

  const text = getMd(brick);

  // ── board_empty ────────────────────────────────────────────────────────────
  if (effectiveKind === "board_empty") {
    const title = typeof c.title === "string" ? c.title : typeof c.name === "string" ? c.name : "";
    const kids = childOrder(brick)
      .map((id) => bricksById[id])
      .filter(Boolean);

    return (
      <div
        className="absolute overflow-visible rounded-xl border"
        style={{
          left: g.x,
          top: g.y,
          width: brick.size.w,
          height: brick.size.h,
          borderColor: "rgba(34,211,238,0.6)",
          borderWidth: 2,
          background: "rgba(15,23,42,0.35)",
        }}
      >
        <div
          className="flex h-7 items-center px-3 text-[10px] font-bold uppercase tracking-widest text-cyan-300 select-none rounded-t-xl"
          style={{ background: "rgba(34,211,238,0.06)", borderBottom: "1px solid rgba(34,211,238,0.2)" }}
        >
          <span className="truncate">{title || "Board"}</span>
        </div>

        {kids.map((kid) => (
          <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} connectedIds={connectedIds} />
        ))}
      </div>
    );
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  if (effectiveKind === "frame") {
    const isVec = !!shapeP;
    const label = text || (typeof c.title === "string" ? c.title : "");
    const kids = childOrder(brick).map((id) => bricksById[id]).filter(Boolean);

    return (
      <div
        className="absolute"
        style={{ left: g.x, top: g.y, width: brick.size.w, height: brick.size.h }}
      >
        {isVec && shapeP ? (
          <ShapeSvg
            preset={shapeP}
            w={brick.size.w}
            h={brick.size.h}
            pts={vecPts}
            stroke={sStroke}
            fill={sFill}
            sw={sSW}
          />
        ) : (
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              border: `2px dashed ${sStroke}`,
              background: sFill,
            }}
          />
        )}
        {label && (
          <div className="absolute left-2 top-1.5 text-[10px] font-semibold text-cyan-200/70 select-none pointer-events-none">
            {label}
          </div>
        )}
        {kids.map((kid) => (
          <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} connectedIds={connectedIds} />
        ))}
      </div>
    );
  }

  // ── draw / decision ────────────────────────────────────────────────────────
  if (effectiveKind === "draw") {
    const hasShape = !!shapeP;
    const isContainer = !!c.isContainer;
    const kids = isContainer
      ? childOrder(brick).map((id) => bricksById[id]).filter(Boolean)
      : [];

    const manualStrokes = normalizeManualStrokes(c.manualStrokes);

    if (!hasShape) {
      return (
        <div
          className="absolute rounded-xl"
          style={{
            left: g.x,
            top: g.y,
            width: brick.size.w,
            height: brick.size.h,
            background: "transparent",
            outline: "1px solid transparent",
          }}
        >
          {manualStrokes.length > 0 && (
            <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${brick.size.w} ${brick.size.h}`}>
              {manualStrokes.map((stroke, idx) => {
                if (!stroke.points.length) return null;
                const d = stroke.points
                  .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * brick.size.w).toFixed(1)},${(p.y * brick.size.h).toFixed(1)}`)
                  .join(" ");
                return (
                  <path
                    key={idx}
                    d={d}
                    fill="none"
                    stroke={stroke.color ?? "#67e8f9"}
                    strokeWidth={stroke.width ?? 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                );
              })}
            </svg>
          )}
          {isContainer && kids.map((kid) => (
            <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} connectedIds={connectedIds} />
          ))}
        </div>
      );
    }

    const tPadX = Math.round(brick.size.w * 0.18);
    const tPadY = Math.round(brick.size.h * 0.18);

    return (
      <div
        className="absolute rounded-xl"
        style={{
          left: g.x,
          top: g.y,
          width: brick.size.w,
          height: brick.size.h,
          outline:  "1px solid transparent",
        }}
      >
        <ShapeSvg
          preset={shapeP!}
          w={brick.size.w}
          h={brick.size.h}
          pts={vecPts}
          stroke={sStroke}
          fill="rgba(0,0,0,0)"
          sw={sSW}
        />

        {manualStrokes.length > 0 && (
          <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${brick.size.w} ${brick.size.h}`}>
            {manualStrokes.map((stroke, idx) => {
              if (!stroke.points.length) return null;
              const d = stroke.points
                .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * brick.size.w).toFixed(1)},${(p.y * brick.size.h).toFixed(1)}`)
                .join(" ");
              return (
                <path
                  key={idx}
                  d={d}
                  fill="none"
                  stroke={stroke.color ?? "#67e8f9"}
                  strokeWidth={stroke.width ?? 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.95}
                />
              );
            })}
          </svg>
        )}

        {text && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{ padding: `${tPadY}px ${tPadX}px`, zIndex: 10 }}
          >
            <p
              className="text-center text-xs leading-snug text-slate-100"
              dangerouslySetInnerHTML={{ __html: renderMd(text) }}
            />
          </div>
        )}

        {isContainer && kids.map((kid) => (
          <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} connectedIds={connectedIds} />
        ))}
      </div>
    );
  }

  // ── text + unifier bricks (original unified renderer path) ─────────────────
  if (docBrick) {
    return (
      <div
        className="absolute overflow-hidden rounded-md"
        style={{
          left: g.x,
          top: g.y,
          width: brick.size.w,
          height: brick.size.h,
          outline: isConnected ? "2px solid rgba(34,211,238,0.55)" : "1px solid transparent",
          borderRadius: 6,
        }}
      >
        <div className="h-full w-full overflow-auto pointer-events-none">
          <UnifiedBrickRenderer
            brick={docBrick}
            canEdit={false}
            onUpdate={() => undefined}
            documents={[]}
            boards={[]}
            activeBricks={[docBrick]}
            users={[]}
            isCompact
          />
        </div>
      </div>
    );
  }

  // ── portal (classic) ───────────────────────────────────────────────────────
  if (brick.kind === "portal" && !uKind) {
    const targetLabel = typeof c.targetLabel === "string" ? c.targetLabel : "";
    const targetType = typeof c.targetType === "string" ? c.targetType : "mesh";
    const targetId = typeof c.targetId === "string" ? c.targetId : "";
    const previewMd = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";
    const previewKind = typeof c.previewKind === "string" ? c.previewKind : "text";
    const previewImageDataUrl = typeof c.previewImageDataUrl === "string" ? c.previewImageDataUrl : "";
    const portalPreviewBrick = previewMd.trim() ? mkPreviewBrick(`portal_${brick.id}`, previewKind, previewMd) : null;

    return (
      <div
        className="absolute overflow-hidden rounded-xl border-2"
        style={{
          left: g.x,
          top: g.y,
          width: brick.size.w,
          height: brick.size.h,
          borderColor: isConnected ? "rgba(34,211,238,0.55)" : "rgba(59,130,246,0.55)",
          background: "rgba(15,23,42,0.92)",
        }}
      >
        <div className="flex h-7 items-center gap-1.5 border-b border-blue-500/20 bg-blue-950/50 px-2.5 select-none">
          <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Portal</span>
          {targetLabel && <span className="ml-1 truncate text-[9px] text-blue-200/70">{targetLabel}</span>}
        </div>
        <div className="relative h-[calc(100%-28px)] w-full overflow-hidden bg-slate-900/60">
          {previewImageDataUrl ? (
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
            <div className="flex h-full items-center justify-center px-3">
              <p className="text-[10px] text-blue-400/30 text-center">
                {targetLabel || targetId || (targetType === "board" ? "Kanban Board" : targetType === "document" ? "Documento" : "Mesh Board")}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── mirror (classic) ───────────────────────────────────────────────────────
  if (brick.kind === "mirror" && !uKind) {
    const sourceId = typeof c.sourceId === "string" ? c.sourceId : "";
    const sourceLabel = typeof c.sourceLabel === "string" ? c.sourceLabel : "";
    const previewMd = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";
    const previewContent = c.previewContent && typeof c.previewContent === "object" ? c.previewContent as Record<string, unknown> : null;
    const sourceBrickKind = typeof c.sourceBrickKind === "string" ? c.sourceBrickKind : "text";
    const previewKind = !previewContent && ["beautiful_table", "bountiful_table", "database", "tabs", "columns", "accordion"].includes(sourceBrickKind)
      ? "text"
      : sourceBrickKind;
    const mirrorPreviewBrick = (previewContent || previewMd.trim())
      ? mkPreviewBrick(`mirror_${brick.id}`, previewKind, previewMd, previewContent)
      : null;

    return (
      <div
        className="absolute overflow-hidden rounded-xl border"
        style={{
          left: g.x,
          top: g.y,
          width: brick.size.w,
          height: brick.size.h,
          borderColor: isConnected ? "rgba(34,211,238,0.55)" : "rgba(168,85,247,0.35)",
          background: "transparent",
        }}
      >
        <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-slate-900/45 px-2.5 backdrop-blur-md select-none">
          <span className="text-[9px] font-bold uppercase tracking-widest text-purple-300">Mirror</span>
          {sourceLabel && <span className="ml-auto truncate text-[9px] text-purple-400/50">{sourceLabel}</span>}
          <span className="ml-1 text-[7px] text-purple-400/30">read-only</span>
        </div>
        <div className="flex h-[calc(100%-28px)] flex-col overflow-hidden">
          {(previewMd || sourceId) ? (
            <div className="pointer-events-none overflow-auto p-2 opacity-95 h-full">
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
                <p className="text-[10px] text-muted-foreground/60">Fuente: {sourceLabel || sourceId.slice(0, 30)}</p>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-[10px] text-muted-foreground/40">Mirror sin contenido</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── script / fallback ─────────────────────────────────────────────────────
  return (
    <div
      className="absolute overflow-hidden rounded-lg border border-slate-600/40 bg-slate-900/60 p-2"
      style={{ left: g.x, top: g.y, width: brick.size.w, height: brick.size.h }}
    >
      <p className="text-[9px] text-slate-400/50 uppercase tracking-wider">{brick.kind}</p>
    </div>
  );
}

// ─── Connector Renderer ───────────────────────────────────────────────────────

function ConnectorLayer({ state }: { state: MeshState }) {
  const conns = Object.values(state.connectionsById);
  if (conns.length === 0) return null;

  const readAnchor = (value: unknown): AnchorNorm | undefined => {
    const rec = asRec(value);
    return typeof rec.x === "number" && typeof rec.y === "number" ? { x: rec.x, y: rec.y } : undefined;
  };

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      <defs>
        <marker id="pub-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="context-stroke" opacity="0.9" />
        </marker>
      </defs>

      {conns.map((conn) => {
        const src = state.bricksById[conn.cons[0]];
        const tgt = state.bricksById[conn.cons[1]];
        if (!src || !tgt) return null;

        const sg = resolveGlobal(state.bricksById, src.id);
        const tg = resolveGlobal(state.bricksById, tgt.id);
        const srcRect = { x: sg.x, y: sg.y, w: src.size.w, h: src.size.h };
        const tgtRect = { x: tg.x, y: tg.y, w: tgt.size.w, h: tgt.size.h };

        const st = asRec(conn.style);
        const stroke = typeof st.stroke === "string" ? st.stroke : "#22d3ee";
        const width  = typeof st.width  === "number" ? st.width  : 2;
        const dashed = st.pattern === "dashed";
        const cType = typeof st.connType === "string" ? st.connType : "technical";
        const sp = typeof st.srcPort === "string" ? st.srcPort as Port : undefined;
        const tp = typeof st.tgtPort === "string" ? st.tgtPort as Port : undefined;
        const srcPreset = asRec(src.content).shapePreset as ShapePreset | undefined;
        const tgtPreset = asRec(tgt.content).shapePreset as ShapePreset | undefined;
        const srcAnchor = readAnchor(st.srcAnchorNorm);
        const tgtAnchor = readAnchor(st.tgtAnchorNorm);
        const srcVecPts = Array.isArray(asRec(src.content).vectorPoints) ? asRec(src.content).vectorPoints as VecPts : undefined;
        const tgtVecPts = Array.isArray(asRec(tgt.content).vectorPoints) ? asRec(tgt.content).vectorPoints as VecPts : undefined;

        const obs = Object.values(state.bricksById)
          .filter((b) => b.id !== src.id && b.id !== tgt.id)
          .map((b) => mkObstaclePoly(b, resolveGlobal(state.bricksById, b.id)));

        const routePts = buildConnPolyline(srcRect, tgtRect, obs, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);

        let d = "";
        let labelPt = pointAtPolylineFraction(routePts, 0.5);

        if (cType === "bezier") {
          const cp1 = readAnchor(st.cp1);
          const cp2 = readAnchor(st.cp2);
          const bezierInfo = buildBezierPath(srcRect, tgtRect, cp1, cp2, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
          d = bezierInfo.d;
          labelPt = {
            x: 0.125 * bezierInfo.e1x + 0.375 * bezierInfo.cp1.x + 0.375 * bezierInfo.cp2.x + 0.125 * bezierInfo.e2x,
            y: 0.125 * bezierInfo.e1y + 0.375 * bezierInfo.cp1.y + 0.375 * bezierInfo.cp2.y + 0.125 * bezierInfo.e2y,
          };
        } else if (cType === "curved") {
          d = buildCurvedPath(srcRect, tgtRect, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
        } else if (cType === "handdrawn") {
          d = handDrawnPath(routePts, conn.id);
        } else {
          d = buildConnPath(srcRect, tgtRect, obs, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
        }

        // label at midpoint (prefer style.label from original runtime)
        const label = (() => {
          if (typeof st.label === "string" && st.label.trim().length > 0) return st.label.trim();
          if (!conn.label) return "";
          const lContent = asRec(conn.label);
          const items = Array.isArray(lContent.content) ? (lContent.content as unknown[]) : [];
          const firstPara = items[0];
          if (!firstPara) return "";
          const paraRec = asRec(firstPara);
          const inlines = Array.isArray(paraRec.content) ? (paraRec.content as unknown[]) : [];
          return inlines.map((il) => {
            const r = asRec(il);
            return typeof r.text === "string" ? r.text : "";
          }).join("").trim();
        })();

        return (
          <g key={conn.id}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={cType === "handdrawn" ? width + 0.5 : width}
              strokeDasharray={dashed ? "6 4" : undefined}
              strokeLinecap={cType === "handdrawn" ? "round" : "butt"}
              strokeLinejoin={cType === "handdrawn" ? "round" : "miter"}
              markerEnd="url(#pub-arr)"
              opacity={0.9}
            />
            {label && (
              <text
                x={labelPt.x}
                y={labelPt.y - 6}
                fontSize={10}
                fill="#e2e8f0"
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Brick render order (root order + nested) ─────────────────────────────────

function renderBrickTree(
  ids: string[],
  bricksById: Record<string, MeshBrick>,
  connectedIds: Set<string>,
): React.ReactNode[] {
  return ids.map((id) => {
    const b = bricksById[id];
    if (!b) return null;
    return <RenderBrick key={id} brick={b} bricksById={bricksById} connectedIds={connectedIds} />;
  });
}

// ─── Main canvas component ───────────────────────────────────────────────────

interface PublicMeshCanvasProps {
  state: MeshState;
  meshName?: string;
}

export function PublicMeshCanvas({ state, meshName }: PublicMeshCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>(() => ({
    x: state.viewport.x,
    y: state.viewport.y,
    zoom: state.viewport.zoom || 1,
  }));

  const [panState, setPanState] = useState<{ startMouse: { x: number; y: number }; startVp: { x: number; y: number } } | null>(null);

  const connectedBrickIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(state.connectionsById).forEach((conn) => {
      ids.add(conn.cons[0]);
      ids.add(conn.cons[1]);
    });
    return ids;
  }, [state.connectionsById]);

  // Fit on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const bricks = Object.values(state.bricksById);
    if (bricks.length === 0) return;
    const vp = fitViewport(state.bricksById, el.clientWidth, el.clientHeight);
    setViewport(vp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewport(fitViewport(state.bricksById, el.clientWidth, el.clientHeight));
  }, [state.bricksById]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setViewport((v) => {
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const nz = Math.max(0.1, Math.min(3, v.zoom * delta));
      const wx = (mx - v.x) / v.zoom;
      const wy = (my - v.y) / v.zoom;
      return { x: mx - wx * nz, y: my - wy * nz, zoom: nz };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setPanState({ startMouse: { x: e.clientX, y: e.clientY }, startVp: { x: viewport.x, y: viewport.y } });
  }, [viewport.x, viewport.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panState) return;
    setViewport((v) => ({
      ...v,
      x: panState.startVp.x + (e.clientX - panState.startMouse.x),
      y: panState.startVp.y + (e.clientY - panState.startMouse.y),
    }));
  }, [panState]);

  const handleMouseUp = useCallback(() => {
    setPanState(null);
  }, []);

  // Touch pan
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !lastTouchRef.current) return;
    const dx = e.touches[0].clientX - lastTouchRef.current.x;
    const dy = e.touches[0].clientY - lastTouchRef.current.y;
    lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);
  const handleTouchEnd = useCallback(() => {
    lastTouchRef.current = null;
  }, []);

  // Top-level bricks (no parent)
  const orderedIds = [
    ...state.rootOrder,
    ...Object.keys(state.bricksById).filter((id) => !state.rootOrder.includes(id)),
  ];

  const rootIds = orderedIds.filter((id) => {
    const b = state.bricksById[id];
    return b && !b.parentId;
  });

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-[#0a0e18] select-none"
      style={{ cursor: panState ? "grabbing" : "grab" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Grid */}
      <svg
        className="pointer-events-none absolute inset-0"
        style={{ width: "100%", height: "100%", opacity: 0.15 }}
      >
        <defs>
          <pattern
            id="pub-grid"
            width={20 * viewport.zoom}
            height={20 * viewport.zoom}
            patternUnits="userSpaceOnUse"
            x={viewport.x % (20 * viewport.zoom)}
            y={viewport.y % (20 * viewport.zoom)}
          >
            <circle cx={0} cy={0} r={0.8} fill="#64748b" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pub-grid)" />
      </svg>

      {/* World layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Connectors (below bricks) */}
        <ConnectorLayer state={state} />

        {/* Bricks */}
        {renderBrickTree(rootIds, state.bricksById, connectedBrickIds)}
      </div>

      {/* HUD — zoom controls */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/85 px-1 py-1 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            title="Ajustar pantalla"
            onClick={handleFit}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Alejar"
            onClick={() => setViewport((v) => {
              const nz = Math.max(0.1, v.zoom / 1.25);
              const el = containerRef.current;
              const cx = el ? el.clientWidth / 2 : 0, cy = el ? el.clientHeight / 2 : 0;
              return { x: cx - (cx - v.x) / v.zoom * nz, y: cy - (cy - v.y) / v.zoom * nz, zoom: nz };
            })}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewport((v) => {
              const el = containerRef.current;
              const cx = el ? el.clientWidth / 2 : 0, cy = el ? el.clientHeight / 2 : 0;
              return { x: cx - (cx - v.x) / v.zoom * 1, y: cy - (cy - v.y) / v.zoom * 1, zoom: 1 };
            })}
            className="min-w-[36px] rounded-md px-1.5 py-0.5 text-center text-[9px] font-semibold tabular-nums text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button
            type="button"
            title="Acercar"
            onClick={() => setViewport((v) => {
              const nz = Math.min(3, v.zoom * 1.25);
              const el = containerRef.current;
              const cx = el ? el.clientWidth / 2 : 0, cy = el ? el.clientHeight / 2 : 0;
              return { x: cx - (cx - v.x) / v.zoom * nz, y: cy - (cy - v.y) / v.zoom * nz, zoom: nz };
            })}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Empty state */}
      {rootIds.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-slate-500">Este mesh no tiene bricks todavía.</p>
        </div>
      )}
    </div>
  );
}
