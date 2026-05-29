"use client";

// Self-contained force-directed graph on a <canvas>. No external deps: a small
// Coulomb repulsion + spring (edges) + gravity simulation with alpha cooldown,
// pan/zoom, node drag, hover highlight and click-to-navigate.

import React from "react";
import type { GraphData, GNode, GEdgeType } from "@/lib/graph/types";
import { getImageElement } from "@/lib/image-cache";

type Pos = { x: number; y: number; vx: number; vy: number };

const TYPE_COLOR: Record<string, string> = {
  document: "#60a5fa", board: "#c084fc", card: "#34d399", mesh: "#f472b6", meshBrick: "#94a3b8",
};
const EDGE_STYLE: Record<GEdgeType, { color: string; alpha: number }> = {
  ref: { color: "#f87171", alpha: 0.55 },
  portal: { color: "#fbbf24", alpha: 0.6 },
  mirror: { color: "#22d3ee", alpha: 0.6 },
  connection: { color: "#64748b", alpha: 0.35 },
  similarity: { color: "#a78bfa", alpha: 0.3 },
};

export function GraphCanvas({
  data,
  showLabels = true,
  showMedia = true,
  imageUrls,
  onNodeClick,
}: {
  data: GraphData;
  showLabels?: boolean;
  showMedia?: boolean;
  /** node id → resolved displayable image url (thumbnail) */
  imageUrls?: Map<string, string>;
  /** click opens a preview; ctrl/cmd-click redirects (redirect=true). */
  onNodeClick?: (node: GNode, opts: { redirect: boolean }) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const posRef = React.useRef<Map<string, Pos>>(new Map());
  const viewRef = React.useRef({ x: 0, y: 0, scale: 1 });
  const alphaRef = React.useRef(1);
  const hoverRef = React.useRef<string | null>(null);
  const armedRef = React.useRef(false); // ctrl/cmd held → redirect mode
  const dragRef = React.useRef<{ id: string | null; panning: boolean; lastX: number; lastY: number; moved: boolean; redirect: boolean }>({ id: null, panning: false, lastX: 0, lastY: 0, moved: false, redirect: false });
  const rafRef = React.useRef<number | null>(null);

  // Degree (for node radius) + adjacency (for hover highlight).
  const { degree, adjacency } = React.useMemo(() => {
    const deg = new Map<string, number>();
    const adj = new Map<string, Set<string>>();
    for (const e of data.edges) {
      deg.set(e.source, (deg.get(e.source) || 0) + 1);
      deg.set(e.target, (deg.get(e.target) || 0) + 1);
      (adj.get(e.source) ?? adj.set(e.source, new Set()).get(e.source)!).add(e.target);
      (adj.get(e.target) ?? adj.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    return { degree: deg, adjacency: adj };
  }, [data]);

  // Node radius grows with connection count (degree) — hubs are clearly bigger.
  const radiusOf = React.useCallback((id: string) => 5 + Math.min(34, Math.sqrt(degree.get(id) || 0) * 4.2), [degree]);

  // (Re)seed positions when the node set changes; keep existing positions.
  React.useEffect(() => {
    const pos = posRef.current;
    const ids = new Set(data.nodes.map((n) => n.id));
    for (const id of [...pos.keys()]) if (!ids.has(id)) pos.delete(id);
    const R = Math.max(200, data.nodes.length * 6);
    data.nodes.forEach((n, i) => {
      if (!pos.has(n.id)) {
        const a = (i / Math.max(1, data.nodes.length)) * Math.PI * 2;
        pos.set(n.id, { x: Math.cos(a) * R * (0.4 + Math.random() * 0.6), y: Math.sin(a) * R * (0.4 + Math.random() * 0.6), vx: 0, vy: 0 });
      }
    });
    alphaRef.current = 1;
  }, [data.nodes]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let running = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const step = () => {
      if (!running) return;
      const pos = posRef.current;
      const nodes = data.nodes;
      const alpha = alphaRef.current;

      if (alpha > 0.02) {
        // Repulsion (O(n^2)).
        for (let i = 0; i < nodes.length; i += 1) {
          const a = pos.get(nodes[i].id)!; if (!a) continue;
          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = pos.get(nodes[j].id)!; if (!b) continue;
            let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy;
            if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
            const f = (2200 * alpha) / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
          }
        }
        // Springs.
        for (const e of data.edges) {
          const a = pos.get(e.source); const b = pos.get(e.target); if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const rest = e.type === "similarity" ? 130 : 90;
          const k = (e.type === "similarity" ? 0.01 : 0.04) * alpha;
          const f = (d - rest) * k;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        // Collision: hard-separate overlapping nodes by their radii (avoidance).
        for (let i = 0; i < nodes.length; i += 1) {
          const a = pos.get(nodes[i].id)!; if (!a) continue;
          const ra = radiusOf(nodes[i].id);
          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = pos.get(nodes[j].id)!; if (!b) continue;
            const min = ra + radiusOf(nodes[j].id) + 6;
            let dx = a.x - b.x, dy = a.y - b.y; let d = Math.sqrt(dx * dx + dy * dy);
            if (d > 0 && d < min) {
              const push = (min - d) / 2;
              dx /= d; dy /= d;
              a.x += dx * push; a.y += dy * push; b.x -= dx * push; b.y -= dy * push;
            }
          }
        }
        // Gravity to centre + integrate.
        for (const n of nodes) {
          const p = pos.get(n.id)!; if (!p) continue;
          p.vx += -p.x * 0.002 * alpha; p.vy += -p.y * 0.002 * alpha;
          if (dragRef.current.id === n.id) { p.vx = 0; p.vy = 0; continue; }
          p.x += p.vx; p.y += p.vy; p.vx *= 0.82; p.vy *= 0.82;
        }
        alphaRef.current *= 0.992;
      }

      // ── Render ──
      const view = viewRef.current;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      ctx.translate(rect.width / 2 + view.x, rect.height / 2 + view.y);
      ctx.scale(view.scale, view.scale);

      const hover = hoverRef.current;
      const hl = hover ? adjacency.get(hover) : null;

      for (const e of data.edges) {
        const a = pos.get(e.source); const b = pos.get(e.target); if (!a || !b) continue;
        const st = EDGE_STYLE[e.type];
        const active = !hover || e.source === hover || e.target === hover;
        // Gentle quadratic curve (perpendicular bow) — reduces straight-line
        // overlap and visually routes links around the field.
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y; const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const bow = Math.min(28, len * 0.12);
        const cx = mx + (-dy / len) * bow, cy = my + (dx / len) * bow;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(cx, cy, b.x, b.y);
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = active ? st.alpha : 0.06;
        ctx.lineWidth = (e.type === "ref" || e.type === "portal" ? 1.4 : 1) / view.scale;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const n of nodes) {
        const p = pos.get(n.id); if (!p) continue;
        const r = radiusOf(n.id);
        const dim = hover && hover !== n.id && !(hl && hl.has(n.id));
        ctx.globalAlpha = dim ? 0.25 : 1;
        const thumbUrl = showMedia ? imageUrls?.get(n.id) : undefined;
        const thumb = thumbUrl ? getImageElement(thumbUrl) : null;
        if (thumb) {
          // Clip to circle and draw the image cover-fit.
          ctx.save();
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
          const iw = thumb.naturalWidth, ih = thumb.naturalHeight;
          const scale = Math.max((r * 2) / iw, (r * 2) / ih);
          const dw = iw * scale, dh = ih * scale;
          ctx.drawImage(thumb, p.x - dw / 2, p.y - dh / 2, dw, dh);
          ctx.restore();
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = TYPE_COLOR[n.type] || "#94a3b8"; ctx.lineWidth = 1.5 / view.scale; ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = TYPE_COLOR[n.type] || "#94a3b8";
          ctx.fill();
        }
        if (showMedia && n.hasMedia) {
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.5 / view.scale, 0, Math.PI * 2);
          ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 1.5 / view.scale; ctx.stroke();
        }
        // Ctrl/Cmd held + hovered → redirect affordance (dashed cyan ring + ↗).
        if (armedRef.current && hover === n.id) {
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 5 / view.scale, 0, Math.PI * 2);
          ctx.strokeStyle = "#22d3ee"; ctx.setLineDash([4 / view.scale, 3 / view.scale]); ctx.lineWidth = 2 / view.scale; ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "#22d3ee"; ctx.font = `bold ${Math.max(10, 12 / view.scale)}px ui-sans-serif, system-ui`;
          ctx.fillText("↗", p.x - r - 12 / view.scale, p.y + 4 / view.scale);
        }
        if (showLabels && (view.scale > 0.55 || hover === n.id) && !dim) {
          ctx.globalAlpha = hover === n.id ? 1 : 0.7;
          ctx.fillStyle = "#cbd5e1";
          ctx.font = `${Math.max(9, 11 / view.scale)}px ui-sans-serif, system-ui`;
          ctx.fillText(n.label.slice(0, 40), p.x + r + 3, p.y + 3);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    // ── Interaction ──
    const toWorld = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect(); const view = viewRef.current;
      return { x: (cx - rect.left - rect.width / 2 - view.x) / view.scale, y: (cy - rect.top - rect.height / 2 - view.y) / view.scale };
    };
    const hitTest = (cx: number, cy: number): string | null => {
      const w = toWorld(cx, cy);
      for (let i = data.nodes.length - 1; i >= 0; i -= 1) {
        const n = data.nodes[i]; const p = posRef.current.get(n.id); if (!p) continue;
        const r = radiusOf(n.id) + 4;
        if ((w.x - p.x) ** 2 + (w.y - p.y) ** 2 <= r * r) return n.id;
      }
      return null;
    };

    const onDown = (ev: PointerEvent) => {
      const id = hitTest(ev.clientX, ev.clientY);
      dragRef.current = { id, panning: !id, lastX: ev.clientX, lastY: ev.clientY, moved: false, redirect: ev.ctrlKey || ev.metaKey };
      canvas.setPointerCapture(ev.pointerId);
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d.id || d.panning) {
        const dx = ev.clientX - d.lastX, dy = ev.clientY - d.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
        d.lastX = ev.clientX; d.lastY = ev.clientY;
        if (d.id) { const p = posRef.current.get(d.id); if (p) { const v = viewRef.current; p.x += dx / v.scale; p.y += dy / v.scale; } alphaRef.current = Math.max(alphaRef.current, 0.3); }
        else { viewRef.current.x += dx; viewRef.current.y += dy; }
      } else {
        hoverRef.current = hitTest(ev.clientX, ev.clientY);
        canvas.style.cursor = hoverRef.current ? "pointer" : "grab";
      }
    };
    const onUp = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d.id && !d.moved) { const n = data.nodes.find((x) => x.id === d.id); if (n) onNodeClick?.(n, { redirect: d.redirect }); }
      dragRef.current = { id: null, panning: false, lastX: 0, lastY: 0, moved: false, redirect: false };
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    };
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const v = viewRef.current;
      const factor = ev.deltaY < 0 ? 1.1 : 0.9;
      v.scale = Math.max(0.15, Math.min(4, v.scale * factor));
    };

    const onKey = (ev: KeyboardEvent) => {
      const armed = ev.ctrlKey || ev.metaKey;
      if (armed !== armedRef.current) { armedRef.current = armed; if (hoverRef.current) canvas.style.cursor = armed ? "alias" : "pointer"; }
    };
    const disarm = () => { armedRef.current = false; };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", disarm);

    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", disarm);
    };
  }, [data, adjacency, radiusOf, showLabels, showMedia, imageUrls, onNodeClick]);

  return <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ cursor: "grab" }} />;
}
