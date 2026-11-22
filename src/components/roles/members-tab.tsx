"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Gavel, LogOut, MoreHorizontal, ShieldCheck, UserX, VolumeX, Volume2, Pencil } from "lucide-react";

import { useTranslations, useI18n } from "@/components/providers/i18n-provider";
import { ApiError, removeTeamMember, updateTeamMemberAlias, updateTeamMemberRole } from "@/lib/api/contracts";
import { invalidateTeamPermissions } from "@/hooks/use-team-permissions";
import { banMember, kickMember, muteMember, setMemberRoles, unmuteMember } from "@/lib/api/roles";
import { toast } from "@/lib/toast";
import { assignableRoles, effectiveRoles, filterMembers, groupRoleIds, memberActionBlockReason, memberRoleIds, paginate, sortRoles } from "@/lib/roles/model";
import { RolePicker } from "./role-picker";
import { useMemberTarget, useSettings, type SettingsMember } from "./settings-context";
import { Avatar, Dialog, EmptyState, RoleChip, btn, btnDanger, btnIcon, btnPrimary, card, cx, formatDate, inputCls } from "./ui";

const PAGE_SIZE = 25;
const MUTE_OPTIONS: Array<{ id: string; minutes: number | null }> = [
  { id: "10m", minutes: 10 },
  { id: "1h", minutes: 60 },
  { id: "1d", minutes: 60 * 24 },
  { id: "1w", minutes: 60 * 24 * 7 },
  { id: "forever", minutes: null },
];

type Action = "roles" | "mute" | "kick" | "ban" | "alias" | "leave";

export function MembersTab() {
  const t = useTranslations("roles");
  const s = useSettings();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ member: SettingsMember; action: Action } | null>(null);

  const filtered = useMemo(
    () =>
      filterMembers(s.members, {
        query,
        roleId: roleFilter || null,
        groupId: groupFilter || null,
        roleIdsOf: (m) => [...memberRoleIds(m, s.roles), ...groupRoleIds(m.id, s.groups)],
        groupIdsOf: (m) => s.groups.filter((g) => g.memberUserIds.includes(m.id)).map((g) => g.id),
      }),
    [s.members, s.roles, s.groups, query, roleFilter, groupFilter],
  );
  useEffect(() => setPage(1), [query, roleFilter, groupFilter]);
  // Humans first, bots after (stable otherwise).
  const ordered = useMemo(() => [...filtered.filter((m) => !m.isBot), ...filtered.filter((m) => m.isBot)], [filtered]);
  const pageData = paginate(ordered, page, PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("members.search")} aria-label={t("members.search")} className={inputCls} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label={t("members.filterRole")} className={cx(inputCls, "sm:w-44")}>
          <option value="">{t("members.allRoles")}</option>
          {sortRoles(s.roles).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label={t("members.filterGroup")} className={cx(inputCls, "sm:w-44")}>
          <option value="">{t("members.allGroups")}</option>
          {s.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground" role="status">{t("members.count", { shown: filtered.length, total: s.members.length })}</p>

      {s.membersLoading && s.members.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={t("members.empty")} />
      ) : (
        <ul className={cx(card, "divide-y divide-border overflow-hidden")}>
          {pageData.items.map((m) => (
            <MemberRow key={m.membershipId} member={m} onAction={(action) => setDialog({ member: m, action })} />
          ))}
        </ul>
      )}

      {pageData.pages > 1 && (
        <nav aria-label={t("members.pagination")} className="flex items-center justify-between gap-2">
          <button type="button" className={btn} disabled={pageData.page <= 1} onClick={() => setPage(pageData.page - 1)}>{t("members.prev")}</button>
          <span className="text-xs text-muted-foreground">{t("members.page", { page: pageData.page, pages: pageData.pages })}</span>
          <button type="button" className={btn} disabled={pageData.page >= pageData.pages} onClick={() => setPage(pageData.page + 1)}>{t("members.next")}</button>
        </nav>
      )}

      {dialog?.action === "roles" && <RolesDialog member={dialog.member} onClose={() => setDialog(null)} />}
      {(dialog?.action === "kick" || dialog?.action === "ban" || dialog?.action === "mute") && <ModerationDialog member={dialog.member} action={dialog.action} onClose={() => setDialog(null)} />}
      {dialog?.action === "alias" && <AliasDialog member={dialog.member} onClose={() => setDialog(null)} />}
      {dialog?.action === "leave" && <LeaveDialog member={dialog.member} onClose={() => setDialog(null)} />}
    </div>
  );
}

/* ───────────────────────── Row + actions menu ───────────────────────── */

function MemberRow({ member, onAction }: { member: SettingsMember; onAction: (a: Action) => void }) {
  const t = useTranslations("roles");
  const { locale } = useI18n();
  const s = useSettings();
  // One chip per role: a role held directly wins over the same role inherited from a group.
  const eff = (() => {
    const seen = new Map<string, ReturnType<typeof effectiveRoles>[number]>();
    for (const e of effectiveRoles({ userId: member.id, roleIds: member.roleIds, role: member.role }, s.roles, s.groups)) {
      const prev = seen.get(e.role.id);
      if (!prev || (prev.source.kind === "group" && e.source.kind === "personal")) seen.set(e.role.id, e);
    }
    return [...seen.values()];
  })();
  const roleNames = new Set(eff.map((e) => e.role.name.trim().toLowerCase()));
  const groups = s.groups.filter((g) => g.memberUserIds.includes(member.id) && !roleNames.has(g.name.trim().toLowerCase()));
  const muted = member.isMuted || (member.mutedUntil ? new Date(member.mutedUntil).getTime() > Date.now() : false);
  const isMe = member.id === s.userId;

  return (
    <li className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={member.alias || member.name} email={member.primaryEmail} url={member.avatarUrl} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-foreground">{member.alias || member.name}</span>
            {member.isBot && <span className="rounded-full border border-border bg-accent/20 px-1.5 text-[9px] font-bold uppercase text-foreground">{t("members.bot")}</span>}
            {isMe && <span className="rounded-full border border-border px-1.5 text-[9px] font-bold uppercase text-muted-foreground">{t("members.you")}</span>}
            {muted && <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-1.5 text-[9px] font-bold uppercase text-amber-800 dark:text-amber-300">{t("members.muted")}</span>}
            {member.status !== "active" && <span className="rounded-full border border-border px-1.5 text-[9px] font-bold uppercase text-muted-foreground">{member.status}</span>}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{member.isBot ? t("members.botHint") : member.primaryEmail}</div>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1" aria-label={t("members.roles")}>
        {eff.length === 0 ? (
          <RoleChip name={member.role} color={null} />
        ) : (
          eff.map((e, i) => <RoleChip key={`${e.role.id}-${i}`} name={e.role.name} color={e.role.color} muted={e.source.kind === "group"} title={e.source.kind === "group" ? t("members.viaGroup", { group: e.source.groupName }) : t("members.personal")} />)
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {groups.length > 0 && <span className="truncate">{groups.map((g) => g.name).join(", ")}</span>}
        <span>{t("members.joined", { date: formatDate(member.joinedAt, locale) })}</span>
      </div>
      <div className="md:justify-self-end">
        <MemberMenu member={member} onAction={onAction} />
      </div>
    </li>
  );
}

function MemberMenu({ member, onAction }: { member: SettingsMember; onAction: (a: Action) => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const target = useMemberTarget(member);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isMe = member.id === s.userId;

  const reason = (perm: string) => {
    const r = memberActionBlockReason(s.actor, s.userId, target, perm);
    return r ? t(`block.member.${r}`, { permission: t(`perm.${perm.replace(/[.]/g, "_")}.name`) }) : null;
  };
  const items: Array<{ id: Action; icon: React.ReactNode; label: string; block: string | null; danger?: boolean }> = [];
  const rolePerm = s.perms.can("members.manage_roles") ? "members.manage_roles" : "members.manage";
  items.push({ id: "roles", icon: <ShieldCheck className="h-3.5 w-3.5" />, label: t("actions.roles"), block: reason(rolePerm) });
  items.push({ id: "mute", icon: <VolumeX className="h-3.5 w-3.5" />, label: t("actions.mute"), block: reason("members.mute") });
  items.push({ id: "kick", icon: <UserX className="h-3.5 w-3.5" />, label: t("actions.kick"), block: reason("members.kick"), danger: true });
  items.push({ id: "ban", icon: <Gavel className="h-3.5 w-3.5" />, label: t("actions.ban"), block: reason("members.ban"), danger: true });
  const canAlias = isMe || s.perms.can("members.manage");
  const menu = [
    ...(canAlias ? [{ id: "alias" as Action, icon: <Pencil className="h-3.5 w-3.5" />, label: t("actions.alias"), block: null as string | null }] : []),
    ...(isMe && !target.isOwner ? [{ id: "leave" as Action, icon: <LogOut className="h-3.5 w-3.5" />, label: t("actions.leave"), block: null as string | null, danger: true }] : []),
    ...(!isMe ? items : []),
  ];
  if (menu.length === 0) return <span className="text-[11px] text-muted-foreground">{t("actions.none")}</span>;

  return (
    <div className="relative">
      <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("actions.open", { name: member.alias || member.name })} onClick={() => setOpen((o) => !o)} className={btnIcon}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                btnRef.current?.focus();
              }
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]"));
                const i = els.indexOf(document.activeElement as HTMLElement);
                els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
              }
            }}
          >
            {menu.map((it, i) => (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                autoFocus={i === 0}
                aria-disabled={!!it.block}
                title={it.block ?? undefined}
                onClick={() => {
                  if (it.block) return;
                  setOpen(false);
                  onAction(it.id);
                }}
                className={cx("flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent/10 focus-visible:bg-accent/10 focus-visible:outline-none", it.block && "cursor-not-allowed opacity-60", (it as { danger?: boolean }).danger && !it.block && "text-red-700 dark:text-red-300")}
              >
                <span className="flex items-center gap-2 font-semibold">{it.icon}{it.label}</span>
                {it.block && <span className="pl-5 text-[11px] font-normal text-muted-foreground">{it.block}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Dialogs ───────────────────────── */

function RolesDialog({ member, onClose }: { member: SettingsMember; onClose: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const current = memberRoleIds(member, s.roles);
  const [ids, setIds] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState<"admin" | "member" | "viewer" | "guest">(["admin", "member", "viewer", "guest"].includes(member.role) ? (member.role as "admin") : "member");
  const hasRoles = s.roles.length > 0;
  const changed = hasRoles ? ids.slice().sort().join() !== current.slice().sort().join() : legacy !== member.role;

  const save = async () => {
    setBusy(true);
    try {
      if (hasRoles) await setMemberRoles(s.teamId, member.id, ids, s.accessToken);
      else await updateTeamMemberRole(s.teamId, member.membershipId, legacy, s.accessToken);
      invalidateTeamPermissions(s.teamId);
      await s.reloadMembers();
      toast(t("toast.membersUpdated"), "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };
  const eff = effectiveRoles({ userId: member.id, roleIds: member.roleIds, role: member.role }, s.roles, s.groups).filter((e) => e.source.kind === "group");

  return (
    <Dialog icon={<ShieldCheck />} title={t("rolesDialog.title", { name: member.alias || member.name })} onClose={onClose} busy={busy} footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnPrimary} onClick={save} disabled={busy || !changed}>{t("common.save")}</button></>}>
      <p className="text-xs text-muted-foreground">{t("rolesDialog.help")}</p>
      {hasRoles ? (
        <RolePicker roles={s.roles} value={ids} onChange={setIds} actor={s.actor} disabled={busy} />
      ) : (
        <select value={legacy} onChange={(e) => setLegacy(e.target.value as typeof legacy)} className={inputCls} aria-label={t("picker.label")}>
          {(["admin", "member", "viewer", "guest"] as const).map((r) => (
            <option key={r} value={r}>{t(`legacyRole.${r}`)}</option>
          ))}
        </select>
      )}
      {eff.length > 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-2">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("rolesDialog.fromGroups")}</div>
          <div className="flex flex-wrap gap-1">
            {eff.map((e, i) => (
              <RoleChip key={i} name={e.role.name} color={e.role.color} muted title={e.source.kind === "group" ? e.source.groupName : undefined} />
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ModerationDialog({ member, action, onClose }: { member: SettingsMember; action: "kick" | "ban" | "mute"; onClose: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("1h");
  const [busy, setBusy] = useState(false);
  const muted = member.isMuted || (member.mutedUntil ? new Date(member.mutedUntil).getTime() > Date.now() : false);
  const name = member.alias || member.name;

  const run = async (unmute = false) => {
    setBusy(true);
    const why = reason.trim() || null;
    try {
      if (action === "mute") {
        if (unmute) await unmuteMember(s.teamId, member.id, s.accessToken);
        else await muteMember(s.teamId, member.id, why, MUTE_OPTIONS.find((o) => o.id === duration)?.minutes ?? null, s.accessToken);
      } else if (action === "ban") {
        await banMember(s.teamId, member.id, why, s.accessToken);
      } else {
        try {
          await kickMember(s.teamId, member.id, why, s.accessToken);
        } catch (e) {
          // Older servers have no moderation route: the plain removal still works (the reason is not stored then).
          if (e instanceof ApiError && (e.status === 404 || e.status === 405)) await removeTeamMember(s.teamId, member.membershipId, s.accessToken);
          else throw e;
        }
      }
      await s.reloadMembers();
      toast(t(`moderation.done.${unmute ? "unmute" : action}`, { name }), "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };

  return (
    <Dialog
      icon={<Gavel />}
      tone={action === "mute" ? undefined : "danger"}
      title={t(`moderation.title.${action}`, { name })}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {action === "mute" && muted && (
            <button type="button" className={btn} onClick={() => run(true)} disabled={busy}><Volume2 className="h-3.5 w-3.5" aria-hidden />{t("moderation.unmute")}</button>
          )}
          <button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button type="button" className={action === "mute" ? btnPrimary : btnDanger} onClick={() => run()} disabled={busy}>{t(`moderation.confirm.${action}`)}</button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground">{t(`moderation.help.${action}`)}</p>
      {action === "mute" && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-foreground">{t("moderation.duration")}</span>
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls}>
            {MUTE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{t(`moderation.durations.${o.id}`)}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-foreground">{t("moderation.reason")}</span>
        <textarea value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} placeholder={t("moderation.reasonPlaceholder")} className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <span className="mt-1 block text-[11px] text-muted-foreground">{t("moderation.reasonHelp")}</span>
      </label>
    </Dialog>
  );
}

function AliasDialog({ member, onClose }: { member: SettingsMember; onClose: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [alias, setAlias] = useState(member.alias ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await updateTeamMemberAlias(s.teamId, member.membershipId, value, s.accessToken);
      await s.reloadMembers();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };
  return (
    <Dialog icon={<Pencil />} title={t("alias.title")} onClose={onClose} busy={busy} footer={<>{member.alias && <button type="button" className={btn} onClick={() => save(null)} disabled={busy}>{t("alias.clear")}</button>}<button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnPrimary} onClick={() => save(alias.trim() || null)} disabled={busy}>{t("common.save")}</button></>}>
      <p className="text-xs text-muted-foreground">{t("alias.help")}</p>
      <input value={alias} maxLength={60} onChange={(e) => setAlias(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save(alias.trim() || null)} aria-label={t("alias.title")} className={inputCls} />
    </Dialog>
  );
}

function LeaveDialog({ member, onClose }: { member: SettingsMember; onClose: () => void }) {
  const t = useTranslations("roles");
  const s = useSettings();
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    setBusy(true);
    try {
      await removeTeamMember(s.teamId, member.membershipId, s.accessToken);
      window.location.href = "/";
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };
  return (
    <Dialog icon={<LogOut />} tone="danger" title={t("leave.title")} onClose={onClose} busy={busy} footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnDanger} onClick={leave} disabled={busy}>{t("leave.confirm")}</button></>}>
      <p className="text-sm text-foreground">{t("leave.body")}</p>
    </Dialog>
  );
}
