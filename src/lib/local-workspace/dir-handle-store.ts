// Persist the picked FileSystemDirectoryHandle in IndexedDB so a Local workspace
// reconnects to its folder across reloads without re-prompting (subject to the
// browser regranting permission via verifyPermission).

const DB_NAME = "killio-local-workspace";
const STORE = "handles";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export async function saveDirHandle(workspaceId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  await tx("readwrite", (s) => s.put(handle, workspaceId));
}

export async function loadDirHandle(workspaceId: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const h = await tx<FileSystemDirectoryHandle | undefined>("readonly", (s) => s.get(workspaceId));
    return h ?? null;
  } catch {
    return null;
  }
}

export async function deleteDirHandle(workspaceId: string): Promise<void> {
  try { await tx("readwrite", (s) => s.delete(workspaceId)); } catch { /* ignore */ }
}
