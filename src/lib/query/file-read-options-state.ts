import { DEFAULT_FILE_READ_OPTIONS } from "./file-read-options.ts";
import type { FileColumnType, FileReadOptions } from "./file-read-options.ts";

export const SKIP_ROWS_MAX = 1000;
export const CUSTOM_DELIMITER_MAX = 3;
export const COLUMN_TYPES: FileColumnType[] = ["text", "integer", "decimal", "boolean", "date", "datetime", "list"];

const ENCODINGS = ["auto", "utf-8", "utf-16le", "utf-16be", "windows-1252", "iso-8859-1", "iso-8859-15"];
const TYPE_DETECTION = ["none", "first-200", "first-1000", "all"];
const THOUSANDS = ["", ",", ".", " ", "'"];

/** Integer clamped to [min, max]; non numbers fall back to `min`. */
export function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function clampSkipRows(value: unknown): number {
  return clampInt(value, 0, SKIP_ROWS_MAX);
}

/** 'auto' stays; an empty value means auto; custom delimiters keep spaces/tabs but are cut to 3 chars; newlines removed. */
export function normalizeDelimiter(value: unknown): string {
  if (typeof value !== "string") return "auto";
  if (value === "auto") return "auto";
  const cleaned = value.replace(/[\r\n]/g, "");
  if (cleaned === "") return "auto";
  if (cleaned === "\\t") return "\t";
  return Array.from(cleaned).slice(0, CUSTOM_DELIMITER_MAX).join("");
}

function cleanTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 50);
}

function cleanRecord<T extends string>(value: unknown, accept: (v: string) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && accept(v)) out[k] = v as T;
  }
  return out;
}

/** Make any (possibly malformed) options object valid: every field present, numbers clamped, delimiter normalised. */
export function normalizeOptions(input: Partial<FileReadOptions> | null | undefined): FileReadOptions {
  const d = DEFAULT_FILE_READ_OPTIONS;
  const o: Partial<FileReadOptions> = input && typeof input === "object" ? input : {};
  const dateFormat = typeof o.dateFormat === "string" && o.dateFormat.trim() ? o.dateFormat.trim().slice(0, 40) : d.dateFormat;
  return {
    encoding: ENCODINGS.includes(o.encoding as string) ? (o.encoding as FileReadOptions["encoding"]) : d.encoding,
    delimiter: o.delimiter === undefined ? d.delimiter : normalizeDelimiter(o.delimiter),
    quote: o.quote === '"' || o.quote === "'" || o.quote === "none" ? o.quote : d.quote,
    skipRows: o.skipRows === undefined ? d.skipRows : clampSkipRows(o.skipRows),
    hasHeader: typeof o.hasHeader === "boolean" ? o.hasHeader : d.hasHeader,
    skipBlankLines: typeof o.skipBlankLines === "boolean" ? o.skipBlankLines : d.skipBlankLines,
    commentPrefix: typeof o.commentPrefix === "string" && o.commentPrefix !== "" ? o.commentPrefix.slice(0, 5) : null,
    trim: typeof o.trim === "boolean" ? o.trim : d.trim,
    nullTokens: Array.isArray(o.nullTokens) ? cleanTokens(o.nullTokens) : [...d.nullTokens],
    decimalSeparator: o.decimalSeparator === "," ? "," : ".",
    thousandsSeparator: THOUSANDS.includes(o.thousandsSeparator as string) ? (o.thousandsSeparator as FileReadOptions["thousandsSeparator"]) : d.thousandsSeparator,
    dateFormat,
    typeDetection: TYPE_DETECTION.includes(o.typeDetection as string) ? (o.typeDetection as FileReadOptions["typeDetection"]) : d.typeDetection,
    listSeparator: typeof o.listSeparator === "string" && o.listSeparator !== "" ? o.listSeparator.slice(0, 10) : null,
    columnTypes: cleanRecord<FileColumnType>(o.columnTypes, (v) => COLUMN_TYPES.includes(v as FileColumnType)),
    columnNames: cleanRecord<string>(o.columnNames, (v) => v.trim() !== ""),
    sheet: typeof o.sheet === "string" && o.sheet !== "" ? o.sheet : null,
  };
}

/** Defaults with the given partial laid over, normalised. */
export function mergeOverDefaults(partial: Partial<FileReadOptions> | null | undefined): FileReadOptions {
  return normalizeOptions({ ...DEFAULT_FILE_READ_OPTIONS, ...(partial ?? {}) });
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return ka.length === kb.length && ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
  }
  return false;
}

/** Minimal patch: only the fields of `draft` that differ from `base` (records and arrays are sent whole). */
export function diffOptions(base: FileReadOptions, draft: FileReadOptions): Partial<FileReadOptions> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_FILE_READ_OPTIONS) as Array<keyof FileReadOptions>) {
    if (!sameValue(base[key], draft[key])) patch[key] = draft[key];
  }
  return patch as Partial<FileReadOptions>;
}

export function isDirty(base: FileReadOptions, draft: FileReadOptions): boolean {
  return Object.keys(diffOptions(base, draft)).length > 0;
}

export type ReadOptionsAction =
  | { type: "load"; options: Partial<FileReadOptions> | null | undefined }
  | { type: "set"; patch: Partial<FileReadOptions> }
  | { type: "setColumnType"; column: string; value: FileColumnType | null }
  | { type: "setColumnName"; column: string; value: string | null }
  | { type: "reset" };

export interface ReadOptionsState {
  baseline: FileReadOptions;
  draft: FileReadOptions;
}

export function initialState(options?: Partial<FileReadOptions> | null): ReadOptionsState {
  const merged = mergeOverDefaults(options);
  return { baseline: merged, draft: merged };
}

export function readOptionsReducer(state: ReadOptionsState, action: ReadOptionsAction): ReadOptionsState {
  switch (action.type) {
    case "load":
      return initialState(action.options);
    case "set":
      return { ...state, draft: normalizeOptions({ ...state.draft, ...action.patch }) };
    case "setColumnType": {
      const columnTypes = { ...state.draft.columnTypes };
      if (action.value === null) delete columnTypes[action.column];
      else columnTypes[action.column] = action.value;
      return { ...state, draft: normalizeOptions({ ...state.draft, columnTypes }) };
    }
    case "setColumnName": {
      const columnNames = { ...state.draft.columnNames };
      const next = action.value === null ? "" : action.value.trim();
      if (next === "" || next === action.column) delete columnNames[action.column];
      else columnNames[action.column] = next;
      return { ...state, draft: normalizeOptions({ ...state.draft, columnNames }) };
    }
    case "reset":
      return { ...state, draft: state.baseline };
    default:
      return state;
  }
}
