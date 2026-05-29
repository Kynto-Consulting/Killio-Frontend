"use client";

// OFFLINE kanban board editor — rendered when a Local workspace is active.
// Reads/writes a .kb KAML file on disk. No realtime. Autosaves to the file and
// detects external edits ("side update"). Card blocks render via the shared
// OfflineBrickRenderer. Focused feature set (lists, cards, titles/summaries);
// expand toward the full cloud board over time.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, HardDrive, Loader2, RefreshCw, X } from "lucide-react";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { readWorkspaceFileWithMeta } from "@/lib/local-workspace/fs-access";
import { boardToKb, kbToBoardDraft, type KbList, type KbCard } from "@/lib/local-workspace/adapters";
import { encodeKillioFile, decodeKillioFile, KILLIO_EXT } from "@/lib/killio-file";
import { OfflineBrickRenderer } from "@/components/bricks/offline-brick-renderer";

const AUTOSAVE_MS = 400;
const POLL_MS = 2000;

function ensureKb(name: string): string {
  return name.endsWith(KILLIO_EXT.kb) ? name : `${name}${KILLIO_EXT.kb}`;
}
function mkId(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function BoardPageOffline() {
  const params = useParams() as { path?: string | string[] };
  const filename = useMemo(() => {
    const segs = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
    return ensureKb(segs.map((s) => decodeURIComponent(s)).join("/"));
  }, [params.path]);
  const { mode, status, getDir, writeFile, reconnect } = useLocalWorkspace();

  const [name, setName] = useState("");
  const [lists, setLists] = useState<KbList[]>([]);
  const [activeCard, setActiveCard] = useState<{ listIdx: number; cardIdx: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const dirtyRef = useRef(false);
  const lastModifiedRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((text: string) => {
    const draft = kbToBoardDraft(decodeKillioFile(text).payload);
    setName(draft.name);
    setLists(draft.lists);
  }, []);

  useEffect(() => {
    if (mode !== "local") return;
    const dir = getDir();
    if (!dir) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const meta = await readWorkspaceFileWithMeta(dir, filename);
      if (cancelled) return;
      if (meta) { try { apply(meta.text); } catch { /* ignore */ } lastModifiedRef.current = meta.lastModified; }
      else { setName(filename.replace(KILLIO_EXT.kb, "")); setLists([]); dirtyRef.current = true; }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mode, filename, getDir, apply]);

  const persist = useCallback(async () => {
    const dir = getDir();
    if (!dir) return;
    setSaving(true);
    try {
      const payload = boardToKb({ id: filename, name, lists });
      await writeFile(filename, encodeKillioFile({ kind: "kb", schemaVersion: "2026-v1", payload }));
      const meta = await readWorkspaceFileWithMeta(dir, filename);
      if (meta) lastModifiedRef.current = meta.lastModified;
      dirtyRef.current = false;
    } finally { setSaving(false); }
  }, [filename, name, lists, getDir, writeFile]);

  useEffect(() => {
    if (loading || mode !== "local") return;
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persist(); }, AUTOSAVE_MS);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [name, lists, loading, mode, persist]);

  useEffect(() => {
    if (mode !== "local" || loading) return;
    const dir = getDir();
    if (!dir) return;
    const id = setInterval(async () => {
      const meta = await readWorkspaceFileWithMeta(dir, filename);
      if (!meta || meta.lastModified <= lastModifiedRef.current + 1) return;
      if (dirtyRef.current) return;
      try { apply(meta.text); lastModifiedRef.current = meta.lastModified; } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [mode, loading, filename, getDir, apply]);

  const addList = () => setLists((cur) => [...cur, { id: mkId(), name: "New list", cards: [] }]);
  const renameList = (i: number, v: string) => setLists((cur) => cur.map((l, idx) => idx === i ? { ...l, name: v } : l));
  const deleteList = (i: number) => setLists((cur) => cur.filter((_, idx) => idx !== i));
  const addCard = (i: number) => setLists((cur) => cur.map((l, idx) => idx === i ? { ...l, cards: [...l.cards, { id: mkId(), title: "New card", blocks: [] }] } : l));
  const deleteCard = (li: number, ci: number) => setLists((cur) => cur.map((l, idx) => idx === li ? { ...l, cards: l.cards.filter((_, c) => c !== ci) } : l));
  const patchCard = (li: number, ci: number, patch: Partial<KbCard>) => setLists((cur) => cur.map((l, idx) => idx === li ? { ...l, cards: l.cards.map((c, x) => x === ci ? { ...c, ...patch } : c) } : l));

  if (mode !== "local") return null;
  if (status === "needs-permission") {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <HardDrive className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-4 text-sm text-muted-foreground">Reconnect the local folder to edit this board.</p>
        <button onClick={() => void reconnect()} className="rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Reconnect</button>
      </div>
    );
  }
  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const card = activeCard ? lists[activeCard.listIdx]?.cards[activeCard.cardIdx] : null;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="bg-transparent text-xl font-bold text-foreground outline-none" placeholder="Board name" />
        <span className="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300"><HardDrive className="h-3 w-3" /> local</span>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {lists.map((list, li) => (
          <div key={list.id} className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-card/50 p-2">
            <div className="mb-2 flex items-center gap-1">
              <input value={list.name} onChange={(e) => renameList(li, e.target.value)} className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none" />
              <button onClick={() => deleteList(li)} className="rounded p-1 text-muted-foreground hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex flex-col gap-2">
              {list.cards.map((c, ci) => (
                <button key={c.id} onClick={() => setActiveCard({ listIdx: li, cardIdx: ci })} className="rounded-lg border border-border bg-background/60 px-3 py-2 text-left text-sm hover:border-accent/40">
                  {c.title || "Untitled"}
                </button>
              ))}
            </div>
            <button onClick={() => addCard(li)} className="mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent/10"><Plus className="h-3.5 w-3.5" /> Add card</button>
          </div>
        ))}
        <button onClick={addList} className="h-10 w-72 shrink-0 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-accent/40"><Plus className="mr-1 inline h-4 w-4" /> Add list</button>
      </div>

      {card && activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setActiveCard(null)}>
          <div className="flex max-h-[85vh] w-[min(680px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <input value={card.title} onChange={(e) => patchCard(activeCard.listIdx, activeCard.cardIdx, { title: e.target.value })} className="flex-1 bg-transparent text-base font-semibold text-foreground outline-none" />
              <button onClick={() => { deleteCard(activeCard.listIdx, activeCard.cardIdx); setActiveCard(null); }} className="rounded p-1 text-muted-foreground hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
              <button onClick={() => setActiveCard(null)} className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-4">
              <textarea value={card.summary ?? ""} onChange={(e) => patchCard(activeCard.listIdx, activeCard.cardIdx, { summary: e.target.value })} placeholder="Summary…" rows={2} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none" />
              {(Array.isArray(card.blocks) ? card.blocks : []).map((b, bi) => (
                <OfflineBrickRenderer key={(b as { id?: string }).id ?? bi} brick={b as { id: string; kind: string; content?: unknown }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
