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

// hex (#rgb / #rrggbb) → rgba string with alpha.
function hexA(hex: string, a: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r},${g},${b},${a})`;
}
