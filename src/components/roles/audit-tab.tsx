"use client";

import { useCallback, useEffect, useState } from "react";
import { Gavel } from "lucide-react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { listAuditLog, listBans, unbanMember, type AuditEntry, type BanEntry } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import { AUDIT_FILTER_ACTIONS, auditActionKey, humanizeKey, summarizeMetadata } from "@/lib/roles/audit";
import { ApiNotice, Avatar, Dialog, EmptyState, btn, btnDanger, btnPrimary, card, cx, formatDate, inputCls } from "./ui";
import { useSettings } from "./settings-context";


export function AuditTab() {
  const t = useTranslations("roles");
  const { locale } = useI18n();
  const s = useSettings();
  const canUnban = s.perms.can("members.ban");
  const [bans, setBans] = useState<BanEntry[] | null>(null);
  const [log, setLog] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState<BanEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [b, l] = await Promise.allSettled([listBans(s.teamId, s.accessToken), listAuditLog(s.teamId, s.accessToken, { action: action || undefined })]);
    setBans(b.status === "fulfilled" ? b.value : []);
    setLog(l.status === "fulfilled" ? l.value.entries : []);
    setNextBefore(l.status === "fulfilled" ? l.value.nextBefore : null);
    const failed = [b, l].find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setError(failed.reason instanceof Error ? failed.reason.message : String(failed.reason));
  }, [s.teamId, s.accessToken, action]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listAuditLog(s.teamId, s.accessToken, { action: action || undefined, before: nextBefore });
      setLog((prev) => [...(prev ?? []), ...page.entries.filter((e) => !(prev ?? []).some((x) => x.id === e.id))]);
      setNextBefore(page.nextBefore);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const nameOfId = (id: string): string | null =>
    s.roles.find((r) => r.id === id)?.name ?? s.groups.find((g) => g.id === id)?.name ?? s.members.find((m) => m.id === id)?.name ?? null;

  const unban = async () => {
    if (!unbanning) return;
    setBusy(true);
    try {
      await unbanMember(s.teamId, unbanning.userId, s.accessToken);
      toast(t("audit.unbanned", { name: unbanning.name }), "success");
      setUnbanning(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <ApiNotice message={error} />}

      <section className={cx(card, "p-3")} aria-labelledby="bans-title">
        <h2 id="bans-title" className="mb-2 text-sm font-bold text-foreground">{t("audit.bansTitle")}</h2>
        {bans === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : bans.length === 0 ? (
          <EmptyState title={t("audit.noBans")} />
        ) : (
          <ul className="divide-y divide-border">
            {bans.map((b) => (
              <li key={b.userId} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("audit.bannedOn", { date: formatDate(b.bannedAt, locale) })}
                    {b.bannedByName ? ` · ${t("audit.by", { name: b.bannedByName })}` : ""}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </div>
                </div>
                {canUnban && <button type="button" className={btn} onClick={() => setUnbanning(b)}>{t("audit.unban")}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cx(card, "p-3")} aria-labelledby="log-title">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="log-title" className="text-sm font-bold text-foreground">{t("audit.logTitle")}</h2>
          <select value={action} onChange={(e) => setAction(e.target.value)} aria-label={t("audit.filter")} className={cx(inputCls, "w-52")}>
            <option value="">{t("audit.allActions")}</option>
            {AUDIT_FILTER_ACTIONS.map((a) => (
              <option key={a} value={a}>{tr(`audit.action.${auditActionKey(a)}`, humanizeKey(a))}</option>
            ))}
          </select>
        </div>
        {log === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : log.length === 0 ? (
          <EmptyState title={t("audit.empty")} />
        ) : (
          <ul className="divide-y divide-border">
            {log.map((e) => {
              const actor = e.actorId ? s.members.find((m) => m.id === e.actorId) : undefined;
              const actorName = e.actorName ?? actor?.alias ?? actor?.name ?? t("audit.system");
              const meta = summarizeMetadata(e.metadata, nameOfId);
              return (
                <li key={e.id} className="flex gap-2.5 py-2 text-sm">
                  <Avatar name={actorName} email={actor?.primaryEmail} url={actor?.avatarUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-semibold text-foreground">
                        {tr(`audit.action.${auditActionKey(e.action)}`, humanizeKey(e.action))}
                        {e.targetName ? <span className="font-normal text-muted-foreground"> · {t("audit.target", { name: e.targetName })}</span> : null}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatDate(e.createdAt, locale)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {t("audit.by", { name: actorName })}
                      {e.reason ? ` · ${t("audit.reason", { reason: e.reason })}` : ""}
                    </div>
                    {meta.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        {meta.map((m) => (
                          <span key={m.key} className="min-w-0 break-words"><span className="font-semibold">{tr(`audit.meta.${m.key}`, humanizeKey(m.key))}:</span> {m.value}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {nextBefore && (
          <div className="mt-2 text-center">
            <button type="button" className={btn} onClick={loadMore} disabled={loadingMore}>{loadingMore ? t("loading") : t("audit.loadMore")}</button>
          </div>
        )}
      </section>

      {unbanning && (
        <Dialog icon={<Gavel />} title={t("audit.unbanTitle", { name: unbanning.name })} onClose={() => setUnbanning(null)} busy={busy} footer={<><button type="button" className={btn} onClick={() => setUnbanning(null)} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnPrimary} onClick={unban} disabled={busy}>{t("audit.unban")}</button></>}>
          <p className="text-sm text-foreground">{t("audit.unbanBody")}</p>
        </Dialog>
      )}
    </div>
  );
}
