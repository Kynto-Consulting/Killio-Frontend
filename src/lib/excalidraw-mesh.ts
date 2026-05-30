// Excalidraw scene → native mesh bricks (full-fidelity import).
//
// Shapes (rectangle/ellipse/diamond)  → draw bricks with shapePreset + style
// Text (standalone)                    → text bricks; bound text → host label
// Freedraw                             → draw bricks with manualStrokes (ink)
// Lines/arrows bound at both ends      → connections (with the bound text label)
// Lines/arrows otherwise               → ink polyline draw bricks
// Frames                               → boards; members nested via frameId
//
// Output is a MeshTemplate so the page can drop it through the same
// instantiateTemplate path as saved templates (ids remapped, recentred).

import type { MeshBrick, MeshConnection } from "@/lib/api/contracts";
import type { MeshTemplate } from "@/lib/mesh-templates";
import { decompressFromBase64 } from "@/lib/lz-string-decompress";

type ExBinding = { elementId?: string } | null;
type ExEl = {
  id: string;
  type: string;
  x: number; y: number; width: number; height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: { type: number } | null;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  frameId?: string | null;
  boundElements?: Array<{ id: string; type: string }> | null;
  startBinding?: ExBinding;
  endBinding?: ExBinding;
  points?: Array<[number, number]>;
};

const isColor = (c?: string) => typeof c === "string" && c !== "transparent" && c !== "";

function looksLikeScene(s: string): boolean {
  try { const j = JSON.parse(s); return !!j && (j.type === "excalidraw" || Array.isArray(j.elements)); } catch { return false; }
}

/** Resolve a scene JSON string from raw text: a plain `.excalidraw` JSON, or an
 *  Obsidian Excalidraw markdown file (a `## Drawing` block with a ```json``` or
 *  LZString-compressed ```compressed-json``` fence). Returns null if none found. */
export function excalidrawSceneFromText(text: string): string | null {
  const t = (text || "").replace(/^﻿/, "");
  const tryCompressed = (b64: string) => { const d = decompressFromBase64(b64.replace(/[\r\n]/g, "")); return d && looksLikeScene(d) ? d : null; };
  let m = t.match(/##?\s*Drawing\s*\n[^`]*```compressed-json\n([\s\S]*?)\n?```/);
  if (m) { const d = tryCompressed(m[1]); if (d) return d; }
  m = t.match(/##?\s*Drawing\s*\n[^`]*```json\n([\s\S]*?)\n?```/);
  if (m && looksLikeScene(m[1].trim())) return m[1].trim();
  m = t.match(/```compressed-json\n([\s\S]*?)\n?```/);
  if (m) { const d = tryCompressed(m[1]); if (d) return d; }
  m = t.match(/```json\n([\s\S]*?)\n?```/);
  if (m && looksLikeScene(m[1].trim())) return m[1].trim();
  if (looksLikeScene(t.trim())) return t.trim();
  return null;
}

function shapePreset(t: string): string | null {
  switch (t) {
    case "rectangle": return "rect";
    case "ellipse": return "ellipse";
    case "diamond": return "diamond";
    default: return null;
  }
}

type NormStroke = { points: { x: number; y: number }[]; color?: string; width?: number };

// Convert a linear element's relative points into manualStrokes normalized to a
// box of the given width/height (so the ink scales with the brick).
function pointsToStroke(pts: Array<[number, number]>, w: number, h: number, color?: string, width?: number): NormStroke {
  return {
    points: pts.map(([px, py]) => ({
      x: +(px / Math.max(w, 1)).toFixed(4),
      y: +(py / Math.max(h, 1)).toFixed(4),
    })),
    color: color ?? "#ffffff",
    width: width ?? 2,
  };
}

export function parseExcalidrawToTemplate(input: string | Record<string, unknown>): MeshTemplate {
  let scene: Record<string, unknown>;
  try { scene = typeof input === "string" ? JSON.parse(input) : input; }
  catch { return { id: "excalidraw", name: "Excalidraw", bricks: [], connections: [] }; }
  const all = Array.isArray(scene.elements) ? (scene.elements as ExEl[]) : [];
  const els = all.filter((e) => !e.isDeleted && e.type !== "selection");

  const byId = new Map<string, ExEl>();
  els.forEach((e) => { if (e.id) byId.set(e.id, e); });

  // Bound text → label of its container (shape or arrow).
  const labelOf = new Map<string, string>();
  els.forEach((e) => {
    if (e.type === "text" && e.containerId) {
      const txt = (typeof e.originalText === "string" ? e.originalText : e.text) || "";
      labelOf.set(e.containerId, labelOf.has(e.containerId) ? `${labelOf.get(e.containerId)}\n${txt}` : txt);
    }
  });
  const consumedText = new Set<string>();
  els.forEach((e) => { if (e.type === "text" && e.containerId) consumedText.add(e.id); });

  const bid = (id: string) => `ex-${id}`;
  const bricks: MeshBrick[] = [];
  const connections: MeshConnection[] = [];
  const brickIds = new Set<string>();
  const frameChildren = new Map<string, string[]>();

  const styleOf = (e: ExEl) => ({
    stroke: isColor(e.strokeColor) ? e.strokeColor : "#22d3ee",
    fill: isColor(e.backgroundColor) ? e.backgroundColor : "rgba(0,0,0,0)",
    strokeWidth: typeof e.strokeWidth === "number" ? e.strokeWidth : 2,
    ...(e.strokeStyle && e.strokeStyle !== "solid" ? { strokeStyle: e.strokeStyle } : {}),
    edges: e.roundness ? "round" : "sharp",
  });

  // Pass 1: frames first (so children can reference parentId).
  els.forEach((e) => {
    if (e.type !== "frame" && e.type !== "magicframe") return;
    const id = bid(e.id);
    bricks.push({
      id, kind: "board_empty", parentId: null,
      position: { x: e.x, y: e.y }, size: { w: Math.max(e.width, 80), h: Math.max(e.height, 60) },
      content: { isContainer: true, childOrder: [], label: typeof (e as { name?: string }).name === "string" ? (e as { name?: string }).name : "",
        style: { stroke: isColor(e.strokeColor) ? e.strokeColor : "#a78bfa", fill: isColor(e.backgroundColor) ? e.backgroundColor : "rgba(167,139,250,0.04)", strokeWidth: 2 } },
    });
    brickIds.add(id);
  });

  const parentOf = (e: ExEl): { pid: string | null; ox: number; oy: number } => {
    if (e.frameId && byId.has(e.frameId)) {
      const f = byId.get(e.frameId)!;
      return { pid: bid(e.frameId), ox: f.x, oy: f.y };
    }
    return { pid: null, ox: 0, oy: 0 };
  };

  // Pass 2: shapes, text, freedraw, unbound lines.
  els.forEach((e) => {
    if (e.type === "frame" || e.type === "magicframe") return;
    if (e.type === "text" && (e.containerId || consumedText.has(e.id))) return;
    const { pid, ox, oy } = parentOf(e);
    const pos = { x: Math.round(e.x - ox), y: Math.round(e.y - oy) };
    const id = bid(e.id);
    const preset = shapePreset(e.type);

    if (preset) {
      const label = labelOf.get(e.id) || "";
      bricks.push({
        id, kind: "draw", parentId: pid, position: pos,
        size: { w: Math.round(Math.max(e.width, 30)), h: Math.round(Math.max(e.height, 24)) },
        content: { shapePreset: preset, isContainer: false, childOrder: [], ...(label ? { markdown: label } : {}), style: styleOf(e) },
      });
      brickIds.add(id);
    } else if (e.type === "text") {
      bricks.push({
        id, kind: "text", parentId: pid, position: pos,
        size: { w: Math.round(Math.max(e.width, 80)), h: Math.round(Math.max(e.height, 24)) },
        content: { markdown: (typeof e.originalText === "string" ? e.originalText : e.text) || "" },
      });
      brickIds.add(id);
    } else if (e.type === "freedraw" && Array.isArray(e.points) && e.points.length > 1) {
      const w = Math.max(e.width, 1), h = Math.max(e.height, 1);
      bricks.push({
        id, kind: "draw", parentId: pid, position: pos, size: { w: Math.round(w), h: Math.round(h) },
        content: { isContainer: false, childOrder: [], manualStrokes: [pointsToStroke(e.points, w, h, isColor(e.strokeColor) ? e.strokeColor : "#ffffff", e.strokeWidth)] },
      });
      brickIds.add(id);
    } else if ((e.type === "arrow" || e.type === "line") && Array.isArray(e.points) && e.points.length > 1) {
      const bound = e.startBinding?.elementId && e.endBinding?.elementId;
      if (!bound) {
        // Unbound polyline → ink stroke.
        const w = Math.max(e.width, 1), h = Math.max(e.height, 1);
        bricks.push({
          id, kind: "draw", parentId: pid, position: pos, size: { w: Math.round(w), h: Math.round(h) },
          content: { isContainer: false, childOrder: [], manualStrokes: [pointsToStroke(e.points, w, h, isColor(e.strokeColor) ? e.strokeColor : "#ffffff", e.strokeWidth)] },
        });
        brickIds.add(id);
      }
    }
    if (pid) (frameChildren.get(pid) ?? frameChildren.set(pid, []).get(pid)!).push(id);
  });

  // Apply frame childOrder.
  frameChildren.forEach((kids, fid) => {
    const f = bricks.find((b) => b.id === fid);
    if (f) f.content = { ...(f.content as Record<string, unknown>), childOrder: kids };
  });

  // Pass 3: bound arrows → connections.
  els.forEach((e) => {
    if (e.type !== "arrow" && e.type !== "line") return;
    const from = e.startBinding?.elementId, to = e.endBinding?.elementId;
    if (!from || !to) return;
    const src = bid(from), tgt = bid(to);
    if (!brickIds.has(src) || !brickIds.has(tgt) || src === tgt) return;
    const label = labelOf.get(e.id) || "";
    const pattern = e.strokeStyle === "dashed" || e.strokeStyle === "dotted" ? e.strokeStyle : "solid";
    connections.push({
      id: `ex-c-${e.id}`,
      cons: [src, tgt],
      label: label ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: label }] }] } : { type: "doc", content: [] },
      style: { stroke: isColor(e.strokeColor) ? e.strokeColor : "#22d3ee", width: typeof e.strokeWidth === "number" ? e.strokeWidth : 2, pattern, connType: (e.points?.length ?? 0) > 2 ? "curved" : "technical" },
    });
  });

  return { id: "excalidraw", name: "Excalidraw import", bricks, connections };
}

// ── PNG-embedded scene extraction ──────────────────────────────────────────────
function readUint32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
async function inflate(data: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") return "";
  try {
    const ds = new DecompressionStream("deflate");
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  } catch { return ""; }
}

// Excalidraw PNG/SVG store the scene under MIME `application/vnd.excalidraw+json`
// as JSON `{ encoded|payload, compressed }`; older exports store raw scene JSON.
function decodeEmbedded(raw: string): string | null {
  try {
    const j = JSON.parse(raw);
    if (j && (j.type === "excalidraw" || Array.isArray(j.elements))) return raw; // already a scene
    return null;
  } catch { return null; }
}

/** Pull an embedded Excalidraw scene JSON out of a .excalidraw.png file. */
export async function extractExcalidrawSceneFromPng(bytes: Uint8Array): Promise<string | null> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (sig.some((s, i) => bytes[i] !== s)) return null;
  const latin = new TextDecoder("latin1");
  const utf8 = new TextDecoder("utf-8");
  let o = 8;
  const candidates: string[] = [];
  while (o + 8 <= bytes.length) {
    const len = readUint32(bytes, o);
    const type = latin.decode(bytes.subarray(o + 4, o + 8));
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === "tEXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) candidates.push(utf8.decode(data.subarray(nul + 1)));
    } else if (type === "zTXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) candidates.push(await inflate(data.subarray(nul + 2)));
    } else if (type === "iTXt") {
      const nul = data.indexOf(0);
      if (nul >= 0) {
        const compFlag = data[nul + 1];
        let p = nul + 3;
        p = data.indexOf(0, p) + 1; // after langTag
        p = data.indexOf(0, p) + 1; // after transKey
        const text = data.subarray(p);
        candidates.push(compFlag === 1 ? await inflate(text) : utf8.decode(text));
      }
    }
    if (type === "IEND") break;
    o += 12 + len;
  }
  for (const c of candidates) {
    if (!c) continue;
    // Direct scene JSON…
    const direct = decodeEmbedded(c);
    if (direct) return direct;
    // …or a wrapper { encoded, compressed }.
    try {
      const w = JSON.parse(c);
      if (w && typeof w.encoded === "string") {
        const bin = Uint8Array.from(atob(w.encoded), (ch) => ch.charCodeAt(0));
        const txt = w.compressed ? await inflate(bin) : utf8.decode(bin);
        const inner = decodeEmbedded(txt);
        if (inner) return inner;
      }
    } catch { /* not a wrapper */ }
  }
  return null;
}
