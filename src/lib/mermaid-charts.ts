// Mermaid chart-type → mesh renderers. These produce a GeneratedMesh of visual
// primitives (rect / ellipse / polygon nodes via vectorPoints, plus text labels
// and connector edges) so charts render as real meshboard shapes — not source
// text. Covers: pie, xychart-beta, quadrantChart, radar-beta, treemap-beta,
// kanban. Each returns { nodes: [] } when it can't parse, so the caller can fall
// back to the raw-text node.

import type { GeneratedMesh, GeneratedMeshNode, GeneratedMeshEdge } from "@/lib/api/contracts";

const PALETTE = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#fb7185", "#4ade80", "#c084fc", "#2dd4bf", "#facc15"];
const strip = (s: string) => s.replace(/^---[\s\S]*?---\s*/m, "");
const unquote = (s: string) => s.trim().replace(/^["'\[]+|["'\]]+$/g, "").trim();
const num = (s: string) => parseFloat(s.replace(/[^\d.+-]/g, ""));

// Title from `title X`, `pie title X`, or a `title: X` frontmatter-ish line.
function grabTitle(lines: string[]): string {
  for (const raw of lines) {
    const t = raw.trim();
    const m = t.match(/^(?:\w[\w-]*\s+)?title\s+(.+)$/i) || t.match(/^title:\s*(.+)$/i);
    if (m) return unquote(m[1]);
  }
  return "";
}

// ─── pie ────────────────────────────────────────────────────────────────────
export function parsePieToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const items: Array<{ label: string; value: number }> = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^pie\b/i.test(t) || /^title\b/i.test(t) || /^showData\b/i.test(t)) continue;
    const m = t.match(/^"?([^":]+?)"?\s*:\s*([\d.]+)/);
    if (m) items.push({ label: m[1].trim(), value: parseFloat(m[2]) });
  }
  if (!items.length) return { nodes: [], edges: [] };
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const S = 340, titleH = title ? 40 : 0;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: S, h: 30 });
  const cx = 0.5, cy = 0.5, r = 0.46;
  let a = -Math.PI / 2;
  items.forEach((it, idx) => {
    const frac = it.value / total, a1 = a + frac * Math.PI * 2;
    const steps = Math.max(2, Math.ceil(frac * 64));
    const pts = [{ x: cx, y: cy }];
    for (let s = 0; s <= steps; s++) { const ang = a + (a1 - a) * (s / steps); pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) }); }
    nodes.push({ ref: `slice${idx}`, kind: "shape", label: "", x: 0, y: titleH, w: S, h: S, vectorPoints: pts, fill: PALETTE[idx % PALETTE.length], stroke: "#0f172a" });
    const mid = (a + a1) / 2, lr = 0.62;
    const lpx = (cx + lr * Math.cos(mid)) * S, lpy = titleH + (cy + lr * Math.sin(mid)) * S;
    const pct = Math.round((it.value / total) * 100);
    nodes.push({ ref: `pl${idx}`, kind: "text", label: `${it.label}\n${it.value} (${pct}%)`, x: Math.round(lpx - 44), y: Math.round(lpy - 16), w: 88, h: 34, textColor: "#f8fafc" });
    a = a1;
  });
  return { nodes, edges: [] };
}

// ─── xychart-beta (bars + lines) ──────────────────────────────────────────────
export function parseXYChartToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  let title = "";
  let xLabels: string[] = [];
  let yMin: number | undefined, yMax: number | undefined;
  const bars: number[][] = [], series: number[][] = [];
  const parseList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^xychart-beta/i.test(t)) continue;
    const ti = t.match(/^title\s+"?(.+?)"?$/i); if (ti) { title = ti[1].trim(); continue; }
    const xa = t.match(/^x-axis\s+(.+)$/i);
    if (xa) { const inner = xa[1].match(/\[(.*)\]/); if (inner) xLabels = parseList(inner[1]).map(unquote); continue; }
    const ya = t.match(/^y-axis\s+(?:"[^"]*"\s*)?([\d.]+)\s*-->\s*([\d.]+)/i);
    if (ya) { yMin = parseFloat(ya[1]); yMax = parseFloat(ya[2]); continue; }
    const bar = t.match(/^bar\s+\[(.*)\]/i); if (bar) { bars.push(parseList(bar[1]).map(num)); continue; }
    const ln = t.match(/^line\s+\[(.*)\]/i); if (ln) { series.push(parseList(ln[1]).map(num)); continue; }
  }
  const all = [...bars.flat(), ...series.flat()].filter((n) => Number.isFinite(n));
  if (!all.length) return { nodes: [], edges: [] };
  const dataMax = Math.max(...all), dataMin = Math.min(0, ...all);
  const ymin = yMin ?? dataMin, ymax = (yMax ?? dataMax * 1.1) || 1;
  const n = Math.max(bars[0]?.length ?? 0, series[0]?.length ?? 0, xLabels.length);
  const W = 540, H = 320, padL = 52, padR = 18, padT = title ? 36 : 12, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const step = plotW / Math.max(1, n);
  const yOf = (v: number) => padT + plotH - ((v - ymin) / (ymax - ymin)) * plotH;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: W, h: 28 });
  // axes (thin rects)
  nodes.push({ ref: "yaxis", kind: "shape", shape: "rect", label: "", x: padL, y: padT, w: 2, h: plotH, fill: "#475569", stroke: "#475569" });
  nodes.push({ ref: "xaxis", kind: "shape", shape: "rect", label: "", x: padL, y: padT + plotH, w: plotW, h: 2, fill: "#475569", stroke: "#475569" });
  nodes.push({ ref: "ymax", kind: "text", label: `${Math.round(ymax)}`, x: padL - 50, y: padT - 8, w: 46, h: 18, textColor: "#94a3b8" });
  nodes.push({ ref: "ymin", kind: "text", label: `${Math.round(ymin)}`, x: padL - 50, y: padT + plotH - 10, w: 46, h: 18, textColor: "#94a3b8" });
  // bars
  bars.forEach((arr, bi) => {
    const bw = (step * 0.6) / Math.max(1, bars.length);
    arr.forEach((v, i) => {
      const y = yOf(v), h = padT + plotH - y;
      const x = padL + i * step + (step - bw * bars.length) / 2 + bi * bw;
      nodes.push({ ref: `bar${bi}_${i}`, kind: "shape", shape: "rect", label: "", x: Math.round(x), y: Math.round(y), w: Math.max(3, Math.round(bw - 2)), h: Math.max(1, Math.round(h)), fill: PALETTE[bi % PALETTE.length], stroke: PALETTE[bi % PALETTE.length] });
    });
  });
  // line series → point nodes + edges
  const edges: GeneratedMeshEdge[] = [];
  series.forEach((arr, si) => {
    const color = PALETTE[(bars.length + si) % PALETTE.length];
    let prev: string | null = null;
    arr.forEach((v, i) => {
      const x = padL + i * step + step / 2, y = yOf(v);
      const ref = `pt${si}_${i}`;
      nodes.push({ ref, kind: "shape", shape: "ellipse", label: "", x: Math.round(x - 5), y: Math.round(y - 5), w: 10, h: 10, fill: color, stroke: color });
      if (prev) edges.push({ from: prev, to: ref, color, width: 2 });
      prev = ref;
    });
  });
  // x labels
  for (let i = 0; i < n; i++) {
    const lbl = xLabels[i] ?? `${i + 1}`;
    nodes.push({ ref: `xl${i}`, kind: "text", label: lbl, x: Math.round(padL + i * step), y: padT + plotH + 6, w: Math.round(step), h: 18, textColor: "#94a3b8" });
  }
  return { nodes, edges };
}

// ─── quadrantChart ────────────────────────────────────────────────────────────
export function parseQuadrantToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  let title = "", xLow = "", xHigh = "", yLow = "", yHigh = "";
  const quads: string[] = ["", "", "", ""];
  const pts: Array<{ label: string; x: number; y: number }> = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^quadrantChart/i.test(t)) continue;
    const ti = t.match(/^title\s+(.+)$/i); if (ti) { title = unquote(ti[1]); continue; }
    const xa = t.match(/^x-axis\s+(.+?)(?:\s*-->\s*(.+))?$/i); if (xa) { xLow = unquote(xa[1]); xHigh = xa[2] ? unquote(xa[2]) : ""; continue; }
    const ya = t.match(/^y-axis\s+(.+?)(?:\s*-->\s*(.+))?$/i); if (ya) { yLow = unquote(ya[1]); yHigh = ya[2] ? unquote(ya[2]) : ""; continue; }
    const q = t.match(/^quadrant-([1-4])\s+(.+)$/i); if (q) { quads[parseInt(q[1]) - 1] = unquote(q[2]); continue; }
    const p = t.match(/^"?(.+?)"?\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/); if (p) { pts.push({ label: p[1].trim(), x: parseFloat(p[2]), y: parseFloat(p[3]) }); }
  }
  if (!pts.length && !quads.some(Boolean)) return { nodes: [], edges: [] };
  const S = 380, titleH = title ? 34 : 0, pad = 18;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: S, h: 28 });
  const ox = pad, oy = titleH + pad, box = S - pad * 2;
  nodes.push({ ref: "bg", kind: "shape", shape: "rect", label: "", x: ox, y: oy, w: box, h: box, fill: "rgba(148,163,184,0.05)", stroke: "#475569" });
  nodes.push({ ref: "vc", kind: "shape", shape: "rect", label: "", x: ox + box / 2 - 1, y: oy, w: 2, h: box, fill: "#475569", stroke: "#475569" });
  nodes.push({ ref: "hc", kind: "shape", shape: "rect", label: "", x: ox, y: oy + box / 2 - 1, w: box, h: 2, fill: "#475569", stroke: "#475569" });
  const qpos = [[ox + box * 0.75, oy + box * 0.25], [ox + box * 0.25, oy + box * 0.25], [ox + box * 0.25, oy + box * 0.75], [ox + box * 0.75, oy + box * 0.75]];
  quads.forEach((q, i) => { if (q) nodes.push({ ref: `q${i}`, kind: "text", label: q, x: Math.round(qpos[i][0] - 70), y: Math.round(qpos[i][1] - 10), w: 140, h: 22, textColor: "#cbd5e1" }); });
  if (xLow) nodes.push({ ref: "xl", kind: "text", label: xLow, x: ox, y: oy + box + 4, w: box / 2, h: 18, textColor: "#94a3b8" });
  if (xHigh) nodes.push({ ref: "xh", kind: "text", label: xHigh, x: ox + box / 2, y: oy + box + 4, w: box / 2, h: 18, textColor: "#94a3b8" });
  pts.forEach((p, i) => {
    const px = ox + p.x * box, py = oy + (1 - p.y) * box;
    nodes.push({ ref: `pt${i}`, kind: "shape", shape: "ellipse", label: "", x: Math.round(px - 6), y: Math.round(py - 6), w: 12, h: 12, fill: PALETTE[i % PALETTE.length], stroke: "#0f172a" });
    nodes.push({ ref: `ptl${i}`, kind: "text", label: p.label, x: Math.round(px + 8), y: Math.round(py - 9), w: 120, h: 18, textColor: "#e2e8f0" });
  });
  return { nodes, edges: [] };
}

// ─── radar-beta ───────────────────────────────────────────────────────────────
export function parseRadarToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  let title = "";
  const axes: string[] = [];
  const curves: Array<{ name: string; values: number[] }> = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^radar-beta/i.test(t)) continue;
    const ti = t.match(/^title\s+(.+)$/i); if (ti) { title = unquote(ti[1]); continue; }
    const ax = t.match(/^axis\s+(.+)$/i);
    if (ax) { ax[1].split(",").forEach((seg) => { const m = seg.trim().match(/(?:\w[\w-]*\s*)?\[?"?([^"\]]+)"?\]?/); if (m) axes.push(m[1].trim()); }); continue; }
    const cv = t.match(/^curve\s+(?:[\w-]+\s*)?(?:\["?([^"\]]+)"?\]|"([^"]+)")?\s*\{([^}]*)\}/i);
    if (cv) { const name = (cv[1] || cv[2] || `Series ${curves.length + 1}`).trim(); const values = cv[3].split(",").map(num).filter((x) => Number.isFinite(x)); curves.push({ name, values }); continue; }
    const cv2 = t.match(/^curve\s+(?:\["?([^"\]]+)"?\]|"([^"]+)"|([\w-]+))\s+\[([^\]]*)\]/i);
    if (cv2) { const name = (cv2[1] || cv2[2] || cv2[3] || `Series ${curves.length + 1}`).trim(); const values = cv2[4].split(",").map(num).filter((x) => Number.isFinite(x)); curves.push({ name, values }); }
  }
  if (axes.length < 3 || !curves.length) return { nodes: [], edges: [] };
  const N = axes.length;
  const maxV = Math.max(1, ...curves.flatMap((c) => c.values));
  const S = 360, titleH = title ? 34 : 0, cx = 0.5, cy = 0.5;
  const ang = (k: number) => -Math.PI / 2 + (k / N) * Math.PI * 2;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: S, h: 28 });
  // grid rings
  [0.5, 1].forEach((rr, ri) => {
    const pts = Array.from({ length: N }, (_, k) => ({ x: cx + 0.42 * rr * Math.cos(ang(k)), y: cy + 0.42 * rr * Math.sin(ang(k)) }));
    nodes.push({ ref: `ring${ri}`, kind: "shape", label: "", x: 0, y: titleH, w: S, h: S, vectorPoints: pts, fill: "rgba(0,0,0,0)", stroke: "#334155" });
  });
  // data polygons
  curves.forEach((c, ci) => {
    const color = PALETTE[ci % PALETTE.length];
    const pts = Array.from({ length: N }, (_, k) => { const r = 0.42 * ((c.values[k] ?? 0) / maxV); return { x: cx + r * Math.cos(ang(k)), y: cy + r * Math.sin(ang(k)) }; });
    nodes.push({ ref: `curve${ci}`, kind: "shape", label: "", x: 0, y: titleH, w: S, h: S, vectorPoints: pts, fill: hexA(color, 0.25), stroke: color });
  });
  // axis labels
  axes.forEach((a, k) => {
    const lx = (cx + 0.48 * Math.cos(ang(k))) * S, ly = titleH + (cy + 0.48 * Math.sin(ang(k))) * S;
    nodes.push({ ref: `axl${k}`, kind: "text", label: a, x: Math.round(lx - 44), y: Math.round(ly - 9), w: 88, h: 18, textColor: "#cbd5e1" });
  });
  return { nodes, edges: [] };
}

// ─── treemap-beta ─────────────────────────────────────────────────────────────
export function parseTreemapToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const leaves: Array<{ label: string; value: number }> = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^treemap-beta/i.test(t) || /^title\b/i.test(t)) continue;
    const m = t.match(/^"?([^":]+?)"?\s*:\s*([\d.]+)/);
    if (m) leaves.push({ label: m[1].trim(), value: parseFloat(m[2]) });
  }
  if (!leaves.length) return { nodes: [], edges: [] };
  const S = 420, titleH = title ? 34 : 0;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: S, h: 28 });
  const rects = squarify(leaves.map((l) => l.value), 0, titleH, S, S);
  leaves.forEach((l, i) => {
    const r = rects[i]; if (!r) return;
    nodes.push({ ref: `tm${i}`, kind: "shape", shape: "rect", label: "", x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), fill: hexA(PALETTE[i % PALETTE.length], 0.55), stroke: "#0f172a" });
    if (r.w > 44 && r.h > 26) nodes.push({ ref: `tml${i}`, kind: "text", label: `${l.label}\n${l.value}`, x: Math.round(r.x + 4), y: Math.round(r.y + 4), w: Math.round(r.w - 8), h: Math.round(r.h - 8), textColor: "#f8fafc" });
  });
  return { nodes, edges: [] };
}

// Squarified treemap layout. Returns a rect per input value (same order).
function squarify(values: number[], x0: number, y0: number, w: number, h: number): Array<{ x: number; y: number; w: number; h: number }> {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const items = values.map((v, i) => ({ i, area: (v / total) * w * h }));
  const out: Array<{ x: number; y: number; w: number; h: number }> = new Array(values.length);
  let x = x0, y = y0, rw = w, rh = h;
  let row: typeof items = [];
  const worst = (r: typeof items, len: number) => {
    const s = r.reduce((a, b) => a + b.area, 0); const mx = Math.max(...r.map((b) => b.area)), mn = Math.min(...r.map((b) => b.area));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const layout = (r: typeof items) => {
    const s = r.reduce((a, b) => a + b.area, 0); const horizontal = rw >= rh;
    const len = horizontal ? rh : rw; const thick = s / len;
    let off = horizontal ? y : x;
    r.forEach((b) => { const side = b.area / thick; out[b.i] = horizontal ? { x, y: off, w: thick, h: side } : { x: off, y, w: side, h: thick }; off += side; });
    if (horizontal) { x += thick; rw -= thick; } else { y += thick; rh -= thick; }
  };
  const queue = [...items];
  while (queue.length) {
    const next = queue[0]; const len = (rw >= rh ? rh : rw);
    if (!row.length || worst([...row, next], len) <= worst(row, len)) { row.push(next); queue.shift(); }
    else { layout(row); row = []; }
  }
  if (row.length) layout(row);
  return out;
}

// ─── kanban ───────────────────────────────────────────────────────────────────
export function parseKanbanToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  type Col = { ref: string; title: string; cards: string[] };
  const cols: Col[] = [];
  let baseIndent: number | null = null;
  let cur: Col | null = null;
  let ci = 0;
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("%%") || /^kanban\b/i.test(raw.trim())) continue;
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, "  ").length;
    if (baseIndent === null) baseIndent = indent;
    const text = raw.trim();
    const m = text.match(/^[\w-]+\s*\[([^\]]+)\]/) || text.match(/^(.+)$/);
    const label = (m && m[1] ? m[1] : text).replace(/^[\w-]+\s*/, (s) => (text.includes("[") ? "" : s)).trim() || text;
    if (indent <= baseIndent) { cur = { ref: `col${ci++}`, title: label, cards: [] }; cols.push(cur); }
    else if (cur) cur.cards.push(label);
  }
  if (!cols.length) return { nodes: [], edges: [] };
  const COLW = 200, GAP = 24, HEAD = 36, CARDH = 44, CARDGAP = 10, PAD = 12;
  const nodes: GeneratedMeshNode[] = [];
  cols.forEach((c, i) => {
    const h = HEAD + Math.max(1, c.cards.length) * (CARDH + CARDGAP) + PAD;
    const x = i * (COLW + GAP);
    nodes.push({ ref: c.ref, kind: "board", label: c.title, x, y: 0, w: COLW, h, stroke: PALETTE[i % PALETTE.length], fill: hexA(PALETTE[i % PALETTE.length], 0.05) });
    c.cards.forEach((card, k) => {
      nodes.push({ ref: `${c.ref}_c${k}`, kind: "shape", shape: "rounded-rect", label: card, x: PAD, y: HEAD + k * (CARDH + CARDGAP), w: COLW - PAD * 2, h: CARDH, parent: c.ref, fill: "rgba(148,163,184,0.08)", stroke: "#475569" });
    });
  });
  return { nodes, edges: [] };
}

// ─── gantt ────────────────────────────────────────────────────────────────────
export function parseGanttToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  type Task = { name: string; section: string; start: Date; end: Date; status: string };
  const tasks: Task[] = [];
  const byId = new Map<string, Task>();
  let section = "";
  const parseDate = (s: string) => { const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const durDays = (s: string) => { const m = s.match(/([\d.]+)\s*([dwmh]?)/i); if (!m) return 1; const v = +m[1], u = (m[2] || "d").toLowerCase(); return u === "w" ? v * 7 : u === "m" ? v * 30 : u === "h" ? v / 24 : v; };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^(gantt|title|dateFormat|axisFormat|excludes|todayMarker|tickInterval|weekday|section\s*$)/i.test(t)) {
      const sec = t.match(/^section\s+(.+)$/i); if (sec) section = sec[1].trim();
      continue;
    }
    const sec = t.match(/^section\s+(.+)$/i); if (sec) { section = sec[1].trim(); continue; }
    const ci = t.indexOf(":"); if (ci < 0) continue;
    const name = t.slice(0, ci).trim();
    const parts = t.slice(ci + 1).split(",").map((s) => s.trim()).filter(Boolean);
    let status = "", afterId = "", id = "";
    const rest: string[] = [];
    for (const p of parts) {
      if (/^(done|active|crit|milestone)$/i.test(p)) status = p.toLowerCase();
      else if (/^after\s+/i.test(p)) afterId = p.replace(/^after\s+/i, "").trim();
      else rest.push(p);
    }
    const ids = rest.filter((p) => !parseDate(p) && !/^[\d.]+\s*[dwmh]$/i.test(p));
    if (ids.length) id = ids[0];
    const dates = rest.filter(parseDate);
    const durs = rest.filter((p) => /^[\d.]+\s*[dwmh]$/i.test(p));
    let start: Date | null = null, end: Date | null = null;
    if (afterId && byId.has(afterId)) start = byId.get(afterId)!.end;
    else if (dates.length) start = parseDate(dates[0]);
    if (dates.length > 1) end = parseDate(dates[1]);
    else if (durs.length && start) end = addDays(start, durDays(durs[0]));
    if (!start) continue;
    if (!end) end = addDays(start, 1);
    const task: Task = { name, section, start, end, status };
    tasks.push(task); if (id) byId.set(id, task);
  }
  if (!tasks.length) return { nodes: [], edges: [] };
  const minD = Math.min(...tasks.map((t) => t.start.getTime())), maxD = Math.max(...tasks.map((t) => t.end.getTime()));
  const range = Math.max(1, (maxD - minD) / 86400000);
  const W = 660, rowH = 28, gap = 6, padL = 168, padR = 20;
  const colors: Record<string, string> = { done: "#475569", active: "#22d3ee", crit: "#fb7185", milestone: "#a78bfa", "": "#60a5fa" };
  const nodes: GeneratedMeshNode[] = [];
  let y = title ? 34 : 8;
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: W, h: 28 });
  const plotW = W - padL - padR;
  let lastSection = "";
  tasks.forEach((t, i) => {
    if (t.section && t.section !== lastSection) { nodes.push({ ref: `sec${i}`, kind: "text", label: `**${t.section}**`, x: 0, y, w: padL - 8, h: 20, textColor: "#94a3b8" }); lastSection = t.section; y += 22; }
    const x = padL + ((t.start.getTime() - minD) / 86400000 / range) * plotW;
    const w = Math.max(4, ((t.end.getTime() - t.start.getTime()) / 86400000 / range) * plotW);
    const col = colors[t.status] || colors[""];
    nodes.push({ ref: `gk${i}`, kind: "shape", shape: "rounded-rect", label: "", x: Math.round(x), y: Math.round(y), w: Math.round(w), h: rowH, fill: hexA(col, 0.7), stroke: col });
    nodes.push({ ref: `gl${i}`, kind: "text", label: t.name, x: 0, y: Math.round(y + 4), w: padL - 12, h: 20, textColor: "#cbd5e1" });
    y += rowH + gap;
  });
  return { nodes, edges: [] };
}

// ─── packet-beta ──────────────────────────────────────────────────────────────
export function parsePacketToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const fields: Array<{ s: number; e: number; label: string }> = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^packet(-beta)?/i.test(t) || /^title\b/i.test(t)) continue;
    const m = t.match(/^(\d+)\s*(?:-\s*(\d+))?\s*:\s*"?([^"]+)"?/);
    if (m) { const s = +m[1], e = m[2] ? +m[2] : s; fields.push({ s, e, label: m[3].trim() }); }
  }
  if (!fields.length) return { nodes: [], edges: [] };
  const maxBit = Math.max(...fields.map((f) => f.e));
  const perRow = 32, W = 660, titleH = title ? 34 : 0, cell = W / perRow, rowH = 46;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: W, h: 28 });
  void maxBit;
  fields.forEach((f, i) => {
    let s = f.s;
    while (s <= f.e) {
      const row = Math.floor(s / perRow), rowEnd = (row + 1) * perRow - 1, segEnd = Math.min(f.e, rowEnd);
      const x = (s - row * perRow) * cell, y = titleH + row * rowH, w = (segEnd - s + 1) * cell;
      nodes.push({ ref: `pk${i}_${s}`, kind: "shape", shape: "rect", label: "", x: Math.round(x), y: Math.round(y), w: Math.round(w), h: rowH - 6, fill: hexA(PALETTE[i % PALETTE.length], 0.3), stroke: "#475569" });
      nodes.push({ ref: `pkl${i}_${s}`, kind: "text", label: `${f.s}${f.e !== f.s ? `-${f.e}` : ""}\n${f.label}`, x: Math.round(x + 3), y: Math.round(y + 3), w: Math.round(w - 6), h: rowH - 12, textColor: "#e2e8f0" });
      s = segEnd + 1;
    }
  });
  return { nodes, edges: [] };
}

// ─── wardley-beta ─────────────────────────────────────────────────────────────
export function parseWardleyToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const comps = new Map<string, { vis: number; evo: number }>();
  const order: string[] = [];
  const rawEdges: Array<{ from: string; to: string }> = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^wardley/i.test(t) || /^title\b/i.test(t)) continue;
    const c = t.match(/^component\s+(.+?)\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/i);
    if (c) { const name = unquote(c[1]); comps.set(name, { vis: +c[2], evo: +c[3] }); order.push(name); continue; }
    const e = t.match(/^(.+?)\s*->\s*(.+)$/); if (e) rawEdges.push({ from: unquote(e[1]).trim(), to: unquote(e[2]).trim() });
  }
  if (!comps.size) return { nodes: [], edges: [] };
  const S = 460, titleH = title ? 34 : 0, pad = 34, box = S - pad * 2;
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: S, h: 28 });
  nodes.push({ ref: "bg", kind: "shape", shape: "rect", label: "", x: pad, y: titleH + pad, w: box, h: box, fill: "rgba(148,163,184,0.04)", stroke: "#475569" });
  ["Genesis", "Custom", "Product", "Commodity"].forEach((lbl, i) => nodes.push({ ref: `ev${i}`, kind: "text", label: lbl, x: Math.round(pad + (i / 4) * box + 4), y: titleH + pad + box + 4, w: Math.round(box / 4), h: 16, textColor: "#64748b" }));
  nodes.push({ ref: "vy", kind: "text", label: "Visible", x: 0, y: titleH + pad - 2, w: pad, h: 16, textColor: "#64748b" });
  const refOf = new Map<string, string>();
  order.forEach((name, i) => {
    const c = comps.get(name)!;
    const px = pad + c.evo * box, py = titleH + pad + (1 - c.vis) * box;
    const ref = `wc${i}`; refOf.set(name, ref);
    nodes.push({ ref, kind: "shape", shape: "ellipse", label: "", x: Math.round(px - 7), y: Math.round(py - 7), w: 14, h: 14, fill: "#fbbf24", stroke: "#0f172a" });
    nodes.push({ ref: `wl${i}`, kind: "text", label: name, x: Math.round(px + 9), y: Math.round(py - 9), w: 130, h: 18, textColor: "#e2e8f0" });
  });
  const edges: GeneratedMeshEdge[] = rawEdges.filter((e) => refOf.has(e.from) && refOf.has(e.to)).map((e) => ({ from: refOf.get(e.from)!, to: refOf.get(e.to)!, color: "#64748b" }));
  return { nodes, edges };
}

// ─── venn-beta ────────────────────────────────────────────────────────────────
export function parseVennToMesh(source: string): GeneratedMesh {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const sets: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^venn/i.test(t) || /^title\b/i.test(t)) continue;
    const m = t.match(/^set\s+(.+)$/i) || t.match(/^"?([A-Za-z0-9 _-]+)"?\s*(?::|$)/);
    if (m) sets.push(unquote(m[1]));
  }
  const uniq = [...new Set(sets.map((s) => s.trim()).filter(Boolean))].slice(0, 3);
  if (uniq.length < 2) return { nodes: [], edges: [] };
  const S = 380, titleH = title ? 34 : 0, r = uniq.length === 2 ? 0.32 : 0.3;
  const centers = uniq.length === 2 ? [{ x: 0.38, y: 0.52 }, { x: 0.62, y: 0.52 }] : [{ x: 0.5, y: 0.36 }, { x: 0.37, y: 0.62 }, { x: 0.63, y: 0.62 }];
  const nodes: GeneratedMeshNode[] = [];
  if (title) nodes.push({ ref: "title", kind: "text", label: `**${title}**`, x: 0, y: 0, w: S, h: 28 });
  uniq.forEach((name, i) => {
    const c = centers[i], color = PALETTE[i % PALETTE.length];
    nodes.push({ ref: `vn${i}`, kind: "shape", shape: "ellipse", label: "", x: Math.round((c.x - r) * S), y: Math.round(titleH + (c.y - r) * S), w: Math.round(2 * r * S), h: Math.round(2 * r * S), fill: hexA(color, 0.25), stroke: color });
    nodes.push({ ref: `vnl${i}`, kind: "text", label: `**${name}**`, x: Math.round((c.x - 0.13) * S), y: Math.round(titleH + (c.y - r - 0.03) * S), w: Math.round(0.26 * S), h: 20, textColor: color });
  });
  return { nodes, edges: [] };
}

// hex (#rgb / #rrggbb) → rgba string with alpha.
function hexA(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r},${g},${b},${a})`;
}
