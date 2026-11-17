/**
 * Table import: what the backend analysis returns (sheets, columns and the AI-written "plan" saying what each
 * column means) and the pure functions that turn rows into tasks. The AI only classifies; every row is handled
 * here, by code, so a 5,000-row sheet costs one small model call.
 */

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
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

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

let blockSeq = 0;
const itemId = () => `imp-${Date.now().toString(36)}-${(blockSeq++).toString(36)}`;

export function buildCardDrafts(sheet: ImportSheet, plan: ImportPlan, members: MemberLike[]): DraftResult {
  const used = new Set<number>(
    [plan.title, plan.list, plan.checklist, plan.assignee, plan.dueDate, plan.priority, plan.tags, plan.email].filter((n): n is number => n !== null),
  );
  plan.description.forEach((i) => used.add(i));
  plan.ignore.forEach((i) => used.add(i));
  const detailColumns = sheet.headers.map((_, i) => i).filter((i) => !used.has(i));

  const unmatched = new Set<string>();
  let badDates = 0;
  let skippedEmpty = 0;
  const cards: CardDraft[] = [];

  for (const row of sheet.rows) {
    const cell = (i: number | null) => (i === null ? "" : String(row[i] ?? "").trim());
    const title = cell(plan.title).replace(/\s+/g, " ");
    if (!title) {
      skippedEmpty++;
      continue;
    }

    const blocks: CardBlock[] = [];
    const description = plan.description.map((i) => cell(i)).filter(Boolean).join("\n\n");
    if (description) blocks.push({ kind: "text", displayStyle: "paragraph", markdown: description });

    const details = detailColumns
      .map((i) => (cell(i) ? `**${sheet.headers[i]}:** ${cell(i).replace(/\n+/g, " ")}` : ""))
      .filter(Boolean);
    if (details.length) blocks.push({ kind: "text", displayStyle: "paragraph", markdown: details.join("\n\n") });

    const steps = plan.checklist === null ? [] : cell(plan.checklist).split(/[;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (steps.length) blocks.push({ kind: "checklist", items: steps.map((label) => ({ id: itemId(), label, checked: false })) });

    const assigneeIds: string[] = [];
    for (const who of splitMulti(cell(plan.assignee))) {
      const member = matchMember(who, members);
      if (member) {
        const id = memberKey(member);
        if (!assigneeIds.includes(id)) assigneeIds.push(id);
      } else {
        unmatched.add(who);
      }
    }

    let dueAt: string | undefined;
    const rawDue = cell(plan.dueDate);
    if (rawDue) {
      const iso = parseDueDate(rawDue);
      if (iso) dueAt = iso;
      else badDates++;
    }

    const tagNames = [...splitMulti(cell(plan.tags)), ...splitMulti(cell(plan.priority))];
    cards.push({ title, listName: cell(plan.list) || null, dueAt, tagNames: [...new Set(tagNames)], assigneeIds, blocks });
  }
  return { cards, skippedEmpty, unmatchedAssignees: [...unmatched], badDates };
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
