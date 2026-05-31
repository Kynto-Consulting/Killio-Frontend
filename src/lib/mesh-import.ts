// Shared mesh import: turn Mermaid / erDiagram / Grarkdown text or an Excalidraw
// scene into a MeshTemplate, and a MeshTemplate into a full MeshState. Used by
// the mesh list "Import" action (and mirrors the editor's in-canvas import).

import type { GeneratedMesh, MeshBrick, MeshConnection, MeshState } from "@/lib/api/contracts";
import type { MeshTemplate } from "@/lib/mesh-templates";
import { parseMermaidToMesh } from "@/lib/mermaid-mesh";
import { parseGrarkdownToMesh, isGrarkdown } from "@/lib/grarkdown-mesh";
import { parseExcalidrawToTemplate, extractExcalidrawSceneFromPng, excalidrawSceneFromText } from "@/lib/excalidraw-mesh";
import { parseMermaidToChartSpec } from "@/lib/mermaid-to-chart";

type ShapePreset = string;
let _seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(_seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const asRec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

// Build a MeshBrick directly (no editor dependency).
function mkBrick(kind: MeshBrick["kind"], pos: { x: number; y: number }, content: Record<string, unknown>, parentId: string | null): MeshBrick {
  return { id: newId("brick"), kind, parentId, position: pos, size: { w: 180, h: 120 }, content };
}

/** GeneratedMesh (nodes+edges) → MeshTemplate (bricks+connections). Mirrors the
 *  editor: parent nesting, colors, title/description split, [color] tint, and
 *  clean-reverse-pair → bidirectional connection collapse. */
export function generatedMeshToTemplate(mesh: GeneratedMesh): MeshTemplate {
  const byId: Record<string, MeshBrick> = {};
  const order: string[] = [];
  const refToId: Record<string, string> = {};
  const pushChild = (parentId: string, childId: string) => {
    const pc = asRec(byId[parentId].content);
    const co = Array.isArray(pc.childOrder) ? (pc.childOrder as string[]) : [];
    byId[parentId] = { ...byId[parentId], content: { ...pc, isContainer: true, childOrder: [...co, childId] } };
  };

  mesh.nodes.forEach((n) => {
    const parentId = n.parent ? (refToId[n.parent] ?? null) : null;
    const pos = { x: Math.round(n.x), y: Math.round(n.y) };
    const tint = (s: string) => (s && n.textColor ? `[color:${n.textColor}]${s}[/color]` : s);
    const nlIdx = n.label ? n.label.indexOf("\n") : -1;
    const title = n.label ? (nlIdx >= 0 ? n.label.slice(0, nlIdx) : n.label).trim() : "";
    const descBody = n.label && nlIdx >= 0
      ? n.label.slice(nlIdx + 1).split("\n").map((s) => s.trim()).filter(Boolean).join("\n\n")
      : "";

    let nb: MeshBrick;
    if (n.kind === "board") {
      nb = mkBrick("board_empty", pos, { isContainer: true, childOrder: [], ...(title ? { label: title } : {}) }, parentId);
    } else if (n.kind === "text") {
      nb = mkBrick("text", pos, { markdown: tint(n.label || "") }, parentId);
    } else if (Array.isArray(n.vectorPoints) && n.vectorPoints.length >= 3) {
      // Arbitrary filled polygon (chart slice, radar polygon, …). A non-special
      // preset makes ShapeSvg fall through to its generic <polygon> branch.
      const content: Record<string, unknown> = { shapePreset: "polygon", vectorPoints: n.vectorPoints, isContainer: false, childOrder: [] };
      if (title) content.markdown = tint(title);
      nb = mkBrick("draw", pos, content, parentId);
    } else {
      const preset = (n.shape ?? "rect") as ShapePreset;
      const content: Record<string, unknown> = { shapePreset: preset, isContainer: false, childOrder: [] };
      if (title) { if (descBody) { content.label = title; content.isContainer = true; } else { content.markdown = tint(title); } }
      nb = mkBrick("draw", pos, content, parentId);
    }
    if (n.stroke || n.fill) {
      const style = { ...asRec(nb.content?.style) };
      if (n.stroke) style.stroke = n.stroke;
      if (n.fill) style.fill = n.fill;
      nb = { ...nb, content: { ...asRec(nb.content), style } };
    }
    nb = { ...nb, size: { w: Math.round(n.w), h: Math.round(n.h) } };
    byId[nb.id] = nb; order.push(nb.id);
    if (parentId && byId[parentId]) pushChild(parentId, nb.id);
    refToId[n.ref] = nb.id;

    if (n.kind === "shape" && descBody) {
      const tb = mkBrick("text", { x: 12, y: 38 }, { markdown: tint(descBody) }, nb.id);
      const sized = { ...tb, size: { w: Math.max(60, nb.size.w - 24), h: Math.max(28, nb.size.h - 52) } };
      byId[sized.id] = sized; order.push(sized.id);
      pushChild(nb.id, sized.id);
    }
  });

  const connections: MeshConnection[] = [];
  const mkDocLabel = (txt?: string) => txt
    ? { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: txt }] }] }
    : { type: "doc" as const, content: [] };
  const resolved = mesh.edges
    .map((e) => ({ e, src: refToId[e.from], tgt: refToId[e.to] }))
    .filter((r) => r.src && r.tgt && r.src !== r.tgt);
  const groups = new Map<string, typeof resolved>();
  resolved.forEach((r) => { const key = [r.src, r.tgt].sort().join("|"); (groups.get(key) ?? groups.set(key, []).get(key)!).push(r); });
  const mkConn = (src: string, tgt: string, e: typeof resolved[number]["e"], bidir: boolean, labelTxt?: string) => {
    const style: Record<string, unknown> = { stroke: e.color ?? "#22d3ee", width: e.width ?? 2, pattern: e.pattern ?? "solid", connType: e.connType ?? "technical" };
    if (bidir) style.bidir = true;
    connections.push({ id: newId("conn"), cons: [src, tgt], label: mkDocLabel(labelTxt ?? e.label), style });
  };
  groups.forEach((grp) => {
    const isCleanReversePair = grp.length === 2 && grp[0].src === grp[1].tgt && grp[0].tgt === grp[1].src;
    if (isCleanReversePair) {
      const merged = [grp[0].e.label, grp[1].e.label].filter(Boolean).join("  |  ");
      mkConn(grp[0].src, grp[0].tgt, grp[0].e, true, merged || undefined);
    } else grp.forEach((r) => mkConn(r.src, r.tgt, r.e, false));
  });

  return { id: "generated", name: "Imported", bricks: order.map((id) => byId[id]), connections };
}

/** MeshTemplate → a full MeshState ready to serialize to .km / persist. */
export function templateToMeshState(tpl: MeshTemplate): MeshState {
  const bricksById: Record<string, MeshBrick> = {};
  const rootOrder: string[] = [];
  tpl.bricks.forEach((b) => { bricksById[b.id] = b; if (!b.parentId) rootOrder.push(b.id); });
  const connectionsById: Record<string, MeshConnection> = {};
  tpl.connections.forEach((c) => { connectionsById[c.id] = c; });
  return { version: "1.0.0", viewport: { x: 0, y: 0, zoom: 1 }, rootOrder, bricksById, connectionsById };
}

/** Wrap a typed ChartSpec as a MeshTemplate with a single draw brick whose
 *  content carries the spec object — the editor renders it via ChartBrickRender
 *  and edits it via ChartBrickEditor. */
export function chartSpecToTemplate(chart: import("@/components/ui/chart-brick").ChartSpec): MeshTemplate {
  const brick: MeshBrick = { id: newId("brick"), kind: "draw", parentId: null, position: { x: 0, y: 0 }, size: { w: 360, h: 300 }, content: { chart } };
  return { id: "chart", name: "Chart", bricks: [brick], connections: [] };
}

/** Auto-detect format and produce a MeshTemplate. Pass file bytes for a
 *  .excalidraw.png (embedded scene). Returns null when nothing parseable. */
export async function importToMeshTemplate(opts: { text?: string; fileName?: string; fileBytes?: Uint8Array }): Promise<MeshTemplate | null> {
  if (opts.fileBytes && opts.fileBytes.length) {
    const scene = await extractExcalidrawSceneFromPng(opts.fileBytes);
    if (scene) { const t = parseExcalidrawToTemplate(scene); return t.bricks.length ? t : null; }
  }
  const src = (opts.text ?? "").replace(/^﻿/, "");
  // Excalidraw: plain JSON OR an Obsidian markdown drawing (json/compressed-json).
  const scene = excalidrawSceneFromText(src);
  if (scene) { const t = parseExcalidrawToTemplate(scene); if (t.bricks.length) return t; }
  // Mermaid chart types → single chart metabrick (typed spec, editable as JSON).
  if (src.trim() && !isGrarkdown(src)) {
    const chart = parseMermaidToChartSpec(src);
    if (chart) return chartSpecToTemplate(chart);
  }
  let tpl: MeshTemplate | null = null;
  if (isGrarkdown(src)) tpl = generatedMeshToTemplate(parseGrarkdownToMesh(src));
  else if (src.trim()) tpl = generatedMeshToTemplate(parseMermaidToMesh(src));
  return tpl && tpl.bricks.length ? tpl : null;
}
