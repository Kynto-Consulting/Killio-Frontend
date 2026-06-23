// Pure graph builder: normalized entities → nodes + edges. Edges come from
// reference pills (@[type:id]), deep refs ($[id:..]), mesh portals/mirrors and
// mesh connections. Token-similarity edges are added separately (tokenize.ts).

import type { EntityInput, GraphData, GEdge, GNode } from "./types.ts";

const REF_RE = /@\[(doc|document|board|mesh|card):([^:\]]+)(?::[^\]]*)?\]/g;
const DEEP_RE = /\$\[(?:mesh:)?([^:\]]+):[^\]]+\]/g;
const MEDIA_KINDS = new Set(["media", "image", "video", "audio", "draw", "bookmark"]);

/** Pull "essential" text out of a brick content object (markdown/text/labels/
 *  cells). Recurses into chart metabricks (content.chart.spec → items, series,
 *  axes, curves, tasks, columns, sets, fields, components, …) so the /graph
 *  view indexes their searchable content the same as any other brick. */
export function essentialText(content: unknown, depth = 0): string {
  if (depth > 8 || content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => essentialText(c, depth + 1)).join(" ");
  if (typeof content === "object") {
    const o = content as Record<string, unknown>;
    const parts: string[] = [];
    // Generic string-valued keys.
    for (const key of ["markdown", "text", "title", "body", "label", "name", "summary", "caption", "previewMarkdown", "targetLabel", "sourceLabel"]) {
      if (typeof o[key] === "string") parts.push(o[key] as string);
    }
    // Generic array-valued keys that may carry user-visible text.
    for (const key of [
      "items", "rows", "xLabels", "axes", "cards", "tasks", "components",
      "columns", "sets", "fields", "curves", "series", "points", "links",
    ]) {
      if (Array.isArray(o[key])) parts.push(essentialText(o[key], depth + 1));
    }
    // beautiful_table rows carry a `cells` MAP (column id → cell) — recurse its
    // values so cell text + entity-ref labels are indexed too.
    if (o.cells && typeof o.cells === "object" && !Array.isArray(o.cells)) {
      parts.push(essentialText(Object.values(o.cells as Record<string, unknown>), depth + 1));
    }
    // Chart metabrick: content.chart = { type, spec }. Recurse into spec.
    if (o.chart && typeof o.chart === "object") {
      const ch = o.chart as Record<string, unknown>;
      if (typeof ch.type === "string") parts.push(ch.type);
      if (ch.spec) parts.push(essentialText(ch.spec, depth + 1));
    }
    // Legacy mermaid-source chart brick.
    if (typeof o.chartSource === "string") parts.push(o.chartSource);
    return parts.join(" ");
  }
  return "";
}

function hasMedia(kind: string, content: unknown): boolean {
  if (MEDIA_KINDS.has(kind.toLowerCase())) return true;
  const o = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  return typeof o.url === "string" && (o.url as string).length > 0;
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
/** First image-ish url/ref in a brick (for node thumbnails). */
function imageOf(kind: string, content: unknown): string | undefined {
  const o = (content && typeof content === "object" ? content : {}) as Record<string, unknown>;
  const url = typeof o.url === "string" ? (o.url as string) : "";
  const mime = typeof o.mimeType === "string" ? (o.mimeType as string) : "";
  const k = kind.toLowerCase();
  if (k === "image" || (k === "media" && (mime.startsWith("image/") || IMG_EXT.test(url) || url.startsWith("asset:")))) {
    if (url) return url;
  }
  // media meta caption may carry the first item url
  const caption = typeof o.caption === "string" ? (o.caption as string) : "";
  const m = caption.match(/"url"\s*:\s*"([^"]+)"/);
  if (m && (IMG_EXT.test(m[1]) || m[1].startsWith("asset:"))) return m[1];
  return undefined;
}

function firstImage(bricks: Array<{ kind: string; content: unknown }>): string | undefined {
  for (const b of bricks) { const img = imageOf(b.kind, b.content); if (img) return img; }
  return undefined;
}

/** Extract referenced entity ids from a text blob. */
function extractRefs(text: string): string[] {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(text)) !== null) ids.add(m[2]);
  DEEP_RE.lastIndex = 0;
  while ((m = DEEP_RE.exec(text)) !== null) ids.add(m[1]);
  return [...ids];
}

/** Pull STRUCTURED entity refs out of a brick content object — the ids that
 *  don't appear as @[]/$[] tokens. Covers beautiful_table relation cells
 *  (cells.<col>.documents|boards|cards[].id), popup/inline doc refs
 *  (inlineDocumentId), and portal/mirror targets (targetId/sourceId). */
function structuredRefIds(value: unknown, acc: Set<string>, depth = 0): void {
  if (depth > 9 || value == null) return;
  if (Array.isArray(value)) { for (const v of value) structuredRefIds(v, acc, depth + 1); return; }
  if (typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  for (const key of ["documents", "boards", "cards", "users"]) {
    const arr = o[key];
    if (Array.isArray(arr)) for (const it of arr) { const id = (it as { id?: unknown })?.id; if (typeof id === "string") acc.add(id); }
  }
  for (const key of ["inlineDocumentId", "targetId", "sourceId", "docId", "boardId", "cardId", "meshId"]) {
    if (typeof o[key] === "string") acc.add(o[key] as string);
  }
  for (const v of Object.values(o)) structuredRefIds(v, acc, depth + 1);
}

/** All refs in a brick: token-based (@[]/$[]) + structured (relation cells). */
function brickRefs(content: unknown): string[] {
  const ids = new Set<string>(extractRefs(essentialText(content)));
  structuredRefIds(content, ids);
  return [...ids];
}

export function buildGraph(entities: EntityInput[], opts: { includeMeshBricks?: boolean } = {}): GraphData {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const nodeIds = new Set<string>();
  const addNode = (n: GNode) => { if (!nodeIds.has(n.id)) { nodeIds.add(n.id); nodes.push(n); } };

  // 1) Entity (+ card / mesh-brick) nodes.
  for (const e of entities) {
    if (e.type === "document") {
      const text = e.bricks.map((b) => essentialText(b.content)).join(" \n");
      addNode({ id: e.id, type: "document", label: e.title || "Untitled", route: e.route, text, hasMedia: e.bricks.some((b) => hasMedia(b.kind, b.content)), image: firstImage(e.bricks) });
    } else if (e.type === "board") {
      addNode({ id: e.id, type: "board", label: e.title || "Board", route: e.route, text: e.title });
      for (const c of e.cards) {
        const text = [c.title, ...c.blocks.map((b) => essentialText(b.content))].join(" \n");
        addNode({ id: c.id, type: "card", label: c.title || "Card", route: e.route, parentId: e.id, text, hasMedia: c.blocks.some((b) => hasMedia(b.kind, b.content)), image: firstImage(c.blocks) });
        edges.push({ source: e.id, target: c.id, type: "connection", weight: 0.4 });
      }
    } else if (e.type === "mesh") {
      const text = e.bricks.map((b) => essentialText(b.content)).join(" \n");
      addNode({ id: e.id, type: "mesh", label: e.title || "Mesh", route: e.route, text, hasMedia: e.bricks.some((b) => hasMedia(b.kind, b.content)), image: firstImage(e.bricks.map((b) => ({ kind: b.kind, content: b.content }))) });
      if (opts.includeMeshBricks) {
        for (const b of e.bricks) {
          addNode({ id: `${e.id}::${b.id}`, type: "meshBrick", label: essentialText(b.content).slice(0, 40) || b.kind, parentId: e.id, route: e.route, text: essentialText(b.content), hasMedia: hasMedia(b.kind, b.content) });
        }
      }
    }
  }

  // 2) Reference / portal / mirror / connection edges (resolve ids to known nodes).
  for (const e of entities) {
    const from = e.id;
    if (e.type === "document") {
      for (const b of e.bricks) for (const ref of brickRefs(b.content)) if (nodeIds.has(ref) && ref !== from) edges.push({ source: from, target: ref, type: "ref", weight: 1 });
    } else if (e.type === "board") {
      for (const c of e.cards) {
        for (const b of c.blocks) for (const ref of brickRefs(b.content)) if (nodeIds.has(ref) && ref !== c.id) edges.push({ source: c.id, target: ref, type: "ref", weight: 1 });
      }
    } else if (e.type === "mesh") {
      for (const b of e.bricks) {
        const o = (b.content && typeof b.content === "object" ? b.content : {}) as Record<string, unknown>;
        // refs inside mesh brick text + structured relation refs
        for (const ref of brickRefs(b.content)) if (nodeIds.has(ref) && ref !== from) edges.push({ source: from, target: ref, type: "ref", weight: 1 });
        // portal / mirror targets
        const target = (typeof o.targetId === "string" && o.targetId) || (typeof o.sourceId === "string" && o.sourceId) || "";
        if (target && nodeIds.has(target) && target !== from) edges.push({ source: from, target, type: b.kind === "mirror" ? "mirror" : "portal", weight: 1 });
      }
      // intra-mesh connections (only when brick nodes are present)
      if (opts.includeMeshBricks) {
        for (const c of e.connections) {
          const s = `${e.id}::${c.source}`; const t = `${e.id}::${c.target}`;
          if (nodeIds.has(s) && nodeIds.has(t)) edges.push({ source: s, target: t, type: "connection", weight: 0.6 });
        }
      }
    }
  }

  return { nodes, edges };
}
