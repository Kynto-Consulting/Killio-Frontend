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
