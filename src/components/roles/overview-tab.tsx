"use client";

import { useState } from "react";
import { Crown, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { deleteTeam, renameTeam } from "@/lib/api/contracts";
import { invalidateTeamPermissions } from "@/hooks/use-team-permissions";
import { invalidateTeamRoles } from "@/hooks/use-team-roles";
import { transferOwnership } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import { usePermissionCatalog } from "@/hooks/use-permission-catalog";
import { groupHeldByCatalog } from "@/lib/roles/catalog";
import { confirmationMatches, sortRoles } from "@/lib/roles/model";
import { OriginBadge, usePermText, useProviderText } from "./role-permissions-editor";
import { useSettings } from "./settings-context";
import { Avatar, Dialog, RoleChip, btn, btnDanger, btnPrimary, card, cx, inputCls } from "./ui";

export function OverviewTab({ onRenamed }: { onRenamed: (name: string) => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const canRename = s.perms.can("team.manage") && !s.team?.isPersonal;
  const [name, setName] = useState(s.team?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<"transfer" | "delete" | null>(null);

  const teamName = s.team?.name ?? "";
  const myRoles = sortRoles(s.perms.roles.map((r) => ({ ...r })));
  const { catalog } = usePermissionCatalog(s.teamId);
  const text = usePermText();
  const prov = useProviderText();
  const held = groupHeldByCatalog(s.perms.permissions, catalog);
  const isOwner = s.perms.isOwner;

  const rename = async () => {
    if (!canRename || saving || !name.trim() || name.trim() === teamName) return;
    setSaving(true);
    try {
      const res = await renameTeam(s.teamId, name.trim(), s.accessToken);
      onRenamed(res.name);
      toast(t("overview.renamed"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cx(card, "space-y-3 p-3")} aria-labelledby="ov-space">
          <h2 id="ov-space" className="text-sm font-bold text-foreground">{t("overview.space")}</h2>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-foreground">{t("overview.name")}</span>
            <div className="flex gap-2">
              <input value={name} maxLength={64} disabled={!canRename} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} className={inputCls} />
              {canRename && <button type="button" className={btnPrimary} disabled={saving || !name.trim() || name.trim() === teamName} onClick={rename}>{t("common.save")}</button>}
            </div>
            {!canRename && <span className="mt-1 block text-[11px] text-muted-foreground">{s.team?.isPersonal ? t("overview.personal") : t("overview.noRename")}</span>}
          </label>
          {s.team?.description && (
            <div>
              <span className="mb-1 block text-xs font-semibold text-foreground">{t("overview.description")}</span>
              <p className="text-sm text-muted-foreground">{s.team.description}</p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border px-3 py-2">
              <dt className="text-muted-foreground">{t("overview.plan")}</dt>
              <dd className="mt-0.5 text-sm font-bold capitalize text-foreground">{s.team?.planTier ?? "free"}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <dt className="text-muted-foreground">{t("overview.members")}</dt>
              <dd className="mt-0.5 text-sm font-bold text-foreground">{s.members.length}</dd>
            </div>
          </dl>
        </section>

        <section className={cx(card, "space-y-3 p-3")} aria-labelledby="ov-me">
          <h2 id="ov-me" className="text-sm font-bold text-foreground">{t("overview.myRole")}</h2>
          <div className="flex flex-wrap gap-1.5">
            {isOwner && <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-bold"><Crown className="h-3 w-3" aria-hidden />{t("overview.owner")}</span>}
            {myRoles.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />)}
            {!isOwner && myRoles.length === 0 && <span className="text-xs text-muted-foreground">{t("overview.noRoles")}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{s.perms.source === "fallback" ? t("overview.fallback") : t("overview.myPermissionsHelp")}</p>
          {isOwner ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">{t("overview.ownerAll")}</p>
          ) : held.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("overview.nothing")}</p>
          ) : (
            <div className="space-y-2">
              {held.map((g) => (
                <div key={`${g.providerId}/${g.group}`}>
                  <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {text.group(g.group, g.groupLabel)}
                    {g.providerId !== "core" && <><span className="normal-case">{prov.label({ id: g.providerId, label: catalog.providers.find((p) => p.id === g.providerId)?.label ?? "" })}</span><OriginBadge providerId={g.providerId} /></>}
                  </div>
                  <ul className="flex flex-wrap gap-1">
                    {g.keys.map((k) => (
                      <li key={k} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">{text.nameOfKey(catalog, k)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {(isOwner || s.perms.can("team.manage")) && !s.team?.isPersonal && (
        <section className="rounded-xl border border-red-500/60 bg-red-500/5 p-3" aria-labelledby="ov-danger">
          <h2 id="ov-danger" className="mb-2 text-sm font-bold text-red-700 dark:text-red-300">{t("overview.danger")}</h2>
          {isOwner ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="max-w-xl">
                  <div className="text-sm font-semibold text-foreground">{t("overview.transfer")}</div>
                  <p className="text-xs text-muted-foreground">{t("overview.transferHelp")}</p>
                </div>
                <button type="button" className={btn} onClick={() => setDialog("transfer")}><Crown className="h-3.5 w-3.5" aria-hidden />{t("overview.transferBtn")}</button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-red-500/30 pt-3">
                <div className="max-w-xl">
                  <div className="text-sm font-semibold text-foreground">{t("overview.delete")}</div>
                  <p className="text-xs text-muted-foreground">{t("overview.deleteHelp")}</p>
                </div>
                <button type="button" className={btnDanger} onClick={() => setDialog("delete")}><Trash2 className="h-3.5 w-3.5" aria-hidden />{t("overview.deleteBtn")}</button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("overview.dangerOwnerOnly")}</p>
          )}
        </section>
      )}

      {dialog === "transfer" && <TransferDialog teamName={teamName} onClose={() => setDialog(null)} />}
      {dialog === "delete" && <DeleteDialog teamName={teamName} onClose={() => setDialog(null)} />}
    </div>
  );
}

function TransferDialog({ teamName, onClose }: { teamName: string; onClose: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [to, setTo] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const candidates = s.members.filter((m) => m.status === "active" && m.id !== s.userId);
  const target = candidates.find((m) => m.id === to);
  const ok = !!target && confirmationMatches(typed, teamName);

  const run = async () => {
    if (!ok || !target) return;
    setBusy(true);
    try {
      await transferOwnership(s.teamId, target.id, s.accessToken);
      invalidateTeamPermissions(s.teamId);
      invalidateTeamRoles(s.teamId);
      await s.reloadMembers();
      toast(t("overview.transferred", { name: target.alias || target.name }), "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };

  return (
    <Dialog icon={<Crown />} tone="danger" title={t("overview.transferTitle")} onClose={onClose} busy={busy} footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnDanger} onClick={run} disabled={!ok || busy}>{t("overview.transferConfirm")}</button></>}>
      <p className="text-xs text-muted-foreground">{t("overview.transferWarn")}</p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-foreground">{t("overview.transferTo")}</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}>
          <option value="">{t("overview.transferPick")}</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>{m.alias || m.name} · {m.primaryEmail}</option>
          ))}
        </select>
      </label>
      {target && (
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
          <Avatar name={target.alias || target.name} email={target.primaryEmail} url={target.avatarUrl} size={26} />
          <span className="text-sm font-semibold text-foreground">{target.alias || target.name}</span>
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-foreground">{t("overview.typeName", { name: teamName })}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={teamName} autoComplete="off" className={inputCls} />
      </label>
    </Dialog>
  );
}

function DeleteDialog({ teamName, onClose }: { teamName: string; onClose: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!confirmationMatches(typed, teamName)) return;
    setBusy(true);
    try {
      await deleteTeam(s.teamId, s.accessToken);
      window.location.href = "/";
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };
  return (
    <Dialog icon={<Trash2 />} tone="danger" title={t("overview.deleteTitle")} onClose={onClose} busy={busy} footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnDanger} onClick={run} disabled={busy || !confirmationMatches(typed, teamName)}>{t("overview.deleteBtn")}</button></>}>
      <p className="text-xs text-muted-foreground">{t("overview.deleteWarn")}</p>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-foreground">{t("overview.typeName", { name: teamName })}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={teamName} autoComplete="off" className={inputCls} />
      </label>
    </Dialog>
  );
}
