/**
 * Tables KQL can read (`rows of "<name>"`): uploaded files, workspace-shared tables, document / card tables.
 * Endpoints under `/teams/:teamId/query`: `files`, `tables`, `files/:fileId/read-options`, `files/:fileId/preview`.
 */

import type { FileColumnType, FileReadOptions } from "../query/file-read-options";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type QueryFileKind = "csv" | "tsv" | "txt" | "xlsx" | "xls" | "json";

export interface QueryFile {
  /** `file:<assetId>`: usable as `rows of "<id>"` when several files share a name, and as `:fileId` of the read-options endpoints. */
  id: string;
  /** File name, as written in `rows of "<name>"`. */
  name: string;
  kind: QueryFileKind;
  /** Bytes, when known. */
  size: number | null;
  /** Sheet names (workbooks, only when the list is short enough to read them). Reach one with `rows of "<name> / <sheet>"`. */
  sheets?: string[];
  /** Where the file is attached. */
  where: "card" | "document";
  /** Id and title of that card or document. */
  refId: string;
  refTitle: string | null;
}

export interface QueryTable {
  /** Usable as `rows of "<id>"`: a brick id, `shared:<id>` or `file:<id>`. */
  id: string;
  name: string;
  /** Prefix a name with `shared:`, `doc:` or `file:` to pick the kind when several tables share a name. */
  origin: "shared" | "document" | "card" | "file" | "sql";
  /** Known column names (empty for files, whose columns come from reading them). */
  columns: string[];
  rows?: number;
  /** Document or card the table (or file) lives in. */
  refTitle?: string | null;
  updated?: string | null;
}

export interface FileReadOptionsResponse {
  options: FileReadOptions;
  /** True when the options were saved with the file (false: these are the defaults). */
  saved: boolean;
  kind: "csv" | "tsv" | "txt" | "xlsx" | "json";
  sheets?: string[];
}

export interface FilePreviewColumn {
  name: string;
  /** What the values were read as (override, else detected). */
  type: FileColumnType;
  detectedType: FileColumnType;
  valid: number;
  /** Values that did not fit the type (they became null). */
  errors: number;
  empty: number;
  distinct: number;
}

export interface FilePreview {
  columns: FilePreviewColumn[];
  rows: Array<Array<string | number | boolean | null>>;
  /** The first lines of the file as text, split with the delimiter (for a "raw" tab). */
  rawRows: string[][];
  encodingUsed: string | null;
  delimiterUsed: string | null;
  totalRowsSeen: number;
  truncated: boolean;
  warnings: string[];
}

export class ApiRequestError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

async function call<T>(path: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new ApiRequestError(message || `Request failed (${res.status})`, res.status, payload);
  }
  return (await res.json()) as T;
}

const search = (q?: string) => (q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "");
const base = (teamId: string) => `/teams/${encodeURIComponent(teamId)}/query`;

/** Files the current user can read (at most 200), optionally filtered by a part of the file name or of its card / document title. */
export const listQueryFiles = (teamId: string, accessToken: string, q?: string) => call<QueryFile[]>(`${base(teamId)}/files${search(q)}`, accessToken);

/** Every table `rows of "..."` can read (at most 200): shared tables, document / card tables and files. */
export const listQueryTables = (teamId: string, accessToken: string, q?: string) => call<QueryTable[]>(`${base(teamId)}/tables${search(q)}`, accessToken);

/** How a file is read: the saved options, else the defaults. Anyone who can read the file may call it. */
export const getFileReadOptions = (teamId: string, fileId: string, accessToken: string) =>
  call<FileReadOptionsResponse>(`${base(teamId)}/files/${encodeURIComponent(fileId)}/read-options`, accessToken);

/** A read of the file with `options` over the saved ones (nothing is saved): typed columns with quality counts and up to 200 rows. */
export const previewQueryFile = (teamId: string, fileId: string, accessToken: string, body: { options?: Partial<FileReadOptions>; limit?: number } = {}) =>
  call<FilePreview>(`${base(teamId)}/files/${encodeURIComponent(fileId)}/preview`, accessToken, { method: "POST", body });

/** Saves the options with the file. Needs edit access to the card or document that holds it (403 otherwise; 400 on invalid options). */
export const saveFileReadOptions = (teamId: string, fileId: string, options: Partial<FileReadOptions>, accessToken: string) =>
  call<{ options: FileReadOptions }>(`${base(teamId)}/files/${encodeURIComponent(fileId)}/read-options`, accessToken, { method: "PUT", body: options });
