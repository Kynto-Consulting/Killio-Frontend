// Pure helpers for the AI Draft Studio "Pedir cambios" (refinement) turn.
// Keep this file free of React so it can be unit-tested with node --test.

/** Fixed hint appended to every refinement turn; backend rule 9 does the heavy lifting. */
export const REFINE_HINT =
  "Es una revisión del trabajo anterior: edita los archivos existentes de tu carpeta, no empieces de cero.";

export function buildRefinementMessage(userText: string): string {
  return `${userText.trim()}\n\n${REFINE_HINT}`;
}

interface PathContent { path: string; content: string }

/** path -> content snapshot taken right before a refinement turn starts. */
export function snapshotContents(files: ReadonlyArray<PathContent>): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.content]));
}

/** Paths that existed in the baseline and whose content now differs. New files are NOT "modified". */
export function detectModifiedPaths(baseline: ReadonlyMap<string, string>, next: ReadonlyArray<PathContent>): string[] {
  const out: string[] = [];
  for (const f of next) {
    if (baseline.has(f.path) && baseline.get(f.path) !== f.content) out.push(f.path);
  }
  return out;
}

/** Copy of `rec` without the given keys (used to put re-written files back to a fresh 'pending' state). */
export function omitKeys<T>(rec: Record<string, T>, keys: ReadonlyArray<string>): Record<string, T> {
  if (keys.length === 0) return rec;
  const drop = new Set(keys);
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) if (!drop.has(k)) out[k] = v;
  return out;
}
