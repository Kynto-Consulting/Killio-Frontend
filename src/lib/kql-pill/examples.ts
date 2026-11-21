/** Example scripts of the KQL syntax guide (the lines under "Examples:"), without their `-- comments`. */
export function kqlGuideExamples(guide: string, max = 8): string[] {
  const idx = guide.lastIndexOf("Examples:");
  if (idx < 0) return [];
  const lines = guide.slice(idx).split(/\r?\n/).slice(1);
  const out: string[] = [];
  for (const line of lines) {
    if (!/^\s{2,}\S/.test(line)) continue;
    const code = line.replace(/\s+--.*$/, "").trim();
    if (code) out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

/** Pill-friendly starters shown before the guide examples. */
export const KQL_PILL_STARTERS: ReadonlyArray<{ script: string; mode: "value" | "list" | "table" | "count" }> = [
  { script: "cards where overdue count", mode: "value" },
  { script: "cards where overdue select title order by due limit 5", mode: "list" },
  { script: "cards where list = \"Done\" group by assignee count", mode: "table" },
];
