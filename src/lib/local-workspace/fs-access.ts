// File System Access API wrapper for the "Local" workspace (plan 11, Fase 1).
// A local workspace is bound to a folder on the user's disk; Killio entities are
// saved there as KAML files (.kd/.km/.kb/.ks) instead of the cloud.

import type { KillioKind } from "@/lib/killio-file";

export type WorkspaceFileEntry = { name: string; kind: KillioKind };

const EXT_TO_KIND: Record<string, KillioKind> = { kd: "kd", km: "km", kb: "kb", ks: "ks" };
const KIND_TO_EXT: Record<KillioKind, string> = { kd: ".kd", km: ".km", kb: ".kb", ks: ".ks" };

/** Map a filename to its Killio kind by extension, or null if not a Killio file. Pure. */
export function kindFromFilename(name: string): KillioKind | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_KIND[name.slice(dot + 1).toLowerCase()] ?? null;
}

export function isKillioFile(name: string): boolean {
  return kindFromFilename(name) !== null;
}

export function extForKind(kind: KillioKind): string {
  return KIND_TO_EXT[kind];
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

type DirHandle = FileSystemDirectoryHandle;

/** Prompt the user to pick a workspace folder (read/write). */
export async function pickWorkspaceDirectory(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o?: unknown) => Promise<DirHandle> }).showDirectoryPicker;
  return picker({ mode: "readwrite", startIn: "documents" });
}

/**
 * Check read/write permission for a stored handle. With requestIfNeeded=false
 * only queries (safe on mount); true may prompt the user (needs a gesture).
 */
export async function verifyPermission(handle: DirHandle, write = true, requestIfNeeded = true): Promise<boolean> {
  const opts = { mode: write ? "readwrite" : "read" } as const;
  const h = handle as unknown as {
    queryPermission?: (o: unknown) => Promise<PermissionState>;
    requestPermission?: (o: unknown) => Promise<PermissionState>;
  };
  if (h.queryPermission && (await h.queryPermission(opts)) === "granted") return true;
  if (requestIfNeeded && h.requestPermission && (await h.requestPermission(opts)) === "granted") return true;
  return false;
}

export async function writeWorkspaceFile(dir: DirHandle, filename: string, contents: string): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await (fileHandle as unknown as { createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }).createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function readWorkspaceFile(dir: DirHandle, filename: string): Promise<string> {
  const fileHandle = await dir.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function deleteWorkspaceFile(dir: DirHandle, filename: string): Promise<void> {
  await dir.removeEntry(filename);
}

/** List all Killio files (.kd/.km/.kb/.ks) in the workspace folder. */
export async function listWorkspaceFiles(dir: DirHandle): Promise<WorkspaceFileEntry[]> {
  const entries: WorkspaceFileEntry[] = [];
  const iter = (dir as unknown as { values: () => AsyncIterable<{ kind: string; name: string }> }).values();
  for await (const entry of iter) {
    if (entry.kind !== "file") continue;
    const kind = kindFromFilename(entry.name);
    if (kind) entries.push({ name: entry.name, kind });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}
