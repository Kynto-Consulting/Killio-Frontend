// Build a reference/@-mention context from local workspace files. Offline, the
// @ picker references other files in the folder (by relative path) instead of
// cloud entities; resolution points at the local routes (/d, /m, /b).

import type { WorkspaceFileEntry } from "@/lib/local-workspace/fs-access";

export type LocalRefEntity = { id: string; title: string; kind: WorkspaceFileEntry["kind"] };

function titleOf(entry: WorkspaceFileEntry): string {
  return entry.name.replace(/\.(kd|km|kb|ks)$/i, "");
}

/** Documents (.kd) as @-mention targets. id = relative path. */
export function localDocsForPicker(files: WorkspaceFileEntry[]): LocalRefEntity[] {
  return files.filter((f) => f.kind === "kd").map((f) => ({ id: f.path, title: titleOf(f), kind: f.kind }));
}

/** Meshes (.km) + boards (.kb) as @-mention targets. */
export function localBoardsForPicker(files: WorkspaceFileEntry[]): LocalRefEntity[] {
  return files.filter((f) => f.kind === "km" || f.kind === "kb").map((f) => ({ id: f.path, title: titleOf(f), kind: f.kind }));
}

/** Local route for a referenced file path. */
export function localRouteFor(kind: WorkspaceFileEntry["kind"], path: string): string {
  const base = kind === "kd" ? "/d" : kind === "ks" ? "/integrations" : kind === "kb" ? "/b" : "/m";
  const segs = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/${segs}`;
}

// Minimal shape for a local folder (matches LocalFolder in folders.ts without the import).
type LocalFolderLike = { path: string; name: string; parent: string; color?: string; icon?: string };

/**
 * Build the @-mention / reference context (documents, boards, folders) from the
 * local workspace, shaped exactly like the cloud picker expects:
 *  - documents: DocumentSummary-ish ({ id, title, folderId })
 *  - boards: BoardSummary-ish ({ id, name, boardType }) — km→"mesh", kb→"kanban"
 *  - folders: Folder-ish ({ id, name, parentFolderId })
 * ids are relative file/folder paths so RefPill/resolver link to /d|/b|/m/<path>.
 */
export function localPickerContext(files: WorkspaceFileEntry[], folders: LocalFolderLike[] = []): {
  documents: Array<{ id: string; title: string; folderId: string | null; teamId: string; visibility: string; createdAt: string; updatedAt: string }>;
  boards: Array<{ id: string; name: string; boardType: string; teamId: string; visibility: string; createdAt: string; updatedAt: string }>;
  folders: Array<{ id: string; name: string; parentFolderId: string | null; teamId: string; createdAt: string; updatedAt: string }>;
} {
  const documents = files.filter((f) => f.kind === "kd").map((f) => ({
    id: f.path, title: titleOf(f), folderId: f.folder || null,
    teamId: "local", visibility: "private", createdAt: "", updatedAt: "",
  }));
  const boards = files.filter((f) => f.kind === "km" || f.kind === "kb").map((f) => ({
    id: f.path, name: titleOf(f), boardType: f.kind === "km" ? "mesh" : "kanban",
    teamId: "local", visibility: "private", createdAt: "", updatedAt: "",
  }));
  const folderList = folders.map((f) => ({
    id: f.path, name: f.name, parentFolderId: f.parent || null,
    teamId: "local", createdAt: "", updatedAt: "",
  }));
  return { documents, boards, folders: folderList };
}
