/**
 * Pure helpers of the "update an installed pack" UI. No React and no DOM, so everything runs under
 * `node --experimental-strip-types --test`.
 */

export type PlanItemLike = {
  logicalKey: string;
  assetType: string;
  name: string | null;
  decision: "add" | "apply" | "conflict" | "keep_content" | "keep_removed" | "skip_missing" | "skip_locked" | "noop";
  overwritable: boolean;
  fields: string[];
};

/** What the person sees, in the order that matters: what needs a decision first. */
export const PLAN_SECTIONS = ["conflicts", "updated", "added", "keptContent", "removed", "skipped"] as const;
export type PlanSection = (typeof PLAN_SECTIONS)[number];

export function sectionOf(item: Pick<PlanItemLike, "decision">): PlanSection | null {
  switch (item.decision) {
    case "conflict": return "conflicts";
    case "apply": return "updated";
    case "add": return "added";
    case "keep_content": return "keptContent";
    case "keep_removed": return "removed";
    case "skip_missing":
    case "skip_locked": return "skipped";
    default: return null; // noop: nothing to show
  }
}

/** Items by section (empty sections are omitted), each section sorted by asset type then name. */
export function groupPlan<T extends PlanItemLike>(items: T[]): Array<{ section: PlanSection; items: T[] }> {
  const buckets = new Map<PlanSection, T[]>();
  for (const item of items) {
    const section = sectionOf(item);
    if (!section) continue;
    buckets.set(section, [...(buckets.get(section) ?? []), item]);
  }
  return PLAN_SECTIONS.filter((s) => buckets.has(s)).map((section) => ({
    section,
    items: [...(buckets.get(section) as T[])].sort((a, b) => a.assetType.localeCompare(b.assetType) || (a.name ?? a.logicalKey).localeCompare(b.name ?? b.logicalKey)),
  }));
}

/** The logical keys to send as `overwrite`: only conflicts the person ticked (never anything else, even if it was selected before). */
export function overwritePayload(selected: ReadonlySet<string>, items: PlanItemLike[]): string[] {
  return items.filter((i) => i.decision === "conflict" && i.overwritable && selected.has(i.logicalKey)).map((i) => i.logicalKey);
}

export type VersionLabel = { from: string; to: string; revision: boolean };

/** `v1 -> v2`; when both are the same version string the pack was revised in place (official packs): shown as a revision. */
export function versionLabel(installed: string, latest: string | null | undefined): VersionLabel {
  const to = latest || installed;
  return { from: installed, to, revision: to === installed };
}

export type ResultCounts = { added: number; updated: number; kept: number; skipped: number; conflict: number; error: number; unchanged: number };

export function countResults(results: Array<{ status: keyof ResultCounts }>): ResultCounts {
  const out: ResultCounts = { added: 0, updated: 0, kept: 0, skipped: 0, conflict: 0, error: 0, unchanged: 0 };
  for (const r of results) out[r.status] += 1;
  return out;
}

/** Results worth listing (everything that is not "nothing happened"), problems first. */
export function reportableResults<T extends { status: string; assetType: string; name: string | null; logicalKey: string }>(results: T[]): T[] {
  const rank: Record<string, number> = { error: 0, conflict: 1, skipped: 2, updated: 3, added: 4, kept: 5 };
  return results
    .filter((r) => r.status !== "unchanged")
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.assetType.localeCompare(b.assetType) || (a.name ?? a.logicalKey).localeCompare(b.name ?? b.logicalKey));
}

/** Is there something to apply? A plan with only conflicts and kept content writes nothing unless something is overwritten. */
export function hasWork(summary: { added: number; updated: number }, overwriteCount: number): boolean {
  return summary.added > 0 || summary.updated > 0 || overwriteCount > 0;
}

/** Short badge text of an install row: what the person should know at a glance. */
export type InstallStatus = "update" | "upToDate" | "check" | "unavailable" | "conflicts";

export function installStatus(entry: { updateAvailable: boolean | null; reason: string | null; pending: { conflicts: number } | null }): InstallStatus {
  if (entry.updateAvailable === true) return "update";
  if (entry.updateAvailable === null) return "check";
  if (entry.reason === "pack_unavailable" || entry.reason === "check_failed") return "unavailable";
  if ((entry.pending?.conflicts ?? 0) > 0) return "conflicts";
  return "upToDate";
}

/** Values of the missing placeholders typed by the person, ready for the API (empty ones are left out). */
export function placeholderPayload(inputs: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(inputs)) if (raw.trim() !== "") out[key] = raw;
  return out;
}
