// Local-workspace folders. A folder is a real subdirectory on disk; its display
// metadata (name/color/icon) lives in a `<foldername>.kf` marker file inside it.
// Children are derived from the disk listing, not stored in the marker.

import {
  ensureWorkspaceDir,
  removeWorkspaceDir,
  listWorkspaceFolders,
  writeWorkspaceFile,
  readWorkspaceFileWithMeta,
  joinPath,
  type WorkspaceFolderEntry,
} from "./fs-access.ts";
import { encodeKillioFile, decodeKillioFile } from "@/lib/killio-file";
import { folderMetaToKf, kfToFolderMeta, KF_SCHEMA } from "./adapters.ts";

export type LocalFolder = {
  /** Relative dir path, e.g. "specs/v2" — also used as the folder id. */
  path: string;
  name: string;
  /** Parent folder path ("" at root). */
  parent: string;
  color: string;
  icon: string;
};

type DirHandle = FileSystemDirectoryHandle;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "folder";

/** Path of the `.kf` marker for a folder at `folderPath`. */
function markerPath(folderPath: string, dirName: string): string {
  return joinPath(folderPath, `${dirName}.kf`);
}

/** List all folders on disk with their metadata resolved from `.kf` markers. */
export async function listLocalFolders(dir: DirHandle): Promise<LocalFolder[]> {
  const entries: WorkspaceFolderEntry[] = await listWorkspaceFolders(dir);
  const out: LocalFolder[] = [];
  for (const e of entries) {
    let name = e.name;
    let color = "#64748b";
    let icon = "folder";
    if (e.metaFile) {
      const meta = await readWorkspaceFileWithMeta(dir, joinPath(e.path, e.metaFile));
      if (meta) {
        try {
          const kf = kfToFolderMeta(decodeKillioFile(meta.text).payload);
          name = kf.name || e.name;
          color = kf.color;
          icon = kf.icon;
        } catch { /* corrupt marker → fall back to dir name */ }
      }
    }
    out.push({ path: e.path, name, parent: e.parent, color, icon });
  }
  return out;
}

/** Create a folder (subdirectory) under `parentPath` and write its `.kf` marker.
 *  Returns the created folder's path. */
export async function createLocalFolder(
  dir: DirHandle,
  parentPath: string,
  meta: { name: string; color?: string | null; icon?: string | null },
): Promise<LocalFolder> {
  const dirName = slug(meta.name);
  const path = joinPath(parentPath, dirName);
  await ensureWorkspaceDir(dir, path);
  await writeWorkspaceFile(
    dir,
    markerPath(path, dirName),
    encodeKillioFile({ kind: "kf", schemaVersion: KF_SCHEMA, payload: folderMetaToKf(meta) }),
  );
  return { path, name: meta.name, parent: parentPath, color: meta.color ?? "#64748b", icon: meta.icon ?? "folder" };
}

/** Update an existing folder's `.kf` metadata (name/color/icon only; not moves). */
export async function updateLocalFolderMeta(
  dir: DirHandle,
  folderPath: string,
  meta: { name?: string; color?: string | null; icon?: string | null },
): Promise<void> {
  const dirName = folderPath.split("/").filter(Boolean).pop() ?? "folder";
  const existing = await readWorkspaceFileWithMeta(dir, markerPath(folderPath, dirName));
  const current = existing ? kfToFolderMeta(decodeKillioFile(existing.text).payload) : folderMetaToKf({ name: dirName });
  await writeWorkspaceFile(
    dir,
    markerPath(folderPath, dirName),
    encodeKillioFile({
      kind: "kf",
      schemaVersion: KF_SCHEMA,
      payload: folderMetaToKf({ name: meta.name ?? current.name, color: meta.color ?? current.color, icon: meta.icon ?? current.icon }),
    }),
  );
}

/** Delete a folder and everything inside it. */
export async function removeLocalFolder(dir: DirHandle, folderPath: string): Promise<void> {
  await removeWorkspaceDir(dir, folderPath);
}
