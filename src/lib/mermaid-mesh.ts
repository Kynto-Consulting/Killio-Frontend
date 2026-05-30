// Lightweight Mermaid flowchart → mesh diagram parser.
// Supports the common flowchart subset (graph/flowchart TD|TB|LR|RL): node shapes,
// edges with inline (`A -- label --> B`) or piped (`A -->|label| B`) labels,
// dashed/thick links, subgraphs (→ boards with nested members), and classDef /
// class / style color directives. No external dependency.

import type { GeneratedMesh, GeneratedMeshNode, GeneratedMeshEdge, GeneratedMeshShape } from "@/lib/api/contracts";
import { parsePieToMesh, parseXYChartToMesh, parseQuadrantToMesh, parseRadarToMesh, parseTreemapToMesh, parseKanbanToMesh } from "@/lib/mermaid-charts";

type Dir = "TB" | "LR";

type ParsedNode = { id: string; label: string; shape: GeneratedMeshShape; kind: "shape" | "text"; subgraph?: string };
type ParsedEdge = { from: string; to: string; label?: string; pattern?: "solid" | "dashed"; thick?: boolean };
type StyleProps = { fill?: string; stroke?: string; strokeWidth?: number; color?: string };
type Subgraph = { id: string; title: string; parent?: string };

const NODE_W = 180;
const NODE_H = 80;
const GAP_MAIN = 90; // between layers
const GAP_CROSS = 50; // within a layer
const SG_PAD = 28;    // padding inside a subgraph board
const SG_HEADER = 30; // room for the board title

// ── Colors ─────────────────────────────────────────────────────────────────────
function expandHex(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  return `#${h}`;
}
function hexToRgba(hex: string, a: number): string {
  const h = expandHex(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r},${g},${b},${a})`;
}
// Robust prop extraction — tolerates stray tokens in the declaration.
function parseStyleProps(s: string): StyleProps {
  const out: StyleProps = {};
  const fill = s.match(/fill\s*:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
  const stroke = s.match(/stroke\s*:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
  const sw = s.match(/stroke-width\s*:\s*([0-9.]+)/);
  const color = s.match(/(?:^|[,;\s])color\s*:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/);
  if (fill) out.fill = fill[1].startsWith("#") ? expandHex(fill[1]) : fill[1];
  if (stroke) out.stroke = stroke[1].startsWith("#") ? expandHex(stroke[1]) : stroke[1];
  if (sw) out.strokeWidth = Number(sw[1]);
  if (color) out.color = color[1].startsWith("#") ? expandHex(color[1]) : color[1];
  return out;
}

// ── Node shapes ──────────────────────────────────────────────────────────────
function shapeFromToken(token: string): { label: string; shape: GeneratedMeshShape } | null {
  const tests: Array<[RegExp, GeneratedMeshShape]> = [
    [/^\[\((.*)\)\]$/, "cylinder"],     // [(text)]
    [/^\(\((.*)\)\)$/, "ellipse"],      // ((text))
    [/^\(\[(.*)\]\)$/, "rounded-rect"], // ([text]) stadium/terminator
    [/^\{\{(.*)\}\}$/, "diamond"],      // {{text}} hexagon → diamond
    [/^\{(.*)\}$/, "diamond"],          // {text}
    [/^\[\[(.*)\]\]$/, "rect"],         // [[text]] subroutine
    [/^\[(.*)\]$/, "rect"],             // [text]
    [/^\((.*)\)$/, "rounded-rect"],     // (text)
    [/^>(.*)\]$/, "rect"],              // >text] asymmetric
  ];
  for (const [re, shape] of tests) {
    const m = token.match(re);
    if (m) return { label: cleanLabel(stripQuotes(m[1].trim())), shape };
  }
  return null;
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

// Convert the small HTML subset Mermaid allows in labels into markdown so the
// brick renderer shows line breaks / italics / bold instead of raw tags.
function cleanLabel(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:b|strong)>/gi, "**") // bold
    .replace(/<\/?(?:i|em)>/gi, "*")        // italic
    .replace(/<[^>]+>/g, "")
    // FontAwesome / Material icon prefixes (e.g. "fa:fa-car Car") — drop the
    // icon token, keep the text. We can't render the glyph here.
    .replace(/\b(?:fa[bsrl]?|mat|mc):[\w-]+\s*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function parseNodeToken(raw: string, nodes: Map<string, ParsedNode>, sg?: string): string | null {
  const token = raw.trim();
  if (!token) return null;
  const idMatch = token.match(/^([A-Za-z0-9_.-]+)\s*([\s\S]*)$/);
  if (!idMatch) return null;
  const id = idMatch[1];
  const rest = idMatch[2].trim();
  const existing = nodes.get(id);
  if (rest) {
    const shaped = shapeFromToken(rest);
    if (shaped) {
      nodes.set(id, { id, label: shaped.label || id, shape: shaped.shape, kind: "shape", subgraph: existing?.subgraph ?? sg });
      return id;
    }
  }
  if (!existing) nodes.set(id, { id, label: id, shape: "rect", kind: "shape", subgraph: sg });
  else if (sg && !existing.subgraph) existing.subgraph = sg;
  return id;
}

// Edge connector: plain (`-->`/`---`/`-.->`/`==>`) optionally with a `|label|`,
// OR an inline-labelled link (`-- label -->`, `-. label .->`, `== label ==>`).
const EDGE_RE = /(?:(-->|---|-\.->|-\.-|==>|===)(?:\|([^|]*)\|)?)|(?:(--|-\.|==)\s*"?([^">|]+?)"?\s*(-->|-\.->|==>))/g;

function linkMeta(plainOp?: string, inlineOp?: string): { pattern: "solid" | "dashed"; thick: boolean } {
  const op = plainOp ?? inlineOp ?? "";
  return { pattern: op.includes(".") ? "dashed" : "solid", thick: op.includes("=") };
}

function parseLine(line: string, nodes: Map<string, ParsedNode>, edges: ParsedEdge[], sg?: string): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("%%")) return;

  EDGE_RE.lastIndex = 0;
  const tokens: string[] = [];
  const labels: string[] = [];
  const metas: Array<{ pattern: "solid" | "dashed"; thick: boolean }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EDGE_RE.exec(trimmed))) {
    tokens.push(trimmed.slice(lastIndex, m.index));
    // group2 = piped label; group4 = inline label
    labels.push((m[2] ?? m[4] ?? "").trim());
    metas.push(linkMeta(m[1], m[3] ?? m[5]));
    lastIndex = EDGE_RE.lastIndex;
  }
  tokens.push(trimmed.slice(lastIndex));

  if (tokens.length < 2) {
    parseNodeToken(tokens[0], nodes, sg);
    return;
  }

  const ids = tokens.map((t) => parseNodeToken(t, nodes, sg));
  for (let i = 0; i < ids.length - 1; i++) {
    const from = ids[i];
    const to = ids[i + 1];
    if (from && to && from !== to) {
      const meta = metas[i] ?? { pattern: "solid" as const, thick: false };
      const lbl = labels[i] ? cleanLabel(stripQuotes(labels[i])) : undefined;
      edges.push({ from, to, label: lbl, pattern: meta.pattern, thick: meta.thick });
    }
  }
}

function detectDir(firstLine: string): Dir {
  const m = firstLine.match(/^(?:graph|flowchart)\s+(TB|TD|BT|LR|RL)/i);
  if (!m) return "TB";
  const d = m[1].toUpperCase();
  return d === "LR" || d === "RL" ? "LR" : "TB";
}

// Longest-path layering from roots (nodes with no incoming edge).
function assignLayers(nodeIds: string[], edges: ParsedEdge[]): Map<string, number> {
  const incoming = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodeIds.forEach((id) => { incoming.set(id, 0); adj.set(id, []); });
  edges.forEach((e) => {
    if (!adj.has(e.from) || !incoming.has(e.to)) return;
    adj.get(e.from)!.push(e.to);
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  });

  const layer = new Map<string, number>();
  const queue: string[] = [];
  nodeIds.forEach((id) => { if ((incoming.get(id) ?? 0) === 0) { layer.set(id, 0); queue.push(id); } });
  if (queue.length === 0 && nodeIds.length) { layer.set(nodeIds[0], 0); queue.push(nodeIds[0]); }

  const remaining = new Map(incoming);
  while (queue.length) {
    const cur = queue.shift()!;
    const curLayer = layer.get(cur) ?? 0;
    for (const next of adj.get(cur) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, curLayer + 1));
      remaining.set(next, (remaining.get(next) ?? 1) - 1);
      if ((remaining.get(next) ?? 0) <= 0) queue.push(next);
    }
  }
  nodeIds.forEach((id) => { if (!layer.has(id)) layer.set(id, 0); });
  return layer;
}

// Join continuation lines: Mermaid lets a single statement span multiple lines.
// A line that starts with a link operator (or pipe), or follows a line that ends
// with one, is part of the previous statement.
function mergeContinuations(raw: string[]): string[] {
  const out: string[] = [];
  const startsLink = /^(?:--+|==+|-\.|\|)/;
  const endsLink = /(?:--+>?|==+>?|-\.->?|--|\|)\s*$/;
  for (const line of raw) {
    const t = line.trim();
    if (!t) continue;
    if (out.length && (startsLink.test(t) || endsLink.test(out[out.length - 1].trim()))) {
      out[out.length - 1] += " " + t;
    } else {
      out.push(line);
    }
  }
  return out;
}

// ── erDiagram ────────────────────────────────────────────────────────────────
// Entities become boards listing their attributes in a nested text brick;
// relationships become labelled connections carrying crow's-foot cardinality.
type ErAttr = { type: string; name: string; key?: string; comment?: string };

function cardText(c: string): string {
  switch (c) {
    case "||": return "1";
    case "|o": case "o|": return "0..1";
    case "}o": case "o{": return "0..N";
    case "}|": case "|{": return "1..N";
    default: return c;
  }
}

function parseErDiagramToMesh(source: string): GeneratedMesh {
  const lines = source.split(/\r?\n/);
  const entities = new Map<string, ErAttr[]>();
  const order: string[] = [];
  const rels: Array<{ left: string; right: string; lc: string; rc: string; label?: string }> = [];
  const ensure = (n: string) => { if (!entities.has(n)) { entities.set(n, []); order.push(n); } };

  let cur: string | null = null;
  let started = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%")) continue;
    if (!started) { if (/^erDiagram\b/i.test(t)) { started = true; continue; } started = true; }

    if (cur) {
      if (t === "}") { cur = null; continue; }
      // attribute: type name [PK|FK|UK] ["comment"]
      const m = t.match(/^([\w<>()]+)\s+([\w$]+)(?:\s+(PK|FK|UK))?(?:\s+"([^"]*)")?/);
      if (m) entities.get(cur)!.push({ type: m[1], name: m[2], key: m[3], comment: m[4] });
      continue;
    }

    const eo = t.match(/^([\w]+)\s*\{$/);
    if (eo) { ensure(eo[1]); cur = eo[1]; continue; }

    // relationship: LEFT <lcard><line><rcard> RIGHT : "label"
    const rel = t.match(/^([\w]+)\s+([|}{o]{1,2})(?:--|\.\.)([|}{o]{1,2})\s+([\w]+)\s*:\s*"?([^"]*)"?$/);
    if (rel) { ensure(rel[1]); ensure(rel[4]); rels.push({ left: rel[1], right: rel[4], lc: rel[2], rc: rel[3], label: rel[5]?.trim() }); continue; }

    const en = t.match(/^([\w]+)$/);
    if (en) ensure(en[1]);
  }

  const COL_W = 300, COL_GAP = 70, ROW_GAP = 64, HEADER = 36, ATTR_H = 24, PAD = 12;
  const cols = Math.max(1, Math.ceil(Math.sqrt(order.length)));
  const heightOf = (n: string) => HEADER + Math.max(1, entities.get(n)!.length) * ATTR_H + PAD;

  const meshNodes: GeneratedMeshNode[] = [];
  let curY = 0;
  for (let r = 0; r * cols < order.length; r++) {
    let rowH = 0;
    for (let ci = 0; ci < cols; ci++) { const idx = r * cols + ci; if (idx < order.length) rowH = Math.max(rowH, heightOf(order[idx])); }
    for (let ci = 0; ci < cols; ci++) {
      const idx = r * cols + ci;
      if (idx >= order.length) break;
      const n = order[idx];
      const h = heightOf(n);
      const x = ci * (COL_W + COL_GAP);
      meshNodes.push({ ref: n, kind: "board", label: n, x, y: curY, w: COL_W, h, stroke: "#38bdf8", fill: "rgba(56,189,248,0.05)" });
      const attrs = entities.get(n)!;
      if (attrs.length) {
        const md = attrs.map((a) => {
          const badge = a.key ? `  \`${a.key}\`` : "";
          return `**${a.name}** *${a.type}*${badge}`;
        }).join("\n\n");
        meshNodes.push({ ref: `${n}__attrs`, kind: "text", label: md, x: PAD, y: HEADER, w: COL_W - PAD * 2, h: h - HEADER - PAD, parent: n });
      }
    }
    curY += rowH + ROW_GAP;
  }

  const edges = rels.map((r) => ({
    from: r.left, to: r.right,
    label: `${cardText(r.lc)} — ${cardText(r.rc)}${r.label ? `  ${r.label}` : ""}`,
  }));

  return { nodes: meshNodes, edges };
}

function parseFlowchartToMesh(source: string): GeneratedMesh {
  const lines = mergeContinuations(source.split(/\r?\n/));
  const nodes = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];
  const subgraphs: Subgraph[] = [];
  const classDefs = new Map<string, StyleProps>();
  const nodeClass = new Map<string, string>();           // nodeId → className
  const directStyle = new Map<string, StyleProps>();      // nodeId/subgraphId → style
  const sgStack: string[] = [];

  let started = false;
  let dir: Dir = "TB";
  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (!t) continue;

    // Header
    if (!started) {
      if (/^(?:graph|flowchart)\b/i.test(t)) { dir = detectDir(t); started = true; continue; }
      started = true; // no header → treat as flowchart TB
    }
    if (t.startsWith("%%")) continue;

    // subgraph ID [Title]  |  subgraph Title
    const sgMatch = t.match(/^subgraph\s+(.+)$/i);
    if (sgMatch) {
      const body = sgMatch[1].trim();
      const titled = body.match(/^(\S+)\s*\[(.+)\]$/);
      const id = titled ? titled[1] : body.replace(/[\[\]"]/g, "");
      const title = titled ? stripQuotes(titled[2].trim()) : stripQuotes(body);
      subgraphs.push({ id, title, parent: sgStack[sgStack.length - 1] });
      sgStack.push(id);
      continue;
    }
    if (/^end$/i.test(t)) { sgStack.pop(); continue; }

    // classDef NAME ...props
    const cdMatch = t.match(/^classDef\s+(\S+)\s+(.+);?$/i);
    if (cdMatch) { classDefs.set(cdMatch[1], parseStyleProps(cdMatch[2])); continue; }

    // class NODE[,NODE...] NAME
    const clMatch = t.match(/^class\s+([A-Za-z0-9_.,-]+)\s+(\S+);?$/i);
    if (clMatch) { clMatch[1].split(",").forEach((n) => nodeClass.set(n.trim(), clMatch[2].replace(/;$/, ""))); continue; }

    // style NODE ...props
    const stMatch = t.match(/^style\s+(\S+)\s+(.+);?$/i);
    if (stMatch) { directStyle.set(stMatch[1], parseStyleProps(stMatch[2])); continue; }

    parseLine(rawLine, nodes, edges, sgStack[sgStack.length - 1]);
  }

  const nodeIds = Array.from(nodes.keys());
  const layers = assignLayers(nodeIds, edges);

  const byLayer = new Map<number, string[]>();
  nodeIds.forEach((id) => {
    const l = layers.get(id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  });

  // Resolve a node's colors from its assigned class or direct style.
  const colorOf = (id: string): { stroke?: string; fill?: string; textColor?: string } => {
    const cls = nodeClass.get(id);
    const sp = directStyle.get(id) ?? (cls ? classDefs.get(cls) : undefined);
    if (!sp) return {};
    return {
      stroke: sp.stroke,
      fill: sp.fill ? hexToRgba(sp.fill, 0.18) : undefined,
      textColor: sp.color,
    };
  };

  // Place nodes by layer (global coords).
  const posById = new Map<string, { x: number; y: number }>();
  const meshNodes: GeneratedMeshNode[] = [];
  byLayer.forEach((ids, l) => {
    ids.forEach((id, idx) => {
      const mainPos = l * (NODE_H + GAP_MAIN);
      const crossPos = idx * (NODE_W + GAP_CROSS);
      const x = dir === "TB" ? crossPos : mainPos;
      const y = dir === "TB" ? mainPos : crossPos;
      posById.set(id, { x, y });
    });
  });

  // ── Nested subgraph boards ────────────────────────────────────────────────
  // Each subgraph's GLOBAL rect = the union of its DIRECT member node rects and
  // its CHILD subgraphs' rects. Computed deepest-first so children are known
  // before parents, then emitted parent-relative so boards nest properly.
  const sgById = new Map(subgraphs.map((s) => [s.id, s]));
  const depthOf = (sg: Subgraph): number => { let d = 0, p = sg.parent; while (p) { d++; p = sgById.get(p)?.parent; } return d; };
  const childSgs = (id: string) => subgraphs.filter((s) => s.parent === id);
  const directMembers = (id: string) => nodeIds.filter((nid) => nodes.get(nid)!.subgraph === id);
  const nodeW = (id: string) => {
    const n = nodes.get(id)!; const longest = n.label.split("\n").reduce((mx, ln) => Math.max(mx, ln.length), 0);
    return Math.min(320, Math.max(NODE_W, longest * 8 + 36));
  };
  const nodeHt = (id: string) => Math.max(NODE_H, 44 + nodes.get(id)!.label.split("\n").length * 22);

  const sgRect = new Map<string, { x: number; y: number; w: number; h: number }>();
  [...subgraphs].sort((a, b) => depthOf(b) - depthOf(a)).forEach((sg) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    directMembers(sg.id).forEach((id) => { const p = posById.get(id)!; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + nodeW(id)); maxY = Math.max(maxY, p.y + nodeHt(id)); });
    childSgs(sg.id).forEach((c) => { const r = sgRect.get(c.id); if (r) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); } });
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = NODE_W; maxY = NODE_H; }
    sgRect.set(sg.id, { x: minX - SG_PAD, y: minY - SG_PAD - SG_HEADER, w: (maxX - minX) + SG_PAD * 2, h: (maxY - minY) + SG_PAD * 2 + SG_HEADER });
  });

  // Emit boards (parent before child: shallowest-first so parent refs resolve).
  const sgBoardRef = new Map<string, string>();
  [...subgraphs].sort((a, b) => depthOf(a) - depthOf(b)).forEach((sg) => {
    const r = sgRect.get(sg.id); if (!r) return;
    const boardRef = `__sg_${sg.id}`;
    sgBoardRef.set(sg.id, boardRef);
    const parentRef = sg.parent ? sgBoardRef.get(sg.parent) : undefined;
    const pr = sg.parent ? sgRect.get(sg.parent) : undefined;
    const sp = directStyle.get(sg.id);
    meshNodes.push({
      ref: boardRef, kind: "board", label: sg.title || sg.id,
      x: pr ? r.x - pr.x : r.x, y: pr ? r.y - pr.y : r.y, w: r.w, h: r.h,
      parent: parentRef, stroke: sp?.stroke, fill: sp?.fill ? hexToRgba(sp.fill, 0.06) : undefined,
    });
  });

  // Emit member/standalone nodes (positions relative to their direct board).
  nodeIds.forEach((id) => {
    const n = nodes.get(id)!;
    const p = posById.get(id)!;
    const sgRef = n.subgraph ? sgBoardRef.get(n.subgraph) : undefined;
    const col = colorOf(id);
    let x = p.x, y = p.y;
    if (sgRef && n.subgraph) { const r = sgRect.get(n.subgraph); if (r) { x = p.x - r.x; y = p.y - r.y; } }
    meshNodes.push({
      ref: id, kind: n.kind, label: n.label, shape: n.shape, x, y, w: nodeW(id), h: nodeHt(id),
      parent: sgRef, stroke: col.stroke, fill: col.fill, textColor: col.textColor,
    });
  });

  return {
    nodes: meshNodes,
    edges: edges.map((e) => ({
      from: e.from, to: e.to, label: e.label,
      pattern: e.pattern, width: e.thick ? 3 : undefined,
    })),
  };
}

// ─── Diagram-type dispatch ─────────────────────────────────────────────────────
// Detect the Mermaid diagram type from the first meaningful line (after YAML
// frontmatter + %% comments), then route. Unknown / not-yet-graph-mappable types
// fall back to a single text node so the import never fails and content is kept.
function detectMermaidType(source: string): string {
  const body = source.replace(/^---[\s\S]*?---\s*/m, ""); // drop YAML frontmatter
  for (const raw of body.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith("%%")) continue;
    const m = t.match(/^([A-Za-z][\w-]*)/);
    const kw = (m?.[1] ?? "").toLowerCase();
    if (kw === "graph" || kw === "flowchart" || kw === "flowchart-elk" || kw === "flow") return "flowchart";
    if (kw === "erdiagram") return "er";
    if (kw === "classdiagram") return "class";
    if (kw === "statediagram" || kw === "statediagram-v2") return "state";
    if (kw === "mindmap") return "mindmap";
    return kw; // sequencediagram, gantt, pie, gitgraph, journey, c4context, …
  }
  return "flowchart";
}

const stripFrontmatter = (s: string) => s.replace(/^---[\s\S]*?---\s*/m, "");

// Render arbitrary source as a single read-only text node (fallback). Keeps the
// content visible/editable instead of producing a broken diagram.
function rawTextMesh(source: string, type: string): GeneratedMesh {
  const text = stripFrontmatter(source).trim();
  const lines = text.split("\n");
  const longest = lines.reduce((mx, l) => Math.max(mx, l.length), 0);
  return {
    nodes: [{
      ref: "raw", kind: "text",
      label: `**${type}** (not yet visual — shown as source)\n\n${text}`,
      x: 0, y: 0, w: Math.min(720, Math.max(280, longest * 7 + 24)), h: Math.min(640, Math.max(120, lines.length * 18 + 60)),
    }],
    edges: [],
  };
}

// classDiagram → entity boards (name + members) + relations as connections.
function parseClassDiagramToMesh(source: string): GeneratedMesh {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const members = new Map<string, string[]>();
  const order: string[] = [];
  const rels: Array<{ a: string; b: string; label?: string }> = [];
  const ensure = (n: string) => { if (!members.has(n)) { members.set(n, []); order.push(n); } };
  const relRe = /^([\w~]+)\s*(<\|--|--\|>|\*--|o--|-->|<--|\.\.>|<\.\.|--|\.\.)\s*([\w~]+)\s*(?::\s*(.+))?$/;
  let cur: string | null = null;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^classDiagram/i.test(t)) continue;
    if (cur) { if (t === "}") { cur = null; continue; } const mm = t.replace(/^[+\-#~]\s*/, "").trim(); if (mm) members.get(cur)!.push(mm); continue; }
    const open = t.match(/^class\s+([\w~]+)\s*\{$/i); if (open) { ensure(open[1]); cur = open[1]; continue; }
    const cls = t.match(/^class\s+([\w~]+)\s*$/i); if (cls) { ensure(cls[1]); continue; }
    const shorthand = t.match(/^([\w~]+)\s*:\s*(.+)$/); // Animal : +int age
    if (shorthand && !relRe.test(t)) { ensure(shorthand[1]); members.get(shorthand[1])!.push(shorthand[2].replace(/^[+\-#~]\s*/, "").trim()); continue; }
    const r = t.match(relRe);
    if (r) { ensure(r[1]); ensure(r[3]); rels.push({ a: r[1], b: r[3], label: r[4]?.trim() }); continue; }
  }
  const COL_W = 240, GAP = 70, HEADER = 36, ROW = 22, PAD = 12;
  const cols = Math.max(1, Math.ceil(Math.sqrt(order.length)));
  const nodes: GeneratedMeshNode[] = [];
  let curY = 0;
  for (let r = 0; r * cols < order.length; r++) {
    let rowH = 0;
    for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < order.length) rowH = Math.max(rowH, HEADER + members.get(order[i])!.length * ROW + PAD); }
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c; if (i >= order.length) break;
      const name = order[i]; const ms = members.get(name)!; const h = HEADER + Math.max(1, ms.length) * ROW + PAD;
      nodes.push({ ref: name, kind: "board", label: name, x: c * (COL_W + GAP), y: curY, w: COL_W, h, stroke: "#818cf8", fill: "rgba(129,140,248,0.05)" });
      if (ms.length) nodes.push({ ref: `${name}__m`, kind: "text", label: ms.map((m) => (/\(/.test(m) ? `\`${m}\`` : `**${m}**`)).join("\n\n"), x: PAD, y: HEADER, w: COL_W - PAD * 2, h: h - HEADER - PAD, parent: name });
    }
    curY += rowH + GAP;
  }
  const ids = new Set(order);
  const edges = rels.filter((r) => ids.has(r.a) && ids.has(r.b)).map((r) => ({ from: r.a, to: r.b, label: r.label }));
  return { nodes, edges };
}

// stateDiagram-v2 → flowchart text (reuse the flowchart engine).
function stateToFlowchart(source: string): string {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const out: string[] = ["flowchart TD"];
  let term = 0;
  const idOf = (s: string) => (s === "[*]" ? `__term${term++}` : s.replace(/[^\w]/g, "_"));
  const shaped = new Set<string>();
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^stateDiagram(-v2)?/i.test(t) || /^state\s/i.test(t) || t === "}" || /^direction\s/i.test(t)) continue;
    const m = t.match(/^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.+))?$/);
    if (!m) continue;
    const a = m[1].trim(), b = m[2].trim(), lbl = m[3]?.trim();
    const ai = idOf(a), bi = idOf(b);
    const decl = (orig: string, id: string) => { if (orig === "[*]") return `${id}((( )))`; if (!shaped.has(id)) { shaped.add(id); return `${id}(["${orig.replace(/"/g, "'")}"])`; } return id; };
    out.push(`${decl(a, ai)} ${lbl ? `-->|${lbl}|` : "-->"} ${decl(b, bi)}`);
  }
  return out.join("\n");
}

// mindmap → flowchart text via indentation tree.
function mindmapToFlowchart(source: string): string {
  const lines = stripFrontmatter(source).split(/\r?\n/).filter((l) => l.trim() && !/^mindmap/i.test(l.trim()) && !/^::/.test(l.trim()) && !/^%%/.test(l.trim()));
  const out: string[] = ["flowchart TD"];
  const stack: Array<{ indent: number; id: string }> = [];
  let n = 0;
  const clean = (s: string) => s.replace(/^\s*[-*]\s*/, "").replace(/^\(\(|\)\)$/g, "").replace(/^\(|\)$/g, "").replace(/^\[|\]$/g, "").replace(/^\{\{|\}\}$/g, "").trim();
  for (const raw of lines) {
    const indent = raw.match(/^\s*/)![0].length;
    const label = clean(raw);
    if (!label) continue;
    const id = `m${n++}`;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    out.push(`${id}(["${label.replace(/"/g, "'")}"])`);
    if (parent) out.push(`${parent.id} --> ${id}`);
    stack.push({ indent, id });
  }
  return out.join("\n");
}

// sequenceDiagram → participants as a top row, messages as labelled edges.
function parseSequenceToMesh(source: string): GeneratedMesh {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const order: string[] = [];
  const labels = new Map<string, string>();
  const ensure = (id: string, lbl?: string) => { if (!labels.has(id)) { labels.set(id, lbl ?? id); order.push(id); } else if (lbl) labels.set(id, lbl); };
  const msgs: Array<{ from: string; to: string; label: string; dashed: boolean }> = [];
  const decl = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i;
  const msgRe = /^([^\s:]+?)\s*(-?->>?|-?-[)x]|--?>>?)\s*([^\s:]+?)\s*:\s*(.+)$/;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^sequenceDiagram/i.test(t)) continue;
    const d = t.match(decl);
    if (d) { const alias = d[3]?.trim(); const name = d[2].trim(); ensure(alias ?? name, alias ? name : name); continue; }
    if (/^(note|loop|alt|opt|else|end|par|and|rect|activate|deactivate|autonumber|critical|break)\b/i.test(t)) continue;
    const m = t.match(msgRe);
    if (m) { ensure(m[1]); ensure(m[3]); msgs.push({ from: m[1], to: m[3], label: m[4].trim(), dashed: m[2].includes("--") }); }
  }
  const W = 150, GAP = 60;
  const nodes: GeneratedMeshNode[] = order.map((id, i) => ({
    ref: id, kind: "shape", shape: "rounded-rect", label: labels.get(id) ?? id,
    x: i * (W + GAP), y: 0, w: W, h: 56, stroke: "#22d3ee", fill: "rgba(34,211,238,0.06)",
  }));
  const edges: GeneratedMeshEdge[] = msgs.map((m) => ({ from: m.from, to: m.to, label: m.label, pattern: m.dashed ? "dashed" : "solid" }));
  return { nodes, edges };
}

// journey → sections as boards, tasks chained inside; sections chained.
function journeyToFlowchart(source: string): string {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const out: string[] = ["flowchart TD"];
  let sg = 0, prevTask: string | null = null, prevSg: string | null = null, n = 0;
  let inSg = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^journey/i.test(t) || /^title\s/i.test(t)) continue;
    const sec = t.match(/^section\s+(.+)$/i);
    if (sec) {
      if (inSg) out.push("end");
      const id = `sec${sg++}`;
      out.push(`subgraph ${id}["${sec[1].trim().replace(/"/g, "'")}"]`);
      inSg = true; prevTask = null;
      if (prevSg) out.push(`${prevSg} -.-> ${id}`);
      prevSg = id;
      continue;
    }
    const task = t.match(/^(.+?)\s*:\s*\d+\s*:\s*(.+)$/);
    if (task) {
      const id = `t${n++}`;
      out.push(`${id}(["${task[1].trim().replace(/"/g, "'")}"])`);
      if (prevTask) out.push(`${prevTask} --> ${id}`);
      prevTask = id;
    }
  }
  if (inSg) out.push("end");
  return out.join("\n");
}

// C4 (C4Context / C4Container …) → elements as nodes, Rel(...) as edges.
function parseC4ToMesh(source: string): GeneratedMesh {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const nodes: GeneratedMeshNode[] = [];
  const order: string[] = [];
  const ids = new Set<string>();
  const edges: GeneratedMeshEdge[] = [];
  const elRe = /^(Person|Person_Ext|System|System_Ext|SystemDb|SystemQueue|Container|ContainerDb|ContainerQueue|Component|System_Boundary|Container_Boundary|Enterprise_Boundary|Boundary|Node)\s*\(\s*([^,)\s]+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?/i;
  const relRe = /^(Rel|BiRel|Rel_[UDLR]|Rel_Back)\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*"([^"]*)"/i;
  const ensure = (id: string, label: string, person: boolean, boundary: boolean) => {
    if (ids.has(id)) return; ids.add(id); order.push(id);
    nodes.push({ ref: id, kind: boundary ? "board" : "shape", shape: person ? "rounded-rect" : "rect", label, x: 0, y: 0, w: 200, h: boundary ? 160 : 84, stroke: person ? "#f59e0b" : "#22d3ee", fill: person ? "rgba(245,158,11,0.06)" : "rgba(34,211,238,0.06)" });
  };
  for (const raw of lines) {
    const t = raw.trim().replace(/[{}]\s*$/, "").trim();
    if (!t || t.startsWith("%%")) continue;
    const e = t.match(elRe);
    if (e) { const kind = e[1]; const id = e[2].trim(); const lbl = e[4] ? `${e[3]}\n${e[4]}` : e[3]; ensure(id, lbl, /^Person/i.test(kind), /Boundary|Enterprise/i.test(kind)); continue; }
    const r = t.match(relRe);
    if (r) { const a = r[2].trim(), b = r[3].trim(); if (ids.has(a) && ids.has(b)) edges.push({ from: a, to: b, label: r[4] }); else edges.push({ from: a, to: b, label: r[4] }); }
  }
  // grid layout for unparented nodes
  const cols = Math.max(1, Math.ceil(Math.sqrt(order.length)));
  nodes.forEach((nd, i) => { nd.x = (i % cols) * 260; nd.y = Math.floor(i / cols) * 220; });
  const valid = new Set(order);
  return { nodes, edges: edges.filter((e) => valid.has(e.from) && valid.has(e.to)) };
}

// architecture-beta → groups as boards, services as nodes, edges strip :side.
function parseArchitectureToMesh(source: string): GeneratedMesh {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const nodes: GeneratedMeshNode[] = [];
  const groups = new Map<string, GeneratedMeshNode>();
  const svcParent = new Map<string, string>();
  const order: string[] = [];
  const edges: GeneratedMeshEdge[] = [];
  const grpRe = /^group\s+([\w-]+)\s*(?:\([^)]*\))?\s*(?:\[([^\]]*)\])?/i;
  const svcRe = /^service\s+([\w-]+)\s*(?:\([^)]*\))?\s*(?:\[([^\]]*)\])?\s*(?:in\s+([\w-]+))?/i;
  const edgeRe = /^([\w-]+)(?::[TBLR])?\s*(<?--?>?)\s*(?::[TBLR])?([\w-]+)/i;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^architecture-beta/i.test(t)) continue;
    const g = t.match(grpRe);
    if (g && /^group\b/i.test(t)) { const id = g[1]; const nd: GeneratedMeshNode = { ref: id, kind: "board", label: g[2] ?? id, x: 0, y: 0, w: 260, h: 180, stroke: "#a78bfa", fill: "rgba(167,139,250,0.05)" }; groups.set(id, nd); nodes.push(nd); order.push(id); continue; }
    const s = t.match(svcRe);
    if (s && /^service\b/i.test(t)) { const id = s[1]; const parent = s[3]; nodes.push({ ref: id, kind: "shape", shape: "rect", label: s[2] ?? id, x: 0, y: 0, w: 140, h: 64, stroke: "#22d3ee", fill: "rgba(34,211,238,0.06)", ...(parent && groups.has(parent) ? { parent } : {}) }); order.push(id); if (parent) svcParent.set(id, parent); continue; }
    const e = t.match(edgeRe);
    if (e && !/^(group|service)\b/i.test(t)) { edges.push({ from: e[1], to: e[3], label: undefined }); }
  }
  // layout services within / outside groups in a simple grid
  const ids = new Set(order);
  let gx = 0;
  groups.forEach((g) => { g.x = gx; g.y = 0; gx += 300; });
  const free = nodes.filter((n) => n.kind !== "board" && !svcParent.has(n.ref));
  free.forEach((n, i) => { n.x = i * 180; n.y = 240; });
  const children = new Map<string, GeneratedMeshNode[]>();
  nodes.forEach((n) => { const p = svcParent.get(n.ref); if (p) { (children.get(p) ?? children.set(p, []).get(p)!).push(n); } });
  children.forEach((kids) => kids.forEach((k, i) => { k.x = 16 + (i % 2) * 130; k.y = 40 + Math.floor(i / 2) * 76; }));
  return { nodes, edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

// block-beta → ids become a grid of nodes; arrows become edges; "space" pads.
function blockToFlowchart(source: string): string {
  const lines = stripFrontmatter(source).split(/\r?\n/);
  const out: string[] = ["flowchart TD"];
  const seen = new Set<string>();
  const node = (tok: string) => {
    const m = tok.match(/^([\w-]+)(?:\["([^"]*)"\]|\(\("([^"]*)"\)\)|\(\["([^"]*)"\]\)|\{"([^"]*)"\})?/);
    if (!m) return null;
    const id = m[1]; const lbl = m[2] ?? m[3] ?? m[4] ?? m[5];
    if (!seen.has(id)) { seen.add(id); out.push(`${id}["${(lbl ?? id).replace(/"/g, "'")}"]`); }
    return id;
  };
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith("%%") || /^block-beta/i.test(t) || /^columns\b/i.test(t) || t === "end" || /^block\b/i.test(t)) continue;
    const arrow = t.match(/^([\w-]+)\s*(--?>?|-->)\s*(?:\|([^|]*)\|\s*)?([\w-]+)/);
    if (arrow) { node(arrow[1]); node(arrow[4]); out.push(`${arrow[1]} ${arrow[3] ? `-->|${arrow[3]}|` : "-->"} ${arrow[4]}`); continue; }
    for (const tok of t.split(/\s+/)) { if (tok === "space" || /^space:/.test(tok) || tok === "columns") continue; node(tok); }
  }
  return out.join("\n");
}

export function parseMermaidToMesh(source: string): GeneratedMesh {
  const type = detectMermaidType(source);
  // Chart types render via dedicated primitive builders; if they can't parse the
  // body they return no nodes, so we fall back to the raw-source text node.
  const orRaw = (m: GeneratedMesh) => (m.nodes.length ? m : rawTextMesh(source, type));
  switch (type) {
    case "flowchart":        return parseFlowchartToMesh(source);
    case "er":               return parseErDiagramToMesh(source);
    case "class":            return parseClassDiagramToMesh(source);
    case "state":            return parseFlowchartToMesh(stateToFlowchart(source));
    case "mindmap":          return parseFlowchartToMesh(mindmapToFlowchart(source));
    case "sequencediagram":  return orRaw(parseSequenceToMesh(source));
    case "journey":          return parseFlowchartToMesh(journeyToFlowchart(source));
    case "c4context":
    case "c4container":
    case "c4component":
    case "c4dynamic":
    case "c4deployment":     return orRaw(parseC4ToMesh(source));
    case "architecture-beta": return orRaw(parseArchitectureToMesh(source));
    case "block-beta":       return parseFlowchartToMesh(blockToFlowchart(source));
    case "pie":              return orRaw(parsePieToMesh(source));
    case "xychart-beta":     return orRaw(parseXYChartToMesh(source));
    case "quadrantchart":    return orRaw(parseQuadrantToMesh(source));
    case "radar-beta":       return orRaw(parseRadarToMesh(source));
    case "treemap-beta":     return orRaw(parseTreemapToMesh(source));
    case "kanban":           return orRaw(parseKanbanToMesh(source));
    default:                 return rawTextMesh(source, type);
  }
}
