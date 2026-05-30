"use client";

// ChartGlyph — renders a Mermaid source string as a single self-contained SVG by
// running the shared parser (parseMermaidToMesh) and drawing the resulting
// GeneratedMesh (boards / shapes / polygons / text + edges) into one viewBox that
// scales to fit its container. Used by the "chart metabrick" in the meshboard
// editor and the read-only canvas, so a chart is one editable brick (its data is
// the Mermaid text) instead of many exploded primitives.

import React from "react";
import type { GeneratedMesh, GeneratedMeshNode } from "@/lib/api/contracts";
import { parseMermaidToMesh } from "@/lib/mermaid-mesh";

type Abs = { x: number; y: number; w: number; h: number };

// Resolve absolute positions (child node x/y are relative to their parent ref).
function resolveAbs(mesh: GeneratedMesh): Map<string, Abs> {
  const byRef = new Map<string, GeneratedMeshNode>();
  mesh.nodes.forEach((n) => byRef.set(n.ref, n));
  const cache = new Map<string, Abs>();
  const abs = (ref: string, seen: Set<string>): Abs => {
    const cached = cache.get(ref);
    if (cached) return cached;
    const n = byRef.get(ref);
    if (!n) return { x: 0, y: 0, w: 0, h: 0 };
    let ox = 0, oy = 0;
    if (n.parent && byRef.has(n.parent) && !seen.has(n.parent)) {
      const p = abs(n.parent, new Set(seen).add(ref));
      ox = p.x; oy = p.y;
    }
    const a = { x: ox + n.x, y: oy + n.y, w: n.w, h: n.h };
    cache.set(ref, a);
    return a;
  };
  mesh.nodes.forEach((n) => abs(n.ref, new Set()));
  return cache;
}

function MeshText({ a, node }: { a: Abs; node: GeneratedMeshNode }) {
  const raw = node.label ?? "";
  const lines = raw.split("\n");
  const color = node.textColor || "#e2e8f0";
  const fs = Math.min(14, Math.max(9, a.h / Math.max(1, lines.length) - 2, 10));
  const lh = fs * 1.2;
  const total = lines.length * lh;
  const startY = a.y + (a.h - total) / 2 + fs * 0.85;
  return (
    <text x={a.x + a.w / 2} y={startY} textAnchor="middle" fontFamily="ui-sans-serif, system-ui, sans-serif">
      {lines.map((ln, i) => {
        const bold = /^\*\*.*\*\*$/.test(ln.trim());
        const txt = ln.replace(/\*\*/g, "");
        return (
          <tspan key={i} x={a.x + a.w / 2} y={startY + i * lh} fontSize={fs} fontWeight={bold ? 700 : 400} fill={color}>
            {txt}
          </tspan>
        );
      })}
    </text>
  );
}

function MeshShape({ a, node }: { a: Abs; node: GeneratedMeshNode }) {
  const stroke = node.stroke || "#22d3ee";
  const fill = node.fill || "rgba(34,211,238,0.07)";
  if (Array.isArray(node.vectorPoints) && node.vectorPoints.length >= 3) {
    const pts = node.vectorPoints.map((p) => `${a.x + p.x * a.w},${a.y + p.y * a.h}`).join(" ");
    return <polygon points={pts} stroke={stroke} fill={fill} strokeWidth={1.5} />;
  }
  if (node.shape === "ellipse") {
    return <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2} stroke={stroke} fill={fill} strokeWidth={1.5} />;
  }
  const rx = node.shape === "rect" ? 2 : 8;
  return <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={rx} ry={rx} stroke={stroke} fill={fill} strokeWidth={1.5} />;
}

// Render a pre-parsed GeneratedMesh as a single fitted SVG. Provider-free (no
// hooks/context) so it can be mounted into a detached React root.
export function MeshGlyph({ mesh, className, emptyHint }: { mesh: GeneratedMesh; className?: string; emptyHint?: string }) {
  const { abs, view } = React.useMemo(() => {
    const abs = resolveAbs(mesh);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    abs.forEach((a) => { minX = Math.min(minX, a.x); minY = Math.min(minY, a.y); maxX = Math.max(maxX, a.x + a.w); maxY = Math.max(maxY, a.y + a.h); });
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 60; }
    const pad = 10;
    const view = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    return { abs, view };
  }, [mesh]);

  if (!mesh.nodes.length) {
    return (
      <div className={`flex h-full w-full items-center justify-center rounded-md border border-dashed border-white/15 bg-slate-900/40 p-2 text-center text-[10px] text-slate-400 ${className ?? ""}`}>
        {emptyHint ?? "Sin contenido para renderizar"}
      </div>
    );
  }

  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
    >
      {/* edges first (under nodes) */}
      {mesh.edges.map((e, i) => {
        const sa = abs.get(e.from), ta = abs.get(e.to);
        if (!sa || !ta) return null;
        return (
          <line
            key={`e${i}`}
            x1={sa.x + sa.w / 2} y1={sa.y + sa.h / 2}
            x2={ta.x + ta.w / 2} y2={ta.y + ta.h / 2}
            stroke={e.color || "#64748b"}
            strokeWidth={e.width || 1.5}
            strokeDasharray={e.pattern === "dashed" ? "5 4" : e.pattern === "dotted" ? "2 3" : undefined}
          />
        );
      })}
      {mesh.nodes.map((n) => {
        const a = abs.get(n.ref);
        if (!a) return null;
        if (n.kind === "text") return <MeshText key={n.ref} a={a} node={n} />;
        const shapeEl = <MeshShape a={a} node={n} />;
        // boards carry a header label
        if (n.kind === "board" && n.label) {
          return (
            <g key={n.ref}>
              {shapeEl}
              <text x={a.x + a.w / 2} y={a.y + 16} textAnchor="middle" fontSize={12} fontWeight={700} fill={n.textColor || "#e2e8f0"} fontFamily="ui-sans-serif, system-ui, sans-serif">
                {n.label.replace(/\*\*/g, "")}
              </text>
            </g>
          );
        }
        return <g key={n.ref}>{shapeEl}</g>;
      })}
    </svg>
  );
}

// Parse a Mermaid source string and render it as a single fitted SVG.
export function ChartGlyph({ source, className }: { source: string; className?: string }) {
  const mesh = React.useMemo(() => {
    try { return parseMermaidToMesh(source || ""); } catch { return { nodes: [], edges: [] } as GeneratedMesh; }
  }, [source]);
  return <MeshGlyph mesh={mesh} className={className} emptyHint={source?.trim() ? "No se pudo renderizar el gráfico" : "Gráfico vacío — edita la fuente Mermaid"} />;
}
