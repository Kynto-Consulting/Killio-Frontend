// `.killio/` — a metadata + docs folder written into every local workspace.
// It caches workspace identity, ships an adapted SKILL.md + kml.md so other AI
// models can understand the on-disk format, and emits graph.kml: a textual,
// model-readable snapshot of the workspace knowledge graph.

import type { WorkspaceFileEntry } from "./fs-access";
import { writeWorkspaceFile, readWorkspaceFileWithMeta } from "./fs-access";
import { collectLocalEntities } from "@/lib/graph/collect-entities";
import { buildGraph } from "@/lib/graph/build-graph";
import type { GraphData } from "@/lib/graph/types";

type DirHandle = FileSystemDirectoryHandle;

export const DOT_KILLIO = ".killio";
export const DOT_KILLIO_VERSION = "2026-v1";

export type DotKillioMeta = {
  name: string;
  creatorId: string;
  creatorAlias?: string;
  createdAt: string;     // ISO — preserved across regenerations
  updatedAt: string;     // ISO — bumped each write
  version: string;       // .killio schema version
  counts: { documents: number; boards: number; meshes: number; folders: number };
};

// ── Generators ─────────────────────────────────────────────────────────────────
function skillMd(meta: DotKillioMeta): string {
  return `# Killio workspace — agent skill

This folder is a **local Killio workspace**: a plain-folder knowledge base of
documents, boards, and mesh boards stored as human-readable text files. Use this
guide to read and edit it like a Killio agent would.

- **Workspace:** ${meta.name}
- **Created:** ${meta.createdAt}
- **Contents:** ${meta.counts.documents} documents · ${meta.counts.boards} boards · ${meta.counts.meshes} meshes · ${meta.counts.folders} folders

## File kinds
| Extension | Kind | Holds |
|-----------|------|-------|
| \`.kd\` | Document | ordered list of **bricks** (text/heading/list/table/media/code/…) |
| \`.kb\` | Board | columns + cards; each card has bricks |
| \`.km\` | Mesh board | free-canvas **bricks** + **connections** (the fractal/visual model) |
| \`.ks\` | Script | node-graph automation |
| \`.kf\` | Folder marker | display name + color + icon for a disk subfolder |
| \`.killio/\` | This folder | workspace metadata, docs, and \`graph.kml\` |

## How to work here
1. Every entity file is **KAML** (see \`kml.md\` for byte-level grammar) with a \`#killio <kind> <version>\` header.
2. **Bricks** are the universal content unit: \`{ id, kind, content{…} }\`. Mesh bricks also carry \`position{x,y}\`, \`size{w,h}\`, and may be containers (\`isContainer\`, \`childOrder\`).
3. Read **\`graph.kml\`** to understand cross-file relationships (refs, portals, mirrors, mesh connections) without parsing everything.
4. Preserve the \`#killio\` header + KAML shape. Don't rename ids. The authoritative kind is the **brick-level \`kind\`** (a redundant \`content.kind\` may also appear — keep them in sync).

## Document bricks (\`.kd\` + card blocks in \`.kb\`)
The brick-level \`kind\` is authoritative (a redundant \`content.kind\` may mirror it — keep in sync). Every brick is \`{ id, kind, position, content }\`. \`content\` fields per \`kind\`:

### Text & structure
- **text** — \`markdown: string\` (rich-text tokens below). \`displayStyle: paragraph | h1 | h2 | h3 | checklist | quote | code | callout\` (default \`paragraph\`) decides how the SAME markdown renders. Optional \`formField\` makes it a form input when nested in a **form**: \`{ fieldId, type: text|textarea|number|email|select|checkbox|date, label, required:boolean, placeholder?, options?:[{label,value}], condition?:{enabled, sourceFieldId, operator, value} }\`.
- **quote** — \`markdown: string\`, optional \`author: string\`. Stylized blockquote.
- **callout** — \`markdown: string\`, \`icon: string\` (emoji or Lucide icon name). Highlighted box.
- **divider** — no fields. Horizontal rule.

### Data
- **table** — simple grid. \`rows: string[][]\` (row 0 = header), optional \`title: string\`.
- **beautiful_table** — database-grade (a.k.a. Bountiful Table). \`title?\`, \`columns: [{ id, name, type: text|number|select|multi_select|date|checkbox|user|doc|board|card|phone|formula }]\`, \`rows: [{ id, cells: { <columnId>: value }, meta?: { _lastEditedAt, _lastEditedBy } }]\`. May also carry \`views: [{ id, type: table|board|gallery|calendar|list, … }]\`.
- **graph** — \`type: line|bar|pie|area|scatter\`, \`title?\`, \`data: [{ <key>: value }]\` (e.g. \`[{ name:"Jan", value:100 }]\`), \`config: { xKey: string, yKeys: string[], colors?: string[] }\`.

### Containers — children live in \`childrenByContainer: { <slotId>: [brickId,…] }\`, NOT inline
- **accordion** — \`title: string\` (header), \`isExpanded: boolean\`, slot \`body\`. (Legacy \`body: string\` markdown still read; prefer nesting.)
- **tabs** — \`tabs: [{ id, label }]\`; one child slot **per tab id**.
- **columns** — multi-column layout. \`columns: [{ id }]\`; one child slot **per column id**. (This is the multi-column brick — each column holds its own bricks.)
- **form** — intake form. \`title, description, submitLabel, webhookUrl\`, \`pages: [{ id, label }]\`; one child slot **per page id**, holding **text** bricks that carry a \`formField\` (above).

### Media — shared family: \`url, title?, caption?, mimeType?, sizeBytes?, mediaType\`
\`mediaType\`/extension picks the renderer. Local assets: \`url = "asset:<name>"\` (bytes next to the file). Cloud: \`url = "/uploads/…"\` or an absolute URL.
- **image** — png/jpg/gif/webp/svg. **video** — mp4/webm/mov. **audio** — mp3/wav/ogg.
- **file** — any other download (pdf, docx, …); download chip.
- **bookmark** — \`url\` is an external web link; renders a link card (\`mimeType:"text/html"\`).
- **model3d** — **3D model**. \`url\` ends in \`.glb\`/\`.gltf\` (or \`mimeType:"model/gltf-binary"\`). Prefer **\`.glb\`** (one file = geometry + textures + materials). Interactive orbit/zoom/auto-rotate via \`<model-viewer>\`. The \`caption\` may pack layout/border/shadow as \`__media_meta_v1__:{…}\` — keep intact.
- **widget** — runnable **code widget** (\`kind:"widget"\`/\`mediaType:"widget"\`). Fields: \`code: string\` (source), \`widgetLang: html|js|ts|jsx|tsx\`, \`widgetArgs: object\` (JSON-serializable, passed to the fn). Contract: \`html\`→verbatim; \`js\`/\`ts\`→\`export default (args)=>htmlString\`; \`tsx\`/\`jsx\`→\`export default (args)=>ReactElement\`. Source may instead come from an uploaded \`.html/.js/.ts/.tsx\` asset via \`url\`. Runs in a **sandboxed iframe** (no app/session access). Persisted locally via KAML (newlines escaped) → works offline for HTML; TS/TSX need a connection to load the compiler.

### Specialized (mostly online; may render as a placeholder offline)
- **payment** — \`amount, currency, provider, status\`.
- **popup_document** — \`targetDocId, label\` (opens a doc in a modal).
- **ai** — saved AI block: \`prompt, output, model\`.
- **database** — embedded queryable collection: \`source, columns, filters, sort\`.

> Container bricks (accordion/tabs/columns/form) NEVER inline their children — the child bricks are normal top-level bricks referenced by id inside \`childrenByContainer\`. Editing one means editing the referenced brick + the slot's id array.

## Mesh bricks (\`.km\`) — kind → content
- **board_empty / frame** — \`{ isContainer:true, childOrder:[ids], label?, style? }\` (a container board).
- **text** — \`{ markdown }\`.   **decision** — \`{ markdown }\` (legacy diamond).
- **draw** — a **shape**: \`{ shapePreset, isContainer, childOrder, vectorPoints?, style }\`; or **ink**: \`{ manualStrokes:[{points:[{x,y}],color,width}] }\` (points are 0..1 normalized to the brick).
- **portal** — link: \`{ targetType: mesh|board|doc, targetId, targetLabel }\`; **meta**: \`{ unifierKind, markdown }\`.
- **mirror** — \`{ sourceId, sourceLabel, previewMarkdown }\`; **meta**: \`{ unifierKind, markdown }\`.
- **script** — embeds a \`.ks\` flow.

### Meta-bricks
A **meta-brick** is a \`portal\`/\`mirror\` whose \`content.unifierKind\` renders a *document* brick inline on the canvas. unifierKinds: portal → \`text, graph, media, image, table, checklist, quote, callout, divider\`; mirror → \`accordion, tabs, columns, callout\`.

### shape \`style\`
\`{ stroke, fill, strokeWidth, strokeStyle: solid|dashed|dotted, edges: round|sharp, opacity }\`. Text color via the \`[color:#hex]…[/color]\` token in \`markdown\`, not style.

### Connections (\`.km\`)
\`{ id, cons:[srcBrickId,tgtBrickId], label:{type:"doc",content}, style }\`; \`style: { stroke, width, pattern: solid|dashed, connType: technical|handdrawn|bezier|curved, bidir?, srcPort?, tgtPort?, cp1?, cp2? }\`.

## Boards (\`.kb\`) & Scripts (\`.ks\`)
- **Board**: \`{ id, name, boardType, lists:[{id,name,cards:[{id,title,status,position,tags,blocks[]}]}] }\` — \`blocks\` are document bricks (same set above).
- **Script**: \`{ id, name, triggerType, nodes:[{id,nodeKind,label,config,positionX,positionY}], edges:[{id,sourceNodeId,targetNodeId,sourceHandle,targetHandle}] }\` — \`nodeKind\` examples: \`core.trigger.manual\`, \`core.condition.regex_match\`, \`core.transform.template\`, \`core.logic.if_else\`, \`killio.action.create_card\`, \`killio.action.add_brick\`, \`core.action.http_request\`, \`core.action.js_code\`.

## Rich-text tokens (inside any brick \`markdown\`)
**Formatting:** \`**bold**\`, \`*italic*\`, \`__underline__\`, \`~~strike~~\`, \`\`inline code\`\`, \`[link:url]label[/link]\` (also plain \`[label](url)\`).
**Styling:** \`[color:#hex|name]text[/color]\`, \`[bg:#hex|name]text[/bg]\`, \`[size:1.2rem]text[/size]\`.
**Blocks:** fenced \`\`\`lang … \`\`\` code, \`![alt](url)\` image, LaTeX \`$inline$\` and \`$$block$$\`.

### Live diagram / chart fences (inside any text \`markdown\`)
Certain fenced-code languages are NOT shown as code — they render as a **live diagram or chart** using Killio's own renderers. Write them as a normal fenced block in a text brick:
- \`\`\`\`mermaid\`\`\` (or \`mmd\`) — Mermaid. Flow/sequence/class/state diagrams render as a mini **mesh**; chart-type Mermaid (\`pie\`, \`bar\`, \`radar\`, …) renders as a native **chart** (SVG).
- \`\`\`\`grarkdown\`\`\` (or \`grark\`) — **Grarkdown**, Killio's terse graph-markup → rendered as a mesh diagram.
- \`\`\`\`erDiagram\`\`\` (or \`erd\`/\`er\`) — entity-relationship diagram → mesh.
Any other \`lang\` stays a normal syntax-highlighted code block. Unparseable diagram source falls back to plain code, so it's safe to use.

### Reference pills — \`@[<kind>:<id>:<label>]\`
Inline **@-mention** tokens that render as clickable pills. Keep them intact byte-for-byte; never rewrite the id.
- \`@[doc:<id>:<Title>]\` document · \`@[board:<id>:<Name>]\` board · \`@[mesh:<id>:<Name>]\` mesh · \`@[card:<id>:<Title>]\` card · \`@[user:<id>:<Name>]\` person.
- **In a LOCAL workspace the \`<id>\` is the entity's relative file path** (e.g. \`@[doc:notes/plan.kd:Plan]\`), not a uuid — that is how offline refs resolve to \`/d|/b|/m/<path>\`. \`<label>\` is display-only.

### Deep data tokens — pull LIVE values from another brick
- \`$[<path>]\` — resolves to the actual **value** (inlined as text).
- \`#[<path>]\` — a visual **pill** that previews that property.
- **Path:** \`[entityType:scopeId:]brickId:selector[:args]\`
  - \`entityType\`: \`doc|board|card|mesh\` (omit if same document). \`scopeId\`: the doc/board/card id (required when entityType present; in local workspaces = relative path).
  - \`brickId\`: the target brick id, OR an alias \`brick1\`,\`brick2\`,… (Nth brick in scope).
  - \`selector\`: \`text | title | body | cell | row | col | range | kind | json | raw\`. \`args\`: \`cell\`→\`A1\`, \`row\`→\`1\`, \`col\`→\`A\`, \`range\`→\`A1:B10\`.
  - Examples: \`$[doc:plan.kd:brick1:title]\`, \`#[brick2:cell:B2]\`.

See \`kml.md\` for the exact KAML grammar, every \`ShapePreset\`, and per-format examples.
`;
}

function kmlMd(): string {
  return `# KML / KAML — the Killio file format

A Killio file is UTF-8 text:

\`\`\`
#killio <kind> <schemaVersion>
<KAML payload>
\`\`\`

\`kind\` ∈ \`kd | km | kb | ks | kf\`. The first line is the header; everything after
is the payload encoded as **KAML**.

## KAML (Killio-AML)
A line-oriented key/value format:

\`\`\`
id = "doc-1"
title = "My doc"
viewport = (x = 0, y = 0, zoom = 1)
rootOrder = ["b1", "b2"]

[[bricks]]
id = "b1"
kind = "text"
content = (markdown = "Hello **world**")

[[bricks]]
id = "b2"
kind = "draw"
position = (x = 120, y = 40)
size = (w = 180, h = 90)
content = (shapePreset = "ellipse", style = (stroke = "#22d3ee", fill = "rgba(34,211,238,0.1)"))
\`\`\`

Value types: strings \`"..."\`, numbers, \`true/false\`, \`null\`, lists \`[a, b]\`,
records \`(key = value, ...)\`. \`[[section]]\` starts a repeated record (array of
objects). Comments start with \`#\`.

KAML is **not YAML** — there is no significant indentation. \`#\` lines are comments.
\`null\` or \`~\` = null. Strings are bare when they match \`[A-Za-z_][\\w.\\-/]*\` and
aren't numeric/reserved, else quoted (escapes \`\\n \\t \\r \\" \\\\\`).

schemaVersion for every kind is currently **\`2026-v1\`**.

## Payload shapes (per kind)

### km — mesh
\`{ id, schemaVersion, title, viewport=(x,y,zoom), bricks[], connections[], rootOrder[], exportedAt }\`
- brick: \`{ id, kind, parentId, position=(x,y), size=(w,h), rotation?, content=(…) }\`
- kinds: \`board_empty | text | frame | script | mirror | portal | decision | draw\`
- draw shape: \`content=(shapePreset, isContainer, childOrder=[], vectorPoints?, style=(stroke,fill,strokeWidth,strokeStyle,edges,opacity))\`
- draw ink: \`content=(manualStrokes=[(points=[(x,y),…], color, width)])\`  (x,y normalized 0..1)
- portal: \`content=(targetType, targetId, targetLabel)\` or meta \`(unifierKind, markdown)\`
- mirror: \`content=(sourceId, sourceLabel, previewMarkdown)\` or meta \`(unifierKind, markdown)\`
- connection: \`{ id, cons=[srcId,tgtId], label=(type="doc", content=[]), style=(stroke,width,pattern,connType,bidir?,srcPort?,tgtPort?,cp1?,cp2?) }\`

\`ShapePreset\` (for draw shapes): rect, rounded-rect, circle, ellipse, diamond,
triangle, hexagon, star, arrow, note, frame-vector, flow-terminator, parallelogram,
cylinder, cross, chevron, pentagon, trapezoid, trapezoid-inv, octagon, stadium,
half-circle, bevel, triangle-rt, diamond-wide, kite, wedge, hexagon-v,
parallelogram-rev, prep-hex, data-io, off-page, collate, predefined-process,
manual-input, delay-shape, arrow-left, arrow-up, arrow-down, double-arrow-h,
double-arrow-v, heart, shield, lightning, house, cloud, star-6, star-4, star-8,
starburst, cross-x, tag, ribbon, callout, banner, gem, location-pin,
thought-bubble, bracket-left, bracket-right.

### kd — document
\`{ id, title, bricks[] }\`  (schemaVersion in header only). brick: \`{ id, kind, position, content=(…) }\`. See SKILL.md for the content fields per kind (text/checklist/table/media/…).

### kb — board
\`{ id, name, description, boardType, backgroundKind, lists=[(id, name, cards=[(id, title, summary, status, position, urgency, tags=[(name,color,tag_kind)], blocks=[…])])] }\`. \`blocks\` are document bricks.

### ks — script
\`{ id, name, description, triggerType, triggerConfig=(), nodes=[(id, nodeKind, label, config=(), positionX, positionY)], edges=[(id, sourceNodeId, targetNodeId, sourceHandle, targetHandle)] }\`.

### kf — folder marker
\`{ name, color, icon }\`  (icon = a lucide icon name; the disk subdirectory IS the folder).

## Examples
\`\`\`
#killio km 2026-v1
id = "m1"
title = "Flow"
viewport = (x = 0, y = 0, zoom = 1)
rootOrder = ["b1", "b2"]

[[bricks]]
id = b1
kind = draw
parentId = null
position = (x = 80, y = 40)
size = (w = 160, h = 70)
content = (shapePreset = ellipse, isContainer = false, childOrder = [], style = (stroke = "#22d3ee", fill = "rgba(34,211,238,0.1)", strokeWidth = 2))

[[bricks]]
id = b2
kind = text
parentId = null
position = (x = 80, y = 200)
size = (w = 200, h = 90)
content = (markdown = "Step **two**")

[[connections]]
id = c1
cons = ["b1", "b2"]
label = (type = "doc", content = [])
style = (stroke = "#22d3ee", width = 2, pattern = solid, connType = technical)
\`\`\`

\`\`\`
#killio kd 2026-v1
id = "d1"
title = "Notes"

[[bricks]]
id = t1
kind = text
position = 0
content = (displayStyle = heading, markdown = "# Title")
\`\`\`
`;
}

function graphKml(graph: GraphData, meta: DotKillioMeta): string {
  const esc = (s: string) => (s || "").replace(/"/g, "'").replace(/\n/g, " ").slice(0, 200);
  const lines: string[] = [];
  lines.push(`#killio graph ${DOT_KILLIO_VERSION}`);
  lines.push(`# Workspace knowledge graph — ${meta.name}`);
  lines.push(`generated = "${meta.updatedAt}"`);
  lines.push(`nodes = ${graph.nodes.length}`);
  lines.push(`edges = ${graph.edges.length}`);
  lines.push("");
  lines.push("## Nodes  (type  id  \"label\"  route)");
  for (const n of graph.nodes) {
    lines.push(`- ${n.type}  ${n.id}  "${esc(n.label)}"${n.route ? `  ${n.route}` : ""}`);
  }
  lines.push("");
  lines.push("## Edges  (source -> target  (type)  \"label\")");
  for (const e of graph.edges) {
    const lbl = (e as { label?: string }).label;
    lines.push(`- ${e.source} -> ${e.target}  (${e.type})${lbl ? `  "${esc(lbl)}"` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ── Agent config (Claude / Cursor / Copilot / Windsurf / generic) ──────────────
// Short pointer files every popular coding agent auto-reads, steering them to the
// authoritative .killio docs. Seeded only when absent so user edits are kept.
function agentInstructions(meta: DotKillioMeta): string {
  return `# Killio workspace — agent instructions

This folder is a **local Killio knowledge base** (\`${meta.name}\`): plain-text files —
\`.kd\` documents, \`.km\` mesh boards, \`.kb\` boards, \`.ks\` scripts — plus assets.

**Before editing any \`.kd\`/\`.km\`/\`.kb\`/\`.ks\` file, read these first:**
- \`.killio/SKILL.md\` — brick + meta-brick catalog and how to edit each format
- \`.killio/kml.md\` — exact KAML grammar + per-format payload schemas + examples
- \`.killio/graph.kml\` — the cross-file relationship graph (refs, portals, mirrors, connections)

**Rules**
1. Each file is **KAML** with a \`#killio <kind> <schemaVersion>\` header line.
2. Content is made of **bricks**: \`{ id, kind, content }\`. Mesh bricks add \`position\`, \`size\`, and may be containers (\`childOrder\`).
3. Preserve the header, ids, and KAML shape. Never rename ids.
4. Rich text uses inline tokens: \`**bold**\`, \`*italic*\`, \`__underline__\`, \`[color:#hex]…[/color]\`.
5. Don't touch \`.killio/\` by hand — it is regenerated by Killio.
`;
}

const CURSOR_MDC = (meta: DotKillioMeta): string =>
  `---\ndescription: Killio local workspace conventions (read .killio/ docs before editing .kd/.km/.kb/.ks)\nglobs: ["**/*.kd","**/*.km","**/*.kb","**/*.ks"]\nalwaysApply: true\n---\n${agentInstructions(meta)}`;

// ── Writer ───────────────────────────────────────────────────────────────────
async function readJson<T>(dir: DirHandle, path: string): Promise<T | null> {
  const meta = await readWorkspaceFileWithMeta(dir, path);
  if (!meta) return null;
  try { return JSON.parse(meta.text) as T; } catch { return null; }
}

/**
 * Create/refresh the `.killio/` folder: meta.json, SKILL.md, kml.md, graph.kml.
 * Preserves createdAt/creatorId from any existing meta. Best-effort — failures
 * (e.g. missing write permission) are swallowed so they never block workspace
 * load. Pass `files`+`readFile` to (re)generate graph.kml from current content.
 */
export async function ensureDotKillio(
  dir: DirHandle,
  input: {
    name: string;
    creatorId: string;
    creatorAlias?: string;
    files: WorkspaceFileEntry[];
    folders?: unknown[];
    readFile: (path: string) => Promise<string>;
  },
): Promise<void> {
  try {
    const prev = await readJson<DotKillioMeta>(dir, `${DOT_KILLIO}/meta.json`);
    const now = new Date().toISOString();
    const counts = {
      documents: input.files.filter((f) => f.kind === "kd").length,
      boards: input.files.filter((f) => f.kind === "kb").length,
      meshes: input.files.filter((f) => f.kind === "km").length,
      folders: Array.isArray(input.folders) ? input.folders.length : 0,
    };
    const meta: DotKillioMeta = {
      name: input.name,
      creatorId: prev?.creatorId || input.creatorId,
      creatorAlias: input.creatorAlias ?? prev?.creatorAlias,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
      version: DOT_KILLIO_VERSION,
      counts,
    };

    let graph: GraphData = { nodes: [], edges: [] };
    try {
      const entities = await collectLocalEntities(input.files, input.readFile);
      graph = buildGraph(entities, { includeMeshBricks: false });
    } catch { /* graph best-effort */ }

    await writeWorkspaceFile(dir, `${DOT_KILLIO}/meta.json`, JSON.stringify(meta, null, 2));
    await writeWorkspaceFile(dir, `${DOT_KILLIO}/SKILL.md`, skillMd(meta));
    await writeWorkspaceFile(dir, `${DOT_KILLIO}/kml.md`, kmlMd());
    await writeWorkspaceFile(dir, `${DOT_KILLIO}/graph.kml`, graphKml(graph, meta));

    // Seed agent config files (only if absent) so Claude Code, Cursor, Copilot,
    // Windsurf, etc. auto-pick-up the workspace conventions + point at .killio.
    const seedIfAbsent = async (path: string, content: string) => {
      if (!(await readWorkspaceFileWithMeta(dir, path))) {
        try { await writeWorkspaceFile(dir, path, content); } catch { /* best-effort */ }
      }
    };
    const instr = agentInstructions(meta);
    await seedIfAbsent("CLAUDE.md", instr);
    await seedIfAbsent("AGENTS.md", instr);
    await seedIfAbsent(".github/copilot-instructions.md", instr);
    await seedIfAbsent(".windsurfrules", instr);
    await seedIfAbsent(".cursor/rules/killio.mdc", CURSOR_MDC(meta));

    // Seed a workspace .gitignore once (don't clobber the user's edits) so the
    // folder can be versioned cleanly. Content files (.km/.kd/.kb/.ks) stay
    // tracked; only OS noise + the regenerated graph snapshot are ignored.
    if (!(await readWorkspaceFileWithMeta(dir, ".gitignore"))) {
      await writeWorkspaceFile(dir, ".gitignore", [
        "# Killio workspace",
        "# .km / .kd / .kb / .ks files ARE your content — keep them tracked.",
        "",
        "# Regenerated workspace graph snapshot (rebuilt on open)",
        ".killio/graph.kml",
        "",
        "# OS / editor noise",
        ".DS_Store",
        "Thumbs.db",
        "*~",
        "*.tmp",
        "",
      ].join("\n"));
    }
  } catch (err) {
    console.warn("[.killio] ensure failed", err);
  }
}
