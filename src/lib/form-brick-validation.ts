/**
 * Pure helpers for the form brick: multi-select values, required checks, the compact schema snapshot
 * sent to the backend (which validates anonymous submissions against it) and the mapping of the
 * backend's per-field errors back onto field bricks.
 *
 * No imports from the app (kept dependency-free so it can be unit-tested with plain node).
 */

export type FormValue = string | boolean | string[];

export type SchemaFieldKind =
  | "text" | "email" | "textarea" | "number" | "date" | "tel" | "url" | "checkbox" | "radio" | "select" | "multi_select";

export type SchemaFieldInput = {
  fieldId: string;
  label?: string;
  type: string;
  required?: boolean;
  options?: string[];
  condition?: { enabled?: boolean; sourceFieldId?: string; operator?: string; value?: string };
};

/** Joins the selected options of a multi-select for text-only destinations (legacy tables, display). */
export function joinMultiSelect(values: readonly string[] | undefined, separator = ", "): string {
  if (!Array.isArray(values)) return "";
  return values.filter((v) => typeof v === "string" && v.length > 0).join(separator);
}

/** Immutable toggle of one option in a multi-select value; keeps the order of `options`. */
export function toggleMultiSelectOption(
  current: readonly string[] | undefined,
  option: string,
  checked: boolean,
  options: readonly string[] = [],
): string[] {
  const set = new Set(Array.isArray(current) ? current : []);
  if (checked) set.add(option);
  else set.delete(option);
  const ordered = options.filter((o) => set.has(o));
  const extras = Array.from(set).filter((o) => !options.includes(o));
  return [...ordered, ...extras];
}

/** Mirror of the backend rule: required strings need text, checkbox needs true, multi-select needs one option. */
export function isRequiredValueMissing(type: string, required: boolean | undefined, value: FormValue | undefined): boolean {
  if (!required) return false;
  if (type === "checkbox") return value !== true;
  if (type === "multi_select") return !Array.isArray(value) || value.length === 0;
  return typeof value !== "string" || value.trim().length === 0;
}

/** Text a condition compares against (booleans, strings and multi-select arrays). */
export function normalizeConditionValue(value: FormValue | undefined): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).join(",");
  return "";
}

// ── Schema snapshot ──────────────────────────────────────────────────────────

const KINDS = new Set<string>(["text", "email", "textarea", "number", "date", "tel", "url", "checkbox", "radio", "select", "multi_select"]);

const slug = (input: string): string => {
  const value = String(input).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return value.length > 0 ? value : "field";
};

/** Compact schema (id/label/kind/required/options/condition) the backend stores on the token. */
export function buildFormSchema(fields: readonly SchemaFieldInput[]) {
  const seen = new Set<string>();
  const out: Array<{
    id: string; label: string; kind: SchemaFieldKind; required: boolean; options: string[];
    condition?: { sourceFieldId: string; operator: string; value: string };
  }> = [];
  for (const f of fields) {
    const id = slug(f.fieldId);
    if (seen.has(id)) continue;
    seen.add(id);
    const entry: (typeof out)[number] = {
      id,
      label: typeof f.label === "string" ? f.label.trim() : "",
      kind: (KINDS.has(f.type) ? f.type : "text") as SchemaFieldKind,
      required: Boolean(f.required),
      options: Array.isArray(f.options) ? f.options.filter((o) => typeof o === "string" && o.trim().length > 0) : [],
    };
    const c = f.condition;
    if (c?.enabled && typeof c.sourceFieldId === "string" && c.sourceFieldId.trim().length > 0) {
      entry.condition = { sourceFieldId: slug(c.sourceFieldId), operator: c.operator || "equals", value: c.value || "" };
    }
    out.push(entry);
  }
  return { version: 1 as const, fields: out };
}

/** Stable string used to decide whether the stored snapshot needs a refresh. */
export function formSchemaSignature(schema: ReturnType<typeof buildFormSchema>): string {
  return JSON.stringify(schema);
}

/** Extracts the token from a `/public/brick/<token>` URL (null for any other URL). */
export function brickTokenFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/public\/brick\/([A-Za-z0-9_-]{16,256})\/?(?:[?#].*)?$/.exec(url.trim());
  return match ? match[1] : null;
}

// ── Server errors ────────────────────────────────────────────────────────────

export type ServerFieldError = { field: string; code?: string; message: string };

export type MappedFormErrors = {
  /** brick id -> message to show under that field */
  byBrick: Record<string, string>;
  /** errors whose field id is not in the form (should not happen; shown as a generic toast) */
  unmapped: ServerFieldError[];
  /** brick id of the first mapped error (in the order the server reported) */
  firstBrickId?: string;
};

/** Reads `{ errors: [{ field, message, code? }] }` out of a rejected response body (any other shape -> []). */
export function parseServerFormErrors(body: unknown): ServerFieldError[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { errors?: unknown }).errors;
  if (!Array.isArray(raw)) return [];
  const out: ServerFieldError[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { field, message, code } = item as Record<string, unknown>;
    if (typeof field !== "string" || field.length === 0) continue;
    out.push({
      field,
      message: typeof message === "string" ? message : "",
      code: typeof code === "string" ? code : undefined,
    });
  }
  return out;
}

/**
 * Maps server errors onto brick ids. `describe` turns a server error into the text shown under the field
 * (e.g. a translated message by code); the first error of a field wins.
 */
export function mapServerFormErrors(
  errors: readonly ServerFieldError[],
  fieldIdToBrickId: Readonly<Record<string, string>>,
  describe: (error: ServerFieldError) => string = (e) => e.message,
): MappedFormErrors {
  const byBrick: Record<string, string> = {};
  const unmapped: ServerFieldError[] = [];
  let firstBrickId: string | undefined;
  for (const error of errors) {
    const brickId = Object.prototype.hasOwnProperty.call(fieldIdToBrickId, error.field) ? fieldIdToBrickId[error.field] : undefined;
    if (!brickId) {
      unmapped.push(error);
      continue;
    }
    if (byBrick[brickId] === undefined) byBrick[brickId] = describe(error);
    if (firstBrickId === undefined) firstBrickId = brickId;
  }
  return { byBrick, unmapped, firstBrickId };
}
