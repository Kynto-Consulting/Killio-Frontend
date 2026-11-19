// Pure helpers of the Draft Studio import (no React, no path aliases, so they run under `node --test`).
//
// `.kt` card templates and `.kg` tag groups are not created by the browser: they go to POST /agent/import-draft, which
// parses them with the REST cleaners and creates them through the existing services. Order matters across files:
// a tag group must exist before a template whose wizard asks about it, and a template may name a board that a `.kb`
// of the same import creates, so groups go first, templates last.

export type DraftEntityKind = "kt" | "kg";

export const isDraftEntityKind = (kind: string): kind is DraftEntityKind => kind === "kt" || kind === "kg";

/** Import rank: tag groups, then everything else, then card templates. */
export const importRank = (kind: string): number => (kind === "kg" ? 0 : kind === "kt" ? 2 : 1);

/** Stable sort of the files to import (ties keep the order the agent wrote them in). */
export function orderForImport<T extends { kind: string }>(files: readonly T[]): T[] {
  return files.map((f, i) => ({ f, i })).sort((a, b) => importRank(a.f.kind) - importRank(b.f.kind) || a.i - b.i).map((x) => x.f);
}

export interface DraftEntityResult {
  status: "created" | "skipped" | "error";
  message: string;
  warnings?: string[];
  id?: string;
}

export interface DraftEntityOutcome {
  /** `skipped` = the name already existed: nothing was created and nothing was changed. */
  status: "created" | "skipped";
  message: string;
  warnings: string[];
  id?: string;
}

/** The server's verdict for one file: an `error` becomes a thrown Error carrying the server's sentence. */
export function outcomeOf(result: DraftEntityResult | undefined): DraftEntityOutcome {
  if (!result) throw new Error("The server returned no result for this file.");
  if (result.status === "error") throw new Error(result.message || "Import failed");
  return { status: result.status, message: result.message, warnings: result.warnings ?? [], id: result.id };
}
