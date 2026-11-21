"use client";

import { useCallback, useEffect, useState } from "react";

import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { listAuditLog, listBans, unbanMember, type AuditEntry, type BanEntry } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import { ApiNotice, Dialog, EmptyState, btn, btnDanger, btnPrimary, card, cx, formatDate, inputCls } from "./ui";
import { useSettings } from "./settings-context";

const ACTIONS = ["kick", "ban", "unban", "mute", "unmute", "roles_changed", "role_created", "role_updated", "role_deleted", "ownership_transferred"];

export function AuditTab() {
  const t = useTranslations("roles");
  const { locale } = useI18n();
  const s = useSettings();
  const canUnban = s.perms.can("members.ban");
  const [bans, setBans] = useState<BanEntry[] | null>(null);
  const [log, setLog] = useState<AuditEntry[] | null>(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unbanning, setUnbanning] = useState<BanEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [b, l] = await Promise.allSettled([listBans(s.teamId, s.accessToken), listAuditLog(s.teamId, s.accessToken, { action: action || undefined })]);
    setBans(b.status === "fulfilled" ? b.value : []);
    setLog(l.status === "fulfilled" ? l.value : []);
    const failed = [b, l].find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) setError(failed.reason instanceof Error ? failed.reason.message : String(failed.reason));
  }, [s.teamId, s.accessToken, action]);
  useEffect(() => {
    void load();
  }, [load]);

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
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{t(`audit.action.${a}`)}</option>
            ))}
          </select>
        </div>
        {log === null ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : log.length === 0 ? (
          <EmptyState title={t("audit.empty")} />
        ) : (
          <ul className="divide-y divide-border">
            {log.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {t(`audit.action.${e.action}`) === `audit.action.${e.action}` ? e.action : t(`audit.action.${e.action}`)}
                    {e.targetName ? <span className="font-normal text-muted-foreground"> · {e.targetName}</span> : null}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(e.createdAt, locale)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {e.actorName ? t("audit.by", { name: e.actorName }) : ""}
                  {e.reason ? ` · ${t("audit.reason", { reason: e.reason })}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {unbanning && (
        <Dialog title={t("audit.unbanTitle", { name: unbanning.name })} onClose={() => setUnbanning(null)} busy={busy} footer={<><button type="button" className={btn} onClick={() => setUnbanning(null)} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnPrimary} onClick={unban} disabled={busy}>{t("audit.unban")}</button></>}>
          <p className="text-sm text-foreground">{t("audit.unbanBody")}</p>
        </Dialog>
      )}
    </div>
  );
}
