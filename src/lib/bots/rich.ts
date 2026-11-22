/**
 * Rich content of bot messages (`metadata.rich = { version: 1 | 2, blocks }`): block types, the backend's limits as editor validation,
 * helpers for the structured editor and the tolerant reader the message renderer uses. Pure, tested in rich.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-rich.ts (sanitizeBlocks, RICH_LIMITS) and docs/BOT-RICH-MESSAGES-V2.md.
 *
 * In a script node the strings may hold templates (`{field}` / `{{ expr }}`); the backend renders them BEFORE validating, so a string
 * with a template is only checked for what it can never render to (it is not measured). The renderer reads what the server stored,
 * which is already sanitised; it still ignores anything it does not know (an unknown block is skipped, never an error).
 *
 * v1 blocks keep their exact shape; v2 adds layout (container, columns, section), media (thumbnail, media_gallery), data (fields, stats,
 * key_value, progress, badges, poll, timestamp), identity (author, footer) and callout / spacer. Messages stored as v1 render unchanged.
 */

export const RICH_LIMITS = {
  maxBlocks: 20,
  maxTotalBlocks: 60,
  maxContainerChildren: 15,
  maxColumnBlocks: 6,
  maxGalleryItems: 6,
  maxImagesTotal: 10,
  maxFields: 12,
  maxStats: 8,
  maxKeyValues: 15,
  maxBadges: 15,
  maxPollOptions: 10,
  maxTextLength: 2000,
  maxTitleLength: 256,
  maxListItems: 25,
  maxTableColumns: 8,
  maxTableRows: 25,
  maxCellLength: 200,
  maxEmbedFields: 10,
  maxCodeLength: 4000,
  maxTotalBytes: 32 * 1024,
  maxUrlLength: 2048,
  maxFieldValueLength: 1000,
} as const;

export const V1_BLOCK_TYPES = ["text", "heading", "list", "checklist", "table", "image", "link", "code", "quote", "divider", "embed"] as const;
export const V2_BLOCK_TYPES = ["section", "thumbnail", "media_gallery", "container", "fields", "author", "footer", "timestamp", "progress", "stats", "key_value", "badges", "callout", "columns", "spacer", "poll"] as const;
export const BLOCK_TYPES = [...V1_BLOCK_TYPES, ...V2_BLOCK_TYPES] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
/** Blocks that always need room.embed_links in the room and bots.send_embeds on the bot (others only when they carry remote content). */
export const EMBED_BLOCK_TYPES: readonly BlockType[] = ["image", "link", "embed", "thumbnail", "media_gallery"];
/** Blocks that hold other blocks. A container may hold columns; columns hold only leaf blocks; a container never holds a container. */
export const LAYOUT_BLOCK_TYPES: readonly BlockType[] = ["container", "columns"];

export const CALLOUT_VARIANTS = ["info", "success", "warning", "error"] as const;
export const BADGE_COLORS = ["gray", "blue", "green", "yellow", "red", "purple", "pink"] as const;
export const PROGRESS_TONES = ["accent", "success", "warning", "danger"] as const;
export const SIZES = ["sm", "md", "lg"] as const;
export const TIMESTAMP_STYLES = ["relative", "absolute", "date", "time", "datetime"] as const;
export const TRENDS = ["up", "down", "flat"] as const;
export const THUMB_SIZES = SIZES;

export type RichBlock = { type: BlockType } & Record<string, any>;

export const hasTemplate = (s: unknown): boolean => typeof s === "string" && /\{[^{}]*\}/.test(s);

export type BlockIssueCode =
  | "not_list" | "empty" | "too_many" | "too_large"
  | "type_unknown" | "text_required" | "text_long" | "heading_level" | "items_empty" | "items_many" | "item_required" | "item_long"
  | "columns_range" | "rows_many" | "row_wide" | "cell_long" | "url_required" | "url_https" | "color_format" | "embed_empty"
  | "fields_many" | "field_name" | "field_value" | "timestamp" | "title_long" | "alt_long" | "code_long"
  | "total_blocks" | "images_many" | "children_range" | "nesting" | "gallery_range" | "variant_invalid" | "progress_range" | "size_invalid"
  | "columns_count" | "accessory_invalid" | "poll_options" | "poll_label" | "poll_votes" | "stat_item" | "kv_item" | "badge_item" | "choice_invalid";

export interface BlockIssue {
  /** `[]` = the whole list, `[2]` = third block, `[2, 1]` = second item / row / field / child of it. */
  at: number[];
  code: BlockIssueCode;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const oneOf = (list: readonly string[], v: unknown) => list.includes(String(v));
const CUSTOM_ID = /^[A-Za-z0-9_.:\-/]{1,100}$/;

function textIssue(out: BlockIssue[], at: number[], value: unknown, max: number, required: boolean, longCode: BlockIssueCode = "text_long"): void {
  const s = str(value).trim();
  if (required && !s) return void out.push({ at, code: "text_required" });
  if (s && !hasTemplate(s) && s.length > max) out.push({ at, code: longCode });
}

function urlIssue(out: BlockIssue[], at: number[], value: unknown, required: boolean): void {
  const s = str(value).trim();
  if (!s) return void (required && out.push({ at, code: "url_required" }));
  if (hasTemplate(s)) return;
  if (s.length > RICH_LIMITS.maxUrlLength || !/^https:\/\/[^\s<>"']+$/i.test(s)) out.push({ at, code: "url_https" });
}

const isDateOk = (v: unknown) => !str(v).trim() || hasTemplate(v) || !Number.isNaN(new Date(str(v)).getTime());

/** Images one block shows (counted against the message-wide limit). */
export function countImages(b: any): number {
  if (!b || typeof b !== "object") return 0;
  switch (b.type) {
    case "image": case "thumbnail": return 1;
    case "media_gallery": return Array.isArray(b.items) ? b.items.length : 0;
    case "embed": return (str(b.imageUrl) ? 1 : 0) + (str(b.thumbnailUrl) ? 1 : 0);
    case "section": return b.accessory?.type === "thumbnail" ? 1 : 0;
    case "container": return (Array.isArray(b.blocks) ? b.blocks : []).reduce((n: number, c: any) => n + countImages(c), 0);
    case "columns": return (Array.isArray(b.columns) ? b.columns : []).reduce((n: number, col: any) => n + (Array.isArray(col?.blocks) ? col.blocks : []).reduce((m: number, c: any) => m + countImages(c), 0), 0);
    default: return 0;
  }
}

/** Number of blocks counting the nested ones. */
export function countBlocks(blocks: readonly any[]): number {
  let n = 0;
  for (const b of blocks) {
    n += 1;
    if (b?.type === "container" && Array.isArray(b.blocks)) n += countBlocks(b.blocks);
    if (b?.type === "columns" && Array.isArray(b.columns)) for (const c of b.columns) n += Array.isArray(c?.blocks) ? countBlocks(c.blocks) : 0;
  }
  return n;
}

/** Contract version a block list needs: 2 as soon as a v2 block or an extended field appears, else 1. */
export function contractVersion(blocks: readonly any[]): 1 | 2 {
  const walk = (list: readonly any[]): boolean => list.some((b) => {
    if (!b || typeof b !== "object") return false;
    if (oneOf(V2_BLOCK_TYPES, b.type)) return true;
    if (b.type === "divider" && b.size) return true;
    if (b.type === "embed" && (b.authorName || b.authorIconUrl || b.authorUrl || b.footerIconUrl)) return true;
    return false;
  });
  return walk(blocks) ? 2 : 1;
}

/** True when a block (at any depth) shows remote content or a card: it needs room.embed_links and bots.send_embeds. */
export function needsEmbedPermission(blocks: readonly any[]): boolean {
  return blocks.some((b) => {
    if (!b || typeof b !== "object") return false;
    if (oneOf(EMBED_BLOCK_TYPES, b.type)) return true;
    if (b.type === "author" && (str(b.iconUrl) || str(b.url))) return true;
    if (b.type === "footer" && str(b.iconUrl)) return true;
    if (b.type === "section" && b.accessory?.type === "thumbnail") return true;
    if (b.type === "container") return needsEmbedPermission(Array.isArray(b.blocks) ? b.blocks : []);
    if (b.type === "columns") return (Array.isArray(b.columns) ? b.columns : []).some((c: any) => needsEmbedPermission(Array.isArray(c?.blocks) ? c.blocks : []));
    return false;
  });
}

/** The buttons that live inside blocks (section accessories), at any depth. They share the customId space of the message. */
export function accessoryButtons(blocks: readonly any[]): any[] {
  const out: any[] = [];
  const walk = (list: readonly any[]) => {
    for (const b of list) {
      if (b?.type === "section" && b.accessory?.type === "button") out.push(b.accessory);
      if (b?.type === "container" && Array.isArray(b.blocks)) walk(b.blocks);
      if (b?.type === "columns" && Array.isArray(b.columns)) for (const c of b.columns) if (Array.isArray(c?.blocks)) walk(c.blocks);
    }
  };
  walk(blocks);
  return out;
}

type Ctx = { depth: "top" | "container" | "column" };

function checkBlock(b: any, at: number[], out: BlockIssue[], ctx: Ctx): void {
  if (!b || typeof b !== "object" || Array.isArray(b)) return void out.push({ at, code: "type_unknown" });
  const type = String(b.type ?? "").trim().toLowerCase();
  if (!oneOf(BLOCK_TYPES, type)) return void out.push({ at, code: "type_unknown" });
  const rootAt = at.slice(0, 1);
  switch (type as BlockType) {
    case "text":
    case "quote":
      return textIssue(out, at, b.text, RICH_LIMITS.maxTextLength, true);
    case "heading":
      if (b.level !== undefined && ![1, 2, 3].includes(Number(b.level))) out.push({ at, code: "heading_level" });
      return textIssue(out, at, b.text, RICH_LIMITS.maxTitleLength, true);
    case "list":
    case "checklist": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length === 0) return void out.push({ at, code: "items_empty" });
      if (items.length > RICH_LIMITS.maxListItems) out.push({ at, code: "items_many" });
      items.forEach((it: any, k: number) => {
        const t = type === "checklist" && it && typeof it === "object" ? it.text : it;
        const s = str(t).trim();
        if (!s) out.push({ at: [...at, k], code: "item_required" });
        else if (!hasTemplate(s) && s.length > RICH_LIMITS.maxCellLength) out.push({ at: [...at, k], code: "item_long" });
      });
      return;
    }
    case "table": {
      const cols = Array.isArray(b.columns) ? b.columns : [];
      if (cols.length < 1 || cols.length > RICH_LIMITS.maxTableColumns) out.push({ at, code: "columns_range" });
      cols.forEach((c: unknown, k: number) => {
        const s = str(c).trim();
        if (!s) out.push({ at: [...at, k], code: "item_required" });
        else if (!hasTemplate(s) && s.length > RICH_LIMITS.maxCellLength) out.push({ at: [...at, k], code: "cell_long" });
      });
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (rows.length > RICH_LIMITS.maxTableRows) out.push({ at, code: "rows_many" });
      rows.forEach((r: unknown, k: number) => {
        const cells = Array.isArray(r) ? r : [];
        if (cells.length > cols.length || cells.length > RICH_LIMITS.maxTableColumns) out.push({ at: [...at, k], code: "row_wide" });
        if (cells.some((c) => !hasTemplate(c) && str(c).length > RICH_LIMITS.maxCellLength)) out.push({ at: [...at, k], code: "cell_long" });
      });
      return;
    }
    case "image":
      urlIssue(out, at, b.url, true);
      if (!hasTemplate(b.alt) && str(b.alt).length > 200) out.push({ at, code: "alt_long" });
      if (!hasTemplate(b.caption) && str(b.caption).length > 300) out.push({ at, code: "alt_long" });
      return;
    case "link":
      urlIssue(out, at, b.url, true);
      if (!hasTemplate(b.title) && str(b.title).length > RICH_LIMITS.maxTitleLength) out.push({ at, code: "title_long" });
      if (!hasTemplate(b.description) && str(b.description).length > 500) out.push({ at, code: "text_long" });
      return;
    case "code":
      return textIssue(out, at, b.code, RICH_LIMITS.maxCodeLength, true, "code_long");
    case "divider":
      if (b.size !== undefined && b.size !== "" && !hasTemplate(b.size) && !oneOf(SIZES, b.size)) out.push({ at, code: "size_invalid" });
      return;
    case "embed": {
      const color = b.color === undefined || b.color === null || b.color === "" ? "" : String(b.color);
      if (color && !hasTemplate(color) && !/^#[0-9a-f]{6}$/i.test(color)) out.push({ at, code: "color_format" });
      const fields = Array.isArray(b.fields) ? b.fields : [];
      if (fields.length > RICH_LIMITS.maxEmbedFields) out.push({ at, code: "fields_many" });
      fields.forEach((f: any, k: number) => {
        if (!str(f?.name).trim()) out.push({ at: [...at, k], code: "field_name" });
        if (!str(f?.value).trim()) out.push({ at: [...at, k], code: "field_value" });
      });
      if (!str(b.title).trim() && !str(b.description).trim() && fields.length === 0) out.push({ at, code: "embed_empty" });
      if (!hasTemplate(b.title) && str(b.title).length > RICH_LIMITS.maxTitleLength) out.push({ at, code: "title_long" });
      if (!hasTemplate(b.description) && str(b.description).length > RICH_LIMITS.maxTextLength) out.push({ at, code: "text_long" });
      for (const key of ["url", "imageUrl", "thumbnailUrl", "authorUrl", "authorIconUrl", "footerIconUrl"]) urlIssue(out, at, b[key], false);
      if (!isDateOk(b.timestamp)) out.push({ at, code: "timestamp" });
      return;
    }
    case "section": {
      textIssue(out, at, b.text, RICH_LIMITS.maxTextLength, true);
      const a = b.accessory;
      if (a === undefined || a === null) return;
      if (a.type === "thumbnail") {
        urlIssue(out, at, a.url, true);
        if (!hasTemplate(a.alt) && str(a.alt).length > 200) out.push({ at, code: "alt_long" });
      } else if (a.type === "button") {
        const style = str(a.style || "secondary").toLowerCase();
        const label = str(a.label).trim();
        if (!oneOf(["primary", "secondary", "success", "danger", "link"], style) || !label || (!hasTemplate(label) && label.length > 80)) out.push({ at, code: "accessory_invalid" });
        else if (style === "link") urlIssue(out, at, a.url, true);
        else if (!str(a.customId) || (!hasTemplate(a.customId) && !CUSTOM_ID.test(str(a.customId)))) out.push({ at, code: "accessory_invalid" });
      } else out.push({ at, code: "accessory_invalid" });
      return;
    }
    case "thumbnail":
      urlIssue(out, at, b.url, true);
      if (!hasTemplate(b.alt) && str(b.alt).length > 200) out.push({ at, code: "alt_long" });
      if (b.size !== undefined && b.size !== "" && !hasTemplate(b.size) && !oneOf(SIZES, b.size)) out.push({ at, code: "size_invalid" });
      return;
    case "media_gallery": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length < 1 || items.length > RICH_LIMITS.maxGalleryItems) out.push({ at, code: "gallery_range" });
      items.forEach((it: any, k: number) => {
        urlIssue(out, [...at, k], it?.url, true);
        if (!hasTemplate(it?.alt) && str(it?.alt).length > 200) out.push({ at: [...at, k], code: "alt_long" });
        if (!hasTemplate(it?.caption) && str(it?.caption).length > 300) out.push({ at: [...at, k], code: "alt_long" });
      });
      return;
    }
    case "container": {
      if (ctx.depth !== "top") return void out.push({ at, code: "nesting" });
      const color = str(b.accentColor);
      if (color && !hasTemplate(color) && !/^#[0-9a-f]{6}$/i.test(color)) out.push({ at, code: "color_format" });
      const kids = Array.isArray(b.blocks) ? b.blocks : [];
      if (kids.length < 1 || kids.length > RICH_LIMITS.maxContainerChildren) out.push({ at, code: "children_range" });
      kids.forEach((c: any, k: number) => checkBlock(c, [...rootAt, k], out, { depth: "container" }));
      return;
    }
    case "columns": {
      if (ctx.depth === "column") return void out.push({ at, code: "nesting" });
      const cols = Array.isArray(b.columns) ? b.columns : [];
      if (cols.length < 2 || cols.length > 3) out.push({ at, code: "columns_count" });
      cols.forEach((col: any, ci: number) => {
        const kids = Array.isArray(col?.blocks) ? col.blocks : [];
        if (kids.length < 1 || kids.length > RICH_LIMITS.maxColumnBlocks) out.push({ at, code: "children_range" });
        kids.forEach((c: any, k: number) => {
          if (c && oneOf(LAYOUT_BLOCK_TYPES, c.type)) out.push({ at: [...rootAt, ci * 10 + k], code: "nesting" });
          else checkBlock(c, [...rootAt, ci * 10 + k], out, { depth: "column" });
        });
      });
      return;
    }
    case "fields": {
      const fields = Array.isArray(b.fields) ? b.fields : [];
      if (fields.length < 1 || fields.length > RICH_LIMITS.maxFields) out.push({ at, code: "fields_many" });
      if (b.columns !== undefined && b.columns !== "" && !hasTemplate(b.columns) && ![1, 2, 3].includes(Number(b.columns))) out.push({ at, code: "columns_range" });
      fields.forEach((f: any, k: number) => {
        if (!str(f?.name).trim()) out.push({ at: [...at, k], code: "field_name" });
        else if (!hasTemplate(f.name) && str(f.name).length > RICH_LIMITS.maxTitleLength) out.push({ at: [...at, k], code: "title_long" });
        if (!str(f?.value).trim()) out.push({ at: [...at, k], code: "field_value" });
        else if (!hasTemplate(f.value) && str(f.value).length > RICH_LIMITS.maxFieldValueLength) out.push({ at: [...at, k], code: "text_long" });
      });
      return;
    }
    case "author":
      textIssue(out, at, b.name, RICH_LIMITS.maxTitleLength, true, "title_long");
      urlIssue(out, at, b.iconUrl, false);
      urlIssue(out, at, b.url, false);
      return;
    case "footer":
      textIssue(out, at, b.text, 200, true);
      urlIssue(out, at, b.iconUrl, false);
      return;
    case "timestamp":
      if (!str(b.value).trim() || !isDateOk(b.value)) out.push({ at, code: "timestamp" });
      if (b.style !== undefined && b.style !== "" && !hasTemplate(b.style) && !oneOf(TIMESTAMP_STYLES, b.style)) out.push({ at, code: "choice_invalid" });
      if (!hasTemplate(b.label) && str(b.label).length > 100) out.push({ at, code: "text_long" });
      return;
    case "progress": {
      const max = b.max === undefined || b.max === "" ? 100 : Number(b.max);
      const value = Number(b.value);
      const templated = hasTemplate(b.value) || hasTemplate(b.max);
      if (!templated && (!Number.isFinite(value) || !Number.isFinite(max) || max < 1 || max > 1e9 || value < 0 || value > max)) out.push({ at, code: "progress_range" });
      if (b.tone !== undefined && b.tone !== "" && !oneOf(PROGRESS_TONES, b.tone)) out.push({ at, code: "choice_invalid" });
      if (!hasTemplate(b.label) && str(b.label).length > 100) out.push({ at, code: "text_long" });
      return;
    }
    case "stats": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length < 1 || items.length > RICH_LIMITS.maxStats) out.push({ at, code: "items_many" });
      items.forEach((it: any, k: number) => {
        const ok = str(it?.label).trim() && str(it?.value).trim() && (hasTemplate(it.label) || str(it.label).length <= 60) && (hasTemplate(it.value) || str(it.value).length <= 40) && (hasTemplate(it.delta) || str(it?.delta).length <= 20) && (!it?.trend || oneOf(TRENDS, it.trend));
        if (!ok) out.push({ at: [...at, k], code: "stat_item" });
      });
      return;
    }
    case "key_value": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length < 1 || items.length > RICH_LIMITS.maxKeyValues) out.push({ at, code: "items_many" });
      items.forEach((it: any, k: number) => {
        const ok = str(it?.key).trim() && str(it?.value).trim() && (hasTemplate(it.key) || str(it.key).length <= 100) && (hasTemplate(it.value) || str(it.value).length <= 300);
        if (!ok) out.push({ at: [...at, k], code: "kv_item" });
      });
      return;
    }
    case "badges": {
      const items = Array.isArray(b.items) ? b.items : [];
      if (items.length < 1 || items.length > RICH_LIMITS.maxBadges) out.push({ at, code: "items_many" });
      items.forEach((it: any, k: number) => {
        const ok = str(it?.text).trim() && (hasTemplate(it.text) || str(it.text).length <= 40) && (!it?.color || oneOf(BADGE_COLORS, it.color));
        if (!ok) out.push({ at: [...at, k], code: "badge_item" });
      });
      return;
    }
    case "callout":
      if (!oneOf(CALLOUT_VARIANTS, b.variant ?? "info")) out.push({ at, code: "variant_invalid" });
      textIssue(out, at, b.text, RICH_LIMITS.maxTextLength, true);
      if (!hasTemplate(b.title) && str(b.title).length > 120) out.push({ at, code: "title_long" });
      if (str(b.icon).length > 8 && !hasTemplate(b.icon)) out.push({ at, code: "text_long" });
      return;
    case "spacer":
      if (b.size !== undefined && b.size !== "" && !hasTemplate(b.size) && !oneOf(SIZES, b.size)) out.push({ at, code: "size_invalid" });
      return;
    case "poll": {
      textIssue(out, at, b.question, RICH_LIMITS.maxTitleLength, true, "title_long");
      const options = Array.isArray(b.options) ? b.options : [];
      if (options.length < 2 || options.length > RICH_LIMITS.maxPollOptions) out.push({ at, code: "poll_options" });
      options.forEach((o: any, k: number) => {
        if (!str(o?.label).trim() || (!hasTemplate(o.label) && str(o.label).length > 100)) out.push({ at: [...at, k], code: "poll_label" });
        if (o?.votes !== undefined && o.votes !== "" && !hasTemplate(o.votes) && !(Number.isInteger(Number(o.votes)) && Number(o.votes) >= 0 && Number(o.votes) <= 1e9)) out.push({ at: [...at, k], code: "poll_votes" });
      });
      if (!isDateOk(b.closesAt)) out.push({ at, code: "timestamp" });
      return;
    }
  }
}

/** Size the backend measures: the JSON of the (sanitised) blocks in UTF-8. */
export const blocksBytes = (blocks: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(blocks)).length;
  } catch {
    return 0;
  }
};

/** Every problem of a block list (empty = the backend accepts it; `[]` is "no rich content", accepted). */
export function validateBlocks(blocks: unknown): BlockIssue[] {
  if (blocks === undefined || blocks === null) return [];
  if (!Array.isArray(blocks)) return [{ at: [], code: "not_list" }];
  const out: BlockIssue[] = [];
  if (blocks.length > RICH_LIMITS.maxBlocks) out.push({ at: [], code: "too_many" });
  if (countBlocks(blocks) > RICH_LIMITS.maxTotalBlocks) out.push({ at: [], code: "total_blocks" });
  if (blocks.reduce((n: number, b) => n + countImages(b), 0) > RICH_LIMITS.maxImagesTotal) out.push({ at: [], code: "images_many" });
  blocks.forEach((b, i) => checkBlock(b, [i], out, { depth: "top" }));
  if (blocksBytes(blocks) > RICH_LIMITS.maxTotalBytes) out.push({ at: [], code: "too_large" });
  return out;
}

export const blockIssuesAt = (issues: readonly BlockIssue[], i: number): BlockIssue[] => issues.filter((x) => x.at[0] === i);

/** A new block of a type with the fields the backend requires already present. */
export function blankBlock(type: BlockType): RichBlock {
  switch (type) {
    case "text": case "quote": return { type, text: "" };
    case "heading": return { type, level: 2, text: "" };
    case "list": return { type, ordered: false, items: [""] };
    case "checklist": return { type, items: [{ text: "", checked: false }] };
    case "table": return { type, columns: ["", ""], rows: [] };
    case "image": return { type, url: "", alt: "", caption: "" };
    case "link": return { type, url: "", title: "", description: "" };
    case "code": return { type, language: "", code: "" };
    case "divider": return { type };
    case "embed": return { type, title: "", description: "", color: "", fields: [] };
    case "section": return { type, text: "" };
    case "thumbnail": return { type, url: "", alt: "" };
    case "media_gallery": return { type, items: [{ url: "", alt: "" }] };
    case "container": return { type, accentColor: "", blocks: [{ type: "text", text: "" }] };
    case "fields": return { type, columns: 1, fields: [{ name: "", value: "", inline: false }] };
    case "author": return { type, name: "" };
    case "footer": return { type, text: "" };
    case "timestamp": return { type, value: "", style: "relative" };
    case "progress": return { type, value: 0, max: 100, label: "", showPercent: true };
    case "stats": return { type, items: [{ label: "", value: "" }] };
    case "key_value": return { type, items: [{ key: "", value: "" }] };
    case "badges": return { type, items: [{ text: "", color: "blue" }] };
    case "callout": return { type, variant: "info", title: "", text: "", icon: "" };
    case "columns": return { type, columns: [{ blocks: [{ type: "text", text: "" }] }, { blocks: [{ type: "text", text: "" }] }] };
    case "spacer": return { type, size: "md" };
    case "poll": return { type, question: "", options: [{ label: "", votes: 0 }, { label: "", votes: 0 }] };
  }
}

const pt = (v: unknown) => str(v);

/** Plain-text rendition (what the backend stores in `content` when the script gives no text); used by the preview and the sr-only label. */
export function blocksToPlainText(blocks: readonly RichBlock[], max = 1000): string {
  const lines: string[] = [];
  const walk = (list: readonly RichBlock[]) => {
    for (const b of list) {
      switch (b.type) {
        case "text": case "quote": case "heading": lines.push(pt(b.text)); break;
        case "list": lines.push(...(Array.isArray(b.items) ? b.items : []).map((t: unknown, i: number) => `${b.ordered ? `${i + 1}.` : "-"} ${pt(t)}`)); break;
        case "checklist": lines.push(...(Array.isArray(b.items) ? b.items : []).map((t: any) => `[${t?.checked ? "x" : " "}] ${pt(t?.text)}`)); break;
        case "table": lines.push((Array.isArray(b.columns) ? b.columns : []).map(pt).join(" | "), ...(Array.isArray(b.rows) ? b.rows : []).map((r: unknown) => (Array.isArray(r) ? r : []).map(pt).join(" | "))); break;
        case "image": lines.push(pt(b.caption) || pt(b.alt) || pt(b.url)); break;
        case "link": lines.push(b.title ? `${pt(b.title)} ${pt(b.url)}` : pt(b.url)); break;
        case "code": lines.push(pt(b.code)); break;
        case "embed": lines.push([pt(b.title), pt(b.description)].filter(Boolean).join(": ") || (b.fields?.[0] ? `${pt(b.fields[0].name)}: ${pt(b.fields[0].value)}` : "")); break;
        case "section": lines.push(pt(b.text)); break;
        case "thumbnail": lines.push(pt(b.alt)); break;
        case "media_gallery": lines.push(...(Array.isArray(b.items) ? b.items : []).map((i: any) => pt(i?.caption) || pt(i?.alt))); break;
        case "container": walk(Array.isArray(b.blocks) ? b.blocks : []); break;
        case "columns": for (const c of Array.isArray(b.columns) ? b.columns : []) walk(Array.isArray(c?.blocks) ? c.blocks : []); break;
        case "fields": lines.push(...(Array.isArray(b.fields) ? b.fields : []).map((f: any) => `${pt(f?.name)}: ${pt(f?.value)}`)); break;
        case "author": lines.push(pt(b.name)); break;
        case "footer": lines.push(pt(b.text)); break;
        case "timestamp": lines.push([pt(b.label), pt(b.value)].filter(Boolean).join(" ")); break;
        case "progress": lines.push(`${pt(b.label) ? `${pt(b.label)}: ` : ""}${pt(b.value)}/${pt(b.max ?? 100)}`); break;
        case "stats": lines.push(...(Array.isArray(b.items) ? b.items : []).map((i: any) => `${pt(i?.label)}: ${pt(i?.value)}`)); break;
        case "key_value": lines.push(...(Array.isArray(b.items) ? b.items : []).map((i: any) => `${pt(i?.key)}: ${pt(i?.value)}`)); break;
        case "badges": lines.push((Array.isArray(b.items) ? b.items : []).map((i: any) => pt(i?.text)).join(", ")); break;
        case "callout": lines.push([pt(b.title), pt(b.text)].filter(Boolean).join(": ")); break;
        case "poll": lines.push(pt(b.question), ...(Array.isArray(b.options) ? b.options : []).map((o: any) => `- ${pt(o?.label)}`)); break;
        default: break;
      }
    }
  };
  walk(blocks);
  return lines.filter(Boolean).join("\n").slice(0, max);
}

/** The backend stores the plain-text rendition of the blocks as `content` when the script gives no text: showing both would repeat everything. */
export function isFallbackContent(content: string, blocks: readonly RichBlock[]): boolean {
  if (blocks.length === 0) return false;
  const norm = (s: string) => s.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  const c = norm(content);
  if (!c) return true;
  const f = norm(blocksToPlainText(blocks, 1000));
  if (c === f) return true;
  // A script that sets `text` to the title of its own first heading ("Reglas de X" + heading "Reglas de X", or "Bienvenid@ Ana a X" + heading
  // "Bienvenid@ Ana") would show that title twice: it is a restatement, not extra content.
  const first = blocks[0];
  if (first && first.type === "heading") {
    const h = norm(str(first.text));
    if (h && (c === h || (c.startsWith(h) && c.length - h.length <= TITLE_RESTATEMENT_EXTRA))) return true;
  }
  return false;
}

/** How many extra characters after the heading text still count as a restatement of it (" a Cemelitos"). */
const TITLE_RESTATEMENT_EXTRA = 40;

/* ── helpers of the structured editor ── */

/** `a\nb\n\nc` -> ["a", "b", "c"] (blank lines dropped). */
export const linesToList = (text: string): string[] => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/** Checklist lines: `[x] done` / `[ ] todo` / `todo`. */
export function linesToChecklist(text: string): Array<{ text: string; checked: boolean }> {
  return linesToList(text).map((l) => {
    const m = /^\[( |x|X)\]\s*(.*)$/.exec(l);
    return m ? { text: m[2], checked: m[1].toLowerCase() === "x" } : { text: l, checked: false };
  });
}
export const checklistToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((i: any) => `[${i?.checked ? "x" : " "}] ${str(i?.text)}`).join("\n");

/** Table rows, one per line, cells separated by ` | `. */
export const linesToRows = (text: string): string[][] => linesToList(text).map((l) => l.split("|").map((c) => c.trim()));
export const rowsToLines = (rows: unknown): string => (Array.isArray(rows) ? rows : []).map((r: unknown) => (Array.isArray(r) ? r : []).map(str).join(" | ")).join("\n");

/** Embed fields, one per line: `name | value` or `name | value | inline`. */
export function linesToFields(text: string): Array<{ name: string; value: string; inline: boolean }> {
  return linesToList(text).map((l) => {
    const [name = "", value = "", flag = ""] = l.split("|").map((c) => c.trim());
    return { name, value, inline: /^(inline|true|1|yes|si)$/i.test(flag) };
  });
}
export const fieldsToLines = (fields: unknown): string => (Array.isArray(fields) ? fields : []).map((f: any) => [str(f?.name), str(f?.value), f?.inline ? "inline" : ""].filter((x, i) => i < 2 || x).join(" | ")).join("\n");

/** Stats, one per line: `label | value | delta | up|down|flat` (delta and trend optional). */
export function linesToStats(text: string): Array<{ label: string; value: string; delta?: string; trend?: string }> {
  return linesToList(text).map((l) => {
    const [label = "", value = "", delta = "", trend = ""] = l.split("|").map((c) => c.trim());
    return { label, value, ...(delta ? { delta } : {}), ...(oneOf(TRENDS, trend) ? { trend } : {}) };
  });
}
export const statsToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((i: any) => [str(i?.label), str(i?.value), str(i?.delta), str(i?.trend)].join(" | ").replace(/( \| )+$/, "")).join("\n");

/** Key / value pairs, one per line: `key | value`. */
export function linesToPairs(text: string): Array<{ key: string; value: string }> {
  return linesToList(text).map((l) => {
    const [key = "", ...rest] = l.split("|").map((c) => c.trim());
    return { key, value: rest.join(" | ") };
  });
}
export const pairsToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((i: any) => `${str(i?.key)} | ${str(i?.value)}`).join("\n");

/** Badges, one per line: `text | color` (color optional). */
export function linesToBadges(text: string): Array<{ text: string; color?: string }> {
  return linesToList(text).map((l) => {
    const [t = "", color = ""] = l.split("|").map((c) => c.trim());
    return { text: t, ...(oneOf(BADGE_COLORS, color) ? { color } : {}) };
  });
}
export const badgesToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((i: any) => [str(i?.text), str(i?.color)].join(" | ").replace(/ \| $/, "")).join("\n");

/** Poll options, one per line: `label | votes` (votes optional). */
export function linesToPollOptions(text: string): Array<{ label: string; votes?: number }> {
  return linesToList(text).map((l) => {
    const [label = "", votes = ""] = l.split("|").map((c) => c.trim());
    return { label, ...(votes !== "" && Number.isFinite(Number(votes)) ? { votes: Math.max(0, Math.floor(Number(votes))) } : {}) };
  });
}
export const pollOptionsToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((o: any) => [str(o?.label), o?.votes === undefined ? "" : str(o.votes)].join(" | ").replace(/ \| $/, "")).join("\n");

/** Gallery items, one per line: `https://url | alt | caption`. */
export function linesToGallery(text: string): Array<{ url: string; alt?: string; caption?: string }> {
  return linesToList(text).map((l) => {
    const [url = "", alt = "", caption = ""] = l.split("|").map((c) => c.trim());
    return { url, ...(alt ? { alt } : {}), ...(caption ? { caption } : {}) };
  });
}
export const galleryToLines = (items: unknown): string => (Array.isArray(items) ? items : []).map((i: any) => [str(i?.url), str(i?.alt), str(i?.caption)].join(" | ").replace(/( \| )+$/, "")).join("\n");

/* ── what a message carries (renderer) ── */

export interface MessageReplyTo {
  /** Id of the message answered (the invocation, for a command). */
  messageId: string;
  userId: string | null;
  excerpt: string;
}

export interface MessageExtras {
  blocks: RichBlock[];
  /** Raw component rows, read by components.ts. */
  componentRows: unknown[];
  componentsExpiresAt: string | null;
  botId: string | null;
  /** Reply reference written by a bot (`{ messageId, userId, excerpt }`); the people's one (`{ id, content, displayName }`) is read by the message item. */
  replyTo: MessageReplyTo | null;
}

const isKnown = (b: unknown): b is RichBlock => !!b && typeof b === "object" && !Array.isArray(b) && oneOf(BLOCK_TYPES, (b as any).type);

/** Keeps the blocks the client knows; a container / columns child that is unknown is dropped, nesting is re-limited. */
function readBlocks(list: unknown, depth: "top" | "container" | "column"): RichBlock[] {
  if (!Array.isArray(list)) return [];
  const out: RichBlock[] = [];
  for (const b of list) {
    if (!isKnown(b)) continue;
    if (b.type === "container") {
      if (depth !== "top") continue;
      out.push({ ...b, blocks: readBlocks(b.blocks, "container").slice(0, RICH_LIMITS.maxContainerChildren) });
    } else if (b.type === "columns") {
      if (depth === "column") continue;
      const cols = (Array.isArray(b.columns) ? b.columns : []).slice(0, 3).map((c: any) => ({ blocks: readBlocks(c?.blocks, "column").slice(0, RICH_LIMITS.maxColumnBlocks) }));
      out.push({ ...b, columns: cols });
    } else out.push(b);
  }
  return out;
}

/** Reads the parts of `message.metadata` a bot writes. Tolerant: anything that is not the documented shape is ignored. */
export function readMessageExtras(metadata: unknown): MessageExtras {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, any>;
  const blocks = readBlocks(m.rich?.blocks, "top").slice(0, RICH_LIMITS.maxBlocks);
  const rows = Array.isArray(m.components?.rows) ? m.components.rows : [];
  const r = m.replyTo && typeof m.replyTo === "object" ? m.replyTo : null;
  const replyTo = r && typeof r.messageId === "string" ? { messageId: r.messageId, userId: typeof r.userId === "string" ? r.userId : null, excerpt: typeof r.excerpt === "string" ? r.excerpt : "" } : null;
  return {
    blocks,
    componentRows: rows,
    componentsExpiresAt: typeof m.components?.expiresAt === "string" ? m.components.expiresAt : null,
    botId: typeof m.bot?.id === "string" ? m.bot.id : null,
    replyTo,
  };
}

/** Only https links are ever opened from a bot message (the server enforces it; this keeps a hostile row inert). */
export const safeHttpsUrl = (v: unknown): string | null => {
  const s = str(v).trim();
  return /^https:\/\/[^\s<>"']+$/i.test(s) && s.length <= RICH_LIMITS.maxUrlLength ? s : null;
};

/* ── value helpers the renderer shares ── */

/** Fraction 0..1 of a progress block (clamped; non-numbers give 0). */
export function progressFraction(value: unknown, max: unknown): number {
  const v = Number(value);
  const m = max === undefined || max === null || max === "" ? 100 : Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.min(1, Math.max(0, v / m));
}

/** Poll results: totals and percentages per option (display only; votes are whatever the script wrote). */
export function pollResults(options: unknown): Array<{ label: string; emoji: string; votes: number; percent: number }> {
  const list = (Array.isArray(options) ? options : []).map((o: any) => ({ label: str(o?.label), emoji: str(o?.emoji), votes: Math.max(0, Math.floor(Number(o?.votes) || 0)) }));
  const total = list.reduce((n, o) => n + o.votes, 0);
  return list.map((o) => ({ ...o, percent: total > 0 ? Math.round((o.votes / total) * 100) : 0 }));
}

/** Text of a timestamp block for a reader: relative ("hace 3 horas") or absolute in the reader's own zone and locale. */
export function formatTimestamp(value: unknown, style: unknown, now: number = Date.now(), locale?: string): string {
  const d = new Date(str(value));
  if (Number.isNaN(d.getTime())) return "";
  const st = oneOf(TIMESTAMP_STYLES, style) ? String(style) : "datetime";
  try {
    if (st === "relative") {
      const diff = d.getTime() - now;
      const abs = Math.abs(diff);
      const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31_536_000_000], ["month", 2_592_000_000], ["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
      return rtf.format(Math.round(diff / 1000), "second");
    }
    const opts: Intl.DateTimeFormatOptions = st === "date" ? { dateStyle: "medium" } : st === "time" ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" };
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return d.toISOString();
  }
}
