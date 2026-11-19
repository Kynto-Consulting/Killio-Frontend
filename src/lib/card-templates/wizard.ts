/**
 * Wizard of a card template (the "new card" modal asks step by step instead of showing one long form) and how its answers
 * fill the card. Pure (no React, no path aliases) so it runs under `node --test`. The server validates the definition
 * (`card-template-wizard.ts` in the backend); this file only reads it and applies answers.
 */
import { buildMediaCaption } from "../media-bricks.ts";
import { addTagWithRules, type RuleGroup } from "../tags/group-rules.ts";

export type WizardFieldKind = "tag_group" | "list" | "title" | "line" | "text" | "checklist" | "date" | "assignees" | "toggle" | "image" | "file";
export type WizardInput = "text" | "number" | "range" | "select";
export type WizardDateTarget = "due" | "start" | "line";

export interface WizardField {
  id: string;
  kind: WizardFieldKind;
  label: string;
  required: boolean;
  /** Name used as `{{variable}}` in the template's title and blocks. */
  variable?: string;
  help?: string;
  groupId?: string;
  key?: string;
  input?: WizardInput;
  options?: string[];
  allowCustom?: boolean;
  /** number / range; for image / file, `max` is the number of files (1 when absent, 10 at most) */
  min?: number;
  max?: number;
  /** file: allowed mime types (`application/pdf`, `image/*`); absent = any file. */
  accept?: string[];
  step?: number;
  /** date: the card's due date, its start date or a description line. */
  target?: WizardDateTarget;
  placeholder?: string;
}

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  fields: WizardField[];
}

export interface TemplateWizard {
  /** Wizard mode on. Off = the template only fills the form (fill mode). */
  enabled: boolean;
  /** Create the card when the last step is done (default true). */
  autoCreate?: boolean;
  steps: WizardStep[];
}

/**
 * A text answer, or the chosen tag ids of a tag group. An `image` / `file` answer is a list of `encodeWizardFile` strings
 * (the files are uploaded while the person answers, so the answer only carries where they are).
 */
export type WizardAnswers = Record<string, string | string[]>;

/** A person of the board, for the `assignees` question. */
export interface WizardMember {
  id: string;
  name: string;
}

export interface WizardTag {
  id: string;
  name?: string | null;
}

/** A text-like brick of the card being created (the modal's block shape). */
export interface WizardBrick {
  id: string;
  kind: string;
  markdown?: string;
  displayStyle?: string;
  [key: string]: unknown;
}

/** The wizard to run for a template: only when it is enabled and asks at least one thing. */
export function activeWizard(wizard: TemplateWizard | null | undefined): TemplateWizard | null {
  if (!wizard || wizard.enabled === false) return null;
  const steps = (wizard.steps ?? []).filter((s) => (s.fields ?? []).length > 0);
  return steps.length > 0 ? { enabled: true, steps } : null;
}

export const isAnswered = (v: string | string[] | undefined): boolean => (Array.isArray(v) ? v.some((x) => String(x).trim() !== "") : typeof v === "string" && v.trim() !== "");

/** Ids of the required fields of a step that still have no answer. */
export const missingRequired = (step: WizardStep, answers: WizardAnswers): string[] => step.fields.filter((f) => f.required && !isAnswered(answers[f.id])).map((f) => f.id);

/** What the server accepts per upload (multer `fileSize` in the uploads module). */
export const WIZARD_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const WIZARD_MAX_FILES = 10;

/** An uploaded file as an `image` / `file` answer remembers it. */
export interface WizardFile {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export const isMediaKind = (kind: string): boolean => kind === "image" || kind === "file";
export const encodeWizardFile = (f: WizardFile): string => JSON.stringify({ url: f.url, name: f.name, mime: f.mime, size: f.size });

export function decodeWizardFile(raw: unknown): WizardFile | null {
  if (typeof raw !== "string") return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o.url !== "string" || o.url === "") return null;
    return { url: o.url, name: typeof o.name === "string" && o.name ? o.name : "file", mime: typeof o.mime === "string" ? o.mime : "", size: typeof o.size === "number" && Number.isFinite(o.size) ? o.size : 0 };
  } catch {
    return null;
  }
}

/** The files of an `image` / `file` answer (anything that is not an encoded file is ignored). */
export const wizardFiles = (v: string | string[] | undefined): WizardFile[] => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).map(decodeWizardFile).filter((x): x is WizardFile => x !== null);

/** How many files an `image` / `file` question takes: `max`, 1 when absent, never more than WIZARD_MAX_FILES. */
export const maxFilesOf = (f: Pick<WizardField, "max">): number => (typeof f.max === "number" && Number.isInteger(f.max) && f.max >= 1 ? Math.min(f.max, WIZARD_MAX_FILES) : 1);

/** Mime types a question takes: images only for `image`, the admin's list (or anything) for `file`. */
export const acceptOf = (f: Pick<WizardField, "kind" | "accept">): string[] => (f.kind === "image" ? ["image/*"] : f.accept ?? []);

/** `true` when `mime` fits the list (`type/subtype` or `type/*`); an empty list takes anything. */
export function mimeAllowed(accept: ReadonlyArray<string>, mime: string): boolean {
  if (accept.length === 0) return true;
  const m = mime.trim().toLowerCase();
  if (!m) return false;
  return accept.some((a) => {
    const p = a.trim().toLowerCase();
    return p.endsWith("/*") ? m.startsWith(p.slice(0, -1)) : m === p;
  });
}

export type WizardFileError = "size" | "type" | "count";

/** Why a file cannot be added to a question (`existing` = files it already has), or `null` when it can. A single-file question replaces its file, so it never runs out of room. */
export function checkWizardFile(f: Pick<WizardField, "kind" | "accept" | "max">, file: { type: string; size: number }, existing: number): WizardFileError | null {
  if (!mimeAllowed(acceptOf(f), file.type)) return "type";
  if (file.size > WIZARD_MAX_FILE_BYTES) return "size";
  const max = maxFilesOf(f);
  if (max > 1 && existing >= max) return "count";
  return null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Sets the `Key: value` line of a markdown text (case-insensitive key); adds the line at the end when there is none. */
export function setLine(markdown: string, key: string, value: string): string {
  const re = new RegExp(`^(\\s*)${esc(key)}\\s*:.*$`, "im");
  const line = `${key}: ${value}`.trimEnd();
  if (re.test(markdown)) return markdown.replace(re, (_m, indent: string) => `${indent}${line}`);
  return markdown.trim() === "" ? line : `${markdown.replace(/\s+$/, "")}\n${line}`;
}

const MD_HEADING = /^\s*#{1,6}\s+/;
const isText = (b: WizardBrick) => b.kind === "text";
/** Headings of a description are markdown lines (`## Detalle`) in a text block of one line. */
const isHeading = (b: WizardBrick) => isText(b) && !String(b.markdown ?? "").includes("\n") && MD_HEADING.test(String(b.markdown ?? ""));
const headingText = (b: WizardBrick) => String(b.markdown ?? "").replace(MD_HEADING, "").trim().toLowerCase();

/** Puts `value` under the heading whose text is `label`: replaces the paragraph that follows, or adds one. Without such a heading it is appended at the end. */
export function setTextUnderHeading(blocks: WizardBrick[], label: string, value: string, makeId: () => string): WizardBrick[] {
  const idx = blocks.findIndex((b) => isHeading(b) && headingText(b) === label.trim().toLowerCase());
  const fresh = (): WizardBrick => ({ id: makeId(), kind: "text", displayStyle: "paragraph", markdown: value, tasks: [] });
  if (idx < 0) return [...blocks, ...(value.trim() ? [fresh()] : [])];
  const next = blocks[idx + 1];
  if (next && isText(next) && !isHeading(next)) return blocks.map((b, i) => (i === idx + 1 ? { ...b, markdown: value } : b));
  return [...blocks.slice(0, idx + 1), fresh(), ...blocks.slice(idx + 1)];
}

export interface ApplyInput {
  wizard: TemplateWizard;
  answers: WizardAnswers;
  /** Blocks of the card as the template left them. */
  blocks: WizardBrick[];
  /** The tags the card has now (ids) and every tag of the board. */
  tagIds: string[];
  allTags: ReadonlyArray<WizardTag>;
  /** Team tag groups with their rules. */
  groups: ReadonlyArray<RuleGroup>;
  /** Title the template produced (its pattern prefix); a `title` answer is appended to it. */
  title: string;
  listId: string | null;
  makeId: () => string;
  /** Lists of the board (to name the chosen state in placeholders). */
  lists?: ReadonlyArray<{ id: string; name: string }>;
  /** Values of the built-in placeholders. */
  builtins?: { date?: string; user?: string; board?: string };
  /** People of the board (to name the assigned ones in placeholders) and the ones already assigned. */
  members?: ReadonlyArray<WizardMember>;
  assigneeIds?: string[];
}

export interface ApplyResult {
  blocks: WizardBrick[];
  tagIds: string[];
  title: string;
  listId: string | null;
  /** `YYYY-MM-DD` set by a date question; `undefined` = leave the card's date as it was. */
  dueDay?: string;
  startDay?: string;
  assigneeIds: string[];
}

export const YES = "Sí";
export const NO = "No";

/** The ISO instant of a calendar day at local noon (so the day never shifts with the time zone). */
export function dayToIso(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Fills a card with the wizard answers. Unanswered optional fields change nothing. */
export function applyWizardAnswers(input: ApplyInput): ApplyResult {
  let blocks = input.blocks.map((b) => ({ ...b }));
  let tagIds = [...input.tagIds];
  let baseTitle = input.title;
  let title = input.title;
  let listId = input.listId;
  let dueDay: string | undefined;
  let startDay: string | undefined;
  let assigneeIds = [...(input.assigneeIds ?? [])];
  const byId = new Map(input.allTags.map((t) => [t.id, t]));
  const nameOf = (id: string) => String(byId.get(id)?.name ?? "").trim().toLowerCase();

  for (const step of input.wizard.steps) {
    for (const f of step.fields) {
      const v = input.answers[f.id];
      if (!isAnswered(v)) continue;
      if (f.kind === "tag_group") {
        const group = input.groups.find((g) => g.id === f.groupId);
        if (!group) continue;
        const names = new Set(group.tags.map((n) => n.trim().toLowerCase()));
        tagIds = tagIds.filter((id) => !names.has(nameOf(id))); // the answer replaces what the group had
        for (const id of Array.isArray(v) ? v : [v]) {
          const tag = byId.get(id);
          if (!tag) continue;
          const res = addTagWithRules(tagIds, tag, input.allTags, input.groups);
          if (res.ok) tagIds = res.ids;
        }
      } else if (f.kind === "list") {
        listId = String(v);
      } else if (f.kind === "title") {
        title = `${baseTitle}${String(v).trim()}`;
      } else if (f.kind === "line" && f.key) {
        blocks = setLineInBlocks(blocks, f.key, String(v).trim(), input.makeId);
      } else if (f.kind === "text") {
        blocks = setTextUnderHeading(blocks, f.label, String(v), input.makeId);
      } else if (f.kind === "checklist") {
        const items = (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean);
        blocks = setChecklistUnderHeading(blocks, f.label, items, input.makeId);
      } else if (isMediaKind(f.kind)) {
        blocks = setMediaUnderHeading(blocks, f.label, wizardFiles(v).slice(0, maxFilesOf(f)), f.kind === "image" ? "image" : "file", input.makeId);
      } else if (f.kind === "date") {
        const day = String(v).trim();
        if (f.target === "start") startDay = day;
        else if (f.target === "line" && f.key) blocks = setLineInBlocks(blocks, f.key, day, input.makeId);
        else dueDay = day;
      } else if (f.kind === "assignees") {
        for (const id of Array.isArray(v) ? v : [v]) if (!assigneeIds.includes(id)) assigneeIds.push(id);
      } else if (f.kind === "toggle") {
        if (f.key) blocks = setLineInBlocks(blocks, f.key, v === "yes" ? YES : NO, input.makeId);
      }
    }
  }
  // `{{variable}}` placeholders of the template's title and blocks
  const vars = buildVariables(input.wizard, input.answers, { allTags: input.allTags, groups: input.groups, lists: input.lists ?? [], builtins: input.builtins ?? {}, members: input.members ?? [] });
  title = substitute(title, vars);
  blocks = blocks.map((b) => substituteBrick(b, vars));
  return { blocks, tagIds, title, listId, dueDay, startDay, assigneeIds };
}

const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]{0,30})\s*\}\}/g;

/** Replaces `{{name}}` (case-insensitive) with its value; a placeholder with no value becomes empty. */
export function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_m, name: string) => vars[name.toLowerCase()] ?? "");
}

function substituteBrick(b: WizardBrick, vars: Record<string, string>): WizardBrick {
  const out: WizardBrick = { ...b };
  if (typeof out.markdown === "string") out.markdown = substitute(out.markdown, vars);
  if (Array.isArray(out.items)) out.items = (out.items as Array<Record<string, unknown>>).map((it) => (typeof it.label === "string" ? { ...it, label: substitute(it.label, vars) } : it));
  return out;
}

/** Value of every variable: the wizard's answers by name (tags and states as readable text) and the built-ins. Keys are lower-case. */
export function buildVariables(
  wizard: TemplateWizard,
  answers: WizardAnswers,
  ctx: { allTags: ReadonlyArray<WizardTag>; groups: ReadonlyArray<RuleGroup>; lists: ReadonlyArray<{ id: string; name: string }>; builtins: { date?: string; user?: string; board?: string }; members?: ReadonlyArray<WizardMember> },
): Record<string, string> {
  const vars: Record<string, string> = { date: ctx.builtins.date ?? "", user: ctx.builtins.user ?? "", board: ctx.builtins.board ?? "" };
  const tagById = new Map(ctx.allTags.map((t) => [t.id, t]));
  for (const step of wizard.steps) {
    for (const f of step.fields) {
      if (!f.variable) continue;
      const v = answers[f.id];
      let text = "";
      if (!isAnswered(v)) text = "";
      else if (f.kind === "tag_group") {
        const group = ctx.groups.find((g) => g.id === f.groupId);
        const prefix = group ? new RegExp(`^${esc(group.name)}\\s*:\\s*`, "i") : null;
        text = (Array.isArray(v) ? v : [v]).map((id) => String(tagById.get(id)?.name ?? "")).map((n) => (prefix ? n.replace(prefix, "") : n)).filter(Boolean).join(", ");
      } else if (f.kind === "list") text = ctx.lists.find((l) => l.id === v)?.name ?? "";
      else if (f.kind === "assignees") text = (Array.isArray(v) ? v : [v]).map((id) => ctx.members?.find((m) => m.id === id)?.name ?? "").filter(Boolean).join(", ");
      else if (f.kind === "checklist") text = (Array.isArray(v) ? v : [v]).map((x) => String(x).trim()).filter(Boolean).join(", ");
      else if (f.kind === "toggle") text = v === "yes" ? YES : NO;
      else if (isMediaKind(f.kind)) text = wizardFiles(v).slice(0, maxFilesOf(f)).map(markdownLink).join(", ");
      else text = String(v).trim();
      vars[f.variable.toLowerCase()] = text;
    }
  }
  return vars;
}

/** Sets a `Key: value` line in the blocks: in the block that already has it, else in the first text block, else in a new first one. */
export function setLineInBlocks(blocks: WizardBrick[], key: string, value: string, makeId: () => string): WizardBrick[] {
  const has = (b: WizardBrick) => isText(b) && new RegExp(`^\\s*${esc(key)}\\s*:`, "im").test(String(b.markdown ?? ""));
  if (blocks.some(has)) return blocks.map((b) => (has(b) ? { ...b, markdown: setLine(String(b.markdown ?? ""), key, value) } : b));
  const first = blocks.findIndex(isText);
  if (first >= 0) return blocks.map((b, i) => (i === first ? { ...b, markdown: setLine(String(b.markdown ?? ""), key, value) } : b));
  return [{ id: makeId(), kind: "text", displayStyle: "paragraph", markdown: `${key}: ${value}`, tasks: [] }, ...blocks];
}

/** Puts `items` in the checklist under the heading `label` (replacing its items), adding the checklist or the heading when missing. */
export function setChecklistUnderHeading(blocks: WizardBrick[], label: string, items: string[], makeId: () => string): WizardBrick[] {
  if (items.length === 0) return blocks;
  const list = (): WizardBrick => ({ id: makeId(), kind: "checklist", items: items.map((l) => ({ id: makeId(), label: l, checked: false })) });
  const idx = blocks.findIndex((b) => isHeading(b) && headingText(b) === label.trim().toLowerCase());
  if (idx < 0) return [...blocks, { id: makeId(), kind: "text", displayStyle: "paragraph", markdown: `## ${label}`, tasks: [] }, list()];
  const next = blocks[idx + 1];
  if (next && next.kind === "checklist") return blocks.map((b, i) => (i === idx + 1 ? { ...b, items: items.map((l) => ({ id: makeId(), label: l, checked: false })) } : b));
  return [...blocks.slice(0, idx + 1), list(), ...blocks.slice(idx + 1)];
}

const mdUrl = (url: string) => url.replace(/[()\s]/g, (c) => ({ "(": "%28", ")": "%29" })[c] ?? "%20");
/** `[name](url)`: how an uploaded file reads inside a `{{variable}}` (several are joined with ", "). */
export const markdownLink = (f: WizardFile): string => `[${f.name.replace(/[[\]\\]/g, "\\$&")}](${mdUrl(f.url)})`;

/**
 * Puts the uploaded files of a question in ONE media brick (`image` or `file`; several files become a carousel, as the
 * card's own upload does) under the heading whose text is `label`: it replaces an empty media brick that follows the heading,
 * else goes right after it. Without such a heading, a `## label` heading and the brick are appended. No files change nothing.
 */
export function setMediaUnderHeading(blocks: WizardBrick[], label: string, files: WizardFile[], mediaType: "image" | "file", makeId: () => string): WizardBrick[] {
  if (files.length === 0) return blocks;
  const items = files.map((f) => ({ url: f.url, title: f.name, mimeType: f.mime || null, sizeBytes: f.size || null }));
  const brick = (): WizardBrick => ({
    id: makeId(),
    kind: "media",
    mediaType,
    title: items[0].title,
    url: items[0].url,
    mimeType: items[0].mimeType,
    sizeBytes: items[0].sizeBytes,
    caption: items.length > 1 ? buildMediaCaption({ subtitle: "", items }) : null,
    parentBlockId: null,
  });
  const idx = blocks.findIndex((b) => isHeading(b) && headingText(b) === label.trim().toLowerCase());
  if (idx < 0) return [...blocks, { id: makeId(), kind: "text", displayStyle: "paragraph", markdown: `## ${label}`, tasks: [] }, brick()];
  const next = blocks[idx + 1];
  if (next && next.kind === "media" && !next.url) return blocks.map((b, i) => (i === idx + 1 ? { ...brick(), id: b.id } : b));
  return [...blocks.slice(0, idx + 1), brick(), ...blocks.slice(idx + 1)];
}

/** One step per kind of thing to ask, built from the team tag groups: a classification step (one field per group) and a detail step. */
export function starterWizard(groups: ReadonlyArray<{ id: string; name: string; mode?: string }>, ids: () => string): TemplateWizard {
  const fields: WizardField[] = groups.slice(0, 8).map((g) => ({ id: ids(), kind: "tag_group", label: g.name, required: g.mode === "single", groupId: g.id }));
  const steps: WizardStep[] = [];
  if (fields.length > 0) steps.push({ id: ids(), title: "Clasificación", description: "Elige las etiquetas que describen la tarjeta.", fields });
  steps.push({
    id: ids(),
    title: "Detalle",
    fields: [
      { id: ids(), kind: "title", label: "Nombre", required: true, placeholder: "Qué hay que hacer" },
      { id: ids(), kind: "list", label: "Estado", required: false },
    ],
  });
  return { enabled: true, steps };
}
