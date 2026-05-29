// File System Access API wrapper for the "Local" workspace (plan 11, Fase 1).
// A local workspace is bound to a folder on the user's disk; Killio entities are
// saved there as KAML files (.kd/.km/.kb/.ks) instead of the cloud.

import type { KillioKind } from "@/lib/killio-file";

// `path` is the file's location relative to the workspace root, using `/` for
// nested folders (e.g. "specs/v2/notes.kd"). `folder` is its parent path ("" at
// root). Folder structure mirrors document/board folders on disk.
export type WorkspaceFileEntry = { name: string; path: string; folder: string; kind: KillioKind; lastModified: number };

const EXT_TO_KIND: Record<string, KillioKind> = { kd: "kd", km: "km", kb: "kb", ks: "ks" };
const KIND_TO_EXT: Record<KillioKind, string> = { kd: ".kd", km: ".km", kb: ".kb", ks: ".ks" };
const ASSETS_DIR = "assets";

/** Split a relative path into its folder segments + final name. Pure. */
export function splitPath(path: string): { dirs: string[]; name: string } {
  const segs = path.split("/").map((s) => s.trim()).filter(Boolean);
  const name = segs.pop() ?? "";
  return { dirs: segs, name };
}

/** Join folder + name into a normalized relative path. Pure. */
export function joinPath(folder: string, name: string): string {
  const f = folder.split("/").filter(Boolean).join("/");
  return f ? `${f}/${name}` : name;
}

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

/** Walk/create nested subdirectories, returning the deepest DirHandle. */
async function resolveDir(root: DirHandle, dirs: string[], create: boolean): Promise<DirHandle> {
  let cur = root;
  for (const seg of dirs) cur = await cur.getDirectoryHandle(seg, { create });
  return cur;
}

export async function writeWorkspaceFile(dir: DirHandle, path: string, contents: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  const target = await resolveDir(dir, dirs, true);
  const fileHandle = await target.getFileHandle(name, { create: true });
  const writable = await (fileHandle as unknown as { createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }).createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function readWorkspaceFile(dir: DirHandle, path: string): Promise<string> {
  const { dirs, name } = splitPath(path);
  const target = await resolveDir(dir, dirs, false);
  const fileHandle = await target.getFileHandle(name);
  const file = await fileHandle.getFile();
  return file.text();
}

/** Read a file's text + lastModified for external-change ("side update") detection.
 *  Returns null if the file does not exist yet. */
export async function readWorkspaceFileWithMeta(
  dir: DirHandle,
  path: string,
): Promise<{ text: string; lastModified: number } | null> {
  try {
    const { dirs, name } = splitPath(path);
    const target = await resolveDir(dir, dirs, false);
    const fileHandle = await target.getFileHandle(name);
    const file = await fileHandle.getFile();
    return { text: await file.text(), lastModified: file.lastModified };
  } catch {
    return null;
  }
}

export async function deleteWorkspaceFile(dir: DirHandle, path: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  const target = await resolveDir(dir, dirs, false);
  await target.removeEntry(name);
}

/** Recursively list all Killio files in the workspace folder + subfolders
 *  (skips the assets/ folder). Folder structure is preserved via `path`/`folder`. */
export async function listWorkspaceFiles(dir: DirHandle, basePath = ""): Promise<WorkspaceFileEntry[]> {
  const entries: WorkspaceFileEntry[] = [];
  const iter = (dir as unknown as { values: () => AsyncIterable<{ kind: string; name: string; getFile?: () => Promise<File> }> }).values();
  for await (const entry of iter) {
    if (entry.kind === "file") {
      const kind = kindFromFilename(entry.name);
      if (kind) {
        let lastModified = 0;
        try { lastModified = entry.getFile ? (await entry.getFile()).lastModified : 0; } catch { /* ignore */ }
        entries.push({ name: entry.name, path: joinPath(basePath, entry.name), folder: basePath, kind, lastModified });
      }
    } else if (entry.kind === "directory" && entry.name !== ASSETS_DIR) {
      const sub = await dir.getDirectoryHandle(entry.name);
      const childPath = joinPath(basePath, entry.name);
      entries.push(...(await listWorkspaceFiles(sub, childPath)));
    }
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}
