/** How an uploaded file is read by KQL: `/teams/:teamId/query/files/:fileId/{read-options,preview}`. */
import type { FileColumnType, FileReadOptions } from "@/lib/query/file-read-options";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

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

export type FileKind = "csv" | "tsv" | "txt" | "xlsx" | "json";

export interface ReadOptionsResponse {
  options: FileReadOptions;
  saved: boolean;
  kind: FileKind;
  sheets?: string[];
}

export interface PreviewColumn {
  name: string;
  type: FileColumnType;
  detectedType: FileColumnType;
  valid: number;
  errors: number;
  empty: number;
  distinct: number;
}

export type PreviewCell = string | number | boolean | null;

export interface PreviewResponse {
  columns: PreviewColumn[];
  rows: PreviewCell[][];
  rawRows: string[][];
  encodingUsed: string;
  delimiterUsed: string;
  totalRowsSeen: number;
  truncated: boolean;
  warnings: string[];
}

async function call<T>(path: string, accessToken: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
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

const base = (teamId: string, fileId: string) => `/teams/${encodeURIComponent(teamId)}/query/files/${encodeURIComponent(fileId)}`;

export const getReadOptions = (teamId: string, fileId: string, accessToken: string, signal?: AbortSignal) =>
  call<ReadOptionsResponse>(`${base(teamId, fileId)}/read-options`, accessToken, { signal });

export const previewFile = (
  teamId: string,
  fileId: string,
  body: { options?: Partial<FileReadOptions>; limit?: number },
  accessToken: string,
  signal?: AbortSignal,
) => call<PreviewResponse>(`${base(teamId, fileId)}/preview`, accessToken, { method: "POST", body, signal });

export const saveReadOptions = (teamId: string, fileId: string, patch: Partial<FileReadOptions>, accessToken: string) =>
  call<{ options: FileReadOptions }>(`${base(teamId, fileId)}/read-options`, accessToken, { method: "PUT", body: patch });
