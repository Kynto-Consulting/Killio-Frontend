"use client";

// Local-workspace documents browser (folder-aware). Rendered by the /d page when
// a Local workspace is active. Lists .kd files from the folder + subfolders,
// supports drilling into folders, and creates new docs (optionally in a subfolder).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Folder, FolderOpen, Plus, ArrowLeft, HardDrive, Loader2, Trash2 } from "lucide-react";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { joinPath } from "@/lib/local-workspace/fs-access";
import { encodeKillioFile } from "@/lib/killio-file";
import { docToKd } from "@/lib/local-workspace/adapters";
import { toast } from "@/lib/toast";

export function LocalDocsList() {
  const router = useRouter();
  const { status, files, writeFile, removeFile, reconnect, busy } = useLocalWorkspace();
  const [cwd, setCwd] = useState(""); // current folder path, "" = root

  const docs = useMemo(() => files.filter((f) => f.kind === "kd"), [files]);

  // Files directly inside cwd + immediate subfolders that contain docs.
  const { here, subfolders } = useMemo(() => {
    const prefix = cwd ? `${cwd}/` : "";
    const here = docs.filter((f) => f.folder === cwd);
    const subs = new Set<string>();
    for (const f of docs) {
      if (cwd ? f.path.startsWith(prefix) && f.folder !== cwd : f.folder !== "") {
        const rest = cwd ? f.folder.slice(prefix.length) : f.folder;
        const first = rest.split("/")[0];
        if (first) subs.add(first);
      }
    }
    return { here, subfolders: [...subs].sort() };
  }, [docs, cwd]);

  const openDoc = (path: string) => {
    router.push(`/d/${path.split("/").map(encodeURIComponent).join("/")}`);
  };

  const newDoc = async () => {
    const name = typeof window !== "undefined" ? window.prompt("Document name") : null;
    if (!name || !name.trim()) return;
    const fileName = name.trim().endsWith(".kd") ? name.trim() : `${name.trim()}.kd`;
    const path = joinPath(cwd, fileName);
    try {
      const payload = docToKd({ id: path, title: name.trim().replace(/\.kd$/, ""), bricks: [] });
      await writeFile(path, encodeKillioFile({ kind: "kd", schemaVersion: "2026-v1", payload }));
      openDoc(path);
    } catch { toast("Could not create document", "error"); }
  };

  const newFolder = () => {
    const name = typeof window !== "undefined" ? window.prompt("Folder name") : null;
    if (!name || !name.trim()) return;
    setCwd(joinPath(cwd, name.trim())); // materializes on disk when a doc is saved
  };

  const del = async (path: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${path}?`)) return;
    try { await removeFile(path); toast("Deleted", "success"); } catch { toast("Delete failed", "error"); }
  };

  const crumbs = cwd ? cwd.split("/") : [];

  if (status === "needs-permission") {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <HardDrive className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-4 text-sm text-muted-foreground">Reconnect the local folder to access documents.</p>
        <button onClick={() => void reconnect()} className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Reconnect</button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-[1200px] p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><HardDrive className="h-5 w-5 text-cyan-300" /> Documents <span className="text-xs font-normal text-muted-foreground">(local)</span></h1>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <button onClick={() => setCwd("")} className="hover:text-foreground">root</button>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">/ <button onClick={() => setCwd(crumbs.slice(0, i + 1).join("/"))} className="hover:text-foreground">{c}</button></span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newFolder} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:bg-accent/10"><Folder className="h-4 w-4" /> New folder</button>
          <button onClick={newDoc} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary/90 px-4 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New document</button>
        </div>
      </div>

      {cwd && (
        <button onClick={() => setCwd(crumbs.slice(0, -1).join("/"))} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Up</button>
      )}

      {subfolders.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Folders</h2>
          <div className="flex flex-wrap gap-3">
            {subfolders.map((sf) => (
              <button key={sf} onClick={() => setCwd(joinPath(cwd, sf))} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:border-accent/40">
                <FolderOpen className="h-4 w-4 text-amber-300" /> {sf}
              </button>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Files</h2>
      {here.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No documents here. Create one.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {here.map((f) => (
            <div key={f.path} className="group relative flex min-h-[120px] flex-col rounded-xl border border-border bg-card p-4 shadow-sm hover:border-accent/40">
              <button onClick={() => del(f.path)} className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
              <button onClick={() => openDoc(f.path)} className="flex flex-1 flex-col items-start text-left">
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10"><FileText className="h-5 w-5 text-accent" /></div>
                <span className="break-words text-sm font-semibold group-hover:text-accent">{f.name.replace(/\.kd$/, "")}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
