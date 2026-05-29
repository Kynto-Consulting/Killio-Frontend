"use client";

// OFFLINE document editor — rendered (via the dispatcher) when a Local workspace
// is active. Reads/writes a .kd KAML file on disk instead of the cloud API.
// No realtime/presence. Autosaves to the file (debounced) and detects external
// edits to the file ("side update") by polling lastModified.
//
// This is the reference implementation of the `.offline.tsx` mechanic; mesh/board
// follow the same pattern. Brick logic here covers text bricks fully and shows
// other brick kinds read-only (expand per-kind as needed).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, FileText, Loader2, HardDrive, RefreshCw } from "lucide-react";

import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { readWorkspaceFileWithMeta } from "@/lib/local-workspace/fs-access";
import { docToKd, kdToDocDraft, type KdBrick } from "@/lib/local-workspace/adapters";
import { encodeKillioFile, decodeKillioFile, KILLIO_EXT } from "@/lib/killio-file";

const AUTOSAVE_MS = 600;
const POLL_MS = 2500;

function ensureKd(name: string): string {
  return name.endsWith(KILLIO_EXT.kd) ? name : `${name}${KILLIO_EXT.kd}`;
}
function mkId(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `b_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function brickMarkdown(b: KdBrick): string {
  const c = (b.content && typeof b.content === "object" ? b.content : {}) as Record<string, unknown>;
  return typeof c.markdown === "string" ? c.markdown : "";
}

export default function DocumentPageOffline() {
  const { docId } = useParams() as { docId: string };
  const router = useRouter();
  const filename = useMemo(() => ensureKd(decodeURIComponent(docId)), [docId]);
  const { mode, status, getDir, writeFile, reconnect } = useLocalWorkspace();

  const [title, setTitle] = useState("");
  const [bricks, setBricks] = useState<KdBrick[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [externalUpdate, setExternalUpdate] = useState(false);

  const dirtyRef = useRef(false);
  const lastModifiedRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyPayload = useCallback((text: string) => {
    const decoded = decodeKillioFile(text);
    const draft = kdToDocDraft(decoded.payload);
    setTitle(draft.title);
    setBricks(draft.bricks);
  }, []);

  // Initial load (create the file if it does not exist yet).
  useEffect(() => {
    if (mode !== "local") return;
    const dir = getDir();
    if (!dir) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const meta = await readWorkspaceFileWithMeta(dir, filename);
      if (cancelled) return;
      if (meta) {
        try { applyPayload(meta.text); } catch { setNotFound(true); }
        lastModifiedRef.current = meta.lastModified;
      } else {
        // brand-new local doc
        setTitle(filename.replace(KILLIO_EXT.kd, ""));
        setBricks([]);
        dirtyRef.current = true;
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, filename, getDir, applyPayload]);

  const persist = useCallback(async () => {
    const dir = getDir();
    if (!dir) return;
    setSaving(true);
    try {
      const payload = docToKd({ id: filename, title, bricks });
      const text = encodeKillioFile({ kind: "kd", schemaVersion: "2026-v1", payload });
      await writeFile(filename, text);
      const meta = await readWorkspaceFileWithMeta(dir, filename);
      if (meta) lastModifiedRef.current = meta.lastModified; // avoid self-trigger
      dirtyRef.current = false;
    } finally { setSaving(false); }
  }, [filename, title, bricks, getDir, writeFile]);

  // Debounced autosave whenever title/bricks change after load.
  useEffect(() => {
    if (loading || mode !== "local") return;
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, AUTOSAVE_MS);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, bricks, loading, mode, persist]);

  // Side update: poll the file; if it changed on disk and we have no unsaved
  // edits, reload. If we DO have unsaved edits, surface a banner.
  useEffect(() => {
    if (mode !== "local" || loading) return;
    const dir = getDir();
    if (!dir) return;
    const id = setInterval(async () => {
      const meta = await readWorkspaceFileWithMeta(dir, filename);
      if (!meta) return;
      if (meta.lastModified > lastModifiedRef.current + 1) {
        if (dirtyRef.current) { setExternalUpdate(true); }
        else {
          try { applyPayload(meta.text); lastModifiedRef.current = meta.lastModified; setExternalUpdate(false); } catch { /* ignore */ }
        }
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [mode, loading, filename, getDir, applyPayload]);

  const reloadFromDisk = useCallback(async () => {
    const dir = getDir();
    if (!dir) return;
    const meta = await readWorkspaceFileWithMeta(dir, filename);
    if (meta) { try { applyPayload(meta.text); lastModifiedRef.current = meta.lastModified; dirtyRef.current = false; setExternalUpdate(false); } catch { /* ignore */ } }
  }, [filename, getDir, applyPayload]);

  const addTextBrick = () => setBricks((cur) => [...cur, { id: mkId(), kind: "text", position: cur.length, content: { markdown: "" } }]);
  const updateBrickMarkdown = (id: string, md: string) => setBricks((cur) => cur.map((b) => b.id === id ? { ...b, content: { ...(b.content as object), markdown: md } } : b));
  const deleteBrick = (id: string) => setBricks((cur) => cur.filter((b) => b.id !== id).map((b, i) => ({ ...b, position: i })));

  if (mode !== "local") return null;
  if (status === "needs-permission") {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <HardDrive className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-4 text-sm text-muted-foreground">Reconnect the local folder to edit this document.</p>
        <button onClick={() => void reconnect()} className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Reconnect</button>
      </div>
    );
  }
  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (notFound) return <div className="mx-auto max-w-2xl p-10 text-center text-sm text-rose-300">Could not read this .kd file.</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <button onClick={() => router.push("/d")} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-accent/10"><ArrowLeft className="h-3.5 w-3.5" /> Documents</button>
        <span className="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-0.5 text-cyan-300"><HardDrive className="h-3 w-3" /> local · {filename}</span>
        {saving && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> saving</span>}
      </div>

      {externalUpdate && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span>This file changed on disk and you have unsaved edits.</span>
          <button onClick={() => void reloadFromDisk()} className="inline-flex items-center gap-1 rounded bg-amber-400/20 px-2 py-1 font-medium hover:bg-amber-400/30"><RefreshCw className="h-3 w-3" /> Reload from disk</button>
        </div>
      )}

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Untitled"
        className="mb-5 w-full bg-transparent text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/50"
      />

      <div className="space-y-3">
        {bricks.map((b) => (
          <div key={b.id} className="group rounded-lg border border-border bg-card/40 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground"><FileText className="h-3 w-3" /> {b.kind}</span>
              <button onClick={() => deleteBrick(b.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {b.kind === "text" ? (
              <textarea
                value={brickMarkdown(b)}
                onChange={(e) => updateBrickMarkdown(b.id, e.target.value)}
                rows={Math.max(2, brickMarkdown(b).split("\n").length)}
                placeholder="Write markdown…"
                className="w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            ) : (
              <pre className="overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-400">{JSON.stringify(b.content, null, 2)}</pre>
            )}
          </div>
        ))}
      </div>

      <button onClick={addTextBrick} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-accent/40 hover:text-foreground">
        <Plus className="h-4 w-4" /> Add text block
      </button>
    </div>
  );
}
