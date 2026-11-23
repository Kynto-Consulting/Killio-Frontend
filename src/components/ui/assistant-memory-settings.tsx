"use client";

import { useEffect, useState } from "react";
import { Brain, Loader2, Plus, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { addMemory, deleteMemory, listMemories, type AssistantMemory } from "@/lib/api/memories";

/**
 * User settings → what the assistant remembers. The assistant saves these on its own while it works; here
 * the person sees them, adds one, or makes it forget one. Renders nothing where the server does not offer
 * assistant memory. Acts on its own buttons: it is not part of the modal's form.
 */
export function AssistantMemorySettings() {
  const { accessToken, activeTeamId } = useSession();
  const { locale } = useI18n();
  const t = useTranslations("preferences");
  const [memories, setMemories] = useState<AssistantMemory[] | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listMemories(accessToken, activeTeamId)
      .then((list) => { if (!cancelled) setMemories(Array.isArray(list) ? list : []); })
      .catch(() => { /* feature off on this server: the section stays hidden */ });
    return () => { cancelled = true; };
  }, [accessToken, activeTeamId]);

  if (!accessToken || memories === null) return null;

  const add = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy("add");
    setError("");
    try {
      const created = await addMemory(accessToken, text, activeTeamId);
      setMemories((list) => [created, ...(list ?? [])]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const forget = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      await deleteMemory(accessToken, id);
      setMemories((list) => (list ?? []).filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const date = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <>
      <div className="h-px w-full bg-border/50" />
      <div className="space-y-3">
        <label className="text-sm font-medium leading-none flex items-center">
          <Brain className="w-4 h-4 mr-2 text-muted-foreground" />
          {t("memory.label")}
        </label>
        <p className="text-xs text-muted-foreground">{t("memory.desc")}</p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left text-sm transition-colors hover:bg-accent/5"
        >
          <span className="font-medium">{memories.length === 0 ? t("memory.none") : t("memory.count", { count: memories.length })}</span>
          <span className="text-xs text-muted-foreground">{open ? t("memory.hide") : t("memory.show")}</span>
        </button>

        {open ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
                placeholder={t("memory.addPlaceholder")}
                maxLength={2000}
                disabled={busy === "add"}
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void add()}
                disabled={!draft.trim() || busy === "add"}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
              >
                {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("memory.add")}
              </button>
            </div>

            {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}

            {memories.length > 0 ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {memories.map((memory) => (
                  <li key={memory.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words leading-5">{memory.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {date(memory.createdAt)}
                        {memory.teamId ? ` · ${t("memory.thisWorkspace")}` : ` · ${t("memory.everywhere")}`}
                      </p>
                    </div>
                    {confirming === memory.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => void forget(memory.id)} disabled={busy === memory.id} className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground disabled:opacity-50">
                          {busy === memory.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t("memory.forget")}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent/10">
                          {t("memory.keep")}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(memory.id)}
                        aria-label={t("memory.forgetThis")}
                        title={t("memory.forgetThis")}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
