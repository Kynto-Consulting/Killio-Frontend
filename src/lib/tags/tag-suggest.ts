/**
 * Predictive helpers of the tag picker: which colours fit a tag being typed and which group it most likely belongs to.
 * Pure pattern matching over what the workspace already has (group prefix, similar names, keywords), no network.
 */

export interface SuggestTag {
  name?: string | null;
  color?: string | null;
}
export interface SuggestGroup {
  id: string;
  name: string;
  tags: string[];
}
export interface ColorSuggestion {
  color: string;
  reason: "group" | "similar" | "keyword";
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export const hexOf = (raw?: string | null): string | null => {
  if (!raw) return null;
  const h = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null;
};

/** Splits `Group: Value`; `group` is null when the text has no prefix. */
export function splitGroupedName(text: string): { group: string | null; value: string } {
  const i = text.indexOf(":");
  if (i <= 0) return { group: null, value: text.trim() };
  return { group: text.slice(0, i).trim() || null, value: text.slice(i + 1).trim() };
}

/** Full tag name for a value created inside a group: `Fuente` + `Aquiles` → `Fuente: Aquiles`. */
export function qualifyTagName(groupName: string | null | undefined, text: string): string {
  const { group, value } = splitGroupedName(text);
  if (!groupName) return text.trim();
  if (group && norm(group) === norm(groupName)) return `${groupName}: ${value}`;
  return `${groupName}: ${group ? text.trim() : value}`;
}

const KEYWORDS: Array<{ color: string; words: string[] }> = [
  { color: "#ef4444", words: ["urgente", "critico", "bloqueado", "bug", "error", "riesgo", "alto", "urgent", "blocked", "critical", "risk", "high", "incidente"] },
  { color: "#f59e0b", words: ["pendiente", "espera", "revision", "medio", "media", "advertencia", "pending", "waiting", "review", "medium", "warning"] },
  { color: "#22c55e", words: ["listo", "hecho", "realizado", "aprobado", "ok", "bajo", "baja", "done", "approved", "low", "completado", "calidad"] },
  { color: "#06b6d4", words: ["info", "idea", "nota", "investigacion", "research", "docs", "documentacion", "soporte", "support"] },
  { color: "#3b82f6", words: ["feature", "mejora", "proyecto", "desarrollo", "dev", "ti", "tecnologia", "digital", "producto", "product"] },
  { color: "#8b5cf6", words: ["diseno", "design", "ux", "marketing", "innovacion", "innovation", "estrategia", "direccion"] },
  { color: "#ec4899", words: ["comercial", "ventas", "sales", "cliente", "customer", "evento", "event", "corporativo"] },
];

const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let hit = 0;
  for (const x of ta) if (tb.some((y) => y === x || (x.length > 3 && (y.startsWith(x) || x.startsWith(y))))) hit += 1;
  return hit / Math.max(ta.length, tb.length);
}

/**
 * Ranked colours for a new tag: the colour its group already uses most, colours of similarly named tags, then keyword
 * rules. Unique, at most `limit`. The caller shows the base palette after these.
 */
export function suggestTagColors(text: string, tags: ReadonlyArray<SuggestTag>, groups: ReadonlyArray<SuggestGroup>, limit = 3): ColorSuggestion[] {
  const out: ColorSuggestion[] = [];
  const push = (color: string | null, reason: ColorSuggestion["reason"]) => {
    if (color && out.length < limit && !out.some((o) => o.color === color)) out.push({ color, reason });
  };
  const { group, value } = splitGroupedName(text);

  const target = group ? groups.find((g) => norm(g.name) === norm(group)) : undefined;
  const prefix = group ? norm(group) : null;
  const siblings = tags.filter((t) => {
    const n = norm(t.name);
    if (target && target.tags.some((x) => norm(x) === n)) return true;
    return prefix ? n.startsWith(`${prefix}:`) : false;
  });
  const counts = new Map<string, number>();
  for (const t of siblings) {
    const c = hexOf(t.color);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([c]) => push(c, "group"));

  const probe = value || text;
  tags
    .map((t) => ({ t, s: similarity(probe, splitGroupedName(String(t.name ?? "")).value) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .forEach((x) => push(hexOf(x.t.color), "similar"));

  const words = tokens(probe);
  for (const rule of KEYWORDS) if (rule.words.some((w) => words.includes(w))) push(rule.color, "keyword");
  return out;
}

export interface GroupSuggestion {
  group: SuggestGroup;
  reason: "prefix" | "similar";
}

/** Groups ordered by how likely the typed text belongs to them (typed prefix first, then similar existing values). */
export function suggestGroups(text: string, groups: ReadonlyArray<SuggestGroup>): GroupSuggestion[] {
  const { group, value } = splitGroupedName(text);
  const res: GroupSuggestion[] = [];
  if (group) {
    for (const g of groups) if (norm(g.name) === norm(group)) res.push({ group: g, reason: "prefix" });
  }
  const probe = value || text;
  groups
    .filter((g) => !res.some((r) => r.group.id === g.id))
    .map((g) => ({ g, s: Math.max(0, ...g.tags.map((t) => similarity(probe, splitGroupedName(t).value))) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)
    .forEach((x) => res.push({ group: x.g, reason: "similar" }));
  return res;
}
