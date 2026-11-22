"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowUpCircle, Bot, CheckCircle2, ChevronDown, FileText, GitBranch, Layout, LayoutTemplate, Lock, MessageSquare,
  Package, RefreshCcw, ShieldCheck, Shield, Tag, Users, X, Zap,
} from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { FOCUS_RING, SOFT_PRIMARY, SOFT_SECONDARY } from "@/components/marketplace/pack-ui";
import {
  adoptLegacyPackInstall,
  applyPackUpdate,
  listTeamPackInstalls,
  previewPackUpdate,
  type PackInstallEntry,
  type PackInstallsResponse,
  type UpdateApplyResult,
  type UpdatePlanItem,
  type UpdatePreview,
} from "@/lib/api/marketplace";
import { countResults, groupPlan, hasWork, installStatus, overwritePayload, placeholderPayload, reportableResults, versionLabel, type PlanSection } from "@/lib/marketplace/updates";

const ASSET_ICONS: Record<string, React.ElementType> = { document: FileText, board: Layout, mesh: GitBranch, script: Zap, card_template: LayoutTemplate, tag_group: Tag, group: Users, role: Shield, room: MessageSquare, bot: Bot };

const BTN_PRIMARY = `${SOFT_PRIMARY} h-9 px-4 text-[13px]`;
const BTN_SECONDARY = `${SOFT_SECONDARY} h-9 px-3 text-[13px]`;

/** Tones come from the theme (light and dark); no hard-coded surfaces. */
const TONE = {
  info: "border-primary/30 bg-primary/10 text-foreground",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  bad: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  muted: "border-border bg-foreground/5 text-foreground/80",
} as const;

const SECTION_TONE: Record<PlanSection, keyof typeof TONE> = { conflicts: "warn", updated: "info", added: "ok", keptContent: "muted", removed: "muted", skipped: "muted" };

/* ── the list of installs of a workspace ── */

export function usePackInstalls(teamId: string | null | undefined) {
  const { accessToken } = useSession();
  const [data, setData] = useState<PackInstallsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!teamId || !accessToken) return;
    setLoading(true);
    try {
      setData(await listTeamPackInstalls(teamId, accessToken));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [accessToken, teamId]);

  useEffect(() => { reload().catch(() => undefined); }, [reload]);
  return { data, loading, error, reload };
}

/* ── small pieces ── */

function StatusChip({ entry }: { entry: PackInstallEntry }) {
  const t = useTranslations("marketplace");
  const status = installStatus(entry);
  const label = versionLabel(entry.installedVersion, entry.latest?.version);
  if (status === "update") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${TONE.info}`}>
        <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {label.revision ? t("update.availableRevision", { version: label.from }) : t("update.available", { from: label.from, to: label.to })}
      </span>
    );
  }
  if (status === "conflicts") {
    return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${TONE.warn}`}>{t("update.conflictsBadge", { count: entry.pending?.conflicts ?? 0 })}</span>;
  }
  if (status === "check") return <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${TONE.muted}`}>{t("update.installedVersion", { version: entry.installedVersion })}</span>;
  if (status === "unavailable") return <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${TONE.muted}`}>{t("update.unavailable")}</span>;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${TONE.ok}`}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{t("update.upToDate", { version: entry.installedVersion })}</span>;
}

function ItemRow({ item, children }: { item: Pick<UpdatePlanItem, "assetType" | "name" | "logicalKey">; children?: React.ReactNode }) {
  const t = useTranslations("marketplace");
  const Icon = ASSET_ICONS[item.assetType] ?? FileText;
  return (
    <li className="rounded-xl border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{item.name ?? item.logicalKey}</span>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground/70">{t(`assetTypes.${item.assetType}`)}</span>
      </div>
      {children}
    </li>
  );
}

const KNOWN_FIELDS = new Set(["color", "mentionable", "selfAssignable", "permissions", "description", "roleIds", "emoji", "channelType", "slowmodeSeconds", "categoryId", "overrides", "name", "avatarUrl", "allowBotTriggers", "commands", "roomPermissions", "graph", "lock", "codeLock"]);

function fieldList(t: ReturnType<typeof useTranslations>, fields: string[]): string {
  return fields.map((f) => (KNOWN_FIELDS.has(f) ? t(`update.fields.${f}`) : f)).join(", ");
}

/* ── the dialog: preview, choices, apply, result ── */

type DialogProps = { teamId: string; packId: string; packTitle: string; hub?: boolean; onClose: () => void; onApplied?: () => void };

export function PackUpdateDialog({ teamId, packId, packTitle, hub = false, onClose, onApplied }: DialogProps) {
  const t = useTranslations("marketplace");
  const { locale } = useI18n();
  const { accessToken } = useSession();
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [result, setResult] = useState<UpdateApplyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({});
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const plan = await previewPackUpdate(teamId, packId, { locale }, accessToken, hub);
      setPreview(plan);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("update.errors.preview"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, hub, locale, packId, t, teamId]);

  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !applying) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applying, onClose]);

  const groups = useMemo(() => groupPlan(preview?.items ?? []), [preview]);
  const chosen = useMemo(() => overwritePayload(overwrite, preview?.items ?? []), [overwrite, preview]);
  const missing = preview?.missingPlaceholders ?? [];
  const missingFilled = missing.every((m) => (placeholders[m.key] ?? "").trim() !== "");
  const canApply = !!preview && !result && !applying && missingFilled && (hasWork(preview.summary, chosen.length) || preview.to.versionId !== preview.from.versionId);

  const toggle = (key: string) => setOverwrite((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const apply = async () => {
    if (!accessToken || !preview) return;
    setApplying(true);
    setError(null);
    try {
      const done = await applyPackUpdate(teamId, packId, { locale, overwrite: chosen, placeholderValues: placeholderPayload(placeholders) }, accessToken, hub);
      setResult(done);
      onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("update.errors.apply"));
    } finally {
      setApplying(false);
    }
  };

  const label = preview ? versionLabel(preview.from.version, preview.to.version) : null;
  const counts = result ? countResults(result.results) : null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !applying) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="pack-update-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/60">{t("update.title")}</p>
            <h2 id="pack-update-title" className="mt-1 truncate text-lg font-black tracking-tight text-foreground">{packTitle}</h2>
            {label ? <p className="mt-0.5 text-[13px] font-semibold text-foreground/70">{label.revision ? t("update.revisionOf", { version: label.from }) : `${label.from} → ${label.to}`}</p> : null}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={applying} aria-label={t("update.close")} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-40 ${FOCUS_RING}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-busy={loading || applying}>
          <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium ${TONE.ok}`}>
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("update.reassure")}
          </p>

          {loading ? (
            <div className="space-y-2" role="status" aria-label={t("status.loading")}>
              {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-foreground/10 motion-reduce:animate-none" />)}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${TONE.bad}`}>
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{error}</span>
              {!preview ? <button type="button" onClick={() => load().catch(() => undefined)} className={BTN_SECONDARY}><RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />{t("gallery.retry")}</button> : null}
            </div>
          ) : null}

          {preview && !result ? (
            <>
              {preview.to.changelog ? (
                <section aria-label={t("update.changelog")} className="rounded-xl border border-border px-3 py-2">
                  <h3 className="text-[12px] font-extrabold uppercase tracking-wider text-foreground/60">{t("update.changelog")}</h3>
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground/90">{preview.to.changelog}</p>
                </section>
              ) : null}

              {missing.length > 0 ? (
                <section className={`rounded-xl border px-3 py-3 ${TONE.warn}`}>
                  <h3 className="text-sm font-bold">{t("update.placeholdersTitle")}</h3>
                  <p className="mt-0.5 text-[13px]">{t("update.placeholdersHint")}</p>
                  <div className="mt-2 space-y-2">
                    {missing.map((m) => (
                      <label key={m.key} className="block text-[13px] font-semibold text-foreground">
                        {m.key}{m.description ? <span className="ml-1 font-normal text-foreground/70">({m.description})</span> : null}
                        <input value={placeholders[m.key] ?? ""} onChange={(e) => setPlaceholders((cur) => ({ ...cur, [m.key]: e.target.value }))} className={`mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-normal ${FOCUS_RING}`} />
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}

              {groups.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground/70">{t("update.noChanges")}</p> : null}

              {groups.map(({ section, items }) => (
                <section key={section} aria-label={t(`update.sections.${section}.title`)}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${TONE[SECTION_TONE[section]]}`}>{items.length}</span>
                    <h3 className="text-sm font-extrabold text-foreground">{t(`update.sections.${section}.title`)}</h3>
                  </div>
                  <p className="mb-2 text-[13px] text-foreground/70">{t(`update.sections.${section}.hint`)}</p>
                  <ul className="space-y-1.5">
                    {items.map((item) => (
                      <ItemRow key={item.logicalKey} item={item}>
                        {item.fields.length > 0 ? <p className="mt-1 text-[12px] text-foreground/70">{t("update.changes", { fields: fieldList(t, item.fields) })}</p> : null}
                        {section === "conflicts" ? (
                          <div className="mt-1.5">
                            <p className="text-[12px] text-foreground/70">{item.reason === "baseline_unknown" ? t("update.reasons.baseline_unknown") : t("update.reasons.edited_locally")}</p>
                            {item.overwritable && preview.canOverwrite ? (
                              <label className={`mt-1.5 flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold ${overwrite.has(item.logicalKey) ? TONE.warn : "border-border text-foreground"}`}>
                                <input type="checkbox" checked={overwrite.has(item.logicalKey)} onChange={() => toggle(item.logicalKey)} className="mt-0.5 h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                                <span>{t("update.overwrite")}<span className="block font-normal text-foreground/70">{t("update.overwriteHint")}</span></span>
                              </label>
                            ) : item.overwritable ? <p className="mt-1 text-[12px] font-semibold text-foreground/70">{t("update.overwriteNoPermission")}</p> : null}
                          </div>
                        ) : section === "skipped" ? (
                          <p className="mt-1 flex items-center gap-1 text-[12px] text-foreground/70">{item.decision === "skip_locked" ? <Lock className="h-3 w-3" aria-hidden="true" /> : null}{t(`update.reasons.${item.reason}`)}</p>
                        ) : section === "keptContent" || section === "removed" ? (
                          <p className="mt-1 text-[12px] text-foreground/70">{t(`update.reasons.${item.reason}`)}</p>
                        ) : null}
                      </ItemRow>
                    ))}
                  </ul>
                </section>
              ))}

              {preview.warnings.length > 0 ? (
                <ul className={`space-y-1 rounded-xl border px-3 py-2 text-[12px] ${TONE.warn}`}>{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              ) : null}
            </>
          ) : null}

          {result ? (
            <section aria-live="polite" aria-label={t("update.results.title")}>
              <p className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${counts && counts.error > 0 ? TONE.warn : TONE.ok}`}>
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {result.noop ? t("update.results.noop") : counts && counts.error > 0 ? t("update.results.withErrors", { count: counts.error }) : t("update.results.done", { version: result.to.version })}
              </p>
              {counts ? (
                <ul className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-bold">
                  {(["updated", "added", "kept", "skipped", "conflict", "error"] as const).filter((k) => counts[k] > 0).map((k) => (
                    <li key={k} className={`rounded-full border px-2.5 py-0.5 ${k === "error" ? TONE.bad : k === "conflict" ? TONE.warn : k === "updated" || k === "added" ? TONE.ok : TONE.muted}`}>{counts[k]} · {t(`update.results.status.${k}`)}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="mt-3 space-y-1.5">
                {reportableResults(result.results).map((r) => (
                  <ItemRow key={r.logicalKey} item={r}>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-foreground/70">
                      <span className={`rounded-full border px-2 py-0.5 font-bold ${r.status === "error" ? TONE.bad : r.status === "conflict" ? TONE.warn : r.status === "updated" || r.status === "added" ? TONE.ok : TONE.muted}`}>{t(`update.results.status.${r.status}`)}</span>
                      {r.fields && r.fields.length > 0 ? <span>{fieldList(t, r.fields)}</span> : null}
                      {r.message ? <span className="min-w-0">{r.message}</span> : null}
                    </p>
                  </ItemRow>
                ))}
              </ul>
              {result.warnings.length > 0 ? <ul className={`mt-3 space-y-1 rounded-xl border px-3 py-2 text-[12px] ${TONE.warn}`}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={applying} className={BTN_SECONDARY}>{result ? t("update.close") : t("actions.cancel")}</button>
          {!result ? (
            <button type="button" onClick={() => apply().catch(() => undefined)} disabled={!canApply} className={BTN_PRIMARY}>
              <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
              {applying ? t("update.applying") : chosen.length > 0 ? t("update.applyWithOverwrite", { count: chosen.length }) : t("update.apply")}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

/* ── detail page: a notice when THIS pack has an update in this workspace ── */

export function PackUpdateNotice({ teamId, packId, packTitle, hub = false }: { teamId: string | null | undefined; packId: string; packTitle: string; hub?: boolean }) {
  const t = useTranslations("marketplace");
  const { data, reload } = usePackInstalls(teamId);
  const [open, setOpen] = useState(false);
  const entry = data?.installs.find((i) => i.packId === packId);
  if (!teamId || !entry || !data?.canManage) return null;
  const status = installStatus(entry);
  if (status === "upToDate" || status === "unavailable") return null;
  return (
    <>
      <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${status === "update" ? TONE.info : TONE.muted}`}>
        <div className="min-w-0">
          <StatusChip entry={entry} />
          {entry.latest?.changelog ? <p className="mt-1.5 line-clamp-2 text-[13px] text-foreground/80">{entry.latest.changelog}</p> : null}
        </div>
        <button type="button" onClick={() => setOpen(true)} className={BTN_PRIMARY}>{status === "check" ? t("update.check") : t("update.viewChanges")}</button>
      </div>
      {open ? <PackUpdateDialog teamId={teamId} packId={packId} packTitle={packTitle} hub={hub || entry.source === "hub"} onClose={() => setOpen(false)} onApplied={() => reload().catch(() => undefined)} /> : null}
    </>
  );
}

/* ── list page: the packs installed in this workspace ── */

export function InstalledPacksSection({ teamId }: { teamId: string | null | undefined }) {
  const t = useTranslations("marketplace");
  const { locale } = useI18n();
  const { accessToken } = useSession();
  const { data, loading, reload } = usePackInstalls(teamId);
  const [open, setOpen] = useState(true);
  const [dialog, setDialog] = useState<PackInstallEntry | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: keyof typeof TONE; text: string } | null>(null);

  const total = (data?.installs.length ?? 0) + (data?.legacy.length ?? 0);
  const updates = (data?.installs ?? []).filter((i) => installStatus(i) === "update").length;
  if (!teamId || (!loading && total === 0)) return null;

  const adopt = async (packId: string) => {
    if (!accessToken) return;
    setBusy(packId);
    try {
      const done = await adoptLegacyPackInstall(teamId, packId, accessToken);
      setNote({ tone: "ok", text: t("update.legacy.enabled", { count: done.tracked }) });
      await reload();
    } catch (e) {
      setNote({ tone: "bad", text: e instanceof Error ? e.message : t("update.errors.adopt") });
    } finally {
      setBusy(null);
    }
  };

  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString(locale) : "");

  return (
    <section aria-label={t("update.installedSection")} className="mt-3 rounded-2xl border border-border bg-background">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left ${FOCUS_RING}`}>
        <Package className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-extrabold text-foreground">{t("update.installedSection")} <span className="font-semibold text-foreground/60">({total})</span></span>
        {updates > 0 ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE.info}`}>{t("update.updatesCount", { count: updates })}</span> : null}
        <ChevronDown className={`h-4 w-4 shrink-0 text-foreground/60 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          {note ? <p role="status" className={`mb-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${TONE[note.tone]}`}>{note.text}</p> : null}
          <ul className="divide-y divide-border">
            {(data?.installs ?? []).map((entry) => {
              const status = installStatus(entry);
              return (
                <li key={entry.packId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{entry.title ?? entry.slug ?? entry.packId}</p>
                    <p className="text-[12px] text-foreground/60">{t("update.installedVersion", { version: entry.installedVersion })}{entry.installedAt ? ` · ${t("update.installedOn", { date: date(entry.installedAt) })}` : ""}</p>
                  </div>
                  <StatusChip entry={entry} />
                  {data?.canManage && (status === "update" || status === "check" || status === "conflicts") ? (
                    <button type="button" onClick={() => setDialog(entry)} className={BTN_SECONDARY}>{status === "check" ? t("update.check") : t("update.viewChanges")}</button>
                  ) : null}
                </li>
              );
            })}
            {(data?.legacy ?? []).map((entry) => (
              <li key={entry.packId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{entry.title ?? entry.slug ?? entry.packId}</p>
                  <p className="text-[12px] text-foreground/60">{t("update.legacy.hint")}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${TONE.muted}`}>{t("update.legacy.title")}</span>
                {entry.canAdopt ? <button type="button" disabled={busy === entry.packId} onClick={() => adopt(entry.packId).catch(() => undefined)} className={BTN_SECONDARY}>{busy === entry.packId ? t("update.legacy.enabling") : t("update.legacy.enable")}</button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {dialog && teamId ? (
        <PackUpdateDialog teamId={teamId} packId={dialog.packId} packTitle={dialog.title ?? dialog.slug ?? dialog.packId} hub={dialog.source === "hub"} onClose={() => setDialog(null)} onApplied={() => reload().catch(() => undefined)} />
      ) : null}
    </section>
  );
}
