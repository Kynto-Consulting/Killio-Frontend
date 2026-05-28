// Lightweight Mermaid flowchart → mesh diagram parser.
// Supports the common flowchart subset (graph/flowchart TD|TB|LR|RL),
// node shapes, and edges with optional labels. No external dependency.

import type { GeneratedMesh, GeneratedMeshNode, GeneratedMeshShape } from "@/lib/api/contracts";

type Dir = "TB" | "LR";

type ParsedNode = { id: string; label: string; shape: GeneratedMeshShape; kind: "shape" | "text" };
type ParsedEdge = { from: string; to: string; label?: string };

const NODE_W = 170;
const NODE_H = 80;
const GAP_MAIN = 90; // between layers
const GAP_CROSS = 50; // within a layer

// Order matters: more specific delimiters first.
function shapeFromToken(token: string): { label: string; shape: GeneratedMeshShape } | null {
  const tests: Array<[RegExp, GeneratedMeshShape]> = [
    [/^\[\((.*)\)\]$/, "cylinder"],   // [(text)]
    [/^\(\((.*)\)\)$/, "ellipse"],    // ((text))
    [/^\(\[(.*)\]\)$/, "rounded-rect"], // ([text]) stadium
    [/^\{\{(.*)\}\}$/, "diamond"],    // {{text}} hexagon → diamond
    [/^\{(.*)\}$/, "diamond"],        // {text}
    [/^\[(.*)\]$/, "rect"],           // [text]
    [/^\((.*)\)$/, "rounded-rect"],   // (text)
    [/^>(.*)\]$/, "rect"],            // >text] asymmetric
  ];
  for (const [re, shape] of tests) {
    const m = token.match(re);
    if (m) return { label: stripQuotes(m[1].trim()), shape };
  }
  return null;
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

function parseNodeToken(raw: string, nodes: Map<string, ParsedNode>): string | null {
  const token = raw.trim();
  if (!token) return null;
  const idMatch = token.match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);
  if (!idMatch) return null;
  const id = idMatch[1];
  const rest = idMatch[2].trim();
  const existing = nodes.get(id);
  if (rest) {
    const shaped = shapeFromToken(rest);
    if (shaped) {
      nodes.set(id, { id, label: shaped.label || id, shape: shaped.shape, kind: "shape" });
      return id;
    }
  }
  if (!existing) nodes.set(id, { id, label: id, shape: "rect", kind: "shape" });
  return id;
}

const EDGE_RE = /(-->|---|-\.->|==>|-\.-)(?:\|([^|]*)\|)?/g;

function parseLine(line: string, nodes: Map<string, ParsedNode>, edges: ParsedEdge[]): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("%%")) return;

  EDGE_RE.lastIndex = 0;
  const tokens: string[] = [];
  const labels: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EDGE_RE.exec(trimmed))) {
    tokens.push(trimmed.slice(lastIndex, m.index));
    labels.push(m[2] ?? "");
    lastIndex = EDGE_RE.lastIndex;
  }
  tokens.push(trimmed.slice(lastIndex));

  if (tokens.length < 2) {
    parseNodeToken(tokens[0], nodes);
    return;
  }

  const ids = tokens.map((t) => parseNodeToken(t, nodes));
  for (let i = 0; i < ids.length - 1; i++) {
    const from = ids[i];
    const to = ids[i + 1];
    if (from && to && from !== to) {
      edges.push({ from, to, label: labels[i]?.trim() ? stripQuotes(labels[i].trim()) : undefined });
    }
  }
}

function detectDir(firstLine: string): Dir {
  const m = firstLine.match(/^(?:graph|flowchart)\s+(TB|TD|BT|LR|RL)/i);
  if (!m) return "TB";
  const d = m[1].toUpperCase();
  return d === "LR" || d === "RL" ? "LR" : "TB";
}

// Assign each node a layer via longest-path from roots (nodes with no incoming edge).
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
  // Fallback: if every node has an incoming edge (cycle), seed the first node.
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

export function parseMermaidToMesh(source: string): GeneratedMesh {
  const lines = source.split(/\r?\n/);
  const nodes = new Map<string, ParsedNode>();
  const edges: ParsedEdge[] = [];

  let started = false;
  let dir: Dir = "TB";
  for (const line of lines) {
    const t = line.trim();
    if (!started) {
      if (/^(?:graph|flowchart)\b/i.test(t)) { dir = detectDir(t); started = true; continue; }
      if (!t) continue;
      // No header — treat as flowchart TB and parse this line too.
      started = true;
    }
    parseLine(line, nodes, edges);
  }

  const nodeIds = Array.from(nodes.keys());
  const layers = assignLayers(nodeIds, edges);

  // Group by layer to place along the cross axis.
  const byLayer = new Map<number, string[]>();
  nodeIds.forEach((id) => {
    const l = layers.get(id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(id);
  });

  const meshNodes: GeneratedMeshNode[] = [];
  byLayer.forEach((ids, l) => {
    ids.forEach((id, idx) => {
      const n = nodes.get(id)!;
      const mainPos = l * (NODE_H + GAP_MAIN);
      const crossPos = idx * (NODE_W + GAP_CROSS);
      const x = dir === "TB" ? crossPos : mainPos;
      const y = dir === "TB" ? mainPos : crossPos;
      meshNodes.push({ ref: id, kind: n.kind, label: n.label, shape: n.shape, x, y, w: NODE_W, h: NODE_H });
    });
  });

  return { nodes: meshNodes, edges: edges.map((e) => ({ from: e.from, to: e.to, label: e.label })) };
}
