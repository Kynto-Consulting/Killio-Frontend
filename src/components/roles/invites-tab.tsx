"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, Mail, Trash2 } from "lucide-react";

import { useTenant } from "@/components/providers/tenant-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import {
  createInvite, createInviteLink, listInviteLinks, listTeamInvites, revokeInviteLink, revokeTeamInvite,
  type InviteLink, type InviteSummary,
} from "@/lib/api/contracts";
import { toast } from "@/lib/toast";
import { inviteState, type InviteState } from "@/lib/roles/model";
import { InviteTargets } from "./invite-targets";
import { useSettings } from "./settings-context";
import { RoleChip, btn, btnDanger, btnPrimary, card, cx, formatDate, inputCls } from "./ui";

const EXPIRY = [3, 7, 14, 31, -1];
type LegacyRole = "admin" | "member" | "viewer" | "guest";

const linkUrl = (l: Pick<InviteLink, "acceptUrl" | "token">) => l.acceptUrl || (l.token && typeof window !== "undefined" ? `${window.location.origin}/accept-invite?token=${encodeURIComponent(l.token)}` : null);

export function InvitesTab() {
  const t = useTranslations("roles");
  const { locale } = useI18n();
  const s = useSettings();
  const tenant = useTenant().permissions;
  const canManageMembers = s.perms.can("members.manage");
  const canInvite = !!s.team && !s.team.isPersonal && s.perms.can("members.invite") && (tenant.membersCanInvite || canManageMembers);
  const canRevoke = s.perms.can("invites.manage") || canManageMembers;
  const rolesAvailable = s.roles.length > 0 && !s.rolesError;
  const legacyOptions: LegacyRole[] = (canManageMembers ? ["admin", "member", "viewer", "guest"] : ["member", "viewer", "guest"]).filter((r) => tenant.allowedInviteRoles.includes(r as LegacyRole)) as LegacyRole[];

  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | InviteState>("all");

  // email form
  const [email, setEmail] = useState("");
  const [emailRoles, setEmailRoles] = useState<string[]>([]);
  const [emailGroups, setEmailGroups] = useState<string[]>([]);
  const [emailLegacy, setEmailLegacy] = useState<LegacyRole>("member");
  const [emailExpiry, setEmailExpiry] = useState(3);
  const [sending, setSending] = useState(false);
  // link form
  const [linkRoles, setLinkRoles] = useState<string[]>([]);
  const [linkGroups, setLinkGroups] = useState<string[]>([]);
  const [linkLegacy, setLinkLegacy] = useState<LegacyRole>("member");
  const [linkExpiry, setLinkExpiry] = useState(3);
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!legacyOptions.includes(emailLegacy) && legacyOptions[0]) setEmailLegacy(legacyOptions[0]);
    if (!legacyOptions.includes(linkLegacy) && legacyOptions[0]) setLinkLegacy(legacyOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyOptions.join()]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [i, l] = await Promise.all([listTeamInvites(s.teamId, s.accessToken).catch(() => [] as InviteSummary[]), listInviteLinks(s.teamId, s.accessToken).catch(() => [] as InviteLink[])]);
    setInvites(i);
    setLinks(l);
    setLoading(false);
  }, [s.teamId, s.accessToken]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const send = async () => {
    if (!canInvite || !email.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const payload = rolesAvailable ? { email: email.trim(), roleIds: emailRoles, groupIds: emailGroups, expiresInDays: emailExpiry } : { email: email.trim(), role: emailLegacy, expiresInDays: emailExpiry };
      const inv = await createInvite(payload, s.teamId, s.accessToken);
      if (inv.deliveryStatus !== "sent") setError(inv.deliveryStatus === "skipped" ? t("invite.deliverySkipped") : t("invite.deliveryFailed"));
      else toast(t("invite.sent"), "success");
      setEmail("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toast.error"));
    } finally {
      setSending(false);
    }
  };

  const generate = async () => {
    if (!canInvite || creating) return;
    setCreating(true);
    setError(null);
    try {
      const max = maxUses.trim() === "" ? null : Math.max(1, parseInt(maxUses, 10) || 1);
      const base = rolesAvailable ? { roleIds: linkRoles, groupIds: linkGroups } : { role: linkLegacy };
      const link = await createInviteLink(s.teamId, { ...base, expiresInDays: linkExpiry, maxUses: max }, s.accessToken);
      setLinks((p) => [link, ...p]);
      const url = linkUrl(link);
      if (url) await copy(link.id, url);
      toast(t("invite.linkCreated"), "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toast.error"));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (kind: "invite" | "link", id: string) => {
    try {
      if (kind === "invite") await revokeTeamInvite(s.teamId, id, s.accessToken);
      else await revokeInviteLink(s.teamId, id, s.accessToken);
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
    }
  };

  const rows = useMemo(() => {
    const all = [
      ...invites.map((i) => ({ kind: "invite" as const, id: i.id, label: i.email, roleIds: i.roleIds, legacy: i.role as string, groupIds: i.groupIds, state: inviteState({ status: i.status, expiresAt: i.expiresAt ?? null }), expiresAt: i.expiresAt ?? null, uses: null as string | null, url: null as string | null })),
      ...links.map((l) => ({ kind: "link" as const, id: l.id, label: t("invite.reusableLink"), roleIds: l.roleIds, legacy: l.role, groupIds: l.groupIds, state: inviteState({ expiresAt: l.expiresAt, maxUses: l.maxUses, useCount: l.useCount }), expiresAt: l.expiresAt, uses: l.maxUses != null ? `${l.useCount}/${l.maxUses}` : `${l.useCount}`, url: linkUrl(l) })),
    ];
    return filter === "all" ? all : all.filter((r) => r.state === filter);
  }, [invites, links, filter, t]);

  const expirySelect = (value: number, onChange: (n: number) => void, label: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls}>
        {EXPIRY.map((d) => (
          <option key={d} value={d}>{d === -1 ? t("invite.never") : t("invite.days", { n: d })}</option>
        ))}
      </select>
      {value === -1 && <span className="mt-1 block text-[11px] text-red-700 dark:text-red-300">{t("invite.neverWarning")}</span>}
    </label>
  );

  const legacySelect = (value: LegacyRole, onChange: (r: LegacyRole) => void) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-foreground">{t("invite.roles")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as LegacyRole)} className={inputCls}>
        {legacyOptions.map((r) => (
          <option key={r} value={r}>{t(`legacyRole.${r}`)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      {!canInvite && <p role="status" className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">{s.team?.isPersonal ? t("invite.personal") : t("invite.noPermission")}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">{error}</p>}

      {canInvite && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={cx(card, "space-y-3 p-3")} aria-labelledby="inv-email-title">
            <h2 id="inv-email-title" className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Mail className="h-4 w-4" aria-hidden />{t("invite.byEmail")}</h2>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("invite.emailPlaceholder")} aria-label={t("invite.emailPlaceholder")} className={inputCls} />
            {rolesAvailable ? <InviteTargets roles={s.roles} groups={s.groups} actor={s.actor} roleIds={emailRoles} groupIds={emailGroups} onRoleIds={setEmailRoles} onGroupIds={setEmailGroups} canGroups={s.perms.can("groups.manage")} disabled={sending} /> : legacySelect(emailLegacy, setEmailLegacy)}
            {expirySelect(emailExpiry, setEmailExpiry, t("invite.expiry"))}
            <button type="button" className={btnPrimary} onClick={send} disabled={sending || !email.trim()}>{sending ? t("invite.sending") : t("invite.send")}</button>
          </section>

          <section className={cx(card, "space-y-3 p-3")} aria-labelledby="inv-link-title">
            <h2 id="inv-link-title" className="flex items-center gap-1.5 text-sm font-bold text-foreground"><Link2 className="h-4 w-4" aria-hidden />{t("invite.link")}</h2>
            <p className="text-xs text-muted-foreground">{t("invite.linkHelp")}</p>
            {rolesAvailable ? <InviteTargets roles={s.roles} groups={s.groups} actor={s.actor} roleIds={linkRoles} groupIds={linkGroups} onRoleIds={setLinkRoles} onGroupIds={setLinkGroups} canGroups={s.perms.can("groups.manage")} disabled={creating} /> : legacySelect(linkLegacy, setLinkLegacy)}
            <div className="grid gap-3 sm:grid-cols-2">
              {expirySelect(linkExpiry, setLinkExpiry, t("invite.expiry"))}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-foreground">{t("invite.maxUses")}</span>
                <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t("invite.unlimited")} className={inputCls} />
              </label>
            </div>
            <button type="button" className={btnPrimary} onClick={generate} disabled={creating}>{creating ? t("invite.generating") : t("invite.generate")}</button>
          </section>
        </div>
      )}

      <section className={cx(card, "p-3")} aria-labelledby="inv-list-title">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="inv-list-title" className="text-sm font-bold text-foreground">{t("invite.listTitle")}</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label={t("invite.filter")} className={cx(inputCls, "w-40")}>
            <option value="all">{t("invite.state.all")}</option>
            {(["pending", "active", "used", "expired", "revoked"] as const).map((st) => (
              <option key={st} value={st}>{t(`invite.state.${st}`)}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("invite.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const names = (r.roleIds ?? []).map((id) => s.roles.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
              return (
                <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{r.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {names.length > 0 ? names.map((x) => <RoleChip key={x.id} name={x.name} color={x.color} />) : <RoleChip name={t(`legacyRole.${r.legacy}`)} color={null} />}
                      {(r.groupIds ?? []).length > 0 && <span className="text-[11px] text-muted-foreground">+ {(r.groupIds ?? []).map((id) => s.groups.find((g) => g.id === id)?.name).filter(Boolean).join(", ")}</span>}
                    </div>
                  </div>
                  <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase", r.state === "active" || r.state === "pending" ? "border-emerald-500/50 text-emerald-800 dark:text-emerald-300" : "border-border text-muted-foreground")}>{t(`invite.state.${r.state}`)}</span>
                  <span className="text-[11px] text-muted-foreground">{r.uses ? `${r.uses} · ` : ""}{r.expiresAt ? formatDate(r.expiresAt, locale) : t("invite.never")}</span>
                  {r.url && (
                    <button type="button" className={btn} onClick={() => copy(r.id, r.url!)}>{copied === r.id ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied === r.id ? t("invite.copied") : t("invite.copy")}</button>
                  )}
                  {canRevoke && (r.state === "pending" || r.state === "active") && (
                    <button type="button" className={btnDanger} aria-label={t("invite.revoke")} title={t("invite.revoke")} onClick={() => revoke(r.kind, r.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
