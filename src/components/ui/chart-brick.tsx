"use client";

// ChartBrick — first-class chart metabricks. Each chart stores a typed spec
// object (NOT Mermaid text). Renderer draws SVG inside the brick's actual w/h
// (so it resizes naturally). Editor is a structured UI (rows, color pickers)
// per chart type — no plain-text mermaid editor.

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";

// Shared translator for editor strings (uses the i18n fallback when no
// provider is mounted, e.g. inside a detached React root).
const useE = () => {
  const t = useTranslations("mesh");
  return (k: string) => t(`charts.editor.${k}` as any);
};

const PALETTE = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#fb7185", "#4ade80", "#c084fc", "#2dd4bf", "#facc15"];
const hexA = (hex: string, a: number) => { let h = hex.replace("#",""); if (h.length===3) h=h.split("").map(c=>c+c).join(""); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); return [r,g,b].some(Number.isNaN) ? hex : `rgba(${r},${g},${b},${a})`; };

// ─── Spec types ───────────────────────────────────────────────────────────────
export type PieSpec = { title?: string; items: { label: string; value: number; color?: string }[] };
export type BarLineSpec = { title?: string; xLabels: string[]; series: { label?: string; values: number[]; color?: string }[]; yMin?: number; yMax?: number };
export type RadarSpec = { title?: string; axes: string[]; curves: { label: string; values: number[]; color?: string }[]; max?: number };
export type QuadrantSpec = { title?: string; xLow?: string; xHigh?: string; yLow?: string; yHigh?: string; quads?: [string,string,string,string]; points: { label: string; x: number; y: number; color?: string }[] };
export type TreemapSpec = { title?: string; items: { label: string; value: number; color?: string }[] };
export type KanbanSpec = { title?: string; columns: { title: string; cards: string[]; color?: string }[] };
export type GanttSpec  = { title?: string; tasks: { name: string; section?: string; start: string; end: string; status?: "done"|"active"|"crit"|"milestone" }[] };
export type VennSpec   = { title?: string; sets: { label: string; color?: string }[] };
export type PacketSpec = { title?: string; fields: { start: number; end: number; label: string; color?: string }[] };
export type WardleySpec= { title?: string; components: { name: string; vis: number; evo: number; color?: string }[]; links: { from: string; to: string }[] };

export type ChartType = "pie" | "bar" | "line" | "radar" | "quadrant" | "treemap" | "kanban" | "gantt" | "venn" | "packet" | "wardley";

export type ChartSpec =
  | { type: "pie";      spec: PieSpec }
  | { type: "bar";      spec: BarLineSpec }
  | { type: "line";     spec: BarLineSpec }
  | { type: "radar";    spec: RadarSpec }
  | { type: "quadrant"; spec: QuadrantSpec }
  | { type: "treemap";  spec: TreemapSpec }
  | { type: "kanban";   spec: KanbanSpec }
  | { type: "gantt";    spec: GanttSpec }
  | { type: "venn";     spec: VennSpec }
  | { type: "packet";   spec: PacketSpec }
  | { type: "wardley";  spec: WardleySpec };

// Styling overrides from the brick's `content.style` — applied where each
// chart type can sensibly use them. Per-type support declared in
// CHART_STYLE_SUPPORT below; the style panel uses that to hide controls that
// wouldn't visibly affect the chart.
export type ChartStyling = {
  stroke?: string;        // outline / link / slice-separator color
  fill?: string;          // background where applicable (quadrant box, venn fill)
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  edges?: "round" | "sharp"; // corner radius for rect-based primitives
  opacity?: number;       // root opacity
};

export const CHART_STYLE_SUPPORT: Record<ChartType, { stroke: boolean; fill: boolean; strokeWidth: boolean; strokeStyle: boolean; edges: boolean; opacity: boolean }> = {
  pie:      { stroke: true, fill: false, strokeWidth: true, strokeStyle: false, edges: false, opacity: true },
  bar:      { stroke: true, fill: false, strokeWidth: true, strokeStyle: false, edges: true,  opacity: true },
  line:     { stroke: true, fill: false, strokeWidth: true, strokeStyle: true,  edges: false, opacity: true },
  radar:    { stroke: true, fill: false, strokeWidth: true, strokeStyle: true,  edges: false, opacity: true },
  quadrant: { stroke: true, fill: true,  strokeWidth: true, strokeStyle: true,  edges: true,  opacity: true },
  treemap:  { stroke: true, fill: false, strokeWidth: true, strokeStyle: false, edges: true,  opacity: true },
  kanban:   { stroke: true, fill: false, strokeWidth: true, strokeStyle: false, edges: true,  opacity: true },
  gantt:    { stroke: true, fill: false, strokeWidth: true, strokeStyle: false, edges: true,  opacity: true },
  venn:     { stroke: true, fill: true,  strokeWidth: true, strokeStyle: true,  edges: false, opacity: true },
  packet:   { stroke: true, fill: false, strokeWidth: true, strokeStyle: false, edges: true,  opacity: true },
  wardley:  { stroke: true, fill: false, strokeWidth: true, strokeStyle: true,  edges: false, opacity: true },
};

const dashFor = (s?: "solid" | "dashed" | "dotted", sw = 2): string | undefined =>
  s === "dashed" ? `${sw * 3} ${sw * 2}` : s === "dotted" ? `${sw} ${sw * 1.5}` : undefined;

// Default specs for the insert palette.
export function defaultChartSpec(type: ChartType): ChartSpec {
  switch (type) {
    case "pie":      return { type, spec: { title: "Distribución", items: [{ label: "Alpha", value: 45 }, { label: "Beta", value: 30 }, { label: "Gamma", value: 25 }] } };
    case "bar":      return { type, spec: { title: "Ingresos", xLabels: ["Ene","Feb","Mar","Abr"], series: [{ values: [5000,7000,6500,9000] }] } };
    case "line":     return { type, spec: { title: "Tendencia", xLabels: ["Ene","Feb","Mar","Abr"], series: [{ values: [3000,4200,3800,5600] }] } };
    case "radar":    return { type, spec: { title: "Skills", axes: ["Velocidad","Potencia","Defensa","Magia"], curves: [{ label: "Héroe", values: [80,60,90,70] }] } };
    case "quadrant": return { type, spec: { title: "Prioridades", xLow: "Bajo", xHigh: "Alto", yLow: "Bajo", yHigh: "Alto", quads: ["Hacer ya","Planear","Descartar","Delegar"], points: [{ label: "Tarea A", x: 0.7, y: 0.8 }, { label: "Tarea B", x: 0.3, y: 0.6 }] } };
    case "treemap":  return { type, spec: { title: "Treemap", items: [{ label: "Frontend", value: 40 }, { label: "Backend", value: 35 }, { label: "Infra", value: 15 }, { label: "QA", value: 10 }] } };
    case "kanban":   return { type, spec: { title: "Kanban", columns: [{ title: "Por hacer", cards: ["Diseño","Investigación"] }, { title: "En curso", cards: ["Maqueta"] }, { title: "Hecho", cards: ["Setup"] }] } };
    case "gantt":    return { type, spec: { title: "Plan", tasks: [{ name: "Diseño", section: "Fase 1", start: "2026-01-01", end: "2026-01-11" }, { name: "Build", section: "Fase 1", start: "2026-01-11", end: "2026-01-25" }] } };
    case "venn":     return { type, spec: { title: "Venn", sets: [{ label: "A" }, { label: "B" }, { label: "C" }] } };
    case "packet":   return { type, spec: { title: "Packet", fields: [{ start: 0, end: 15, label: "Source Port" }, { start: 16, end: 31, label: "Dest Port" }, { start: 32, end: 63, label: "Sequence Number" }] } };
    case "wardley":  return { type, spec: { title: "Wardley", components: [{ name: "Cliente", vis: 0.95, evo: 0.2 }, { name: "API", vis: 0.6, evo: 0.55 }, { name: "DB", vis: 0.25, evo: 0.85 }], links: [{ from: "Cliente", to: "API" }, { from: "API", to: "DB" }] } };
  }
}

export const CHART_PALETTE: { key: ChartType; labelKey: string }[] = [
  { key: "pie", labelKey: "pie" }, { key: "bar", labelKey: "bar" }, { key: "line", labelKey: "line" }, { key: "radar", labelKey: "radar" },
  { key: "quadrant", labelKey: "quadrant" }, { key: "treemap", labelKey: "treemap" }, { key: "kanban", labelKey: "kanban" }, { key: "gantt", labelKey: "gantt" },
  { key: "venn", labelKey: "venn" }, { key: "packet", labelKey: "packet" }, { key: "wardley", labelKey: "wardley" },
];

// ─── Renderers (each takes w,h and draws within that viewport) ───────────────
function Title({ text, w }: { text?: string; w: number }) {
  if (!text) return null;
  return <text x={w/2} y={16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#e2e8f0" fontFamily="ui-sans-serif, system-ui">{text}</text>;
}

function PieView({ s, w, h, st }: { s: PieSpec; w: number; h: number; st: ChartStyling }) {
  const titleH = s.title ? 26 : 6;
  const cx = w/2, cy = titleH + (h - titleH)/2;
  const r = Math.max(10, Math.min(w, h - titleH) / 2 - 6);
  const total = s.items.reduce((a,b)=>a+b.value,0) || 1;
  const stroke = st.stroke ?? "#0f172a";
  const sw = st.strokeWidth ?? 1.5;
  let a = -Math.PI/2;
  return <>
    <Title text={s.title} w={w} />
    {s.items.map((it,i) => {
      const frac = it.value/total, a1 = a + frac*Math.PI*2;
      const steps = Math.max(2, Math.ceil(frac*64));
      const pts = [`${cx},${cy}`];
      for (let stp=0; stp<=steps; stp++) { const ang = a + (a1-a)*(stp/steps); pts.push(`${cx+r*Math.cos(ang)},${cy+r*Math.sin(ang)}`); }
      const mid = (a+a1)/2; const lx = cx + r*0.62*Math.cos(mid), ly = cy + r*0.62*Math.sin(mid);
      const color = it.color || PALETTE[i % PALETTE.length];
      const pct = Math.round((it.value/total)*100);
      a = a1;
      return <g key={i}>
        <polygon points={pts.join(" ")} fill={color} stroke={stroke} strokeWidth={sw} />
        <text x={lx} y={ly-4} textAnchor="middle" fontSize={Math.max(8,Math.min(11,r/8))} fontWeight={600} fill="#f8fafc">{it.label}</text>
        <text x={lx} y={ly+8} textAnchor="middle" fontSize={Math.max(7,Math.min(10,r/9))} fill="#f8fafc">{it.value} ({pct}%)</text>
      </g>;
    })}
  </>;
}

function BarLineView({ s, w, h, kind, st }: { s: BarLineSpec; w: number; h: number; kind: "bar"|"line"; st: ChartStyling }) {
  const all = s.series.flatMap(se => se.values).filter(Number.isFinite);
  if (!all.length) return <Title text={s.title} w={w} />;
  const dataMax = Math.max(...all), dataMin = Math.min(0, ...all);
  const ymin = s.yMin ?? dataMin, ymax = (s.yMax ?? dataMax * 1.1) || 1;
  const n = Math.max(...s.series.map(se=>se.values.length), s.xLabels.length, 1);
  const padL = 44, padR = 12, padT = s.title ? 30 : 10, padB = 30;
  const plotW = Math.max(20, w - padL - padR), plotH = Math.max(20, h - padT - padB);
  const step = plotW / n;
  const yOf = (v: number) => padT + plotH - ((v - ymin) / (ymax - ymin)) * plotH;
  const sw = st.strokeWidth ?? (kind === "line" ? 2 : 0);
  const stroke = st.stroke;
  const rx = st.edges === "sharp" ? 0 : 2;
  const dash = dashFor(st.strokeStyle, sw || 2);
  return <>
    <Title text={s.title} w={w} />
    <line x1={padL} y1={padT} x2={padL} y2={padT+plotH} stroke="#475569" strokeWidth={1} />
    <line x1={padL} y1={padT+plotH} x2={padL+plotW} y2={padT+plotH} stroke="#475569" strokeWidth={1} />
    <text x={padL-4} y={padT+4} textAnchor="end" fontSize={9} fill="#94a3b8">{Math.round(ymax)}</text>
    <text x={padL-4} y={padT+plotH} textAnchor="end" fontSize={9} fill="#94a3b8">{Math.round(ymin)}</text>
    {kind === "bar" && s.series.map((se, si) => {
      const bw = (step * 0.7) / s.series.length;
      const color = se.color || PALETTE[si % PALETTE.length];
      return <g key={si}>
        {se.values.map((v, i) => {
          const y = yOf(v), bh = padT + plotH - y;
          const x = padL + i*step + (step - bw*s.series.length)/2 + si*bw;
          return <rect key={i} x={x} y={y} width={Math.max(2, bw-2)} height={Math.max(1, bh)} rx={rx} ry={rx} fill={color} stroke={stroke ?? "none"} strokeWidth={sw} />;
        })}
      </g>;
    })}
    {kind === "line" && s.series.map((se, si) => {
      const color = se.color || PALETTE[si % PALETTE.length];
      const pts = se.values.map((v, i) => `${padL + i*step + step/2},${yOf(v)}`).join(" ");
      return <g key={si}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={sw || 2} strokeDasharray={dash} />
        {se.values.map((v, i) => <circle key={i} cx={padL + i*step + step/2} cy={yOf(v)} r={3} fill={color} />)}
      </g>;
    })}
    {Array.from({length: n}).map((_, i) => (
      <text key={i} x={padL + i*step + step/2} y={padT+plotH+14} textAnchor="middle" fontSize={9} fill="#94a3b8">{s.xLabels[i] ?? String(i+1)}</text>
    ))}
  </>;
}

function RadarView({ s, w, h, st }: { s: RadarSpec; w: number; h: number; st: ChartStyling }) {
  const N = s.axes.length; if (N < 3) return <Title text={s.title} w={w} />;
  const titleH = s.title ? 26 : 6;
  const cx = w/2, cy = titleH + (h - titleH)/2;
  const r = Math.max(10, Math.min(w, h - titleH) / 2 - 28);
  const maxV = s.max ?? Math.max(1, ...s.curves.flatMap(c=>c.values));
  const ang = (k: number) => -Math.PI/2 + (k/N)*Math.PI*2;
  return <>
    <Title text={s.title} w={w} />
    {[0.5, 1].map((rr, ri) => {
      const pts = Array.from({length: N}, (_, k) => `${cx + r*rr*Math.cos(ang(k))},${cy + r*rr*Math.sin(ang(k))}`).join(" ");
      return <polygon key={ri} points={pts} fill="none" stroke="#334155" strokeWidth={1} />;
    })}
    {Array.from({length: N}, (_, k) => (
      <line key={k} x1={cx} y1={cy} x2={cx + r*Math.cos(ang(k))} y2={cy + r*Math.sin(ang(k))} stroke="#334155" strokeWidth={0.5} />
    ))}
    {s.curves.map((c, ci) => {
      const color = c.color || PALETTE[ci % PALETTE.length];
      const pts = Array.from({length: N}, (_, k) => { const v = (c.values[k] ?? 0) / maxV; return `${cx + r*v*Math.cos(ang(k))},${cy + r*v*Math.sin(ang(k))}`; }).join(" ");
      const sw = st.strokeWidth ?? 1.5;
      return <polygon key={ci} points={pts} fill={hexA(color, 0.25)} stroke={st.stroke ?? color} strokeWidth={sw} strokeDasharray={dashFor(st.strokeStyle, sw)} />;
    })}
    {s.axes.map((a, k) => (
      <text key={k} x={cx + (r+14)*Math.cos(ang(k))} y={cy + (r+14)*Math.sin(ang(k))+3} textAnchor="middle" fontSize={10} fill="#cbd5e1">{a}</text>
    ))}
  </>;
}

function QuadrantView({ s, w, h, st }: { s: QuadrantSpec; w: number; h: number; st: ChartStyling }) {
  const titleH = s.title ? 24 : 4; const pad = 22;
  const box = Math.max(40, Math.min(w - pad*2, h - titleH - pad*2 - 16));
  const ox = (w - box)/2, oy = titleH + (h - titleH - box - 16)/2;
  const stroke = st.stroke ?? "#475569";
  const sw = st.strokeWidth ?? 1;
  const fill = st.fill ?? "rgba(148,163,184,0.05)";
  const rx = st.edges === "sharp" ? 0 : 6;
  return <>
    <Title text={s.title} w={w} />
    <rect x={ox} y={oy} width={box} height={box} rx={rx} ry={rx} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dashFor(st.strokeStyle, sw)} />
    <line x1={ox+box/2} y1={oy} x2={ox+box/2} y2={oy+box} stroke="#475569" strokeWidth={1} />
    <line x1={ox} y1={oy+box/2} x2={ox+box} y2={oy+box/2} stroke="#475569" strokeWidth={1} />
    {(s.quads ?? ["","","",""]).map((q, i) => {
      const pos = [[ox+box*0.75, oy+box*0.25], [ox+box*0.25, oy+box*0.25], [ox+box*0.25, oy+box*0.75], [ox+box*0.75, oy+box*0.75]][i];
      return q ? <text key={i} x={pos[0]} y={pos[1]} textAnchor="middle" fontSize={11} fontWeight={600} fill="#cbd5e1">{q}</text> : null;
    })}
    {s.xLow  && <text x={ox+4} y={oy+box+14} fontSize={9} fill="#94a3b8">{s.xLow}</text>}
    {s.xHigh && <text x={ox+box-4} y={oy+box+14} textAnchor="end" fontSize={9} fill="#94a3b8">{s.xHigh}</text>}
    {s.yLow  && <text x={ox-4} y={oy+box} textAnchor="end" fontSize={9} fill="#94a3b8">{s.yLow}</text>}
    {s.yHigh && <text x={ox-4} y={oy+10} textAnchor="end" fontSize={9} fill="#94a3b8">{s.yHigh}</text>}
    {s.points.map((p, i) => {
      const px = ox + p.x*box, py = oy + (1-p.y)*box, color = p.color || PALETTE[i % PALETTE.length];
      return <g key={i}>
        <circle cx={px} cy={py} r={5} fill={color} stroke="#0f172a" strokeWidth={1} />
        <text x={px+8} y={py+3} fontSize={10} fill="#e2e8f0">{p.label}</text>
      </g>;
    })}
  </>;
}

// Squarified treemap layout.
function squarify(values: number[], x0: number, y0: number, w: number, h: number) {
  const total = values.reduce((a,b)=>a+b,0) || 1;
  const items = values.map((v,i) => ({ i, area: (v/total)*w*h }));
  const out = new Array<{x:number;y:number;w:number;h:number}>(values.length);
  let x = x0, y = y0, rw = w, rh = h;
  const worst = (r: typeof items, len: number) => { const s = r.reduce((a,b)=>a+b.area,0); const mx = Math.max(...r.map(b=>b.area)), mn = Math.min(...r.map(b=>b.area)); return Math.max((len*len*mx)/(s*s), (s*s)/(len*len*mn)); };
  const layout = (r: typeof items) => { const s = r.reduce((a,b)=>a+b.area,0); const horiz = rw >= rh; const len = horiz ? rh : rw; const thick = s/len; let off = horiz ? y : x; r.forEach(b => { const side = b.area/thick; out[b.i] = horiz ? { x, y: off, w: thick, h: side } : { x: off, y, w: side, h: thick }; off += side; }); if (horiz) { x += thick; rw -= thick; } else { y += thick; rh -= thick; } };
  const queue = [...items]; let row: typeof items = [];
  while (queue.length) { const next = queue[0]; const len = (rw >= rh ? rh : rw); if (!row.length || worst([...row, next], len) <= worst(row, len)) { row.push(next); queue.shift(); } else { layout(row); row = []; } }
  if (row.length) layout(row);
  return out;
}
function TreemapView({ s, w, h, st }: { s: TreemapSpec; w: number; h: number; st: ChartStyling }) {
  const titleH = s.title ? 24 : 0;
  const rects = squarify(s.items.map(i=>i.value), 0, titleH, w, h - titleH);
  const stroke = st.stroke ?? "#0f172a";
  const sw = st.strokeWidth ?? 1;
  const rx = st.edges === "sharp" ? 0 : 4;
  return <>
    <Title text={s.title} w={w} />
    {s.items.map((it, i) => {
      const r = rects[i]; if (!r) return null;
      const color = it.color || PALETTE[i % PALETTE.length];
      const fs = Math.max(8, Math.min(13, Math.min(r.w, r.h)/6));
      return <g key={i}>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={rx} ry={rx} fill={hexA(color, 0.55)} stroke={stroke} strokeWidth={sw} />
        {r.w > 44 && r.h > 26 && <>
          <text x={r.x + r.w/2} y={r.y + r.h/2 - 2} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#f8fafc">{it.label}</text>
          <text x={r.x + r.w/2} y={r.y + r.h/2 + fs} textAnchor="middle" fontSize={fs*0.85} fill="#f8fafc">{it.value}</text>
        </>}
      </g>;
    })}
  </>;
}

function KanbanView({ s, w, h, st }: { s: KanbanSpec; w: number; h: number; st: ChartStyling }) {
  const titleH = s.title ? 24 : 6; const gap = 8;
  const cols = Math.max(1, s.columns.length);
  const colW = (w - gap*(cols+1)) / cols;
  const top = titleH + 4;
  const sw = st.strokeWidth ?? 1;
  const colRx = st.edges === "sharp" ? 0 : 8;
  const cardRx = st.edges === "sharp" ? 0 : 4;
  return <>
    <Title text={s.title} w={w} />
    {s.columns.map((c, ci) => {
      const x = gap + ci*(colW + gap), color = c.color || PALETTE[ci % PALETTE.length];
      const headH = 22, cardH = 26, cardGap = 6;
      return <g key={ci}>
        <rect x={x} y={top} width={colW} height={h - top - 4} rx={colRx} ry={colRx} fill={hexA(color, 0.05)} stroke={st.stroke ?? color} strokeWidth={sw} />
        <text x={x + colW/2} y={top + 15} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>{c.title}</text>
        {c.cards.map((card, ki) => {
          const y = top + headH + ki*(cardH + cardGap);
          if (y + cardH > h - 8) return null;
          return <g key={ki}>
            <rect x={x+8} y={y} width={colW-16} height={cardH} rx={cardRx} ry={cardRx} fill="rgba(148,163,184,0.12)" stroke={st.stroke ?? "#475569"} strokeWidth={sw} />
            <text x={x+14} y={y+17} fontSize={10} fill="#e2e8f0">{card.length > 28 ? card.slice(0,27)+"…" : card}</text>
          </g>;
        })}
      </g>;
    })}
  </>;
}

function GanttView({ s, w, h, st }: { s: GanttSpec; w: number; h: number; st: ChartStyling }) {
  if (!s.tasks.length) return <Title text={s.title} w={w} />;
  const titleH = s.title ? 24 : 6;
  const parse = (d: string) => { const m = d.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) : NaN; };
  const valid = s.tasks.filter(t => Number.isFinite(parse(t.start)) && Number.isFinite(parse(t.end)));
  if (!valid.length) return <Title text={s.title} w={w} />;
  const t0 = Math.min(...valid.map(t=>parse(t.start))), t1 = Math.max(...valid.map(t=>parse(t.end))) || t0 + 86400000;
  const span = Math.max(1, t1 - t0);
  const padL = 110, padR = 12, padB = 16;
  const plotW = Math.max(40, w - padL - padR);
  const rowH = Math.max(16, Math.min(24, (h - titleH - padB) / Math.max(1, valid.length)));
  const colorOf = (st?: string) => st==="crit"?"#fb7185":st==="active"?"#22d3ee":st==="done"?"#4ade80":st==="milestone"?"#a78bfa":"#60a5fa";
  return <>
    <Title text={s.title} w={w} />
    {valid.map((t, i) => {
      const y = titleH + i*rowH, x = padL + ((parse(t.start)-t0)/span)*plotW;
      const bw = Math.max(3, ((parse(t.end)-parse(t.start))/span)*plotW);
      const color = colorOf(t.status);
      const rx = st.edges === "sharp" ? 0 : 3;
      return <g key={i}>
        <text x={padL-6} y={y+rowH*0.7} textAnchor="end" fontSize={10} fill="#cbd5e1">{t.name}</text>
        <rect x={x} y={y+3} width={bw} height={rowH-6} rx={rx} ry={rx} fill={hexA(color, t.status==="done"?0.4:0.7)} stroke={st.stroke ?? color} strokeWidth={st.strokeWidth ?? 1} />
      </g>;
    })}
  </>;
}

function VennView({ s, w, h, st }: { s: VennSpec; w: number; h: number; st: ChartStyling }) {
  const sets = s.sets.slice(0, 3);
  if (sets.length < 2) return <Title text={s.title} w={w} />;
  const titleH = s.title ? 24 : 6;
  const cx = w/2, cy = titleH + (h - titleH)/2;
  const r = Math.max(20, Math.min(w/3, (h - titleH)/2.2));
  const centers = sets.length === 2
    ? [{ x: cx - r*0.55, y: cy }, { x: cx + r*0.55, y: cy }]
    : [{ x: cx, y: cy - r*0.5 }, { x: cx - r*0.55, y: cy + r*0.35 }, { x: cx + r*0.55, y: cy + r*0.35 }];
  return <>
    <Title text={s.title} w={w} />
    {sets.map((set, i) => {
      const color = set.color || PALETTE[i % PALETTE.length];
      const c = centers[i];
      const lx = c.x, ly = i === 0 && sets.length === 3 ? c.y - r - 6 : (i === 0 ? c.y - r - 6 : c.y + r + 14);
      const sw = st.strokeWidth ?? 1.5;
      const fill = st.fill ?? hexA(color, 0.28);
      return <g key={i}>
        <circle cx={c.x} cy={c.y} r={r} fill={fill} stroke={st.stroke ?? color} strokeWidth={sw} strokeDasharray={dashFor(st.strokeStyle, sw)} />
        <text x={lx} y={ly} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>{set.label}</text>
      </g>;
    })}
  </>;
}

function PacketView({ s, w, h, st }: { s: PacketSpec; w: number; h: number; st: ChartStyling }) {
  if (!s.fields.length) return <Title text={s.title} w={w} />;
  const titleH = s.title ? 24 : 4;
  const perRow = 32;
  const maxBit = Math.max(...s.fields.map(f => f.end));
  const rows = Math.floor(maxBit / perRow) + 1;
  const cell = (w - 2) / perRow;
  const rowH = Math.max(28, Math.min(48, (h - titleH - 4) / rows));
  return <>
    <Title text={s.title} w={w} />
    {s.fields.map((f, fi) => {
      const color = f.color || PALETTE[fi % PALETTE.length];
      const segs: React.ReactNode[] = [];
      let b = f.start;
      while (b <= f.end) {
        const row = Math.floor(b / perRow);
        const rowEnd = (row + 1) * perRow - 1;
        const segEnd = Math.min(f.end, rowEnd);
        const x = 1 + (b - row * perRow) * cell;
        const y = titleH + row * rowH;
        const segW = (segEnd - b + 1) * cell;
        const rx = st.edges === "sharp" ? 0 : 2;
        segs.push(
          <g key={b}>
            <rect x={x} y={y+2} width={segW-1} height={rowH-6} rx={rx} ry={rx} fill={hexA(color, 0.3)} stroke={st.stroke ?? color} strokeWidth={st.strokeWidth ?? 1} />
            <text x={x+4} y={y+12} fontSize={8} fill="#94a3b8">{f.start===f.end ? `${f.start}` : `${f.start}–${f.end}`}</text>
            <text x={x + segW/2} y={y + rowH/2 + 4} textAnchor="middle" fontSize={Math.max(8, Math.min(11, rowH/3.5))} fontWeight={600} fill="#e2e8f0">{f.label}</text>
          </g>
        );
        b = segEnd + 1;
      }
      return <g key={fi}>{segs}</g>;
    })}
  </>;
}

function WardleyView({ s, w, h, st }: { s: WardleySpec; w: number; h: number; st: ChartStyling }) {
  if (!s.components.length) return <Title text={s.title} w={w} />;
  const titleH = s.title ? 24 : 4;
  const pad = 30;
  const box = Math.max(60, Math.min(w - pad*2, h - titleH - pad*2 - 16));
  const ox = (w - box) / 2, oy = titleH + (h - titleH - box - 16) / 2;
  const posOf = (c: { vis: number; evo: number }) => ({ x: ox + c.evo * box, y: oy + (1 - c.vis) * box });
  const byName = new Map(s.components.map(c => [c.name, c] as const));
  return <>
    <Title text={s.title} w={w} />
    <rect x={ox} y={oy} width={box} height={box} fill="rgba(148,163,184,0.04)" stroke="#475569" strokeWidth={1} />
    {/* evolution axis labels */}
    {["Genesis","Custom","Product","Commodity"].map((lbl, i) => (
      <text key={i} x={ox + (i/3.5 + 0.05)*box} y={oy + box + 14} fontSize={9} fill="#64748b">{lbl}</text>
    ))}
    <text x={ox - 4} y={oy + 10} textAnchor="end" fontSize={9} fill="#64748b">Visible</text>
    <text x={ox - 4} y={oy + box} textAnchor="end" fontSize={9} fill="#64748b">Invisible</text>
    {/* links */}
    {s.links.map((l, i) => {
      const sc = byName.get(l.from), tc = byName.get(l.to);
      if (!sc || !tc) return null;
      const sp = posOf(sc), tp = posOf(tc);
      const sw = st.strokeWidth ?? 1;
      return <line key={i} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke={st.stroke ?? "#64748b"} strokeWidth={sw} strokeDasharray={dashFor(st.strokeStyle, sw)} />;
    })}
    {/* components */}
    {s.components.map((c, i) => {
      const p = posOf(c), color = c.color || "#fbbf24";
      return <g key={i}>
        <circle cx={p.x} cy={p.y} r={5} fill={color} stroke="#0f172a" strokeWidth={1} />
        <text x={p.x + 8} y={p.y + 3} fontSize={10} fill="#e2e8f0">{c.name}</text>
      </g>;
    })}
  </>;
}

// ─── Public renderer ─────────────────────────────────────────────────────────
export function ChartBrickRender({ chart, w, h, className, styling }: { chart: ChartSpec; w: number; h: number; className?: string; styling?: ChartStyling }) {
  const st = styling ?? {};
  let body: React.ReactNode = null;
  try {
    if (chart.type === "pie")      body = <PieView      s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "bar") body = <BarLineView  s={chart.spec} w={w} h={h} kind="bar" st={st} />;
    else if (chart.type === "line")body = <BarLineView  s={chart.spec} w={w} h={h} kind="line" st={st} />;
    else if (chart.type === "radar")    body = <RadarView    s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "quadrant") body = <QuadrantView s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "treemap")  body = <TreemapView  s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "kanban")   body = <KanbanView   s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "gantt")    body = <GanttView    s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "venn")     body = <VennView     s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "packet")   body = <PacketView   s={chart.spec} w={w} h={h} st={st} />;
    else if (chart.type === "wardley")  body = <WardleyView  s={chart.spec} w={w} h={h} st={st} />;
  } catch { body = null; }
  const opacity = typeof st.opacity === "number" ? st.opacity : 1;
  return (
    <svg className={className} width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" fontFamily="ui-sans-serif, system-ui, sans-serif" style={{ display: "block", opacity }}>
      {body}
    </svg>
  );
}

// ─── Editor (structured UI per type — no plain text) ─────────────────────────
const inp = "h-7 w-full rounded border border-white/10 bg-slate-800 px-1.5 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50";
const num = "h-7 w-20 rounded border border-white/10 bg-slate-800 px-1.5 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50";
const btn = "rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-300 transition-colors hover:bg-accent/20 hover:text-foreground";
const danger = "rounded p-1 text-rose-400 transition-colors hover:bg-rose-500/10";

function Row({ children }: { children: React.ReactNode }) { return <div className="flex items-center gap-1.5">{children}</div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><p className="text-[9px] uppercase tracking-wider text-slate-400">{title}</p><div className="space-y-1">{children}</div></div>;
}

function ItemValueEditor({ items, onChange }: { items: { label: string; value: number; color?: string }[]; onChange: (items: { label: string; value: number; color?: string }[]) => void }) {
  const e = useE();
  return <Section title={e("items")}>
    {items.map((it, i) => (
      <Row key={i}>
        <input type="color" value={it.color ?? PALETTE[i % PALETTE.length]} onChange={ev => { const a=[...items]; a[i] = { ...it, color: ev.target.value }; onChange(a); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input value={it.label} onChange={ev => { const a=[...items]; a[i] = { ...it, label: ev.target.value }; onChange(a); }} placeholder={e("label")} className={inp} />
        <input type="number" value={it.value} onChange={ev => { const a=[...items]; a[i] = { ...it, value: parseFloat(ev.target.value)||0 }; onChange(a); }} className={num} />
        <button type="button" onClick={() => onChange(items.filter((_,j)=>j!==i))} className={danger}><Trash2 className="h-3 w-3" /></button>
      </Row>
    ))}
    <button type="button" onClick={() => onChange([...items, { label: e("new"), value: 0 }])} className={btn}><Plus className="inline h-3 w-3" /> {e("add")}</button>
  </Section>;
}

function PieEditor({ s, on }: { s: PieSpec; on: (s: PieSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <ItemValueEditor items={s.items} onChange={items => on({ ...s, items })} />
  </>;
}

function BarLineEditor({ s, on }: { s: BarLineSpec; on: (s: BarLineSpec) => void }) {
  const e = useE();
  const xCsv = s.xLabels.join(", ");
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("xAxis")}</span><input value={xCsv} onChange={ev=>on({...s, xLabels: ev.target.value.split(",").map(t=>t.trim()).filter(Boolean)})} placeholder={e("xAxisPlaceholder")} className={inp} /></Row>
    <Section title={e("series")}>
      {s.series.map((se, si) => (
        <div key={si} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input type="color" value={se.color ?? PALETTE[si % PALETTE.length]} onChange={ev => { const a=[...s.series]; a[si] = { ...se, color: ev.target.value }; on({ ...s, series: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input value={se.label ?? ""} onChange={ev => { const a=[...s.series]; a[si] = { ...se, label: ev.target.value }; on({ ...s, series: a }); }} placeholder={`${e("series")} ${si+1}`} className={inp} />
            <button type="button" onClick={() => on({ ...s, series: s.series.filter((_,j)=>j!==si) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <input value={se.values.join(", ")} onChange={ev => { const a=[...s.series]; a[si] = { ...se, values: ev.target.value.split(",").map(t=>parseFloat(t.trim())).filter(Number.isFinite) }; on({ ...s, series: a }); }} placeholder={e("valuesPlaceholder")} className={inp} />
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, series: [...s.series, { values: [] }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addSeries")}</button>
    </Section>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("yMin")}</span><input type="number" value={s.yMin ?? ""} onChange={ev=>on({...s, yMin: ev.target.value===""?undefined:parseFloat(ev.target.value)})} className={inp} /><span className="w-12 text-[9px] text-slate-400">{e("yMax")}</span><input type="number" value={s.yMax ?? ""} onChange={ev=>on({...s, yMax: ev.target.value===""?undefined:parseFloat(ev.target.value)})} className={inp} /></Row>
  </>;
}

function RadarEditor({ s, on }: { s: RadarSpec; on: (s: RadarSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("axes")}</span><input value={s.axes.join(", ")} onChange={ev=>on({...s, axes: ev.target.value.split(",").map(t=>t.trim()).filter(Boolean)})} className={inp} /></Row>
    <Section title={e("curves")}>
      {s.curves.map((c, ci) => (
        <div key={ci} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input type="color" value={c.color ?? PALETTE[ci % PALETTE.length]} onChange={ev => { const a=[...s.curves]; a[ci] = { ...c, color: ev.target.value }; on({ ...s, curves: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input value={c.label} onChange={ev => { const a=[...s.curves]; a[ci] = { ...c, label: ev.target.value }; on({ ...s, curves: a }); }} className={inp} />
            <button type="button" onClick={() => on({ ...s, curves: s.curves.filter((_,j)=>j!==ci) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <input value={c.values.join(", ")} onChange={ev => { const a=[...s.curves]; a[ci] = { ...c, values: ev.target.value.split(",").map(t=>parseFloat(t.trim())).filter(Number.isFinite) }; on({ ...s, curves: a }); }} className={inp} />
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, curves: [...s.curves, { label: `${e("series")} ${s.curves.length+1}`, values: [] }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addCurve")}</button>
    </Section>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("max")}</span><input type="number" value={s.max ?? ""} onChange={ev=>on({...s, max: ev.target.value===""?undefined:parseFloat(ev.target.value)})} className={inp} /></Row>
  </>;
}

function QuadrantEditor({ s, on }: { s: QuadrantSpec; on: (s: QuadrantSpec) => void }) {
  const e = useE();
  const q = s.quads ?? ["","","",""];
  const setQ = (i: number, v: string) => { const a = [...q] as [string,string,string,string]; a[i] = v; on({ ...s, quads: a }); };
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("xLow")}</span><input value={s.xLow ?? ""} onChange={ev=>on({...s, xLow: ev.target.value})} className={inp} /><span className="w-12 text-[9px] text-slate-400">{e("xHigh")}</span><input value={s.xHigh ?? ""} onChange={ev=>on({...s, xHigh: ev.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("yLow")}</span><input value={s.yLow ?? ""} onChange={ev=>on({...s, yLow: ev.target.value})} className={inp} /><span className="w-12 text-[9px] text-slate-400">{e("yHigh")}</span><input value={s.yHigh ?? ""} onChange={ev=>on({...s, yHigh: ev.target.value})} className={inp} /></Row>
    <Section title={e("quadrants")}>
      {[e("quad1"), e("quad2"), e("quad3"), e("quad4")].map((lbl, i) => (
        <Row key={i}><span className="w-24 text-[9px] text-slate-400">{lbl}</span><input value={q[i]} onChange={ev=>setQ(i, ev.target.value)} className={inp} /></Row>
      ))}
    </Section>
    <Section title={e("points")}>
      {s.points.map((p, i) => (
        <Row key={i}>
          <input type="color" value={p.color ?? PALETTE[i % PALETTE.length]} onChange={ev => { const a=[...s.points]; a[i] = { ...p, color: ev.target.value }; on({ ...s, points: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input value={p.label} onChange={ev => { const a=[...s.points]; a[i] = { ...p, label: ev.target.value }; on({ ...s, points: a }); }} placeholder={e("label")} className={inp} />
          <input type="number" step="0.05" min="0" max="1" value={p.x} onChange={ev => { const a=[...s.points]; a[i] = { ...p, x: Math.max(0, Math.min(1, parseFloat(ev.target.value)||0)) }; on({ ...s, points: a }); }} className={num} />
          <input type="number" step="0.05" min="0" max="1" value={p.y} onChange={ev => { const a=[...s.points]; a[i] = { ...p, y: Math.max(0, Math.min(1, parseFloat(ev.target.value)||0)) }; on({ ...s, points: a }); }} className={num} />
          <button type="button" onClick={() => on({ ...s, points: s.points.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
        </Row>
      ))}
      <button type="button" onClick={() => on({ ...s, points: [...s.points, { label: e("new"), x: 0.5, y: 0.5 }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addPoint")}</button>
    </Section>
  </>;
}

function KanbanEditor({ s, on }: { s: KanbanSpec; on: (s: KanbanSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Section title={e("columns")}>
      {s.columns.map((c, ci) => (
        <div key={ci} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input type="color" value={c.color ?? PALETTE[ci % PALETTE.length]} onChange={ev => { const a=[...s.columns]; a[ci] = { ...c, color: ev.target.value }; on({ ...s, columns: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input value={c.title} onChange={ev => { const a=[...s.columns]; a[ci] = { ...c, title: ev.target.value }; on({ ...s, columns: a }); }} className={inp} />
            <button type="button" onClick={() => on({ ...s, columns: s.columns.filter((_,j)=>j!==ci) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <textarea value={c.cards.join("\n")} onChange={ev => { const a=[...s.columns]; a[ci] = { ...c, cards: ev.target.value.split("\n").map(t=>t.trim()).filter(Boolean) }; on({ ...s, columns: a }); }} placeholder={e("cardsPlaceholder")} rows={Math.min(6, Math.max(2, c.cards.length+1))} className="w-full rounded border border-white/10 bg-slate-800 px-1.5 py-1 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50" />
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, columns: [...s.columns, { title: e("newColumn"), cards: [] }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addColumn")}</button>
    </Section>
  </>;
}

function GanttEditor({ s, on }: { s: GanttSpec; on: (s: GanttSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Section title={e("tasks")}>
      {s.tasks.map((t, i) => (
        <div key={i} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input value={t.name} onChange={ev => { const a=[...s.tasks]; a[i] = { ...t, name: ev.target.value }; on({ ...s, tasks: a }); }} placeholder={e("name")} className={inp} />
            <button type="button" onClick={() => on({ ...s, tasks: s.tasks.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <Row>
            <input value={t.section ?? ""} onChange={ev => { const a=[...s.tasks]; a[i] = { ...t, section: ev.target.value }; on({ ...s, tasks: a }); }} placeholder={e("section")} className={inp} />
            <select value={t.status ?? ""} onChange={ev => { const a=[...s.tasks]; a[i] = { ...t, status: (ev.target.value || undefined) as any }; on({ ...s, tasks: a }); }} className={inp}>
              <option value="">—</option><option value="done">done</option><option value="active">active</option><option value="crit">crit</option><option value="milestone">milestone</option>
            </select>
          </Row>
          <Row>
            <input type="date" value={t.start} onChange={ev => { const a=[...s.tasks]; a[i] = { ...t, start: ev.target.value }; on({ ...s, tasks: a }); }} className={inp} />
            <input type="date" value={t.end} onChange={ev => { const a=[...s.tasks]; a[i] = { ...t, end: ev.target.value }; on({ ...s, tasks: a }); }} className={inp} />
          </Row>
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, tasks: [...s.tasks, { name: e("newTask"), start: "2026-01-01", end: "2026-01-08" }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addTask")}</button>
    </Section>
  </>;
}

function TreemapEditor({ s, on }: { s: TreemapSpec; on: (s: TreemapSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <ItemValueEditor items={s.items} onChange={items => on({ ...s, items })} />
  </>;
}

function VennEditor({ s, on }: { s: VennSpec; on: (s: VennSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Section title={e("sets")}>
      {s.sets.map((set, i) => (
        <Row key={i}>
          <input type="color" value={set.color ?? PALETTE[i % PALETTE.length]} onChange={ev => { const a=[...s.sets]; a[i] = { ...set, color: ev.target.value }; on({ ...s, sets: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input value={set.label} onChange={ev => { const a=[...s.sets]; a[i] = { ...set, label: ev.target.value }; on({ ...s, sets: a }); }} className={inp} />
          <button type="button" onClick={() => on({ ...s, sets: s.sets.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
        </Row>
      ))}
      {s.sets.length < 3 && <button type="button" onClick={() => on({ ...s, sets: [...s.sets, { label: e("new") }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addSet")}</button>}
    </Section>
  </>;
}

function PacketEditor({ s, on }: { s: PacketSpec; on: (s: PacketSpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Section title={e("fields")}>
      {s.fields.map((f, i) => (
        <Row key={i}>
          <input type="color" value={f.color ?? PALETTE[i % PALETTE.length]} onChange={ev => { const a=[...s.fields]; a[i] = { ...f, color: ev.target.value }; on({ ...s, fields: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input type="number" value={f.start} onChange={ev => { const a=[...s.fields]; a[i] = { ...f, start: parseInt(ev.target.value)||0 }; on({ ...s, fields: a }); }} className={num} />
          <input type="number" value={f.end} onChange={ev => { const a=[...s.fields]; a[i] = { ...f, end: parseInt(ev.target.value)||0 }; on({ ...s, fields: a }); }} className={num} />
          <input value={f.label} onChange={ev => { const a=[...s.fields]; a[i] = { ...f, label: ev.target.value }; on({ ...s, fields: a }); }} className={inp} />
          <button type="button" onClick={() => on({ ...s, fields: s.fields.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
        </Row>
      ))}
      <button type="button" onClick={() => { const last = s.fields[s.fields.length-1]; const next = last ? last.end + 1 : 0; on({ ...s, fields: [...s.fields, { start: next, end: next + 7, label: e("newField") }] }); }} className={btn}><Plus className="inline h-3 w-3" /> {e("addField")}</button>
    </Section>
  </>;
}

function WardleyEditor({ s, on }: { s: WardleySpec; on: (s: WardleySpec) => void }) {
  const e = useE();
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">{e("title")}</span><input value={s.title ?? ""} onChange={ev=>on({...s, title: ev.target.value})} className={inp} /></Row>
    <Section title={e("components")}>
      {s.components.map((c, i) => (
        <Row key={i}>
          <input type="color" value={c.color ?? "#fbbf24"} onChange={ev => { const a=[...s.components]; a[i] = { ...c, color: ev.target.value }; on({ ...s, components: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input value={c.name} onChange={ev => { const a=[...s.components]; a[i] = { ...c, name: ev.target.value }; on({ ...s, components: a }); }} className={inp} />
          <input type="number" step="0.05" min="0" max="1" value={c.vis} onChange={ev => { const a=[...s.components]; a[i] = { ...c, vis: Math.max(0, Math.min(1, parseFloat(ev.target.value)||0)) }; on({ ...s, components: a }); }} className={num} title={e("visibility")} />
          <input type="number" step="0.05" min="0" max="1" value={c.evo} onChange={ev => { const a=[...s.components]; a[i] = { ...c, evo: Math.max(0, Math.min(1, parseFloat(ev.target.value)||0)) }; on({ ...s, components: a }); }} className={num} title={e("evolution")} />
          <button type="button" onClick={() => on({ ...s, components: s.components.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
        </Row>
      ))}
      <button type="button" onClick={() => on({ ...s, components: [...s.components, { name: e("new"), vis: 0.5, evo: 0.5 }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addComponent")}</button>
    </Section>
    <Section title={e("links")}>
      {s.links.map((l, i) => (
        <Row key={i}>
          <select value={l.from} onChange={ev => { const a=[...s.links]; a[i] = { ...l, from: ev.target.value }; on({ ...s, links: a }); }} className={inp}>
            {s.components.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <span className="text-[10px] text-slate-400">→</span>
          <select value={l.to} onChange={ev => { const a=[...s.links]; a[i] = { ...l, to: ev.target.value }; on({ ...s, links: a }); }} className={inp}>
            {s.components.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <button type="button" onClick={() => on({ ...s, links: s.links.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
        </Row>
      ))}
      <button type="button" onClick={() => on({ ...s, links: [...s.links, { from: s.components[0]?.name ?? "", to: s.components[1]?.name ?? "" }] })} className={btn}><Plus className="inline h-3 w-3" /> {e("addLink")}</button>
    </Section>
  </>;
}

export function ChartBrickEditor({ chart, onChange }: { chart: ChartSpec; onChange: (next: ChartSpec) => void }) {
  switch (chart.type) {
    case "pie":      return <PieEditor      s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "bar":      return <BarLineEditor  s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "line":     return <BarLineEditor  s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "radar":    return <RadarEditor    s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "quadrant": return <QuadrantEditor s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "treemap":  return <TreemapEditor  s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "kanban":   return <KanbanEditor   s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "gantt":    return <GanttEditor    s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "venn":     return <VennEditor     s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "packet":   return <PacketEditor   s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
    case "wardley":  return <WardleyEditor  s={chart.spec} on={spec => onChange({ ...chart, spec })} />;
  }
}
