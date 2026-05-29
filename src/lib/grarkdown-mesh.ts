// Grarkdown (github.com/ArubikU/Grarkdown) → mesh diagram.
// Nodes:   # {Label} [id]
// Options: ### OPT CLUSTER Path[>Sub] [..] | ### OPT COLOR HEX | ### OPT CLASS x | ### OPT DESC "..."
// Vars:    ## VAR  / - name: type (PK|FK)  / ## END VAR        → nested attribute brick
// Rels:    ## F_RELA / - TO|FROM|BI [id] {label} [style=,color=,arrowhead=] / ## END F_RELA
// Clusters become boards; nodes with VARs become entity boards holding an
// attribute text brick; relations become connections.

import type { GeneratedMesh, GeneratedMeshNode } from "@/lib/api/contracts";

type GAttr = { name: string; type: string; key?: string };
type GRel = { dir: "TO" | "FROM" | "BI"; target: string; label?: string; dashed?: boolean; color?: string };
type GNode = {
  id: string; label: string; cluster?: string; color?: string; desc?: string;
  attrs: GAttr[]; funcs: string[]; rels: GRel[];
};

export function isGrarkdown(src: string): boolean {
  return /^\s*#\s*\{[^}]+\}\s*\[[\w-]+\]/m.test(src) || /^\s*###\s+OPT\s+/m.test(src) || /^\s*##\s+F_RELA\b/m.test(src);
}

function parseNodes(src: string): GNode[] {
  const lines = src.split(/\r?\n/);
  const nodes: GNode[] = [];
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
      if (key === "CLUSTER") cur.cluster = (val.match(/^([^\[]+)/)?.[1] ?? "").trim().split(">")[0].trim() || undefined;
      else if (key === "COLOR") cur.color = val.startsWith("#") ? val : `#${val}`;
      else if (key === "DESC") cur.desc = val.replace(/^"|"$/g, "");
      continue;
    }

    if (mode === "var") {
      const a = t.match(/^-\s*([\w$]+)\s*:\s*([\w<>()]+)(?:\s*\(([^)]+)\))?/);
      if (a) cur.attrs.push({ name: a[1], type: a[2], key: a[3] });
      else { const raw = t.replace(/^-\s*/, "").trim(); if (raw) cur.attrs.push({ name: raw, type: "" }); }
      continue;
    }
    if (mode === "func") {
      const raw = t.replace(/^-\s*/, "").trim();
      if (raw) cur.funcs.push(raw);
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
          dashed: /style\s*=\s*dashed/i.test(opts),
          color: opts.match(/color\s*=\s*(#?[0-9a-fA-F]{3,8})/)?.[1]?.replace(/^(?!#)/, "#"),
        });
      }
      continue;
    }
  }
  return nodes;
}

export function parseGrarkdownToMesh(src: string): GeneratedMesh {
  const gnodes = parseNodes(src);
  if (!gnodes.length) return { nodes: [], edges: [] };

  const COL_W = 300, COL_GAP = 80, NODE_GAP = 50, HEADER = 36, ATTR_H = 24, PAD = 14, SHAPE_H = 84, SG_HEADER = 30, SG_PAD = 26;
  const rows = (n: GNode) => n.attrs.length + n.funcs.length + (n.funcs.length ? 1 : 0);
  const hasBody = (n: GNode) => n.attrs.length > 0 || n.funcs.length > 0;
  const nodeH = (n: GNode) => (hasBody(n) ? HEADER + rows(n) * ATTR_H + PAD : SHAPE_H + (n.desc ? 24 : 0));
  const nodeW = (n: GNode) => (hasBody(n) ? COL_W : 220);

  // Group by top-level cluster ("" = no cluster). Lay clusters in columns.
  const clusters = new Map<string, GNode[]>();
  gnodes.forEach((n) => { const k = n.cluster ?? ""; (clusters.get(k) ?? clusters.set(k, []).get(k)!).push(n); });

  const meshNodes: GeneratedMeshNode[] = [];
  const globalPos = new Map<string, { x: number; y: number; w: number; h: number }>();
  let colX = 0;

  const accent = (n: GNode) => n.color ?? "#38bdf8";
  const rgba = (hex: string, a: number) => {
    const h = hex.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return [r, g, b].some(Number.isNaN) ? hex : `rgba(${r},${g},${b},${a})`;
  };

  [...clusters.entries()].forEach(([cname, members]) => {
    const colW = Math.max(...members.map(nodeW));
    let y = cname ? SG_HEADER + SG_PAD : 0;
    members.forEach((n) => {
      const w = nodeW(n), h = nodeH(n);
      globalPos.set(n.id, { x: colX + (cname ? SG_PAD : 0), y, w, h });
      y += h + NODE_GAP;
    });
    if (cname) {
      // Cluster board enclosing its members.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      members.forEach((n) => { const p = globalPos.get(n.id)!; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h); });
      meshNodes.push({
        ref: `__cl_${cname}`, kind: "board", label: cname,
        x: minX - SG_PAD, y: minY - SG_HEADER, w: (maxX - minX) + SG_PAD * 2, h: (maxY - minY) + SG_HEADER + SG_PAD,
        stroke: "#a78bfa", fill: rgba("#a78bfa", 0.05),
      });
    }
    colX += colW + COL_GAP + (cname ? SG_PAD * 2 : 0);
  });

  // Emit nodes (after cluster boards so parent refs resolve on apply).
  gnodes.forEach((n) => {
    const p = globalPos.get(n.id)!;
    const clusterRef = n.cluster ? `__cl_${n.cluster}` : undefined;
    const board = clusterRef ? meshNodes.find((b) => b.ref === clusterRef) : undefined;
    const x = board ? p.x - board.x : p.x;
    const y = board ? p.y - board.y : p.y;
    const ac = accent(n);
    if (hasBody(n)) {
      meshNodes.push({ ref: n.id, kind: "board", label: n.label, x, y, w: p.w, h: p.h, parent: clusterRef, stroke: ac, fill: rgba(ac, 0.05) });
      const attrMd = n.attrs.map((a) => `**${a.name}**${a.type ? ` *${a.type}*` : ""}${a.key ? `  \`${a.key}\`` : ""}`).join("\n\n");
      const funcMd = n.funcs.length ? `\n\n— *funcs* —\n\n${n.funcs.map((f) => `\`${f}\``).join("\n\n")}` : "";
      meshNodes.push({ ref: `${n.id}__attrs`, kind: "text", label: attrMd + funcMd, x: PAD, y: HEADER, w: p.w - PAD * 2, h: p.h - HEADER - PAD, parent: n.id });
    } else {
      meshNodes.push({
        ref: n.id, kind: "shape", shape: "rounded-rect",
        label: n.desc ? `${n.label}\n*${n.desc}*` : n.label,
        x, y, w: p.w, h: p.h, parent: clusterRef, stroke: ac, fill: rgba(ac, 0.12),
      });
    }
  });

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
