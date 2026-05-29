"use client";

import React from "react";
import type { MeshBrick } from "@/lib/api/contracts";
import type { MeshTemplate } from "@/lib/mesh-templates";

// Static, scaled-down SVG preview of a mesh template. Renders boards as rounded
// rects, shape bricks by a simplified geometry, text bricks as a faint bar, and
// connections as lines between brick centers — all in the template's own colors.

function asRec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function resolveGlobal(byId: Record<string, MeshBrick>, id: string): { x: number; y: number } {
  let x = 0, y = 0;
  let cur: MeshBrick | undefined = byId[id];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    x += cur.position.x; y += cur.position.y;
    cur = cur.parentId ? byId[cur.parentId] : undefined;
  }
  return { x, y };
}

export function MeshTemplateThumb({ tpl, width = 168, height = 104 }: { tpl: MeshTemplate; width?: number; height?: number }) {
  const byId: Record<string, MeshBrick> = {};
  tpl.bricks.forEach((b) => { byId[b.id] = b; });

  // Bounding box over all bricks in global coords.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const placed = tpl.bricks.map((b) => {
    const g = resolveGlobal(byId, b.id);
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + b.size.w); maxY = Math.max(maxY, g.y + b.size.h);
    return { b, g };
  });
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }

  const pad = 10;
  const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
  const scale = Math.min((width - pad * 2) / bw, (height - pad * 2) / bh);
  const offX = pad + (width - pad * 2 - bw * scale) / 2;
  const offY = pad + (height - pad * 2 - bh * scale) / 2;
  const X = (x: number) => offX + (x - minX) * scale;
  const Y = (y: number) => offY + (y - minY) * scale;

  const center = (id: string) => {
    const b = byId[id]; if (!b) return null;
    const g = resolveGlobal(byId, id);
    return { x: X(g.x + b.size.w / 2), y: Y(g.y + b.size.h / 2) };
  };

  // Draw containers first so children sit on top.
  const ordered = [...placed].sort((a, c) => {
    const ac = a.b.kind === "board_empty" || !!asRec(a.b.content).isContainer ? 0 : 1;
    const cc = c.b.kind === "board_empty" || !!asRec(c.b.content).isContainer ? 0 : 1;
    return ac - cc;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {/* connections under bricks */}
      {tpl.connections.map((conn) => {
        const a = center(conn.cons[0]); const b = center(conn.cons[1]);
        if (!a || !b) return null;
        const stroke = (asRec(conn.style).stroke as string) || "#22d3ee";
        return <line key={conn.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={1.25} strokeOpacity={0.7} />;
      })}
      {ordered.map(({ b, g }) => {
        const c = asRec(b.content);
        const style = asRec(c.style);
        const stroke = (style.stroke as string) || "#22d3ee";
        const fillC = (style.fill as string) || "rgba(34,211,238,0.10)";
        const x = X(g.x), y = Y(g.y), w = b.size.w * scale, h = b.size.h * scale;
        const preset = typeof c.shapePreset === "string" ? c.shapePreset : null;
        const isBoard = b.kind === "board_empty";

        if (b.kind === "text") {
          return <rect key={b.id} x={x} y={y + h / 2 - 2} width={w} height={4} rx={2} fill={stroke} fillOpacity={0.5} />;
        }
        if (isBoard) {
          return (
            <g key={b.id}>
              <rect x={x} y={y} width={w} height={h} rx={4} fill={fillC} stroke={stroke} strokeWidth={1.25} strokeOpacity={0.85} />
              <rect x={x} y={y} width={w} height={Math.min(7, h)} rx={3} fill={stroke} fillOpacity={0.22} />
            </g>
          );
        }
        // shape bricks
        if (preset === "ellipse" || preset === "circle" || preset === "stadium") {
          return <ellipse key={b.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={fillC} stroke={stroke} strokeWidth={1.25} />;
        }
        if (preset === "diamond" || preset === "diamond-wide") {
          const cx = x + w / 2, cy = y + h / 2;
          return <polygon key={b.id} points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} fill={fillC} stroke={stroke} strokeWidth={1.25} />;
        }
        if (preset === "cylinder") {
          return (
            <g key={b.id}>
              <rect x={x} y={y + 4} width={w} height={h - 8} fill={fillC} stroke={stroke} strokeWidth={1.25} />
              <ellipse cx={x + w / 2} cy={y + 4} rx={w / 2} ry={4} fill={fillC} stroke={stroke} strokeWidth={1.25} />
            </g>
          );
        }
        const rx = preset === "rect" ? 1 : 4;
        return <rect key={b.id} x={x} y={y} width={w} height={h} rx={rx} fill={fillC} stroke={stroke} strokeWidth={1.25} />;
      })}
    </svg>
  );
}
