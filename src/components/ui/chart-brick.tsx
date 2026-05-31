"use client";

// ChartBrick — first-class chart metabricks. Each chart stores a typed spec
// object (NOT Mermaid text). Renderer draws SVG inside the brick's actual w/h
// (so it resizes naturally). Editor is a structured UI (rows, color pickers)
// per chart type — no plain-text mermaid editor.

import React from "react";
import { Plus, Trash2 } from "lucide-react";

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

export type ChartType = "pie" | "bar" | "line" | "radar" | "quadrant" | "treemap" | "kanban" | "gantt";

export type ChartSpec =
  | { type: "pie";      spec: PieSpec }
  | { type: "bar";      spec: BarLineSpec }
  | { type: "line";     spec: BarLineSpec }
  | { type: "radar";    spec: RadarSpec }
  | { type: "quadrant"; spec: QuadrantSpec }
  | { type: "treemap";  spec: TreemapSpec }
  | { type: "kanban";   spec: KanbanSpec }
  | { type: "gantt";    spec: GanttSpec };

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
  }
}

export const CHART_PALETTE: { key: ChartType; label: string }[] = [
  { key: "pie", label: "Pastel" }, { key: "bar", label: "Barras" }, { key: "line", label: "Líneas" }, { key: "radar", label: "Radar" },
  { key: "quadrant", label: "Cuadrante" }, { key: "treemap", label: "Treemap" }, { key: "kanban", label: "Kanban" }, { key: "gantt", label: "Gantt" },
];

// ─── Renderers (each takes w,h and draws within that viewport) ───────────────
function Title({ text, w }: { text?: string; w: number }) {
  if (!text) return null;
  return <text x={w/2} y={16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#e2e8f0" fontFamily="ui-sans-serif, system-ui">{text}</text>;
}

function PieView({ s, w, h }: { s: PieSpec; w: number; h: number }) {
  const titleH = s.title ? 26 : 6;
  const cx = w/2, cy = titleH + (h - titleH)/2;
  const r = Math.max(10, Math.min(w, h - titleH) / 2 - 6);
  const total = s.items.reduce((a,b)=>a+b.value,0) || 1;
  let a = -Math.PI/2;
  return <>
    <Title text={s.title} w={w} />
    {s.items.map((it,i) => {
      const frac = it.value/total, a1 = a + frac*Math.PI*2;
      const steps = Math.max(2, Math.ceil(frac*64));
      const pts = [`${cx},${cy}`];
      for (let st=0; st<=steps; st++) { const ang = a + (a1-a)*(st/steps); pts.push(`${cx+r*Math.cos(ang)},${cy+r*Math.sin(ang)}`); }
      const mid = (a+a1)/2; const lx = cx + r*0.62*Math.cos(mid), ly = cy + r*0.62*Math.sin(mid);
      const color = it.color || PALETTE[i % PALETTE.length];
      const pct = Math.round((it.value/total)*100);
      a = a1;
      return <g key={i}>
        <polygon points={pts.join(" ")} fill={color} stroke="#0f172a" strokeWidth={1.5} />
        <text x={lx} y={ly-4} textAnchor="middle" fontSize={Math.max(8,Math.min(11,r/8))} fontWeight={600} fill="#f8fafc">{it.label}</text>
        <text x={lx} y={ly+8} textAnchor="middle" fontSize={Math.max(7,Math.min(10,r/9))} fill="#f8fafc">{it.value} ({pct}%)</text>
      </g>;
    })}
  </>;
}

function BarLineView({ s, w, h, kind }: { s: BarLineSpec; w: number; h: number; kind: "bar"|"line" }) {
  const all = s.series.flatMap(se => se.values).filter(Number.isFinite);
  if (!all.length) return <Title text={s.title} w={w} />;
  const dataMax = Math.max(...all), dataMin = Math.min(0, ...all);
  const ymin = s.yMin ?? dataMin, ymax = (s.yMax ?? dataMax * 1.1) || 1;
  const n = Math.max(...s.series.map(se=>se.values.length), s.xLabels.length, 1);
  const padL = 44, padR = 12, padT = s.title ? 30 : 10, padB = 30;
  const plotW = Math.max(20, w - padL - padR), plotH = Math.max(20, h - padT - padB);
  const step = plotW / n;
  const yOf = (v: number) => padT + plotH - ((v - ymin) / (ymax - ymin)) * plotH;
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
          return <rect key={i} x={x} y={y} width={Math.max(2, bw-2)} height={Math.max(1, bh)} fill={color} />;
        })}
      </g>;
    })}
    {kind === "line" && s.series.map((se, si) => {
      const color = se.color || PALETTE[si % PALETTE.length];
      const pts = se.values.map((v, i) => `${padL + i*step + step/2},${yOf(v)}`).join(" ");
      return <g key={si}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
        {se.values.map((v, i) => <circle key={i} cx={padL + i*step + step/2} cy={yOf(v)} r={3} fill={color} />)}
      </g>;
    })}
    {Array.from({length: n}).map((_, i) => (
      <text key={i} x={padL + i*step + step/2} y={padT+plotH+14} textAnchor="middle" fontSize={9} fill="#94a3b8">{s.xLabels[i] ?? String(i+1)}</text>
    ))}
  </>;
}

function RadarView({ s, w, h }: { s: RadarSpec; w: number; h: number }) {
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
      return <polygon key={ci} points={pts} fill={hexA(color, 0.25)} stroke={color} strokeWidth={1.5} />;
    })}
    {s.axes.map((a, k) => (
      <text key={k} x={cx + (r+14)*Math.cos(ang(k))} y={cy + (r+14)*Math.sin(ang(k))+3} textAnchor="middle" fontSize={10} fill="#cbd5e1">{a}</text>
    ))}
  </>;
}

function QuadrantView({ s, w, h }: { s: QuadrantSpec; w: number; h: number }) {
  const titleH = s.title ? 24 : 4; const pad = 22;
  const box = Math.max(40, Math.min(w - pad*2, h - titleH - pad*2 - 16));
  const ox = (w - box)/2, oy = titleH + (h - titleH - box - 16)/2;
  return <>
    <Title text={s.title} w={w} />
    <rect x={ox} y={oy} width={box} height={box} fill="rgba(148,163,184,0.05)" stroke="#475569" strokeWidth={1} />
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
function TreemapView({ s, w, h }: { s: TreemapSpec; w: number; h: number }) {
  const titleH = s.title ? 24 : 0;
  const rects = squarify(s.items.map(i=>i.value), 0, titleH, w, h - titleH);
  return <>
    <Title text={s.title} w={w} />
    {s.items.map((it, i) => {
      const r = rects[i]; if (!r) return null;
      const color = it.color || PALETTE[i % PALETTE.length];
      const fs = Math.max(8, Math.min(13, Math.min(r.w, r.h)/6));
      return <g key={i}>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={hexA(color, 0.55)} stroke="#0f172a" strokeWidth={1} />
        {r.w > 44 && r.h > 26 && <>
          <text x={r.x + r.w/2} y={r.y + r.h/2 - 2} textAnchor="middle" fontSize={fs} fontWeight={600} fill="#f8fafc">{it.label}</text>
          <text x={r.x + r.w/2} y={r.y + r.h/2 + fs} textAnchor="middle" fontSize={fs*0.85} fill="#f8fafc">{it.value}</text>
        </>}
      </g>;
    })}
  </>;
}

function KanbanView({ s, w, h }: { s: KanbanSpec; w: number; h: number }) {
  const titleH = s.title ? 24 : 6; const gap = 8;
  const cols = Math.max(1, s.columns.length);
  const colW = (w - gap*(cols+1)) / cols;
  const top = titleH + 4;
  return <>
    <Title text={s.title} w={w} />
    {s.columns.map((c, ci) => {
      const x = gap + ci*(colW + gap), color = c.color || PALETTE[ci % PALETTE.length];
      const headH = 22, cardH = 26, cardGap = 6;
      return <g key={ci}>
        <rect x={x} y={top} width={colW} height={h - top - 4} rx={8} ry={8} fill={hexA(color, 0.05)} stroke={color} strokeWidth={1} />
        <text x={x + colW/2} y={top + 15} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>{c.title}</text>
        {c.cards.map((card, ki) => {
          const y = top + headH + ki*(cardH + cardGap);
          if (y + cardH > h - 8) return null;
          return <g key={ki}>
            <rect x={x+8} y={y} width={colW-16} height={cardH} rx={4} ry={4} fill="rgba(148,163,184,0.12)" stroke="#475569" strokeWidth={1} />
            <text x={x+14} y={y+17} fontSize={10} fill="#e2e8f0">{card.length > 28 ? card.slice(0,27)+"…" : card}</text>
          </g>;
        })}
      </g>;
    })}
  </>;
}

function GanttView({ s, w, h }: { s: GanttSpec; w: number; h: number }) {
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
      return <g key={i}>
        <text x={padL-6} y={y+rowH*0.7} textAnchor="end" fontSize={10} fill="#cbd5e1">{t.name}</text>
        <rect x={x} y={y+3} width={bw} height={rowH-6} rx={3} ry={3} fill={hexA(color, t.status==="done"?0.4:0.7)} stroke={color} strokeWidth={1} />
      </g>;
    })}
  </>;
}

// ─── Public renderer ─────────────────────────────────────────────────────────
export function ChartBrickRender({ chart, w, h, className }: { chart: ChartSpec; w: number; h: number; className?: string }) {
  let body: React.ReactNode = null;
  try {
    if (chart.type === "pie")      body = <PieView      s={chart.spec} w={w} h={h} />;
    else if (chart.type === "bar") body = <BarLineView  s={chart.spec} w={w} h={h} kind="bar" />;
    else if (chart.type === "line")body = <BarLineView  s={chart.spec} w={w} h={h} kind="line" />;
    else if (chart.type === "radar")    body = <RadarView    s={chart.spec} w={w} h={h} />;
    else if (chart.type === "quadrant") body = <QuadrantView s={chart.spec} w={w} h={h} />;
    else if (chart.type === "treemap")  body = <TreemapView  s={chart.spec} w={w} h={h} />;
    else if (chart.type === "kanban")   body = <KanbanView   s={chart.spec} w={w} h={h} />;
    else if (chart.type === "gantt")    body = <GanttView    s={chart.spec} w={w} h={h} />;
  } catch { body = null; }
  return (
    <svg className={className} width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" fontFamily="ui-sans-serif, system-ui, sans-serif" style={{ display: "block" }}>
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
  return <Section title="Items">
    {items.map((it, i) => (
      <Row key={i}>
        <input type="color" value={it.color ?? PALETTE[i % PALETTE.length]} onChange={e => { const a=[...items]; a[i] = { ...it, color: e.target.value }; onChange(a); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input value={it.label} onChange={e => { const a=[...items]; a[i] = { ...it, label: e.target.value }; onChange(a); }} placeholder="Etiqueta" className={inp} />
        <input type="number" value={it.value} onChange={e => { const a=[...items]; a[i] = { ...it, value: parseFloat(e.target.value)||0 }; onChange(a); }} className={num} />
        <button type="button" onClick={() => onChange(items.filter((_,j)=>j!==i))} className={danger}><Trash2 className="h-3 w-3" /></button>
      </Row>
    ))}
    <button type="button" onClick={() => onChange([...items, { label: "Nuevo", value: 0 }])} className={btn}><Plus className="inline h-3 w-3" /> añadir</button>
  </Section>;
}

function PieEditor({ s, on }: { s: PieSpec; on: (s: PieSpec) => void }) {
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <ItemValueEditor items={s.items} onChange={items => on({ ...s, items })} />
  </>;
}

function BarLineEditor({ s, on }: { s: BarLineSpec; on: (s: BarLineSpec) => void }) {
  const xCsv = s.xLabels.join(", ");
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">Eje X</span><input value={xCsv} onChange={e=>on({...s, xLabels: e.target.value.split(",").map(t=>t.trim()).filter(Boolean)})} placeholder="Ene, Feb, Mar" className={inp} /></Row>
    <Section title="Series">
      {s.series.map((se, si) => (
        <div key={si} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input type="color" value={se.color ?? PALETTE[si % PALETTE.length]} onChange={e => { const a=[...s.series]; a[si] = { ...se, color: e.target.value }; on({ ...s, series: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input value={se.label ?? ""} onChange={e => { const a=[...s.series]; a[si] = { ...se, label: e.target.value }; on({ ...s, series: a }); }} placeholder={`Serie ${si+1}`} className={inp} />
            <button type="button" onClick={() => on({ ...s, series: s.series.filter((_,j)=>j!==si) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <input value={se.values.join(", ")} onChange={e => { const a=[...s.series]; a[si] = { ...se, values: e.target.value.split(",").map(t=>parseFloat(t.trim())).filter(Number.isFinite) }; on({ ...s, series: a }); }} placeholder="100, 200, 300" className={inp} />
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, series: [...s.series, { values: [] }] })} className={btn}><Plus className="inline h-3 w-3" /> añadir serie</button>
    </Section>
    <Row><span className="w-12 text-[9px] text-slate-400">Y min</span><input type="number" value={s.yMin ?? ""} onChange={e=>on({...s, yMin: e.target.value===""?undefined:parseFloat(e.target.value)})} className={inp} /><span className="w-12 text-[9px] text-slate-400">Y max</span><input type="number" value={s.yMax ?? ""} onChange={e=>on({...s, yMax: e.target.value===""?undefined:parseFloat(e.target.value)})} className={inp} /></Row>
  </>;
}

function RadarEditor({ s, on }: { s: RadarSpec; on: (s: RadarSpec) => void }) {
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">Ejes</span><input value={s.axes.join(", ")} onChange={e=>on({...s, axes: e.target.value.split(",").map(t=>t.trim()).filter(Boolean)})} className={inp} /></Row>
    <Section title="Curvas">
      {s.curves.map((c, ci) => (
        <div key={ci} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input type="color" value={c.color ?? PALETTE[ci % PALETTE.length]} onChange={e => { const a=[...s.curves]; a[ci] = { ...c, color: e.target.value }; on({ ...s, curves: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input value={c.label} onChange={e => { const a=[...s.curves]; a[ci] = { ...c, label: e.target.value }; on({ ...s, curves: a }); }} className={inp} />
            <button type="button" onClick={() => on({ ...s, curves: s.curves.filter((_,j)=>j!==ci) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <input value={c.values.join(", ")} onChange={e => { const a=[...s.curves]; a[ci] = { ...c, values: e.target.value.split(",").map(t=>parseFloat(t.trim())).filter(Number.isFinite) }; on({ ...s, curves: a }); }} className={inp} />
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, curves: [...s.curves, { label: `Serie ${s.curves.length+1}`, values: [] }] })} className={btn}><Plus className="inline h-3 w-3" /> añadir curva</button>
    </Section>
    <Row><span className="w-12 text-[9px] text-slate-400">Max</span><input type="number" value={s.max ?? ""} onChange={e=>on({...s, max: e.target.value===""?undefined:parseFloat(e.target.value)})} className={inp} /></Row>
  </>;
}

function QuadrantEditor({ s, on }: { s: QuadrantSpec; on: (s: QuadrantSpec) => void }) {
  const q = s.quads ?? ["","","",""];
  const setQ = (i: number, v: string) => { const a = [...q] as [string,string,string,string]; a[i] = v; on({ ...s, quads: a }); };
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">X low</span><input value={s.xLow ?? ""} onChange={e=>on({...s, xLow: e.target.value})} className={inp} /><span className="w-12 text-[9px] text-slate-400">X high</span><input value={s.xHigh ?? ""} onChange={e=>on({...s, xHigh: e.target.value})} className={inp} /></Row>
    <Row><span className="w-12 text-[9px] text-slate-400">Y low</span><input value={s.yLow ?? ""} onChange={e=>on({...s, yLow: e.target.value})} className={inp} /><span className="w-12 text-[9px] text-slate-400">Y high</span><input value={s.yHigh ?? ""} onChange={e=>on({...s, yHigh: e.target.value})} className={inp} /></Row>
    <Section title="Cuadrantes">
      {["Q1 (arriba-der)","Q2 (arriba-izq)","Q3 (abajo-izq)","Q4 (abajo-der)"].map((lbl, i) => (
        <Row key={i}><span className="w-24 text-[9px] text-slate-400">{lbl}</span><input value={q[i]} onChange={e=>setQ(i, e.target.value)} className={inp} /></Row>
      ))}
    </Section>
    <Section title="Puntos (x,y entre 0 y 1)">
      {s.points.map((p, i) => (
        <Row key={i}>
          <input type="color" value={p.color ?? PALETTE[i % PALETTE.length]} onChange={e => { const a=[...s.points]; a[i] = { ...p, color: e.target.value }; on({ ...s, points: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input value={p.label} onChange={e => { const a=[...s.points]; a[i] = { ...p, label: e.target.value }; on({ ...s, points: a }); }} placeholder="Etiqueta" className={inp} />
          <input type="number" step="0.05" min="0" max="1" value={p.x} onChange={e => { const a=[...s.points]; a[i] = { ...p, x: Math.max(0, Math.min(1, parseFloat(e.target.value)||0)) }; on({ ...s, points: a }); }} className={num} />
          <input type="number" step="0.05" min="0" max="1" value={p.y} onChange={e => { const a=[...s.points]; a[i] = { ...p, y: Math.max(0, Math.min(1, parseFloat(e.target.value)||0)) }; on({ ...s, points: a }); }} className={num} />
          <button type="button" onClick={() => on({ ...s, points: s.points.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
        </Row>
      ))}
      <button type="button" onClick={() => on({ ...s, points: [...s.points, { label: "Nuevo", x: 0.5, y: 0.5 }] })} className={btn}><Plus className="inline h-3 w-3" /> añadir punto</button>
    </Section>
  </>;
}

function KanbanEditor({ s, on }: { s: KanbanSpec; on: (s: KanbanSpec) => void }) {
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <Section title="Columnas">
      {s.columns.map((c, ci) => (
        <div key={ci} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input type="color" value={c.color ?? PALETTE[ci % PALETTE.length]} onChange={e => { const a=[...s.columns]; a[ci] = { ...c, color: e.target.value }; on({ ...s, columns: a }); }} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input value={c.title} onChange={e => { const a=[...s.columns]; a[ci] = { ...c, title: e.target.value }; on({ ...s, columns: a }); }} className={inp} />
            <button type="button" onClick={() => on({ ...s, columns: s.columns.filter((_,j)=>j!==ci) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <textarea value={c.cards.join("\n")} onChange={e => { const a=[...s.columns]; a[ci] = { ...c, cards: e.target.value.split("\n").map(t=>t.trim()).filter(Boolean) }; on({ ...s, columns: a }); }} placeholder="Una tarjeta por línea" rows={Math.min(6, Math.max(2, c.cards.length+1))} className="w-full rounded border border-white/10 bg-slate-800 px-1.5 py-1 text-[10px] text-slate-100 outline-none focus:border-cyan-500/50" />
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, columns: [...s.columns, { title: "Nueva", cards: [] }] })} className={btn}><Plus className="inline h-3 w-3" /> añadir columna</button>
    </Section>
  </>;
}

function GanttEditor({ s, on }: { s: GanttSpec; on: (s: GanttSpec) => void }) {
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <Section title="Tareas">
      {s.tasks.map((t, i) => (
        <div key={i} className="rounded border border-white/10 p-1.5 space-y-1">
          <Row>
            <input value={t.name} onChange={e => { const a=[...s.tasks]; a[i] = { ...t, name: e.target.value }; on({ ...s, tasks: a }); }} placeholder="Nombre" className={inp} />
            <button type="button" onClick={() => on({ ...s, tasks: s.tasks.filter((_,j)=>j!==i) })} className={danger}><Trash2 className="h-3 w-3" /></button>
          </Row>
          <Row>
            <input value={t.section ?? ""} onChange={e => { const a=[...s.tasks]; a[i] = { ...t, section: e.target.value }; on({ ...s, tasks: a }); }} placeholder="Sección" className={inp} />
            <select value={t.status ?? ""} onChange={e => { const a=[...s.tasks]; a[i] = { ...t, status: (e.target.value || undefined) as any }; on({ ...s, tasks: a }); }} className={inp}>
              <option value="">—</option><option value="done">done</option><option value="active">active</option><option value="crit">crit</option><option value="milestone">milestone</option>
            </select>
          </Row>
          <Row>
            <input type="date" value={t.start} onChange={e => { const a=[...s.tasks]; a[i] = { ...t, start: e.target.value }; on({ ...s, tasks: a }); }} className={inp} />
            <input type="date" value={t.end} onChange={e => { const a=[...s.tasks]; a[i] = { ...t, end: e.target.value }; on({ ...s, tasks: a }); }} className={inp} />
          </Row>
        </div>
      ))}
      <button type="button" onClick={() => on({ ...s, tasks: [...s.tasks, { name: "Nueva", start: "2026-01-01", end: "2026-01-08" }] })} className={btn}><Plus className="inline h-3 w-3" /> añadir tarea</button>
    </Section>
  </>;
}

function TreemapEditor({ s, on }: { s: TreemapSpec; on: (s: TreemapSpec) => void }) {
  return <>
    <Row><span className="w-12 text-[9px] text-slate-400">Título</span><input value={s.title ?? ""} onChange={e=>on({...s, title: e.target.value})} className={inp} /></Row>
    <ItemValueEditor items={s.items} onChange={items => on({ ...s, items })} />
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
  }
}
