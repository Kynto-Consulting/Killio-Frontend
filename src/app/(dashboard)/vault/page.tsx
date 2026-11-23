"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BookOpen, Brain, Cpu, Loader2, Mic, Search, Square } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { AssistantMemorySettings } from "@/components/ui/assistant-memory-settings";
import { SpeakersSettings } from "@/components/app-shell/speakers-settings";
import { getVaultEntitlements, searchDiary, type DiaryEntry, type VaultEntitlements } from "@/lib/api/vault";
import { killioApp } from "@/lib/app-shell";
import { activeListening, type ListeningState } from "@/lib/app-shell/active-listening";
import { isWakePhraseEnabled, setWakePhraseEnabled } from "@/lib/app-shell/wake-phrase";

type Tab = "diary" | "listening" | "memory" | "models";
const OFF: ListeningState = { status: "off", speaking: false, phrases: 0, lastText: "", error: null };

/** Today as YYYY-MM-DD in the device's own time zone: the diary is kept by the person's day. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Vault: what Killio hears and remembers for the person. The diary written by active listening, the switch
 * and plan limits of listening itself, the assistant's memory, and which speech models are in use.
 * It replaces the screens the Killio Vault phone app had; listening itself needs Killio App.
 */
export default function VaultPage() {
  const { accessToken, activeTeamId } = useSession();
  const { locale } = useI18n();
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<Tab>("diary");
  // Decided after mount: the server never knows whether the page runs inside the app.
  const [inApp, setInApp] = useState(false);
  useEffect(() => { setInApp(killioApp() !== null); }, []);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Mic }> = [
    { key: "diary", label: t("vault.tabs.diary"), icon: BookOpen },
    { key: "listening", label: t("vault.tabs.listening"), icon: Mic },
    { key: "memory", label: t("vault.tabs.memory"), icon: Brain },
    { key: "models", label: t("vault.tabs.models"), icon: Cpu },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{t("vault.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("vault.subtitle")}</p>
      </header>

      <div role="tablist" aria-label={t("vault.title")} className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {!accessToken || !activeTeamId ? null : tab === "diary" ? (
        <Diary accessToken={accessToken} teamId={activeTeamId} locale={locale} />
      ) : tab === "listening" ? (
        <Listening accessToken={accessToken} teamId={activeTeamId} inApp={inApp} />
      ) : tab === "memory" ? (
        <div className="space-y-4 [&>div:first-child]:hidden"><AssistantMemorySettings /></div>
      ) : (
        <Models inApp={inApp} />
      )}
    </div>
  );
}

function Diary({ accessToken, teamId, locale }: { accessToken: string; teamId: string; locale: string }) {
  const t = useTranslations("dashboard");
  const [date, setDate] = useState(today);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback((words: string) => {
    let cancelled = false;
    setEntries(null);
    setError("");
    searchDiary(accessToken, { teamId, date, query: words })
      .then((list) => { if (!cancelled) setEntries(list); })
      .catch((e) => { if (!cancelled) { setEntries([]); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { cancelled = true; };
  }, [accessToken, teamId, date]);

  // A new day loads at once; words are searched when the person submits them.
  useEffect(() => load(""), [load]);

  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); load(query); }} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("vault.diary.day")}
          <input type="date" value={date} max={today()} onChange={(e) => { setQuery(""); setDate(e.target.value || today()); }} className="block h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
        </label>
        <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
          {t("vault.diary.search")}
          <span className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2">
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} placeholder={t("vault.diary.searchPlaceholder")} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" />
          </span>
        </label>
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10">{t("vault.diary.find")}</button>
      </form>

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      {entries === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("vault.diary.loading")}</p>
      ) : entries.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">{t("vault.diary.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("vault.diary.emptyHint")}</p>
        </div>
      ) : (
        <ol className="space-y-1">
          {entries.map((entry) => (
            <li key={`${entry.brickId}-${entry.ts}`} className="flex gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
              <time dateTime={new Date(entry.ts).toISOString()} className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{time(entry.ts)}</time>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-6">
                {entry.speaker ? <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{entry.speaker}</span> : null}
                {entry.speaker && entry.text.startsWith(`${entry.speaker}: `) ? entry.text.slice(entry.speaker.length + 2) : entry.text}
              </p>
              <Link href={`/d/${entry.documentId}`} className="shrink-0 pt-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{t("vault.diary.open")}</Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Listening({ accessToken, teamId, inApp }: { accessToken: string; teamId: string; inApp: boolean }) {
  const t = useTranslations("dashboard");
  const state = useSyncExternalStore(activeListening.subscribe, activeListening.getState, () => OFF);
  const [plan, setPlan] = useState<VaultEntitlements | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVaultEntitlements(accessToken, teamId).then((p) => { if (!cancelled) setPlan(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken, teamId]);

  const [wake, setWake] = useState(false);
  useEffect(() => { setWake(isWakePhraseEnabled()); }, []);

  const on = state.status === "listening" || state.status === "starting";
  const minutes = plan?.policy.cloudSttMinutesMonthly ?? null;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${on ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>
            <Mic className={`h-4 w-4 ${state.speaking ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{on ? t("appShell.listening.on") : t("vault.listening.off")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("vault.listening.what")}</p>
            {on ? <p className="mt-2 text-xs text-muted-foreground">{t("appShell.listening.saved", { count: state.phrases })}</p> : null}
            {state.status === "error" && state.error ? <p className="mt-2 text-xs text-destructive" role="alert">{state.error}</p> : null}
          </div>
          {inApp ? (
            <button
              type="button"
              onClick={() => window.__killioListening?.toggle()}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${on ? "border border-border hover:bg-accent/10" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            >
              {on ? <><Square className="h-4 w-4" /> {t("appShell.listening.stop")}</> : <><Mic className="h-4 w-4" /> {t("vault.listening.start")}</>}
            </button>
          ) : null}
        </div>
        {!inApp ? (
          <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
            {t("vault.listening.needsApp")} <Link href="/download" className="font-medium underline underline-offset-2">{t("vault.listening.getApp")}</Link>
          </p>
        ) : null}
      </div>

      {inApp ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4">
          <input
            type="checkbox"
            checked={wake}
            onChange={(e) => { setWakePhraseEnabled(e.target.checked); setWake(e.target.checked); }}
            className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("vault.listening.wake")}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{t("vault.listening.wakeHint")}</span>
          </span>
        </label>
      ) : null}

      {inApp ? <SpeakersSettings /> : null}

      <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-2">
        <Fact label={t("vault.listening.plan")} value={plan ? plan.tier : "…"} />
        <Fact
          label={t("vault.listening.cloudMinutes")}
          value={minutes === null ? "…" : !plan?.policy.enabled || minutes === 0 ? t("vault.listening.notIncluded") : t("vault.listening.minutesPerMonth", { count: minutes })}
        />
        <Fact label={t("vault.listening.transcription")} value={t("vault.listening.transcriptionCloud")} />
        <Fact label={t("vault.listening.audio")} value={t("vault.listening.audioNotKept")} />
      </dl>
      <p className="text-xs text-muted-foreground">{t("vault.listening.limits")}</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

/** Which speech models are in use. Stated as it is: today everything speech-related runs on the server. */
function Models({ inApp }: { inApp: boolean }) {
  const t = useTranslations("dashboard");
  const rows: Array<{ name: string; where: string; ready: boolean }> = [
    { name: t("vault.models.transcription"), where: t("vault.models.cloud"), ready: true },
    { name: t("vault.models.onDevice"), where: t("vault.models.notYet"), ready: false },
    { name: t("vault.models.speakers"), where: t("vault.models.onThisDevice"), ready: true },
    { name: t("vault.models.wakeWord"), where: t("vault.models.fromTranscript"), ready: true },
  ];
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("vault.models.intro")}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-3 bg-card p-3 text-sm">
            <span className="font-medium">{row.name}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${row.ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{row.where}</span>
          </li>
        ))}
      </ul>
      {!inApp ? <p className="text-xs text-muted-foreground">{t("vault.models.appNote")}</p> : null}
    </section>
  );
}
