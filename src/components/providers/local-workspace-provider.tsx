"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  isFileSystemAccessSupported,
  pickWorkspaceDirectory,
  verifyPermission,
  listWorkspaceFiles,
  writeWorkspaceFile,
  readWorkspaceFile,
  deleteWorkspaceFile,
  type WorkspaceFileEntry,
} from "@/lib/local-workspace/fs-access";
import { saveDirHandle, loadDirHandle, deleteDirHandle } from "@/lib/local-workspace/dir-handle-store";
import {
  listLocalFolders,
  createLocalFolder,
  updateLocalFolderMeta,
  removeLocalFolder,
  type LocalFolder,
} from "@/lib/local-workspace/folders";

const REGISTRY_KEY = "killio_local_workspaces";
const ACTIVE_KEY = "killio_active_local";

export type LocalWorkspaceMeta = { id: string; name: string };
export type WorkspaceMode = "cloud" | "local";

type Status = "idle" | "needs-permission" | "connected";

type LocalWorkspaceCtx = {
  supported: boolean;
  mode: WorkspaceMode;
  workspaces: LocalWorkspaceMeta[];
  activeId: string | null;
  active: LocalWorkspaceMeta | null;
  status: Status;
  files: WorkspaceFileEntry[];
  folders: LocalFolder[];
  busy: boolean;
  createFolder: (parentPath: string, meta: { name: string; color?: string | null; icon?: string | null }) => Promise<LocalFolder | null>;
  updateFolder: (folderPath: string, meta: { name?: string; color?: string | null; icon?: string | null }) => Promise<void>;
  removeFolder: (folderPath: string) => Promise<void>;
  createLocalWorkspace: () => Promise<LocalWorkspaceMeta | null>;
  selectLocalWorkspace: (id: string) => Promise<void>;
  exitLocal: () => void;
  removeLocalWorkspace: (id: string) => Promise<void>;
  reconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  writeFile: (filename: string, contents: string) => Promise<void>;
  readFile: (filename: string) => Promise<string>;
  removeFile: (filename: string) => Promise<void>;
  getDir: () => FileSystemDirectoryHandle | null;
};

const Ctx = createContext<LocalWorkspaceCtx | null>(null);

function loadRegistry(): LocalWorkspaceMeta[] {
  if (typeof window === "undefined") return [];
  try { const r = JSON.parse(window.localStorage.getItem(REGISTRY_KEY) || "[]"); return Array.isArray(r) ? r : []; }
  catch { return []; }
}
function persistRegistry(list: LocalWorkspaceMeta[]) {
  if (typeof window !== "undefined") window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
}

export function LocalWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const supported = typeof window !== "undefined" && isFileSystemAccessSupported();
  const [workspaces, setWorkspaces] = useState<LocalWorkspaceMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [busy, setBusy] = useState(false);
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null);

  const mode: WorkspaceMode = activeId ? "local" : "cloud";

  useEffect(() => {
    setWorkspaces(loadRegistry());
    const a = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_KEY) : null;
    if (a) setActiveId(a);
  }, []);

  const refreshFrom = useCallback(async (handle: FileSystemDirectoryHandle) => {
    try { setFiles(await listWorkspaceFiles(handle)); } catch { setFiles([]); }
    try { setFolders(await listLocalFolders(handle)); } catch { setFolders([]); }
  }, []);

  // When the active local workspace changes, try to (re)connect to its folder.
  useEffect(() => {
    if (!activeId) { dirRef.current = null; setFiles([]); setFolders([]); setStatus("idle"); return; }
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_KEY, activeId);
    let cancelled = false;
    (async () => {
      const handle = await loadDirHandle(activeId);
      if (!handle || cancelled) { setStatus("needs-permission"); return; }
      const ok = await verifyPermission(handle, true, false); // query-only on mount
      if (cancelled) return;
      if (ok) { dirRef.current = handle; setStatus("connected"); void refreshFrom(handle); }
      else setStatus("needs-permission");
    })();
    return () => { cancelled = true; };
  }, [activeId, refreshFrom]);

  const createLocalWorkspace = useCallback(async () => {
    if (!supported) return null;
    setBusy(true);
    try {
      const handle = await pickWorkspaceDirectory();
      const id = `lw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const name = (handle as { name?: string }).name || "Local";
      await saveDirHandle(id, handle);
      const meta: LocalWorkspaceMeta = { id, name };
      setWorkspaces((cur) => { const next = [...cur.filter((w) => w.id !== id), meta]; persistRegistry(next); return next; });
      dirRef.current = handle;
      setActiveId(id);
      setStatus("connected");
      await refreshFrom(handle);
      return meta;
    } catch { return null; }
    finally { setBusy(false); }
  }, [supported, refreshFrom]);

  const selectLocalWorkspace = useCallback(async (id: string) => {
    setActiveId(id);
    const handle = await loadDirHandle(id);
    if (!handle) { setStatus("needs-permission"); return; }
    setBusy(true);
    try {
      const ok = await verifyPermission(handle, true, true); // click gesture → may prompt
      if (ok) { dirRef.current = handle; setStatus("connected"); await refreshFrom(handle); }
      else setStatus("needs-permission");
    } finally { setBusy(false); }
  }, [refreshFrom]);

  const reconnect = useCallback(async () => {
    if (!activeId) return;
    await selectLocalWorkspace(activeId);
  }, [activeId, selectLocalWorkspace]);

  const exitLocal = useCallback(() => {
    setActiveId(null);
    if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const removeLocalWorkspace = useCallback(async (id: string) => {
    await deleteDirHandle(id);
    setWorkspaces((cur) => { const next = cur.filter((w) => w.id !== id); persistRegistry(next); return next; });
    if (activeId === id) exitLocal();
  }, [activeId, exitLocal]);

  const refresh = useCallback(async () => { if (dirRef.current) await refreshFrom(dirRef.current); }, [refreshFrom]);

  const writeFile = useCallback(async (filename: string, contents: string) => {
    if (!dirRef.current) throw new Error("No local workspace folder");
    await writeWorkspaceFile(dirRef.current, filename, contents);
    await refreshFrom(dirRef.current);
  }, [refreshFrom]);

  const readFile = useCallback(async (filename: string) => {
    if (!dirRef.current) throw new Error("No local workspace folder");
    return readWorkspaceFile(dirRef.current, filename);
  }, []);

  const removeFile = useCallback(async (filename: string) => {
    if (!dirRef.current) throw new Error("No local workspace folder");
    await deleteWorkspaceFile(dirRef.current, filename);
    await refreshFrom(dirRef.current);
  }, [refreshFrom]);

  const getDir = useCallback(() => dirRef.current, []);

  const createFolder = useCallback(async (parentPath: string, meta: { name: string; color?: string | null; icon?: string | null }) => {
    if (!dirRef.current) throw new Error("No local workspace folder");
    const f = await createLocalFolder(dirRef.current, parentPath, meta);
    await refreshFrom(dirRef.current);
    return f;
  }, [refreshFrom]);

  const updateFolder = useCallback(async (folderPath: string, meta: { name?: string; color?: string | null; icon?: string | null }) => {
    if (!dirRef.current) throw new Error("No local workspace folder");
    await updateLocalFolderMeta(dirRef.current, folderPath, meta);
    await refreshFrom(dirRef.current);
  }, [refreshFrom]);

  const removeFolder = useCallback(async (folderPath: string) => {
    if (!dirRef.current) throw new Error("No local workspace folder");
    await removeLocalFolder(dirRef.current, folderPath);
    await refreshFrom(dirRef.current);
  }, [refreshFrom]);

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  const value = useMemo<LocalWorkspaceCtx>(() => ({
    supported, mode, workspaces, activeId, active, status, files, folders, busy,
    createFolder, updateFolder, removeFolder,
    createLocalWorkspace, selectLocalWorkspace, exitLocal, removeLocalWorkspace,
    reconnect, refresh, writeFile, readFile, removeFile, getDir,
  }), [supported, mode, workspaces, activeId, active, status, files, folders, busy,
    createFolder, updateFolder, removeFolder,
    createLocalWorkspace, selectLocalWorkspace, exitLocal, removeLocalWorkspace,
    reconnect, refresh, writeFile, readFile, removeFile, getDir]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Safe cloud-mode default so any consumer rendered outside the provider (e.g.
// a public/non-dashboard route, or during an SSR/hydration edge) degrades to
// cloud mode instead of crashing the page.
const FALLBACK: LocalWorkspaceCtx = {
  supported: false,
  mode: "cloud",
  workspaces: [],
  activeId: null,
  active: null,
  status: "idle",
  files: [],
  folders: [],
  busy: false,
  createFolder: async () => null,
  updateFolder: async () => {},
  removeFolder: async () => {},
  createLocalWorkspace: async () => null,
  selectLocalWorkspace: async () => {},
  exitLocal: () => {},
  removeLocalWorkspace: async () => {},
  reconnect: async () => {},
  refresh: async () => {},
  writeFile: async () => {},
  readFile: async () => "",
  removeFile: async () => {},
  getDir: () => null,
};

export function useLocalWorkspace(): LocalWorkspaceCtx {
  return useContext(Ctx) ?? FALLBACK;
}
