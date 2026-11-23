"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { speakerId, type KnownSpeaker } from "@/lib/app-shell/voice/speaker-id";

/**
 * Telling voices apart, on this device: the switch, and the voices heard so far so the person can
 * name them ("Person 2" becomes "Marta") or forget them. Shown inside Killio App only.
 */
export function SpeakersSettings() {
  const t = useTranslations("dashboard");
  // The store keeps no snapshot object: a counter re-renders this on every change.
  const [version, setVersion] = useState(0);
  useEffect(() => speakerId.subscribe(() => setVersion((v) => v + 1)), []);
  const [enabled, setEnabled] = useState(false);
  const [speakers, setSpeakers] = useState<KnownSpeaker[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setEnabled(speakerId.enabled);
    setSpeakers(speakerId.list());
  }, [version]);

  const label = (s: KnownSpeaker) => s.name ?? t("vault.speakers.person", { number: s.number ?? "" });
  const save = (id: string) => {
    setError("");
    try {
      speakerId.rename(id, draft);
      setEditing(null);
    } catch {
      setError(t("vault.speakers.nameTaken"));
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => speakerId.setEnabled(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t("vault.speakers.title")}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{t("vault.speakers.hint")}</span>
        </span>
      </label>

      {enabled && speakerId.lastError ? <p className="mt-3 text-xs text-destructive" role="alert">{t("vault.speakers.failed")} {speakerId.lastError}</p> : null}

      {speakers.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("vault.speakers.heard")}</p>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {speakers.map((s) => (
              <li key={s.speakerId} className="flex items-center gap-2 p-2 text-sm">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {editing === s.speakerId ? (
                  <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(s.speakerId); }}>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={40}
                      placeholder={t("vault.speakers.namePlaceholder")}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button type="submit" aria-label={t("vault.speakers.saveName")} title={t("vault.speakers.saveName")} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground">
                      <Check className="h-4 w-4" />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{label(s)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("vault.speakers.phrases", { count: s.phrases })}</span>
                    <button
                      type="button"
                      onClick={() => { setError(""); setDraft(s.name ?? ""); setEditing(s.speakerId); }}
                      aria-label={t("vault.speakers.rename", { name: label(s) })}
                      title={t("vault.speakers.rename", { name: label(s) })}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => speakerId.forget(s.speakerId)}
                      aria-label={t("vault.speakers.forget", { name: label(s) })}
                      title={t("vault.speakers.forget", { name: label(s) })}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
          <button type="button" onClick={() => { if (window.confirm(t("vault.speakers.clearConfirm"))) speakerId.clear(); }} className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive">
            {t("vault.speakers.clear")}
          </button>
        </div>
      ) : enabled ? (
        <p className="mt-3 text-xs text-muted-foreground">{t("vault.speakers.none")}</p>
      ) : null}
    </div>
  );
}
