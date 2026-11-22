/**
 * Interactive components of a bot message: model, the backend's limits as editor validation, reading what the server stored, the
 * state machine of a press, and the modal a script can open. Pure, tested in components.test.ts and components-v2.test.ts.
 * Contract: Killio-Backend/src/modules/bots/bot-rich.ts (sanitizeComponents, COMPONENT_LIMITS), bot-interactions.service.ts
 * (POST /rooms/:id/messages/:mid/interact -> 202; GET .../select-options; POST /rooms/:id/ephemeral/:eid/modal-submit) and
 * docs/BOT-RICH-MESSAGES-V2.md.
 *
 * Rows: max 5 rows; a row holds up to 5 of button | toggle, OR exactly one select of any kind (string, user, role, channel, mentionable).
 * `string_select` is an input alias of `select` (stored as `select`).
 */
import { accessoryButtons, hasTemplate } from "./rich.ts";

export const COMPONENT_LIMITS = {
  maxRows: 5,
  maxButtonsPerRow: 5,
  maxSelectOptions: 25,
  maxSelectValues: 25,
  maxCustomIdLength: 100,
  maxLabelLength: 80,
  maxOptionValueLength: 100,
  maxOptionDescriptionLength: 100,
  maxPlaceholderLength: 150,
  minExpiresMinutes: 1,
  maxExpiresMinutes: 7 * 24 * 60,
  defaultExpiresMinutes: 24 * 60,
} as const;

export const MODAL_LIMITS = {
  maxInputs: 5,
  maxTitleLength: 45,
  maxSubmitLabelLength: 30,
  maxLabelLength: 45,
  maxPlaceholderLength: 100,
  maxShortLength: 400,
  maxParagraphLength: 2000,
  maxLengthCeiling: 4000,
  /** Minutes the modal waits for the person (the ephemeral that carries it expires). */
  expiresMinutes: 15,
} as const;

export const BUTTON_STYLES = ["primary", "secondary", "success", "danger", "link"] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const PICKER_TYPES = ["user_select", "role_select", "channel_select", "mentionable_select"] as const;
export type PickerType = (typeof PICKER_TYPES)[number];
export const COMPONENT_TYPES = ["button", "select", "string_select", ...PICKER_TYPES, "toggle"] as const;

export interface ButtonComponent { type: "button"; label: string; style: ButtonStyle; customId?: string; url?: string; disabled?: boolean; emoji?: string }
export interface SelectOption { label: string; value: string; description?: string; default?: boolean }
export interface SelectComponent { type: "select"; customId: string; placeholder?: string; options: SelectOption[]; minValues: number; maxValues: number; disabled?: boolean }
export interface PickerComponent { type: PickerType; customId: string; placeholder?: string; minValues: number; maxValues: number; disabled?: boolean; selfAssignableOnly?: boolean }
export interface ToggleComponent { type: "toggle"; customId: string; label: string; checked?: boolean; disabled?: boolean }
export type Component = ButtonComponent | SelectComponent | PickerComponent | ToggleComponent;
export interface ComponentRow { components: Component[] }

export const isPicker = (c: { type: string }): c is PickerComponent => (PICKER_TYPES as readonly string[]).includes(c.type);
/** A select of any kind takes a whole row. */
export const isSelectLike = (c: { type: string }): boolean => c.type === "select" || c.type === "string_select" || isPicker(c);

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

/**
 * Validates rows like the backend (templated strings are not measured: they only become a value when the run renders them).
 * `blocks` (optional) are the rich blocks of the same message: the buttons of `section` accessories share the customId space.
 */
export function validateComponents(rows: unknown, expiresInMinutes?: unknown, blocks?: readonly unknown[]): ComponentIssue[] {
  const out: ComponentIssue[] = [];
  if (expiresInMinutes !== undefined && expiresInMinutes !== null && expiresInMinutes !== "") {
    const m = Number(expiresInMinutes);
    if (!Number.isFinite(m) || m < COMPONENT_LIMITS.minExpiresMinutes || m > COMPONENT_LIMITS.maxExpiresMinutes) out.push({ at: [], code: "expires_range" });
  }
  const seen = new Set<string>();
  for (const a of blocks ? accessoryButtons(blocks) : []) {
    const id = s(a?.customId);
    if (!id) continue;
    seen.add(id);
  }
  if (rows === undefined || rows === null) return out;
  if (!Array.isArray(rows)) return [...out, { at: [], code: "too_many_rows" }];
  if (rows.length > COMPONENT_LIMITS.maxRows) out.push({ at: [], code: "too_many_rows" });
  rows.forEach((row: any, r) => {
    const list = Array.isArray(row) ? row : row?.components;
    if (!Array.isArray(list) || list.length === 0) return void out.push({ at: [r], code: "row_empty" });
    const hasSelect = list.some((c: any) => isSelectLike({ type: s(c?.type).toLowerCase() }));
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
      const placeholder = () => {
        if (!hasTemplate(c?.placeholder) && s(c?.placeholder).length > COMPONENT_LIMITS.maxPlaceholderLength) out.push({ at, code: "placeholder_long" });
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
      } else if (type === "toggle") {
        customId(true);
        const label = s(c?.label).trim();
        if (!label) out.push({ at, code: "label_required" });
        else if (!hasTemplate(label) && label.length > COMPONENT_LIMITS.maxLabelLength) out.push({ at, code: "label_long" });
      } else if (type === "select" || type === "string_select") {
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
        placeholder();
      } else if ((PICKER_TYPES as readonly string[]).includes(type)) {
        customId(true);
        const min = c?.minValues === undefined ? 1 : Number(c.minValues);
        const max = c?.maxValues === undefined ? 1 : Number(c.maxValues);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > COMPONENT_LIMITS.maxSelectValues || min > max) out.push({ at, code: "values_range" });
        placeholder();
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
export const blankPicker = (type: PickerType, index = 0): PickerComponent => ({ type, customId: `${type.replace("_select", "")}_${index + 1}`, placeholder: "", minValues: 1, maxValues: 1 });
export const blankToggle = (index = 0): ToggleComponent => ({ type: "toggle", customId: `toggle_${index + 1}`, label: "", checked: false });

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
      if (c.type === "toggle") {
        const t: ToggleComponent = { type: "toggle", customId: c.customId, label: c.label };
        if (c.checked) t.checked = true;
        if (c.disabled) t.disabled = true;
        return t;
      }
      if (isPicker(c)) {
        const p: PickerComponent = { type: c.type, customId: c.customId, minValues: c.minValues, maxValues: c.maxValues };
        if (c.placeholder?.trim()) p.placeholder = c.placeholder.trim();
        if (c.disabled) p.disabled = true;
        if (c.type === "role_select" && c.selfAssignableOnly) p.selfAssignableOnly = true;
        return p;
      }
      const sel = c as SelectComponent;
      const out: SelectComponent = { type: "select", customId: sel.customId, options: sel.options.map((o) => ({ label: o.label, value: o.value, ...(o.description?.trim() ? { description: o.description.trim() } : {}), ...(o.default ? { default: true } : {}) })), minValues: sel.minValues, maxValues: sel.maxValues };
      if (sel.placeholder?.trim()) out.placeholder = sel.placeholder.trim();
      if (sel.disabled) out.disabled = true;
      return out;
    }),
  }));
}

/* ── reading what the server stored (renderer) ── */

const isStyle = (v: unknown): v is ButtonStyle => (BUTTON_STYLES as readonly string[]).includes(String(v));
const clampInt = (v: unknown, fallback: number, lo: number, hi: number) => (Number.isInteger(v) ? Math.max(lo, Math.min(hi, v as number)) : fallback);

/** Reads one stored component; null when it is not something this client draws. Exported for the `section` accessory button. */
export function readComponent(c: any): Component | null {
  if (!c || typeof c !== "object") return null;
  if (c.type === "button" && typeof c.label === "string") {
    const style = isStyle(c.style) ? c.style : "secondary";
    return { type: "button", label: c.label, style, customId: typeof c.customId === "string" ? c.customId : undefined, url: typeof c.url === "string" ? c.url : undefined, disabled: c.disabled === true, emoji: typeof c.emoji === "string" ? c.emoji : undefined };
  }
  if ((c.type === "select" || c.type === "string_select") && typeof c.customId === "string" && Array.isArray(c.options)) {
    const options: SelectOption[] = c.options.filter((o: any) => o && typeof o.label === "string" && typeof o.value === "string").slice(0, COMPONENT_LIMITS.maxSelectOptions).map((o: any) => ({ label: o.label, value: o.value, description: typeof o.description === "string" ? o.description : undefined, default: o.default === true }));
    if (options.length === 0) return null;
    const min = clampInt(c.minValues, 1, 0, options.length);
    const max = clampInt(c.maxValues, 1, 1, options.length);
    return { type: "select", customId: c.customId, placeholder: typeof c.placeholder === "string" ? c.placeholder : undefined, options, minValues: Math.min(min, max), maxValues: max, disabled: c.disabled === true };
  }
  if ((PICKER_TYPES as readonly string[]).includes(c.type) && typeof c.customId === "string") {
    const max = clampInt(c.maxValues, 1, 1, COMPONENT_LIMITS.maxSelectValues);
    const min = clampInt(c.minValues, 1, 0, max);
    return { type: c.type, customId: c.customId, placeholder: typeof c.placeholder === "string" ? c.placeholder : undefined, minValues: min, maxValues: max, disabled: c.disabled === true, selfAssignableOnly: c.selfAssignableOnly === true };
  }
  if (c.type === "toggle" && typeof c.customId === "string" && typeof c.label === "string") {
    return { type: "toggle", customId: c.customId, label: c.label, checked: c.checked === true, disabled: c.disabled === true };
  }
  return null;
}

/** Tolerant reader of `metadata.components.rows`: unknown pieces are dropped, limits re-applied (a select-like keeps its row to itself). */
export function readComponentRows(raw: unknown): ComponentRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: ComponentRow[] = [];
  for (const r of raw.slice(0, COMPONENT_LIMITS.maxRows)) {
    const list = Array.isArray(r) ? r : (r as any)?.components;
    if (!Array.isArray(list)) continue;
    const comps: Component[] = [];
    for (const c of list.slice(0, COMPONENT_LIMITS.maxButtonsPerRow)) {
      const read = readComponent(c);
      if (read) comps.push(read);
    }
    const select = comps.find((c) => isSelectLike(c));
    if (select) rows.push({ components: [select] });
    else if (comps.length) rows.push({ components: comps });
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

/** Ids a picker (user / role / channel / mentionable) may send: unique and within min / max. Null when not allowed yet. */
export function validPick(p: Pick<PickerComponent, "minValues" | "maxValues">, ids: readonly string[]): string[] | null {
  const unique = [...new Set(ids)];
  if (unique.length < p.minValues || unique.length > p.maxValues) return null;
  return unique;
}

/** What a picker lists: the server answers `GET .../select-options` with these (never trust anything else). */
export interface PickerItem { id: string; name: string; kind: "user" | "role" | "channel"; avatarUrl?: string; color?: string }

export function readPickerItems(raw: unknown): PickerItem[] {
  const list = Array.isArray((raw as any)?.items) ? (raw as any).items : Array.isArray(raw) ? raw : [];
  const out: PickerItem[] = [];
  for (const it of list.slice(0, 100)) {
    if (!it || typeof it.id !== "string" || typeof it.name !== "string" || !["user", "role", "channel"].includes(it.kind)) continue;
    out.push({ id: it.id, name: it.name, kind: it.kind, avatarUrl: typeof it.avatarUrl === "string" ? it.avatarUrl : undefined, color: typeof it.color === "string" && /^#[0-9a-f]{6}$/i.test(it.color) ? it.color : undefined });
  }
  return out;
}

/** Toggle press: the value sent is the NEW state. */
export const toggleValues = (nextChecked: boolean): string[] => [nextChecked ? "true" : "false"];

/* ── modal (opened by a script as an answer to a press or a command) ── */

export type ModalInputStyle = "short" | "paragraph";
export interface ModalInput { customId: string; label: string; style: ModalInputStyle; placeholder?: string; required: boolean; minLength?: number; maxLength?: number; value?: string }
export interface ModalDef { customId: string; title: string; submitLabel?: string; inputs: ModalInput[] }

export type ModalIssueCode =
  | "custom_id_required" | "custom_id_invalid" | "title_required" | "title_long" | "submit_long" | "inputs_range"
  | "input_custom_id" | "input_duplicate" | "input_label" | "input_style" | "input_placeholder" | "input_length" | "input_value";

export interface ModalIssue { at: number[]; code: ModalIssueCode }

/** Highest `maxLength` an input may declare (short: 400, paragraph: 2000; the contract allows up to 4000 for explicit values). */
export const modalMaxLengthFor = (style: ModalInputStyle): number => (style === "short" ? MODAL_LIMITS.maxShortLength : MODAL_LIMITS.maxParagraphLength);

export function validateModal(raw: unknown): ModalIssue[] {
  const out: ModalIssue[] = [];
  if (raw === undefined || raw === null) return out;
  const m = raw as any;
  const id = s(m?.customId);
  if (!id) out.push({ at: [], code: "custom_id_required" });
  else if (!hasTemplate(id) && !CUSTOM_ID_RE.test(id)) out.push({ at: [], code: "custom_id_invalid" });
  const title = s(m?.title).trim();
  if (!title) out.push({ at: [], code: "title_required" });
  else if (!hasTemplate(title) && title.length > MODAL_LIMITS.maxTitleLength) out.push({ at: [], code: "title_long" });
  if (!hasTemplate(m?.submitLabel) && s(m?.submitLabel).length > MODAL_LIMITS.maxSubmitLabelLength) out.push({ at: [], code: "submit_long" });
  const inputs = Array.isArray(m?.inputs) ? m.inputs : [];
  if (inputs.length < 1 || inputs.length > MODAL_LIMITS.maxInputs) out.push({ at: [], code: "inputs_range" });
  const seen = new Set<string>();
  inputs.forEach((inp: any, k: number) => {
    const at = [k];
    const cid = s(inp?.customId);
    if (!cid || (!hasTemplate(cid) && !CUSTOM_ID_RE.test(cid))) out.push({ at, code: "input_custom_id" });
    else if (seen.has(cid)) out.push({ at, code: "input_duplicate" });
    seen.add(cid);
    const label = s(inp?.label).trim();
    if (!label || (!hasTemplate(label) && label.length > MODAL_LIMITS.maxLabelLength)) out.push({ at, code: "input_label" });
    const style = s(inp?.style || "short");
    if (style !== "short" && style !== "paragraph") out.push({ at, code: "input_style" });
    if (!hasTemplate(inp?.placeholder) && s(inp?.placeholder).length > MODAL_LIMITS.maxPlaceholderLength) out.push({ at, code: "input_placeholder" });
    const ceiling = style === "paragraph" ? MODAL_LIMITS.maxLengthCeiling : MODAL_LIMITS.maxShortLength;
    const min = inp?.minLength === undefined || inp.minLength === "" ? undefined : Number(inp.minLength);
    const max = inp?.maxLength === undefined || inp.maxLength === "" ? undefined : Number(inp.maxLength);
    if ((min !== undefined && (!Number.isInteger(min) || min < 0 || min > MODAL_LIMITS.maxLengthCeiling)) || (max !== undefined && (!Number.isInteger(max) || max < 1 || max > ceiling)) || (min !== undefined && max !== undefined && min > max)) out.push({ at, code: "input_length" });
    if (!hasTemplate(inp?.value) && s(inp?.value).length > (max ?? modalMaxLengthFor(style === "paragraph" ? "paragraph" : "short"))) out.push({ at, code: "input_value" });
  });
  return out;
}

export const modalIssuesAt = (issues: readonly ModalIssue[], at: readonly number[]): ModalIssue[] => issues.filter((i) => i.at.join(".") === at.join("."));

export const blankModalInput = (index = 0): ModalInput => ({ customId: `field_${index + 1}`, label: "", style: "short", required: true });
export const blankModal = (): ModalDef => ({ customId: "modal_1", title: "", submitLabel: "", inputs: [blankModalInput(0)] });

/** Drops empty optional fields (what the node stores). */
export function modalPayload(m: ModalDef): ModalDef {
  return {
    customId: m.customId,
    title: m.title,
    ...(m.submitLabel?.trim() ? { submitLabel: m.submitLabel.trim() } : {}),
    inputs: m.inputs.map((i) => ({
      customId: i.customId, label: i.label, style: i.style,
      ...(i.placeholder?.trim() ? { placeholder: i.placeholder.trim() } : {}),
      required: i.required,
      ...(i.minLength ? { minLength: i.minLength } : {}),
      ...(i.maxLength ? { maxLength: i.maxLength } : {}),
      ...(i.value ? { value: i.value } : {}),
    })),
  };
}

/** Tolerant reader of `metadata.modal` of an ephemeral message; null when it is not a usable modal. */
export function readModal(raw: unknown): (ModalDef & { expiresAt: string | null }) | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, any>;
  if (typeof m.customId !== "string" || typeof m.title !== "string" || !Array.isArray(m.inputs)) return null;
  const inputs: ModalInput[] = [];
  for (const inp of m.inputs.slice(0, MODAL_LIMITS.maxInputs)) {
    if (!inp || typeof inp.customId !== "string" || typeof inp.label !== "string") continue;
    const style: ModalInputStyle = inp.style === "paragraph" ? "paragraph" : "short";
    const ceiling = style === "paragraph" ? MODAL_LIMITS.maxLengthCeiling : MODAL_LIMITS.maxShortLength;
    inputs.push({
      customId: inp.customId, label: inp.label, style,
      placeholder: typeof inp.placeholder === "string" ? inp.placeholder : undefined,
      required: inp.required !== false,
      minLength: Number.isInteger(inp.minLength) && inp.minLength > 0 ? Math.min(inp.minLength, MODAL_LIMITS.maxLengthCeiling) : undefined,
      maxLength: Number.isInteger(inp.maxLength) && inp.maxLength > 0 ? Math.min(inp.maxLength, ceiling) : undefined,
      value: typeof inp.value === "string" ? inp.value : undefined,
    });
  }
  if (inputs.length === 0) return null;
  return { customId: m.customId, title: m.title, submitLabel: typeof m.submitLabel === "string" ? m.submitLabel : undefined, inputs, expiresAt: typeof m.expiresAt === "string" ? m.expiresAt : null };
}

export type ModalFieldError = "required" | "min" | "max";

/** Checks what the person typed against the definition (the server checks again). Empty = can be sent. */
export function validateModalFields(def: ModalDef, fields: Record<string, string>): Record<string, ModalFieldError> {
  const errors: Record<string, ModalFieldError> = {};
  for (const inp of def.inputs) {
    const v = (fields[inp.customId] ?? "").trim();
    const max = inp.maxLength ?? modalMaxLengthFor(inp.style);
    if (!v) { if (inp.required) errors[inp.customId] = "required"; continue; }
    if (inp.minLength && v.length < inp.minLength) errors[inp.customId] = "min";
    else if (v.length > max) errors[inp.customId] = "max";
  }
  return errors;
}

/** Body of the submit: only the inputs the modal declares, trimmed. */
export function modalSubmitBody(def: ModalDef, fields: Record<string, string>): { fields: Record<string, string> } {
  return { fields: Object.fromEntries(def.inputs.map((i) => [i.customId, (fields[i.customId] ?? "").trim()])) };
}
