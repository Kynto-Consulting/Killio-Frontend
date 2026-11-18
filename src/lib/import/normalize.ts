/**
 * Normalisation for imported spreadsheets. Real files are messy: "POR HACER", "por hacer " and "Por Hacer" are the
 * same status, "#web" and "Web" the same tag, cells carry non-breaking spaces and stray bullets. Everything here is
 * pure and deterministic; nothing is sent to a model.
 */

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u00ad]/g;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Key for comparing labels: no accents, no case, no leading "#", single spaces. */
export const labelKey = (v: string): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Text for descriptions and details: NFC, no invisible/control characters, tidy spaces, at most one blank line in a row. */
export function cleanText(value: string): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(CONTROL, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One-line text for titles and checklist items: also drops list markers ("- ", "• ", "1. ", "[ ] "). */
export function cleanTitle(value: string): string {
  return cleanText(value)
    .replace(/\n+/g, " ")
    .replace(/^(?:[-*•▪◦–—]|\d{1,3}[.)]|\[[ xX]?\])\s+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Display form of a label chosen from its variants: ALL CAPS and all-lowercase become "Sentence case"; short acronyms (QA, UX) stay. */
export function tidyLabel(value: string): string {
  const v = cleanTitle(value).replace(/^#+\s*/, "");
  const letters = v.replace(/[^\p{L}]/gu, "");
  if (!letters) return v;
  const allUpper = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const allLower = letters === letters.toLowerCase() && letters !== letters.toUpperCase();
  if (allUpper && letters.length <= 3) return v;
  if (allUpper || allLower) return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  return v;
}

/** Three-letter words that are acronyms when written in capitals ("WEB" is just shouting, "API" is not). */
const KNOWN_ACRONYMS = new Set(["API", "SEO", "CRM", "ERP", "KPI", "SQL", "CSS", "PDF", "MVP", "SLA", "OKR", "SDK", "CLI", "RRHH"]);

/** Words that mean the same thing in a work-management file. Within one file the most used form wins. */
export const STATUS_GROUPS: string[][] = [
  ["to do", "todo", "por hacer", "pendiente", "pending", "new", "nuevo", "open", "abierto"],
  ["doing", "in progress", "en curso", "en progreso", "wip", "working", "en desarrollo", "started", "iniciado"],
  ["review", "in review", "en revision", "revision", "qa", "testing", "en pruebas", "por revisar"],
  ["done", "hecho", "completado", "completo", "terminado", "finalizado", "complete", "completed", "closed", "cerrado", "listo"],
  ["blocked", "bloqueado", "on hold", "en pausa", "detenido"],
];
export const PRIORITY_GROUPS: string[][] = [
  ["alta", "high", "p1", "importante"],
  ["media", "medium", "normal", "p2"],
  ["baja", "low", "p3", "menor"],
  ["critica", "critical", "blocker", "bloqueante", "p0"],
];

/**
 * Builds a function that maps every variant of a label to one canonical form. Variants that only differ in case,
 * accents, spacing or a leading "#" are merged, and so are the synonym groups given; the most frequent spelling
 * in the data is the one kept (then tidied).
 */
export function canonicalizer(values: string[], groups: string[][] = []): (value: string) => string {
  const groupOf = new Map<string, string>();
  groups.forEach((g, i) => g.forEach((word) => groupOf.set(labelKey(word), `g${i}`)));
  const idOf = (v: string) => {
    const key = labelKey(v);
    return groupOf.get(key) ?? key;
  };

  // group id -> spelling family (same labelKey) -> how often each exact spelling appears
  const groupsSeen = new Map<string, Map<string, Map<string, number>>>();
  for (const raw of values) {
    const v = cleanTitle(raw).replace(/^#+\s*/, "");
    if (!v) continue;
    const id = idOf(v);
    const families = groupsSeen.get(id) ?? new Map<string, Map<string, number>>();
    const family = labelKey(v);
    const forms = families.get(family) ?? new Map<string, number>();
    forms.set(v, (forms.get(v) ?? 0) + 1);
    families.set(family, forms);
    groupsSeen.set(id, families);
  }
  const total = (forms: Map<string, number>) => [...forms.values()].reduce((a, b) => a + b, 0);
  const chosen = new Map<string, string>();
  for (const [id, families] of groupsSeen) {
    // The family used most in the file wins (then the first seen); inside it, the most used spelling,
    // preferring one that already looks tidy.
    const [, forms] = [...families].sort((a, b) => total(b[1]) - total(a[1]))[0];
    // A short ALL-CAPS spelling (QA, UX) is evidence of an acronym and beats "qa"/"Qa".
    const acronym = [...forms.keys()].find((f) => {
      const letters = f.replace(/[^\p{L}]/gu, "");
      return f === f.toUpperCase() && (/^[A-Z]{2}$/.test(letters) || KNOWN_ACRONYMS.has(letters));
    });
    const best = acronym ?? [...forms].sort((a, b) => b[1] - a[1] || Number(tidyLabel(b[0]) === b[0]) - Number(tidyLabel(a[0]) === a[0]))[0][0];
    chosen.set(id, tidyLabel(best));
  }
  return (value: string) => {
    const v = cleanTitle(value).replace(/^#+\s*/, "");
    if (!v) return "";
    return chosen.get(idOf(v)) ?? tidyLabel(v);
  };
}
