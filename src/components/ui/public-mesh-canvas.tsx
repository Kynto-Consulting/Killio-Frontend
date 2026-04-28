"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

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

function buildConnPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
): string {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = edgeExit(srcRect.x, srcRect.y, srcRect.w, srcRect.h, tc.x, tc.y);
  const e2 = edgeExit(tgtRect.x, tgtRect.y, tgtRect.w, tgtRect.h, sc.x, sc.y);
  const s1 = { x: e1.x + e1.nx * STUB, y: e1.y + e1.ny * STUB };
  const s2 = { x: e2.x + e2.nx * STUB, y: e2.y + e2.ny * STUB };
  const hvPts = [e1, s1, { x: s2.x, y: s1.y }, s2, e2];
  const vhPts = [e1, s1, { x: s1.x, y: s2.y }, s2, e2];
  const hvLen = hvPts.reduce((a, b, i) => i > 0 ? a + Math.hypot(b.x - hvPts[i - 1].x, b.y - hvPts[i - 1].y) : a, 0);
  const vhLen = vhPts.reduce((a, b, i) => i > 0 ? a + Math.hypot(b.x - vhPts[i - 1].x, b.y - vhPts[i - 1].y) : a, 0);
  return smoothPoly(hvLen <= vhLen ? hvPts : vhPts, CORNER_R);
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
}: {
  brick: MeshBrick;
  bricksById: Record<string, MeshBrick>;
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
        {/* Header */}
        <div
          className="flex h-7 items-center px-3 text-[10px] font-bold uppercase tracking-widest text-cyan-300 select-none rounded-t-xl"
          style={{ background: "rgba(34,211,238,0.06)", borderBottom: "1px solid rgba(34,211,238,0.2)" }}
        >
          <span className="truncate">{title || "Board"}</span>
        </div>

        {/* Render children in-place (they use absolute global coords) */}
        {kids.map((kid) => (
          <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} />
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
          <div
            className="absolute left-2 top-1.5 text-[10px] font-semibold text-cyan-200/70 select-none pointer-events-none"
          >
            {label}
          </div>
        )}
        {kids.map((kid) => (
          <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} />
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

    // Pen strokes
    const manualStrokes = Array.isArray(c.manualStrokes)
      ? (c.manualStrokes as Array<{ points: Array<{ x: number; y: number }>; color?: string; width?: number }>)
      : [];
    const penPathD = manualStrokes
      .map((s) => {
        if (!s.points.length) return "";
        const [f, ...rest] = s.points;
        return (
          `M${(g.x + f.x * brick.size.w).toFixed(1)},${(g.y + f.y * brick.size.h).toFixed(1)}` +
          rest.map((p) => ` L${(g.x + p.x * brick.size.w).toFixed(1)},${(g.y + p.y * brick.size.h).toFixed(1)}`).join("")
        );
      })
      .filter(Boolean)
      .join(" ");

    const tPadX = Math.round(brick.size.w * 0.18);
    const tPadY = Math.round(brick.size.h * 0.18);

    return (
      <div
        className="absolute"
        style={{ left: g.x, top: g.y, width: brick.size.w, height: brick.size.h }}
      >
        {hasShape && (
          <ShapeSvg
            preset={shapeP!}
            w={brick.size.w}
            h={brick.size.h}
            pts={vecPts}
            stroke={sStroke}
            fill={sFill}
            sw={sSW}
          />
        )}

        {/* Pen strokes overlay */}
        {penPathD && (
          <svg
            className="pointer-events-none absolute inset-0"
            width={brick.size.w}
            height={brick.size.h}
            viewBox={`${g.x} ${g.y} ${brick.size.w} ${brick.size.h}`}
          >
            {manualStrokes.map((s, i) => {
              if (!s.points.length) return null;
              const [f, ...rest] = s.points;
              const sd =
                `M${(g.x + f.x * brick.size.w).toFixed(1)},${(g.y + f.y * brick.size.h).toFixed(1)}` +
                rest.map((p) => ` L${(g.x + p.x * brick.size.w).toFixed(1)},${(g.y + p.y * brick.size.h).toFixed(1)}`).join("");
              return (
                <path
                  key={i}
                  d={sd}
                  fill="none"
                  stroke={s.color ?? "#ffffff"}
                  strokeWidth={s.width ?? 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
          </svg>
        )}

        {/* Text inside shape */}
        {text && hasShape && (
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

        {/* Children */}
        {isContainer && kids.map((kid) => (
          <RenderBrick key={kid.id} brick={kid} bricksById={bricksById} />
        ))}
      </div>
    );
  }

  // ── text ───────────────────────────────────────────────────────────────────
  if (effectiveKind === "text") {
    return (
      <div
        className="absolute overflow-hidden rounded-lg"
        style={{ left: g.x, top: g.y, width: brick.size.w, height: brick.size.h }}
      >
        <div
          className="h-full w-full overflow-hidden p-2 text-xs leading-relaxed text-slate-100"
          dangerouslySetInnerHTML={{ __html: renderMd(text) }}
        />
      </div>
    );
  }

  // ── portal ────────────────────────────────────────────────────────────────
  if (brick.kind === "portal") {
    const targetLabel = typeof c.targetLabel === "string" ? c.targetLabel : "";
    const targetType  = typeof c.targetType  === "string" ? c.targetType  : "mesh";
    const hasImage    = typeof c.previewImageDataUrl === "string" && (c.previewImageDataUrl as string).startsWith("data:image/");

    return (
      <div
        className="absolute overflow-hidden rounded-xl border-2"
        style={{
          left: g.x, top: g.y,
          width: brick.size.w, height: brick.size.h,
          borderColor: "rgba(59,130,246,0.55)",
          background: "rgba(15,23,42,0.92)",
        }}
      >
        <div className="flex h-7 items-center gap-1.5 border-b border-blue-500/20 bg-slate-900/40 px-2.5 select-none">
          <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Portal</span>
          {targetLabel && <span className="ml-1 truncate text-[9px] text-blue-400/50">{targetLabel}</span>}
        </div>
        <div className="flex h-[calc(100%-28px)] items-center justify-center">
          {hasImage ? (
            <img
              src={c.previewImageDataUrl as string}
              alt="Portal preview"
              className="w-full h-full object-cover opacity-80"
            />
          ) : (
            <p className="text-[10px] text-blue-400/30 text-center px-3">
              {targetLabel || (targetType === "board" ? "Kanban Board" : targetType === "document" ? "Documento" : "Mesh Board")}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── mirror ────────────────────────────────────────────────────────────────
  if (brick.kind === "mirror") {
    const sourceLabel = typeof c.sourceLabel    === "string" ? c.sourceLabel    : "";
    const previewMd   = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";

    return (
      <div
        className="absolute overflow-hidden rounded-xl border-2"
        style={{
          left: g.x, top: g.y,
          width: brick.size.w, height: brick.size.h,
          borderColor: "rgba(168,85,247,0.55)",
          background: "rgba(15,23,42,0.92)",
        }}
      >
        <div className="flex h-7 items-center gap-1.5 border-b border-purple-500/20 bg-slate-900/40 px-2.5 select-none">
          <span className="text-[9px] font-bold uppercase tracking-widest text-purple-300">Mirror</span>
          {sourceLabel && <span className="ml-1 truncate text-[9px] text-purple-400/50">{sourceLabel}</span>}
        </div>
        <div className="overflow-hidden p-2 text-[10px] leading-relaxed text-slate-300/80 pointer-events-none">
          {previewMd ? (
            <p dangerouslySetInnerHTML={{ __html: renderMd(previewMd) }} />
          ) : (
            <p className="text-purple-400/25">Vista espejo</p>
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

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      <defs>
        <marker id="pub-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="#22d3ee" opacity="0.9" />
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
        const d = buildConnPath(srcRect, tgtRect);

        const st = asRec(conn.style);
        const stroke = typeof st.stroke === "string" ? st.stroke : "#22d3ee";
        const width  = typeof st.width  === "number" ? st.width  : 2;
        const dashed = st.pattern === "dashed";

        // label at midpoint
        const label = (() => {
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
              strokeWidth={width}
              strokeDasharray={dashed ? "6 4" : undefined}
              markerEnd="url(#pub-arr)"
              opacity={0.9}
            />
            {label && (() => {
              // approximate midpoint from path
              return (
                <text
                  fontSize={10}
                  fill="#e2e8f0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                >
                  {label}
                </text>
              );
            })()}
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
): React.ReactNode[] {
  return ids.map((id) => {
    const b = bricksById[id];
    if (!b) return null;
    return <RenderBrick key={id} brick={b} bricksById={bricksById} />;
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
  const rootIds = state.rootOrder.filter((id) => {
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
        {renderBrickTree(rootIds, state.bricksById)}
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
