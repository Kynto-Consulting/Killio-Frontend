// Lightweight Mermaid flowchart → mesh diagram parser.
// Supports the common flowchart subset (graph/flowchart TD|TB|LR|RL): node shapes,
// edges with inline (`A -- label --> B`) or piped (`A -->|label| B`) labels,
// dashed/thick links, subgraphs (→ boards with nested members), and classDef /
// class / style color directives. No external dependency.

import type { GeneratedMesh, GeneratedMeshNode, GeneratedMeshShape } from "@/lib/api/contracts";

type Dir = "TB" | "LR";

type ParsedNode = { id: string; label: string; shape: GeneratedMeshShape; kind: "shape" | "text"; subgraph?: string };
type ParsedEdge = { from: string; to: string; label?: string; pattern?: "solid" | "dashed"; thick?: boolean };
type StyleProps = { fill?: string; stroke?: string; strokeWidth?: number; color?: string };
type Subgraph = { id: string; title: string };

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
    .replace(/<\/?(?:i|em)>/gi, "*")
    .replace(/<\/?(?:b|strong)>/gi, "**")
    .replace(/<[^>]+>/g, "")
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

export function parseMermaidToMesh(source: string): GeneratedMesh {
  if (/^\s*erDiagram\b/im.test(source)) return parseErDiagramToMesh(source);
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
      subgraphs.push({ id, title });
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

  // Build subgraph boards from member bounding boxes, then nest members.
  const sgBoardRef = new Map<string, string>();
  subgraphs.forEach((sg) => {
    const members = nodeIds.filter((id) => nodes.get(id)!.subgraph === sg.id);
    if (!members.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    members.forEach((id) => {
      const p = posById.get(id)!;
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H);
    });
    const boardRef = `__sg_${sg.id}`;
    sgBoardRef.set(sg.id, boardRef);
    const bx = minX - SG_PAD, by = minY - SG_PAD - SG_HEADER;
    const bw = (maxX - minX) + SG_PAD * 2, bh = (maxY - minY) + SG_PAD * 2 + SG_HEADER;
    const sp = directStyle.get(sg.id);
    meshNodes.push({
      ref: boardRef, kind: "board", label: sg.title || sg.id, x: bx, y: by, w: bw, h: bh,
      stroke: sp?.stroke, fill: sp?.fill ? hexToRgba(sp.fill, 0.06) : undefined,
    });
  });

  // Emit member/standalone nodes (after boards so parent refs resolve on apply).
  nodeIds.forEach((id) => {
    const n = nodes.get(id)!;
    const p = posById.get(id)!;
    const sgRef = n.subgraph ? sgBoardRef.get(n.subgraph) : undefined;
    const col = colorOf(id);
    let x = p.x, y = p.y;
    if (sgRef) {
      // Position relative to the parent board.
      const board = meshNodes.find((b) => b.ref === sgRef)!;
      x = p.x - board.x; y = p.y - board.y;
    }
    // Grow nodes that carry a description (multi-line label) so the text fits.
    const lines = n.label.split("\n");
    const longest = lines.reduce((mx, ln) => Math.max(mx, ln.length), 0);
    const w = Math.min(320, Math.max(NODE_W, longest * 8 + 36));
    const h = Math.max(NODE_H, 44 + lines.length * 22);
    meshNodes.push({
      ref: id, kind: n.kind, label: n.label, shape: n.shape, x, y, w, h,
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
