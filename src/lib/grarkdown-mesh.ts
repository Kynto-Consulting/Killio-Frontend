// Grarkdown (github.com/ArubikU/Grarkdown) → mesh diagram.
// Nodes:   # {Label} [id]
// Options: ### OPT CLUSTER A>B>C [color=, bgcolor=, style=] | ### OPT COLOR HEX
//          | ### OPT CLASS x | ### OPT DESC "..."
// Vars:    ## VAR  / - name: type (PK|FK)  / ## END VAR   → nested attribute brick
// Funcs:   ## FUNC / - sig                 / ## END FUNC  → appended to body
// Rels:    ## F_RELA / - TO|FROM|BI [id] {label} [style=,color=] / ## END F_RELA
//
// Clusters nest arbitrarily deep (A>B>C) and become NESTED boards; a node with
// VARs/FUNCs becomes an entity board holding an attribute brick; relations
// become connections.

import type { GeneratedMesh, GeneratedMeshNode } from "@/lib/api/contracts";

type GAttr = { name: string; type: string; key?: string };
type GRel = { dir: "TO" | "FROM" | "BI"; target: string; label?: string; dashed?: boolean; color?: string };
type GNode = {
  id: string; label: string; clusterPath?: string[]; color?: string; desc?: string;
  attrs: GAttr[]; funcs: string[]; rels: GRel[];
};
type ClusterMeta = { stroke?: string; fill?: string };

export function isGrarkdown(src: string): boolean {
  return /^\s*#\s*\{[^}]+\}\s*\[[\w-]+\]/m.test(src) || /^\s*###\s+OPT\s+/m.test(src) || /^\s*##\s+F_RELA\b/m.test(src);
}

const normColor = (c?: string): string | undefined => {
  if (!c) return undefined;
  if (c.startsWith("#")) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c) || /^[0-9a-fA-F]{3}$/.test(c)) return `#${c}`;
  return c; // CSS named color (blue, red, …)
};

function parseNodes(src: string): { nodes: GNode[]; clusterMeta: Map<string, ClusterMeta> } {
  const lines = src.split(/\r?\n/);
  const nodes: GNode[] = [];
  const clusterMeta = new Map<string, ClusterMeta>();
  let cur: GNode | null = null;
  let mode: "" | "var" | "func" | "rela" = "";
  let inStyle = false;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^###\s+STYLESHEET/i.test(t)) { inStyle = true; continue; }
    if (/^###\s+END\s+STYLESHEET/i.test(t)) { inStyle = false; continue; }
    if (inStyle) continue;

    const node = t.match(/^#\s*\{([^}]*)\}\s*\[([\w-]+)\]/);
    if (node) {
      cur = { id: node[2], label: node[1].trim(), attrs: [], funcs: [], rels: [] };
      nodes.push(cur); mode = ""; continue;
    }
    if (!cur) continue;

    if (/^##\s+VAR\b/i.test(t)) { mode = "var"; continue; }
    if (/^##\s+END\s+VAR\b/i.test(t)) { mode = ""; continue; }
    if (/^##\s+FUNC\b/i.test(t)) { mode = "func"; continue; }
    if (/^##\s+END\s+FUNC\b/i.test(t)) { mode = ""; continue; }
    if (/^##\s+F_RELA\b/i.test(t)) { mode = "rela"; continue; }
    if (/^##\s+END\s+F_RELA\b/i.test(t)) { mode = ""; continue; }

    const opt = t.match(/^###\s+OPT\s+(\w+)\s*(.*)$/i);
    if (opt) {
      const key = opt[1].toUpperCase(); const val = opt[2].trim();
      if (key === "CLUSTER") {
        const m = val.match(/^([^\[]+?)\s*(?:\[([^\]]*)\])?$/);
        const path = (m?.[1] ?? "").split(">").map((s) => s.trim()).filter(Boolean);
        if (path.length) {
          cur.clusterPath = path;
          const optStr = m?.[2] ?? "";
          const color = normColor(optStr.match(/(?:^|[,\s])color\s*=\s*([#\w]+)/i)?.[1]);
          const bg = normColor(optStr.match(/bgcolor\s*=\s*([#\w]+)/i)?.[1]);
          const pathKey = path.join(">");
          const prev = clusterMeta.get(pathKey) ?? {};
          clusterMeta.set(pathKey, { stroke: color ?? prev.stroke, fill: bg ?? prev.fill });
        }
      } else if (key === "COLOR") cur.color = normColor(val);
      else if (key === "DESC") cur.desc = val.replace(/^"|"$/g, "");
      continue;
    }

    if (mode === "var") {
      const a = t.match(/^-\s*([\w$]+)\s*:\s*([\w<>()]+)(?:\s*\(([^)]+)\))?/);
      if (a) cur.attrs.push({ name: a[1], type: a[2], key: a[3] });
      else { const r = t.replace(/^-\s*/, "").trim(); if (r) cur.attrs.push({ name: r, type: "" }); }
      continue;
    }
    if (mode === "func") {
      const r = t.replace(/^-\s*/, "").trim();
      if (r) cur.funcs.push(r);
      continue;
    }
    if (mode === "rela") {
      const r = t.match(/^-\s*(TO|FROM|BI)\s*\[([\w-]+)\]\s*(?:\{([^}]*)\})?\s*(?:\[([^\]]*)\])?/i);
      if (r) {
        const opts = r[4] || "";
        cur.rels.push({
          dir: r[1].toUpperCase() as GRel["dir"],
          target: r[2],
          label: r[3]?.trim() || undefined,
          dashed: /style\s*=\s*(dashed|dotted)/i.test(opts),
          color: normColor(opts.match(/color\s*=\s*([#\w]+)/i)?.[1]),
        });
      }
      continue;
    }
  }
  return { nodes, clusterMeta };
}

export function parseGrarkdownToMesh(src: string): GeneratedMesh {
  const { nodes: gnodes, clusterMeta } = parseNodes(src);
  if (!gnodes.length) return { nodes: [], edges: [] };

  const COL_W = 300, COL_GAP = 90, NODE_GAP = 40, HEADER = 36, ATTR_H = 24, PAD = 14, SHAPE_H = 84, SG_HEADER = 32, SG_PAD = 22;
  const rows = (n: GNode) => n.attrs.length + n.funcs.length + (n.funcs.length ? 1 : 0);
  const hasBody = (n: GNode) => n.attrs.length > 0 || n.funcs.length > 0;
  const nodeH = (n: GNode) => (hasBody(n) ? HEADER + rows(n) * ATTR_H + PAD : SHAPE_H + (n.desc ? 24 : 0));
  const nodeW = (n: GNode) => (hasBody(n) ? COL_W : 220);
  const rgba = (hex: string, a: number) => {
    if (!hex.startsWith("#")) return hex; // named CSS color → opaque
    const h = hex.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return [r, g, b].some(Number.isNaN) ? hex : `rgba(${r},${g},${b},${a})`;
  };

  // ── Build the cluster tree (paths + prefixes) ──────────────────────────────
  const directChildren = new Map<string, string[]>();
  const leaves = new Map<string, GNode[]>();
  const allKeys = new Set<string>();
  const rootKeys: string[] = [];
  const ungrouped: GNode[] = [];
  gnodes.forEach((n) => {
    if (!n.clusterPath || !n.clusterPath.length) { ungrouped.push(n); return; }
    const path = n.clusterPath;
    for (let i = 0; i < path.length; i++) {
      const key = path.slice(0, i + 1).join(">");
      if (!allKeys.has(key)) {
        allKeys.add(key);
        if (i === 0) rootKeys.push(key);
        else {
          const pk = path.slice(0, i).join(">");
          (directChildren.get(pk) ?? directChildren.set(pk, []).get(pk)!).push(key);
        }
      }
    }
    const dk = path.join(">");
    (leaves.get(dk) ?? leaves.set(dk, []).get(dk)!).push(n);
  });

  // ── Bottom-up sizing ───────────────────────────────────────────────────────
  const sizeMemo = new Map<string, { w: number; h: number }>();
  const sizeOf = (key: string): { w: number; h: number } => {
    const memo = sizeMemo.get(key); if (memo) return memo;
    const items: Array<{ w: number; h: number }> = [];
    (leaves.get(key) ?? []).forEach((n) => items.push({ w: nodeW(n), h: nodeH(n) }));
    (directChildren.get(key) ?? []).forEach((ck) => items.push(sizeOf(ck)));
    const w = SG_PAD * 2 + (items.length ? Math.max(...items.map((i) => i.w)) : 140);
    const h = SG_HEADER + SG_PAD + (items.length ? items.reduce((s, i) => s + i.h, 0) + NODE_GAP * (items.length - 1) : 40);
    const sz = { w, h }; sizeMemo.set(key, sz); return sz;
  };

  // ── Emit ───────────────────────────────────────────────────────────────────
  const meshNodes: GeneratedMeshNode[] = [];
  const accent = (n: GNode) => n.color ?? "#38bdf8";

  const emitLeaf = (n: GNode, parentRef: string | undefined, x: number, y: number) => {
    const w = nodeW(n), h = nodeH(n), ac = accent(n);
    if (hasBody(n)) {
      meshNodes.push({ ref: n.id, kind: "board", label: n.label, x, y, w, h, parent: parentRef, stroke: ac, fill: rgba(ac, 0.05) });
      const attrMd = n.attrs.map((a) => `**${a.name}**${a.type ? ` *${a.type}*` : ""}${a.key ? `  \`${a.key}\`` : ""}`).join("\n\n");
      const funcMd = n.funcs.length ? `\n\n— *funcs* —\n\n${n.funcs.map((f) => `\`${f}\``).join("\n\n")}` : "";
      meshNodes.push({ ref: `${n.id}__attrs`, kind: "text", label: attrMd + funcMd, x: PAD, y: HEADER, w: w - PAD * 2, h: h - HEADER - PAD, parent: n.id });
    } else {
      meshNodes.push({ ref: n.id, kind: "shape", shape: "rounded-rect", label: n.desc ? `${n.label}\n*${n.desc}*` : n.label, x, y, w, h, parent: parentRef, stroke: ac, fill: rgba(ac, 0.12) });
    }
  };

  const placeCluster = (key: string, parentRef: string | undefined, x: number, y: number) => {
    const sz = sizeOf(key);
    const meta = clusterMeta.get(key);
    const stroke = meta?.stroke ?? "#a78bfa";
    const fill = meta?.fill ? rgba(meta.fill, 0.10) : rgba(stroke, 0.05);
    const boardRef = `__cl_${key}`;
    meshNodes.push({ ref: boardRef, kind: "board", label: key.split(">").pop() ?? key, x, y, w: sz.w, h: sz.h, parent: parentRef, stroke, fill });
    let cy = SG_HEADER + SG_PAD;
    (leaves.get(key) ?? []).forEach((n) => { emitLeaf(n, boardRef, SG_PAD, cy); cy += nodeH(n) + NODE_GAP; });
    (directChildren.get(key) ?? []).forEach((ck) => { placeCluster(ck, boardRef, SG_PAD, cy); cy += sizeOf(ck).h + NODE_GAP; });
  };

  // Top-level clusters laid in a row; ungrouped nodes stacked after them.
  let rx = 0;
  rootKeys.forEach((key) => { placeCluster(key, undefined, rx, 0); rx += sizeOf(key).w + COL_GAP; });
  let uy = 0;
  ungrouped.forEach((n) => { emitLeaf(n, undefined, rx, uy); uy += nodeH(n) + NODE_GAP; });

  // ── Edges ──────────────────────────────────────────────────────────────────
  const ids = new Set(gnodes.map((n) => n.id));
  const edges: GeneratedMesh["edges"] = [];
  gnodes.forEach((n) => {
    n.rels.forEach((r) => {
      if (!ids.has(r.target)) return;
      const mk = (from: string, to: string) => edges.push({ from, to, label: r.label, pattern: r.dashed ? "dashed" : undefined, color: r.color });
      if (r.dir === "FROM") mk(r.target, n.id);
      else if (r.dir === "BI") { mk(n.id, r.target); mk(r.target, n.id); }
      else mk(n.id, r.target);
    });
  });

  return { nodes: meshNodes, edges };
}
