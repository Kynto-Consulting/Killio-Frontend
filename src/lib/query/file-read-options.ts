/**
 * How an uploaded file is read as a KQL table (the options of a Power BI-style "text / CSV import" dialog).
 * Pure: no imports. The frontend mirror lives at Killio-Frontend/src/lib/query/file-read-options.ts and is kept identical.
 */

export type FileColumnType = 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'list';

export interface FileReadOptions {
  /** auto = BOM sniff, UTF-8 if valid else windows-1252. */
  encoding: 'auto' | 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' | 'iso-8859-1' | 'iso-8859-15';
  /** ',' ';' '\t' '|' ' ' ':' or any custom string up to 3 chars; auto sniffs. */
  delimiter: 'auto' | string;
  quote: '"' | "'" | 'none';
  /** Rows to skip at the top, 0..1000. */
  skipRows: number;
  /** The first row after skipRows holds the column names; otherwise Column1, Column2... */
  hasHeader: boolean;
  skipBlankLines: boolean;
  /** Lines starting with it are ignored. */
  commentPrefix: string | null;
  trim: boolean;
  /** Cells equal to one of these become null. */
  nullTokens: string[];
  decimalSeparator: '.' | ',';
  thousandsSeparator: '' | ',' | '.' | ' ' | "'";
  /** 'auto', a day / month order, or a custom pattern such as 'dd/MM/yyyy HH:mm'. */
  dateFormat: 'auto' | 'ymd' | 'dmy' | 'mdy' | string;
  typeDetection: 'none' | 'first-200' | 'first-1000' | 'all';
  /** Cells of 'list' columns are split with it (a comma when null). */
  listSeparator: string | null;
  /** Per-column overrides by column name; they win over detection. */
  columnTypes: Record<string, FileColumnType>;
  /** Optional renames: original name -> new name. */
  columnNames: Record<string, string>;
  /** Workbooks only (null = first sheet). skipRows, hasHeader, types, nullTokens and dateFormat apply to workbooks too. */
  sheet: string | null;
}

export const DEFAULT_NULL_TOKENS = ['', 'NA', 'N/A', 'null', 'NULL', '-'];

export const FILE_COLUMN_TYPES: readonly FileColumnType[] = ['text', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'list'];

export const DEFAULT_FILE_READ_OPTIONS: FileReadOptions = {
  encoding: 'auto',
  delimiter: 'auto',
  quote: '"',
  skipRows: 0,
  hasHeader: true,
  skipBlankLines: true,
  commentPrefix: null,
  trim: true,
  nullTokens: DEFAULT_NULL_TOKENS,
  decimalSeparator: '.',
  thousandsSeparator: '',
  dateFormat: 'auto',
  typeDetection: 'first-1000',
  listSeparator: null,
  columnTypes: {},
  columnNames: {},
  sheet: null,
};

export const MAX_OPTION_STRING = 60;
export const MAX_COLUMN_OVERRIDES = 200;
export const MAX_SKIP_ROWS = 1000;
const MAX_NULL_TOKENS = 50;

/** The options could not be accepted; the message names the field. */
export class ReadOptionsError extends Error {}

export function defaultReadOptions(): FileReadOptions {
  return { ...DEFAULT_FILE_READ_OPTIONS, nullTokens: [...DEFAULT_NULL_TOKENS], columnTypes: {}, columnNames: {} };
}

const ENCODINGS = ['auto', 'utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'iso-8859-1', 'iso-8859-15'];
const QUOTES = ['"', "'", 'none'];
const DECIMALS = ['.', ','];
const THOUSANDS = ['', ',', '.', ' ', "'"];
const DETECTION = ['none', 'first-200', 'first-1000', 'all'];
const KEYS = Object.keys(DEFAULT_FILE_READ_OPTIONS);

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function oneOf<T extends string>(key: string, v: unknown, allowed: readonly string[]): T {
  if (typeof v !== 'string' || !allowed.includes(v)) throw new ReadOptionsError(`${key} must be one of: ${allowed.map((a) => JSON.stringify(a)).join(', ')}.`);
  return v as T;
}

function shortString(key: string, v: unknown, min = 0): string {
  if (typeof v !== 'string') throw new ReadOptionsError(`${key} must be text.`);
  if (v.length > MAX_OPTION_STRING) throw new ReadOptionsError(`${key} is too long (max ${MAX_OPTION_STRING} characters).`);
  if (v.length < min) throw new ReadOptionsError(`${key} cannot be empty.`);
  return v;
}

function bool(key: string, v: unknown): boolean {
  if (typeof v !== 'boolean') throw new ReadOptionsError(`${key} must be true or false.`);
  return v;
}

/**
 * Validates a (partial) options object over `base` (the defaults, or the saved options). Unknown keys are rejected, numbers are
 * clamped, strings are capped at 60 characters, at most 200 column overrides. Returns a complete options object.
 */
export function normalizeReadOptions(input: unknown, base: FileReadOptions = DEFAULT_FILE_READ_OPTIONS): FileReadOptions {
  if (input == null) return { ...base, nullTokens: [...base.nullTokens], columnTypes: { ...base.columnTypes }, columnNames: { ...base.columnNames } };
  if (!isRecord(input)) throw new ReadOptionsError('The options must be an object.');
  for (const k of Object.keys(input)) if (!KEYS.includes(k)) throw new ReadOptionsError(`Unknown option "${k.slice(0, MAX_OPTION_STRING)}".`);
  const out = normalizeReadOptions(null, base);
  const has = (k: keyof FileReadOptions) => k in input && input[k] !== undefined;

  if (has('encoding')) out.encoding = oneOf('encoding', input.encoding, ENCODINGS);
  if (has('delimiter')) {
    const d = input.delimiter;
    if (d !== 'auto') {
      if (typeof d !== 'string' || d.length < 1 || d.length > 3) throw new ReadOptionsError('delimiter must be "auto" or a string of 1 to 3 characters.');
      if (/[\r\n]/.test(d)) throw new ReadOptionsError('delimiter cannot contain a line break.');
    }
    out.delimiter = d as string;
  }
  if (has('quote')) out.quote = oneOf('quote', input.quote, QUOTES);
  if (has('skipRows')) {
    const n = input.skipRows;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new ReadOptionsError('skipRows must be a number.');
    out.skipRows = Math.max(0, Math.min(MAX_SKIP_ROWS, Math.floor(n)));
  }
  if (has('hasHeader')) out.hasHeader = bool('hasHeader', input.hasHeader);
  if (has('skipBlankLines')) out.skipBlankLines = bool('skipBlankLines', input.skipBlankLines);
  if (has('commentPrefix')) {
    const c = input.commentPrefix;
    out.commentPrefix = c === null || c === '' ? null : shortString('commentPrefix', c);
  }
  if (has('trim')) out.trim = bool('trim', input.trim);
  if (has('nullTokens')) {
    const t = input.nullTokens;
    if (!Array.isArray(t) || t.length > MAX_NULL_TOKENS) throw new ReadOptionsError(`nullTokens must be a list of at most ${MAX_NULL_TOKENS} texts.`);
    out.nullTokens = [...new Set(t.map((x) => shortString('nullTokens item', x)))];
  }
  if (has('decimalSeparator')) out.decimalSeparator = oneOf('decimalSeparator', input.decimalSeparator, DECIMALS);
  if (has('thousandsSeparator')) out.thousandsSeparator = oneOf('thousandsSeparator', input.thousandsSeparator, THOUSANDS);
  if (out.thousandsSeparator !== '' && out.thousandsSeparator === out.decimalSeparator) throw new ReadOptionsError('thousandsSeparator cannot be the same as decimalSeparator.');
  if (has('dateFormat')) {
    const f = shortString('dateFormat', input.dateFormat, 1);
    if (!['auto', 'ymd', 'dmy', 'mdy'].includes(f) && !(/y/.test(f) && /M/.test(f) && /d/.test(f))) {
      throw new ReadOptionsError('dateFormat must be "auto", "ymd", "dmy", "mdy" or a pattern with year, month and day such as "dd/MM/yyyy HH:mm".');
    }
    out.dateFormat = f;
  }
  if (has('typeDetection')) out.typeDetection = oneOf('typeDetection', input.typeDetection, DETECTION);
  if (has('listSeparator')) {
    const s = input.listSeparator;
    if (s === null || s === '') out.listSeparator = null;
    else {
      const v = shortString('listSeparator', s);
      if (v.length > 10) throw new ReadOptionsError('listSeparator is too long (max 10 characters).');
      out.listSeparator = v;
    }
  }
  if (has('columnTypes')) {
    const m = input.columnTypes;
    if (!isRecord(m)) throw new ReadOptionsError('columnTypes must be an object of column name -> type.');
    const keys = Object.keys(m);
    if (keys.length > MAX_COLUMN_OVERRIDES) throw new ReadOptionsError(`columnTypes can hold at most ${MAX_COLUMN_OVERRIDES} columns.`);
    out.columnTypes = {};
    for (const k of keys) {
      shortString('columnTypes name', k, 1);
      out.columnTypes[k] = oneOf<FileColumnType>(`columnTypes["${k.slice(0, 20)}"]`, m[k], FILE_COLUMN_TYPES);
    }
  }
  if (has('columnNames')) {
    const m = input.columnNames;
    if (!isRecord(m)) throw new ReadOptionsError('columnNames must be an object of original name -> new name.');
    const keys = Object.keys(m);
    if (keys.length > MAX_COLUMN_OVERRIDES) throw new ReadOptionsError(`columnNames can hold at most ${MAX_COLUMN_OVERRIDES} columns.`);
    out.columnNames = {};
    for (const k of keys) {
      shortString('columnNames name', k, 1);
      out.columnNames[k] = shortString(`columnNames["${k.slice(0, 20)}"]`, m[k], 1).trim() || k;
    }
  }
  if (has('sheet')) {
    const s = input.sheet;
    out.sheet = s === null || s === '' ? null : shortString('sheet', s);
  }
  return out;
}

/** The options that differ from the defaults (what is worth storing); a complete object is accepted back by normalizeReadOptions. */
export function isDefaultReadOptions(o: FileReadOptions): boolean {
  return JSON.stringify(o) === JSON.stringify(DEFAULT_FILE_READ_OPTIONS);
}
