/**
 * Table import: what the backend analysis returns (sheets, columns and the AI-written "plan" saying what each
 * column means) and the pure functions that turn rows into tasks. The AI only classifies; every row is handled
 * here, by code, so a 5,000-row sheet costs one small model call.
 */

import { PRIORITY_GROUPS, STATUS_GROUPS, canonicalizer, cleanText, cleanTitle } from "./normalize.ts";

export type ColumnType = "number" | "date" | "boolean" | "email" | "url" | "text";
export type ImportEntity = "cards" | "boards" | "documents" | "people" | "skip";

export interface ImportColumn {
  index: number;
  header: string;
  type: ColumnType;
  distinct: number;
  categorical: boolean;
}

export interface ImportPlan {
  entity: ImportEntity;
  title: number | null;
  description: number[];
  list: number | null;
  checklist: number | null;
  ignore: number[];
  assignee: number | null;
  dueDate: number | null;
  priority: number | null;
  tags: number | null;
  email: number | null;
  checks: number[];
  source: "ai" | "heuristic";
}

export interface ImportSheet {
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
  columns: ImportColumn[];
  plan: ImportPlan;
}

export interface ImportAnalysis {
  fileName: string;
  sheets: ImportSheet[];
  aiUsed: boolean;
}

export interface MemberLike {
  userId?: string;
  id: string;
  name?: string | null;
  alias?: string | null;
  displayName?: string | null;
  primaryEmail?: string | null;
  email?: string | null;
}

export interface CardBlock {
  kind: "text" | "checklist";
  displayStyle?: "paragraph";
  markdown?: string;
  items?: Array<{ id: string; label: string; checked: boolean }>;
}

export interface CardDraft {
  title: string;
  listName: string | null;
  dueAt?: string;
  tagNames: string[];
  assigneeIds: string[];
  blocks: CardBlock[];
}

export interface DraftResult {
  cards: CardDraft[];
  skippedEmpty: number;
  unmatchedAssignees: string[];
  badDates: number;
}

// ── Small value helpers ──────────────────────────────────────────────────────

export const normalize = (v: string): string =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** "web, diseño; ux / mobile" -> ["web","diseño","ux","mobile"] (case-insensitive de-duplication). */
export function splitMulti(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(value ?? "").split(/[,;|\n/]+/)) {
    const v = part.trim();
    if (!v) continue;
    const key = normalize(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** ISO date (UTC midnight) from "2025-03-01", "01/03/2025", "1-3-25"… Day-first unless the first number cannot be a day. */
export function parseDueDate(value: string): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    y = Number(match[3]);
    if (y < 100) y += 2000;
    // 03/25/2025 can only be month-first; anything ambiguous is read day-first (the convention in LatAm/EU).
    [d, m] = a > 12 && b <= 12 ? [a, b] : b > 12 && a <= 12 ? [b, a] : [a, b];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

/** Finds a member by email (exact) or by name/alias (accent- and case-insensitive). */
export function matchMember(value: string, members: MemberLike[]): MemberLike | null {
  const v = normalize(value);
  if (!v) return null;
  const byEmail = members.find((m) => normalize(m.primaryEmail ?? m.email ?? "") === v);
  if (byEmail) return byEmail;
  return members.find((m) => [m.name, m.alias, m.displayName].some((n) => n && normalize(n) === v)) ?? null;
}

const memberKey = (m: MemberLike) => m.userId ?? m.id;

// ── Rows -> cards ────────────────────────────────────────────────────────────

const TRUTHY = /^(true|yes|y|si|sí|x|✓|✔|1|verdadero)$/i;
let blockSeq = 0;
const itemId = () => `imp-${Date.now().toString(36)}-${(blockSeq++).toString(36)}`;

/** Ticket keys: PROJECT-123 (project in capitals, optional digits). */
const TICKET_KEY = /\b[A-Z][A-Z0-9]{1,9}-\d{1,7}\b/g;
/** Look like ticket keys but are not (encodings, standards, hashes, ...). */
const NOT_PROJECTS = new Set(["UTF", "ISO", "SHA", "AES", "RSA", "TLS", "SSL", "RFC", "UTC", "GMT", "COVID", "IPV", "HTTP", "TCP", "UDP", "MD", "RGB", "CMYK", "USB", "WPA", "GPT", "IEEE", "ASCII"]);
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()\[\]"']+[^\s<>()\[\]"'.,;:!?]/g;

/**
 * Makes what can be clicked clickable: URLs in a cell become links and, when the deployment knows where its tickets
 * live, so do ticket keys ("TRP-261" -> a link to the ticket). Text that is already a markdown link is left alone.
 */
export function linkify(value: string, ticketBaseUrl?: string | null): string {
  if (!value) return value;
  const parts = value.split(/(\[[^\]]*\]\([^)]*\))/); // keep existing [text](url) intact
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let out = part.replace(URL_IN_TEXT, (url) => `[${url}](${url})`);
      if (ticketBaseUrl) {
        const base = ticketBaseUrl.endsWith("/") ? ticketBaseUrl : `${ticketBaseUrl}/`;
        // Keys inside a URL we just wrapped must not be wrapped again: only touch text outside the [..](..) pairs.
        out = out
          .split(/(\[[^\]]*\]\([^)]*\))/)
          .map((seg, j) => (j % 2 === 1 ? seg : seg.replace(TICKET_KEY, (key) => (NOT_PROJECTS.has(key.slice(0, key.indexOf("-"))) ? key : `[${key}](${base}${key})`))))
          .join("");
      }
      return out;
    })
    .join("");
}

export interface DraftOptions {
  /** e.g. "https://acme.atlassian.net/browse/": ticket keys in cells link to base + key. */
  ticketBaseUrl?: string | null;
}

export function buildCardDrafts(sheet: ImportSheet, plan: ImportPlan, members: MemberLike[], options: DraftOptions = {}): DraftResult {
  const link = (text: string) => linkify(text, options.ticketBaseUrl);
  const used = new Set<number>(
    [plan.title, plan.list, plan.checklist, plan.assignee, plan.dueDate, plan.priority, plan.tags, plan.email].filter((n): n is number => n !== null),
  );
  plan.description.forEach((i) => used.add(i));
  plan.ignore.forEach((i) => used.add(i));
  (plan.checks ?? []).forEach((i) => used.add(i));
  const detailColumns = sheet.headers.map((_, i) => i).filter((i) => !used.has(i));

  // A "description" column holds prose only if its header says so or its cells are long; short values (a module, a
  // severity, "1000 web") would lose their meaning pasted into a paragraph, so they are kept as labelled details.
  const average = (i: number) => {
    const cells = sheet.rows.map((r) => String(r[i] ?? "").trim()).filter(Boolean);
    return cells.length ? cells.reduce((n, c) => n + c.length, 0) / cells.length : 0;
  };
  const PROSE_HEADER = /(descripci|description|detalle|detail|nota|note|comentari|comment|observaci|requisit|contenido|content|body)/i;
  const proseColumns = plan.description.filter((i) => PROSE_HEADER.test(sheet.headers[i]) || average(i) >= 60);
  const labelledDescription = plan.description.filter((i) => !proseColumns.includes(i));

  // One canonical spelling per status / tag / priority across the whole sheet ("POR HACER" = "por hacer ").
  const column = (i: number | null) => (i === null ? [] : sheet.rows.map((r) => String(r[i] ?? "")));
  const statusOf = canonicalizer(column(plan.list), STATUS_GROUPS);
  const tagOf = canonicalizer(plan.tags === null ? [] : column(plan.tags).flatMap(splitMulti));
  const priorityText = (v: string) => (/^\d+$/.test(v.trim()) ? `${cleanTitle(sheet.headers[plan.priority!])} ${v.trim()}` : v);
  const priorityOf = canonicalizer(plan.priority === null ? [] : column(plan.priority).flatMap((v) => splitMulti(priorityText(v))), PRIORITY_GROUPS);

  const unmatched = new Map<string, string>(); // normalised name -> first spelling ("Ti" and "TI" are one entry)
  let badDates = 0;
  let skippedEmpty = 0;
  const cards: CardDraft[] = [];

  for (const row of sheet.rows) {
    const cell = (i: number | null) => (i === null ? "" : String(row[i] ?? "").trim());
    const title = cleanTitle(cell(plan.title));
    if (!title) {
      skippedEmpty++;
      continue;
    }

    const blocks: CardBlock[] = [];
    // One prose column reads as the description; several are told apart by their header.
    const description = proseColumns
      .map((i) => (cleanText(cell(i)) ? (proseColumns.length > 1 ? `**${cleanTitle(sheet.headers[i])}**\n\n${link(cleanText(cell(i)))}` : link(cleanText(cell(i)))) : ""))
      .filter(Boolean)
      .join("\n\n");
    if (description) blocks.push({ kind: "text", displayStyle: "paragraph", markdown: description });

    const rawDue = cell(plan.dueDate);
    const dueIso = rawDue ? parseDueDate(rawDue) : null;
    const details = [...labelledDescription, ...detailColumns]
      .map((i) => (cleanText(cell(i)) ? `**${cleanTitle(sheet.headers[i])}:** ${link(cleanText(cell(i)).replace(/\n+/g, " "))}` : ""))
      .filter(Boolean);
    // A due date that cannot be read is not thrown away: it stays visible in the card.
    if (rawDue && !dueIso) details.push(`**${cleanTitle(sheet.headers[plan.dueDate!])}:** ${cleanText(rawDue)}`);
    if (details.length) blocks.push({ kind: "text", displayStyle: "paragraph", markdown: details.join("\n\n") });

    const steps = plan.checklist === null ? [] : cell(plan.checklist).split(/[;\n]+/).map(cleanTitle).filter(Boolean);
    // Yes/No columns ("Validado en TEST") become checklist items named like the column, checked when true.
    const checks = (plan.checks ?? []).filter((i) => cell(i) !== "").map((i) => ({ id: itemId(), label: cleanTitle(sheet.headers[i]), checked: TRUTHY.test(cell(i)) }));
    const items = [...steps.map((label) => ({ id: itemId(), label, checked: false })), ...checks];
    if (items.length) blocks.push({ kind: "checklist", items });

    const assigneeIds: string[] = [];
    for (const who of splitMulti(cell(plan.assignee))) {
      const member = matchMember(who, members);
      if (member) {
        const id = memberKey(member);
        if (!assigneeIds.includes(id)) assigneeIds.push(id);
      } else {
        if (!unmatched.has(normalize(who))) unmatched.set(normalize(who), who);
      }
    }

    let dueAt: string | undefined;
    if (rawDue) {
      if (dueIso) dueAt = dueIso;
      else badDates++;
    }

    // A numeric priority ("3") means nothing alone: "Prioridad 3".
    const priorityLabel = (v: string) => (/^\d+$/.test(v.trim()) ? `${cleanTitle(sheet.headers[plan.priority!])} ${v.trim()}` : v);
    const tagNames = [...splitMulti(cell(plan.tags)).map(tagOf), ...splitMulti(priorityLabel(cell(plan.priority))).map(priorityOf)];
    const uniqueTags = [...new Map(tagNames.filter(Boolean).map((n) => [normalize(n), n])).values()];
    cards.push({ title, listName: statusOf(cell(plan.list)) || null, dueAt, tagNames: uniqueTags, assigneeIds, blocks });
  }
  return { cards, skippedEmpty, unmatchedAssignees: [...unmatched.values()], badDates };
}

/** Distinct values in order of first appearance. */
export function distinctInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = normalize(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
}

// ── Backend call ─────────────────────────────────────────────────────────────

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function analyzeTableFile(
  file: File,
  target: { scope: "team" | "board" | "list" | "personal"; scopeId: string },
  accessToken: string,
): Promise<ImportAnalysis> {
  const form = new FormData();
  form.append("file", file);
  form.append("scopeId", target.scopeId);
  const res = await fetch(`${API}/ai/scope/${target.scope}/import-table`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    let message = "";
    try {
      message = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(message || `Import failed (${res.status})`);
  }
  return (await res.json()) as ImportAnalysis;
}
