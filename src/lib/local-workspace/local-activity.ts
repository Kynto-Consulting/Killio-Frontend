// Local activity log. The cloud activity feed is backed by the team activity
// table; offline we keep a per-entity hidden sidecar file living next to the
// entity, named `.<entityfile>.h` (dot-prefixed → hidden on unix, and excluded
// from entity listings because `.h` is not a Killio extension).
//
// Format: a `#killio-activity <ver>` header + KAML payload `{ entries: [...] }`.
// Entries mirror the cloud ActivityLogEntry shape so the existing drawers can
// render them without changes. To keep the file compact during editing, logging
// "touches" (updates the timestamp of) the last entry when it has the same
// action within a short window instead of appending a new row.

import { stringifyKaml, parseKaml } from "@/lib/killio-file/kaml.ts";
import { readWorkspaceFileWithMeta, writeWorkspaceFile, splitPath, joinPath } from "./fs-access.ts";

const HEADER = "#killio-activity 2026-v1";
const MAX_ENTRIES = 500;
const DEFAULT_DEDUPE_MS = 2 * 60 * 1000;

export type LocalActivityEntry = {
  id: string;
  action: string;
  actorId: string;
  createdAt: string;
  scope: string;
  scopeId: string;
  payload?: Record<string, unknown>;
};

type DirHandle = FileSystemDirectoryHandle;

/** Path of the hidden activity sidecar for an entity at `entityPath`. */
export function activitySidecarPath(entityPath: string): string {
  const { dirs, name } = splitPath(entityPath);
  return joinPath(dirs.join("/"), `.${name}.h`);
}

function genId(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function decode(text: string): LocalActivityEntry[] {
  const nl = text.indexOf("\n");
  const body = nl === -1 ? "" : text.slice(nl + 1);
  try {
    const payload = parseKaml(body) as { entries?: unknown };
    return Array.isArray(payload?.entries) ? (payload.entries as LocalActivityEntry[]) : [];
  } catch { return []; }
}

function encode(entries: LocalActivityEntry[]): string {
  return `${HEADER}\n${stringifyKaml({ entries })}\n`;
}

/** Read the activity log for an entity, newest-first. */
export async function readLocalActivity(dir: DirHandle, entityPath: string): Promise<LocalActivityEntry[]> {
  const meta = await readWorkspaceFileWithMeta(dir, activitySidecarPath(entityPath));
  if (!meta) return [];
  const entries = decode(meta.text);
  return entries.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Append (or touch) an activity entry for an entity. */
export async function logLocalActivity(
  dir: DirHandle,
  entityPath: string,
  entry: { action: string; actorId: string; scope: string; scopeId: string; payload?: Record<string, unknown> },
  opts: { dedupeMs?: number } = {},
): Promise<void> {
  const path = activitySidecarPath(entityPath);
  const existing = await readWorkspaceFileWithMeta(dir, path);
  const entries = existing ? decode(existing.text) : [];
  const now = Date.now();
  const dedupeMs = opts.dedupeMs ?? DEFAULT_DEDUPE_MS;

  // Touch the most-recent entry if same actor+action within the window and no
  // distinguishing payload changes — keeps continuous edits from spamming rows.
  const last = entries[entries.length - 1];
  if (
    last && last.action === entry.action && last.actorId === entry.actorId &&
    now - new Date(last.createdAt).getTime() <= dedupeMs &&
    JSON.stringify(last.payload ?? {}) === JSON.stringify(entry.payload ?? {})
  ) {
    last.createdAt = new Date(now).toISOString();
  } else {
    entries.push({
      id: genId(),
      action: entry.action,
      actorId: entry.actorId,
      createdAt: new Date(now).toISOString(),
      scope: entry.scope,
      scopeId: entry.scopeId,
      payload: entry.payload,
    });
  }

  const trimmed = entries.slice(-MAX_ENTRIES);
  await writeWorkspaceFile(dir, path, encode(trimmed));
}
