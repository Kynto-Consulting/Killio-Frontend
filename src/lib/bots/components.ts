/**
 * Interactive components of a bot message (buttons and selects): model, the backend's limits as editor validation, reading what
 * the server stored, and the state machine of a press (idle / loading / error / expired). Pure, tested in components.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-rich.ts (sanitizeComponents, COMPONENT_LIMITS) and
 * bot-interactions.service.ts (POST /rooms/:id/messages/:mid/interact -> 202, 400/404/409/410/429).
 */
import { hasTemplate } from "./rich.ts";

export const COMPONENT_LIMITS = {
  maxRows: 5,
  maxButtonsPerRow: 5,
  maxSelectOptions: 25,
  maxCustomIdLength: 100,
  maxLabelLength: 80,
  maxOptionValueLength: 100,
  maxOptionDescriptionLength: 100,
  maxPlaceholderLength: 150,
  minExpiresMinutes: 1,
  maxExpiresMinutes: 7 * 24 * 60,
  defaultExpiresMinutes: 24 * 60,
} as const;

export const BUTTON_STYLES = ["primary", "secondary", "success", "danger", "link"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export interface ButtonComponent { type: "button"; label: string; style: ButtonStyle; customId?: string; url?: string; disabled?: boolean; emoji?: string }
export interface SelectOption { label: string; value: string; description?: string; default?: boolean }
export interface SelectComponent { type: "select"; customId: string; placeholder?: string; options: SelectOption[]; minValues: number; maxValues: number; disabled?: boolean }
export type Component = ButtonComponent | SelectComponent;
export interface ComponentRow { components: Component[] }

export const CUSTOM_ID_RE = /^[A-Za-z0-9_.:\-/]{1,100}$/;

export type ComponentIssueCode =
  | "too_many_rows" | "row_empty" | "select_alone" | "too_many_buttons" | "type_invalid" | "style_invalid"
  | "label_required" | "label_long" | "custom_id_required" | "custom_id_invalid" | "custom_id_duplicate"
  | "link_url" | "link_custom_id" | "url_extra" | "options_empty" | "options_many"
  | "option_label" | "option_value" | "option_value_duplicate" | "option_description_long" | "values_range" | "placeholder_long" | "expires_range";

export interface ComponentIssue {
  /** `[]` = the whole list, `[1]` = second row, `[1, 0]` = first component of it, `[1, 0, 3]` = fourth option of that select. */
  at: number[];
  code: ComponentIssueCode;
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Validates rows like the backend (templated strings are not measured: they only become a value when the run renders them). */
export function validateComponents(rows: unknown, expiresInMinutes?: unknown): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (expiresInMinutes !== undefined && expiresInMinutes !== null && expiresInMinutes !== "") {
    const m = Number(expiresInMinutes);
    if (!Number.isFinite(m) || m < COMPONENT_LIMITS.minExpiresMinutes || m > COMPONENT_LIMITS.maxExpiresMinutes) out.push({ at: [], code: "expires_range" });
  }
  if (rows === undefined || rows === null) return out;
  if (!Array.isArray(rows)) return [...out, { at: [], code: "too_many_rows" }];
  if (rows.length > COMPONENT_LIMITS.maxRows) out.push({ at: [], code: "too_many_rows" });
  const seen = new Set<string>();
  rows.forEach((row: any, r) => {
    const list = Array.isArray(row) ? row : row?.components;
    if (!Array.isArray(list) || list.length === 0) return void out.push({ at: [r], code: "row_empty" });
    const hasSelect = list.some((c: any) => s(c?.type).toLowerCase() === "select");
    if (hasSelect && list.length !== 1) out.push({ at: [r], code: "select_alone" });
    if (list.length > COMPONENT_LIMITS.maxButtonsPerRow) out.push({ at: [r], code: "too_many_buttons" });
    list.forEach((c: any, i: number) => {
      const at = [r, i];
      const type = s(c?.type).toLowerCase();
      const customId = (required: boolean) => {
        const v = s(c?.customId);
        if (!v) return void (required && out.push({ at, code: "custom_id_required" }));
        if (!hasTemplate(v) && (!CUSTOM_ID_RE.test(v) || v.length > COMPONENT_LIMITS.maxCustomIdLength)) out.push({ at, code: "custom_id_invalid" });
        if (seen.has(v)) out.push({ at, code: "custom_id_duplicate" });
        seen.add(v);
      };
      if (type === "button") {
        const style = s(c?.style || "secondary").toLowerCase();
        if (!(BUTTON_STYLES as readonly string[]).includes(style)) out.push({ at, code: "style_invalid" });
        const label = s(c?.label).trim();
        if (!label) out.push({ at, code: "label_required" });
        else if (!hasTemplate(label) && label.length > COMPONENT_LIMITS.maxLabelLength) out.push({ at, code: "label_long" });
        if (style === "link") {
          if (c?.customId) out.push({ at, code: "link_custom_id" });
          const url = s(c?.url).trim();
          if (!url || (!hasTemplate(url) && !/^https:\/\/[^\s<>"']+$/i.test(url))) out.push({ at, code: "link_url" });
        } else {
          if (c?.url) out.push({ at, code: "url_extra" });
          customId(true);
        }
      } else if (type === "select") {
        customId(true);
        const opts = Array.isArray(c?.options) ? c.options : [];
        if (opts.length === 0) out.push({ at, code: "options_empty" });
        if (opts.length > COMPONENT_LIMITS.maxSelectOptions) out.push({ at, code: "options_many" });
        const values = new Set<string>();
        opts.forEach((o: any, k: number) => {
          const oat = [r, i, k];
          const label = s(o?.label).trim();
          const value = s(o?.value).trim();
          if (!label || (!hasTemplate(label) && label.length > COMPONENT_LIMITS.maxLabelLength)) out.push({ at: oat, code: "option_label" });
          if (!value || (!hasTemplate(value) && value.length > COMPONENT_LIMITS.maxOptionValueLength)) out.push({ at: oat, code: "option_value" });
          else if (values.has(value)) out.push({ at: oat, code: "option_value_duplicate" });
          values.add(value);
          if (!hasTemplate(o?.description) && s(o?.description).length > COMPONENT_LIMITS.maxOptionDescriptionLength) out.push({ at: oat, code: "option_description_long" });
        });
        const min = c?.minValues === undefined ? 1 : Number(c.minValues);
        const max = c?.maxValues === undefined ? 1 : Number(c.maxValues);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > opts.length || min > max) out.push({ at, code: "values_range" });
        if (!hasTemplate(c?.placeholder) && s(c?.placeholder).length > COMPONENT_LIMITS.maxPlaceholderLength) out.push({ at, code: "placeholder_long" });
      } else {
        out.push({ at, code: "type_invalid" });
      }
    });
  });
  return out;
}

export const componentIssuesAt = (issues: readonly ComponentIssue[], at: readonly number[]): ComponentIssue[] => {
  const key = at.join(".");
  return issues.filter((i) => i.at.join(".") === key);
};

export const blankButton = (index = 0): ButtonComponent => ({ type: "button", label: "", style: "primary", customId: `btn_${index + 1}` });
export const blankSelect = (index = 0): SelectComponent => ({ type: "select", customId: `select_${index + 1}`, placeholder: "", options: [{ label: "", value: "" }], minValues: 1, maxValues: 1 });

/** Rows the editor edits (always the `{ components: [...] }` form). */
export function toRows(raw: unknown): ComponentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => ({ components: Array.isArray(r) ? r : Array.isArray(r?.components) ? r.components : [] }));
}

/** Drops empty optional fields so the stored config stays small and the backend sees only what was set. */
export function componentsPayload(rows: readonly ComponentRow[]): ComponentRow[] {
  return rows.map((row) => ({
    components: row.components.map((c): Component => {
      if (c.type === "button") {
        const b: ButtonComponent = { type: "button", label: c.label, style: c.style };
        if (c.style === "link") b.url = c.url ?? "";
        else b.customId = c.customId ?? "";
        if (c.disabled) b.disabled = true;
        if (c.emoji?.trim()) b.emoji = c.emoji.trim();
        return b;
      }
      const sel: SelectComponent = { type: "select", customId: c.customId, options: c.options.map((o) => ({ label: o.label, value: o.value, ...(o.description?.trim() ? { description: o.description.trim() } : {}), ...(o.default ? { default: true } : {}) })), minValues: c.minValues, maxValues: c.maxValues };
      if (c.placeholder?.trim()) sel.placeholder = c.placeholder.trim();
      if (c.disabled) sel.disabled = true;
      return sel;
    }),
  }));
}

/* ── reading what the server stored (renderer) ── */

const isStyle = (v: unknown): v is ButtonStyle => (BUTTON_STYLES as readonly string[]).includes(String(v));

/** Tolerant reader of `metadata.components.rows`: unknown pieces are dropped, limits re-applied. */
export function readComponentRows(raw: unknown): ComponentRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ComponentRow[] = [];
  for (const r of raw.slice(0, COMPONENT_LIMITS.maxRows)) {
    const list = Array.isArray(r) ? r : (r as any)?.components;
    if (!Array.isArray(list)) continue;
    const comps: Component[] = [];
    for (const c of list.slice(0, COMPONENT_LIMITS.maxButtonsPerRow)) {
      if (!c || typeof c !== "object") continue;
      if (c.type === "button" && typeof c.label === "string") {
        const style = isStyle(c.style) ? c.style : "secondary";
        comps.push({ type: "button", label: c.label, style, customId: typeof c.customId === "string" ? c.customId : undefined, url: typeof c.url === "string" ? c.url : undefined, disabled: c.disabled === true, emoji: typeof c.emoji === "string" ? c.emoji : undefined });
      } else if (c.type === "select" && typeof c.customId === "string" && Array.isArray(c.options)) {
        const options: SelectOption[] = c.options.filter((o: any) => o && typeof o.label === "string" && typeof o.value === "string").slice(0, COMPONENT_LIMITS.maxSelectOptions).map((o: any) => ({ label: o.label, value: o.value, description: typeof o.description === "string" ? o.description : undefined, default: o.default === true }));
        if (options.length === 0) continue;
        const min = Number.isInteger(c.minValues) ? c.minValues : 1;
        const max = Number.isInteger(c.maxValues) ? c.maxValues : 1;
        comps.push({ type: "select", customId: c.customId, placeholder: typeof c.placeholder === "string" ? c.placeholder : undefined, options, minValues: Math.max(0, Math.min(min, options.length)), maxValues: Math.max(1, Math.min(max, options.length)), disabled: c.disabled === true });
      }
    }
    if (comps.length) rows.push({ components: comps });
  }
  return rows;
}

export const isExpired = (expiresAt: string | null | undefined, now: number = Date.now()): boolean => {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
};

/** Message the person reads when a press fails (status of POST /interact). The text is a translation key under `bot.interact`. */
export function interactErrorKey(status: number | undefined): "forbidden" | "notFound" | "notListening" | "expired" | "tooMany" | "invalid" | "generic" {
  switch (status) {
    case 400: return "invalid";
    case 403: return "forbidden";
    case 404: return "notFound";
    case 409: return "notListening";
    case 410: return "expired";
    case 429: return "tooMany";
    default: return "generic";
  }
}

export type PressState = { status: "idle" } | { status: "loading" } | { status: "error"; key: ReturnType<typeof interactErrorKey> } | { status: "sent" };

/** Values a select may send: within min / max and among the options. Null when the choice is not allowed yet. */
export function validSelection(sel: SelectComponent, values: readonly string[]): string[] | null {
  const allowed = new Set(sel.options.map((o) => o.value));
  const unique = [...new Set(values)];
  if (unique.some((v) => !allowed.has(v))) return null;
  if (unique.length < sel.minValues || unique.length > sel.maxValues) return null;
  return unique;
}
