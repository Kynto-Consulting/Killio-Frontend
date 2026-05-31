// Mermaid → typed ChartSpec. Used by importers + fenced ```mermaid``` blocks
// to turn chart-type sources into a single chart metabrick (editable as JSON
// via the structured editor) instead of exploded primitive nodes.

import type { ChartSpec, PieSpec, BarLineSpec, RadarSpec, QuadrantSpec, TreemapSpec, KanbanSpec, GanttSpec, VennSpec, PacketSpec, WardleySpec } from "@/components/ui/chart-brick";

const strip = (s: string) => s.replace(/^---[\s\S]*?---\s*/m, "");
const unquote = (s: string) => s.trim().replace(/^["'\[]+|["'\]]+$/g, "").trim();
const num = (s: string) => parseFloat(s.replace(/[^\d.+-]/g, ""));
const parseList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function detectType(source: string): string {
  const body = source.replace(/^---[\s\S]*?---\s*/m, "");
  for (const raw of body.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith("%%")) continue;
    const m = t.match(/^([A-Za-z][\w-]*)/);
    return (m?.[1] ?? "").toLowerCase();
  }
  return "";
}

function grabTitle(lines: string[]): string | undefined {
  for (const raw of lines) {
    const t = raw.trim();
    const m = t.match(/^(?:\w[\w-]*\s+)?title\s+(.+)$/i) || t.match(/^title:\s*(.+)$/i);
    if (m) return unquote(m[1]);
  }
  return undefined;
}

function piePart(source: string): PieSpec | null {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const items: PieSpec["items"] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^pie\b/i.test(t) || /^title\b/i.test(t) || /^showData\b/i.test(t)) continue;
    const m = t.match(/^"?([^":]+?)"?\s*:\s*([\d.]+)/);
    if (m) items.push({ label: m[1].trim(), value: parseFloat(m[2]) });
  }
  return items.length ? { title, items } : null;
}

function xyPart(source: string): { kind: "bar" | "line"; spec: BarLineSpec } | null {
  const lines = strip(source).split(/\r?\n/);
  let title: string | undefined; let xLabels: string[] = [];
  let yMin: number | undefined, yMax: number | undefined;
  const bars: number[][] = [], lineSeries: number[][] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^xychart-beta/i.test(t)) continue;
    const ti = t.match(/^title\s+"?(.+?)"?$/i); if (ti) { title = ti[1].trim(); continue; }
    const xa = t.match(/^x-axis\s+(.+)$/i);
    if (xa) { const inner = xa[1].match(/\[(.*)\]/); if (inner) xLabels = parseList(inner[1]).map(unquote); continue; }
    const ya = t.match(/^y-axis\s+(?:"[^"]*"\s*)?([\d.]+)\s*-->\s*([\d.]+)/i);
    if (ya) { yMin = parseFloat(ya[1]); yMax = parseFloat(ya[2]); continue; }
    const bar = t.match(/^bar\s+\[(.*)\]/i); if (bar) { bars.push(parseList(bar[1]).map(num)); continue; }
    const ln  = t.match(/^line\s+\[(.*)\]/i); if (ln)  { lineSeries.push(parseList(ln[1]).map(num)); continue; }
  }
  const all = [...bars, ...lineSeries];
  if (!all.length) return null;
  const kind: "bar" | "line" = bars.length >= lineSeries.length ? "bar" : "line";
  const series: BarLineSpec["series"] = all.map((values) => ({ values }));
  return { kind, spec: { title, xLabels, series, yMin, yMax } };
}

function radarPart(source: string): RadarSpec | null {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const axes: string[] = [];
  const curves: RadarSpec["curves"] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^radar-beta/i.test(t) || /^title\b/i.test(t)) continue;
    const ax = t.match(/^axis\s+(.+)$/i);
    if (ax) { ax[1].split(",").forEach((seg) => { const m = seg.trim().match(/(?:\w[\w-]*\s*)?\[?"?([^"\]]+)"?\]?/); if (m) axes.push(m[1].trim()); }); continue; }
    const cv = t.match(/^curve\s+(?:[\w-]+\s*)?(?:\["?([^"\]]+)"?\]|"([^"]+)")?\s*\{([^}]*)\}/i);
    if (cv) { curves.push({ label: (cv[1] || cv[2] || `Serie ${curves.length+1}`).trim(), values: cv[3].split(",").map(num).filter(Number.isFinite) }); continue; }
    const cv2 = t.match(/^curve\s+(?:\["?([^"\]]+)"?\]|"([^"]+)"|([\w-]+))\s+\[([^\]]*)\]/i);
    if (cv2) { curves.push({ label: (cv2[1] || cv2[2] || cv2[3] || `Serie ${curves.length+1}`).trim(), values: cv2[4].split(",").map(num).filter(Number.isFinite) }); }
  }
  return (axes.length >= 3 && curves.length) ? { title, axes, curves } : null;
}

function quadrantPart(source: string): QuadrantSpec | null {
  const lines = strip(source).split(/\r?\n/);
  let title: string | undefined, xLow = "", xHigh = "", yLow = "", yHigh = "";
  const quads: [string, string, string, string] = ["", "", "", ""];
  const points: QuadrantSpec["points"] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^quadrantChart/i.test(t)) continue;
    const ti = t.match(/^title\s+(.+)$/i); if (ti) { title = unquote(ti[1]); continue; }
    const xa = t.match(/^x-axis\s+(.+?)(?:\s*-->\s*(.+))?$/i); if (xa) { xLow = unquote(xa[1]); xHigh = xa[2] ? unquote(xa[2]) : ""; continue; }
    const ya = t.match(/^y-axis\s+(.+?)(?:\s*-->\s*(.+))?$/i); if (ya) { yLow = unquote(ya[1]); yHigh = ya[2] ? unquote(ya[2]) : ""; continue; }
    const q  = t.match(/^quadrant-([1-4])\s+(.+)$/i); if (q) { quads[parseInt(q[1]) - 1] = unquote(q[2]); continue; }
    const p  = t.match(/^"?(.+?)"?\s*:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/); if (p) { points.push({ label: p[1].trim(), x: parseFloat(p[2]), y: parseFloat(p[3]) }); }
  }
  return (points.length || quads.some(Boolean)) ? { title, xLow, xHigh, yLow, yHigh, quads, points } : null;
}

function treemapPart(source: string): TreemapSpec | null {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const items: TreemapSpec["items"] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^treemap-beta/i.test(t) || /^title\b/i.test(t)) continue;
    const m = t.match(/^"?([^":]+?)"?\s*:\s*([\d.]+)/);
    if (m) items.push({ label: m[1].trim(), value: parseFloat(m[2]) });
  }
  return items.length ? { title, items } : null;
}

function kanbanPart(source: string): KanbanSpec | null {
  const lines = strip(source).split(/\r?\n/);
  const cols: KanbanSpec["columns"] = [];
  let baseIndent: number | null = null; let cur: { title: string; cards: string[] } | null = null;
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("%%") || /^kanban\b/i.test(raw.trim())) continue;
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, "  ").length;
    if (baseIndent === null) baseIndent = indent;
    const text = raw.trim();
    const m = text.match(/^[\w-]+\s*\[([^\]]+)\]/) || text.match(/^(.+)$/);
    const label = (m && m[1] ? m[1] : text).replace(/^[\w-]+\s*/, (s) => (text.includes("[") ? "" : s)).trim() || text;
    if (indent <= (baseIndent ?? 0)) { cur = { title: label, cards: [] }; cols.push(cur); }
    else if (cur) cur.cards.push(label);
  }
  return cols.length ? { columns: cols } : null;
}

function ganttPart(source: string): GanttSpec | null {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const parseDate = (s: string) => { const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const durDays = (s: string) => { const m = s.match(/([\d.]+)\s*([dwmh]?)/i); if (!m) return 1; const v = +m[1], u = (m[2] || "d").toLowerCase(); return u === "w" ? v * 7 : u === "m" ? v * 30 : u === "h" ? v / 24 : v; };
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const tasks: GanttSpec["tasks"] = []; const byId = new Map<string, { start: Date; end: Date }>();
  let section = "";
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^(gantt|title|dateFormat|axisFormat|excludes|todayMarker|tickInterval|weekday)/i.test(t)) continue;
    const sec = t.match(/^section\s+(.+)$/i); if (sec) { section = sec[1].trim(); continue; }
    const ci = t.indexOf(":"); if (ci < 0) continue;
    const name = t.slice(0, ci).trim();
    const parts = t.slice(ci + 1).split(",").map((s) => s.trim()).filter(Boolean);
    let status: GanttSpec["tasks"][number]["status"]; let afterId = ""; let id = "";
    const rest: string[] = [];
    for (const p of parts) {
      if (/^(done|active|crit|milestone)$/i.test(p)) status = p.toLowerCase() as GanttSpec["tasks"][number]["status"];
      else if (/^after\s+/i.test(p)) afterId = p.replace(/^after\s+/i, "").trim();
      else rest.push(p);
    }
    const ids = rest.filter((p) => !parseDate(p) && !/^[\d.]+\s*[dwmh]$/i.test(p));
    if (ids.length) id = ids[0];
    const dates = rest.filter(parseDate); const durs = rest.filter((p) => /^[\d.]+\s*[dwmh]$/i.test(p));
    let start: Date | null = null, end: Date | null = null;
    if (afterId && byId.has(afterId)) start = byId.get(afterId)!.end;
    else if (dates.length) start = parseDate(dates[0]);
    if (dates.length > 1) end = parseDate(dates[1]);
    else if (durs.length && start) end = addDays(start, durDays(durs[0]));
    if (!start) continue;
    if (!end) end = addDays(start, 1);
    const task = { name, section, start: fmt(start), end: fmt(end), status };
    tasks.push(task); if (id) byId.set(id, { start, end });
  }
  return tasks.length ? { title, tasks } : null;
}

function vennPart(source: string): VennSpec | null {
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
  return uniq.length >= 2 ? { title, sets: uniq.map((label) => ({ label })) } : null;
}

function packetPart(source: string): PacketSpec | null {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const fields: PacketSpec["fields"] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^packet(-beta)?/i.test(t) || /^title\b/i.test(t)) continue;
    const m = t.match(/^(\d+)\s*(?:-\s*(\d+))?\s*:\s*"?([^"]+)"?/);
    if (m) { const s = +m[1], e = m[2] ? +m[2] : s; fields.push({ start: s, end: e, label: m[3].trim() }); }
  }
  return fields.length ? { title, fields } : null;
}

function wardleyPart(source: string): WardleySpec | null {
  const lines = strip(source).split(/\r?\n/);
  const title = grabTitle(lines);
  const components: WardleySpec["components"] = [];
  const links: WardleySpec["links"] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^wardley/i.test(t) || /^title\b/i.test(t)) continue;
    const c = t.match(/^component\s+(.+?)\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/i);
    if (c) { components.push({ name: unquote(c[1]), vis: +c[2], evo: +c[3] }); continue; }
    const e = t.match(/^(.+?)\s*->\s*(.+)$/); if (e) links.push({ from: unquote(e[1]).trim(), to: unquote(e[2]).trim() });
  }
  return components.length ? { title, components, links } : null;
}

/** Detect a mermaid chart type and return a typed ChartSpec; null if the source
 *  isn't a chart type (flowchart/sequence/etc still go through the primitive
 *  parser path). */
export function parseMermaidToChartSpec(source: string): ChartSpec | null {
  const type = detectType(source);
  switch (type) {
    case "pie":           { const s = piePart(source);      return s ? { type: "pie", spec: s } : null; }
    case "xychart-beta":  { const r = xyPart(source);       return r ? (r.kind === "bar" ? { type: "bar", spec: r.spec } : { type: "line", spec: r.spec }) : null; }
    case "radar-beta":    { const s = radarPart(source);    return s ? { type: "radar", spec: s } : null; }
    case "quadrantchart": { const s = quadrantPart(source); return s ? { type: "quadrant", spec: s } : null; }
    case "treemap-beta":  { const s = treemapPart(source);  return s ? { type: "treemap", spec: s } : null; }
    case "kanban":        { const s = kanbanPart(source);   return s ? { type: "kanban", spec: s } : null; }
    case "gantt":         { const s = ganttPart(source);    return s ? { type: "gantt", spec: s } : null; }
    case "venn-beta":     { const s = vennPart(source);     return s ? { type: "venn", spec: s } : null; }
    case "packet":
    case "packet-beta":   { const s = packetPart(source);   return s ? { type: "packet", spec: s } : null; }
    case "wardley-beta":  { const s = wardleyPart(source);  return s ? { type: "wardley", spec: s } : null; }
    default: return null;
  }
}
