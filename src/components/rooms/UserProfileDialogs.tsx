"use client";

/**
 * Management dialogs opened from the profile card. They add NO logic of their own: roles go through the same RolePicker and
 * `PUT /teams/:id/members/:userId/roles` as /teams, groups through `/teams/:id/groups/:gid/members`, expulsion through
 * `POST /teams/:id/members/:userId/kick`. The server keeps deciding who may do what; the UI only disables what it already knows.
 */

import { useEffect, useMemo, useState } from "react";
import { Gavel, ShieldCheck, Users } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSession } from "@/components/providers/session-provider";
import { invalidateTeamPermissions, useTeamPermissions } from "@/hooks/use-team-permissions";
import { addTeamGroupMembers, listTeamGroups, removeTeamGroupMember, type TeamGroup } from "@/lib/api/groups";
import { kickMember, listRoles, setMemberRoles } from "@/lib/api/roles";
import type { TeamRole } from "@/lib/roles/model";
import type { MemberProfile } from "@/lib/rooms/user-profile";
import { toast } from "@/lib/toast";
import { RolePicker } from "@/components/roles/role-picker";
import { buildActor } from "@/components/roles/settings-context";
import { Dialog, RoleChip, btn, btnDanger, btnPrimary, inputCls } from "@/components/roles/ui";

interface BaseProps {
  teamId: string;
  profile: MemberProfile;
  onClose: () => void;
  /** After a successful change: the card reloads and the page refreshes its member list. */
  onDone: () => void;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export function ProfileRolesDialog({ teamId, profile, onClose, onDone }: BaseProps) {
  const t = useTranslations("roles");
  const { accessToken, user } = useSession();
  const perms = useTeamPermissions(teamId, accessToken, user?.id);
  const [roles, setRoles] = useState<TeamRole[] | null>(null);
  const current = useMemo(() => profile.roles.filter((r) => !r.inherited).map((r) => r.id), [profile.roles]);
  const [ids, setIds] = useState<string[]>(current);
  const [busy, setBusy] = useState(false);
  const name = profile.displayName;

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listRoles(teamId, accessToken).then((r) => { if (!cancelled) setRoles(r); }).catch(() => { if (!cancelled) setRoles([]); });
    return () => { cancelled = true; };
  }, [teamId, accessToken]);

  const actor = useMemo(() => buildActor(perms, roles ?? []), [perms, roles]);
  const inherited = profile.roles.filter((r) => r.inherited);

  const save = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      await setMemberRoles(teamId, profile.userId, ids, accessToken);
      invalidateTeamPermissions(teamId);
      toast(t("toast.membersUpdated"), "success");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };

  return (
    <Dialog
      icon={<ShieldCheck />}
      title={t("rolesDialog.title", { name })}
      onClose={onClose}
      busy={busy}
      footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnPrimary} onClick={save} disabled={busy || roles === null || sameSet(ids, current)}>{t("common.save")}</button></>}
    >
      <p className="text-xs text-muted-foreground">{t("rolesDialog.help")}</p>
      {roles === null ? (
        <div className="space-y-2" role="status" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>
      ) : (
        <RolePicker roles={roles} value={ids} onChange={setIds} actor={actor} disabled={busy} />
      )}
      {inherited.length > 0 && (
        <div className="rounded-lg border border-dashed border-border px-3 py-2">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("rolesDialog.fromGroups")}</div>
          <div className="flex flex-wrap gap-1">{inherited.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} muted />)}</div>
        </div>
      )}
    </Dialog>
  );
}

export function ProfileGroupsDialog({ teamId, profile, onClose, onDone }: BaseProps) {
  const t = useTranslations("rooms");
  const tr = useTranslations("roles");
  const { accessToken } = useSession();
  const [groups, setGroups] = useState<TeamGroup[] | null>(null);
  const [initial, setInitial] = useState<string[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    listTeamGroups(teamId, accessToken)
      .then((list) => {
        if (cancelled) return;
        const mine = list.filter((g) => g.memberUserIds.includes(profile.userId)).map((g) => g.id);
        setGroups(list);
        setInitial(mine);
        setIds(mine);
      })
      .catch(() => { if (!cancelled) setGroups([]); });
    return () => { cancelled = true; };
  }, [teamId, accessToken, profile.userId]);

  const save = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      await Promise.all([
        ...ids.filter((g) => !initial.includes(g)).map((g) => addTeamGroupMembers(teamId, g, [profile.userId], accessToken)),
        ...initial.filter((g) => !ids.includes(g)).map((g) => removeTeamGroupMember(teamId, g, profile.userId, accessToken)),
      ]);
      toast(t("profile.groupsDialog.saved"), "success");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : tr("toast.error"), "error");
      setBusy(false);
    }
  };

  return (
    <Dialog
      icon={<Users />}
      title={t("profile.groupsDialog.title", { name: profile.displayName })}
      onClose={onClose}
      busy={busy}
      footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{tr("common.cancel")}</button><button type="button" className={btnPrimary} onClick={save} disabled={busy || groups === null || sameSet(ids, initial)}>{tr("common.save")}</button></>}
    >
      <p className="text-xs text-muted-foreground">{t("profile.groupsDialog.help")}</p>
      {groups === null ? (
        <div className="space-y-2" role="status" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("profile.groupsDialog.empty")}</p>
      ) : (
        <ul role="group" aria-label={t("profile.groups")} className="divide-y divide-border rounded-lg border border-border">
          {groups.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/10">
                <input type="checkbox" className="h-4 w-4" checked={ids.includes(g.id)} disabled={busy} onChange={() => setIds((cur) => (cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]))} />
                <RoleChip name={g.name} color={g.color} />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function ProfileKickDialog({ teamId, profile, onClose, onDone }: BaseProps) {
  const t = useTranslations("roles");
  const tr = useTranslations("rooms");
  const { accessToken } = useSession();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const name = profile.displayName;

  const run = async () => {
    if (!accessToken) return;
    setBusy(true);
    try {
      await kickMember(teamId, profile.userId, reason.trim() || null, accessToken);
      toast(t("moderation.done.kick", { name }), "success");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setBusy(false);
    }
  };

  return (
    <Dialog
      icon={<Gavel />}
      tone="danger"
      title={t("moderation.title.kick", { name })}
      onClose={onClose}
      busy={busy}
      footer={<><button type="button" className={btn} onClick={onClose} disabled={busy}>{t("common.cancel")}</button><button type="button" className={btnDanger} onClick={run} disabled={busy}>{t("moderation.confirm.kick")}</button></>}
    >
      <p className="text-sm text-muted-foreground">{tr("profile.kickDialog.help")}</p>
      <label className="block text-xs font-semibold">
        {t("moderation.reason")}
        <input data-autofocus className={`${inputCls} mt-1 font-normal`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t("moderation.reasonPlaceholder")} />
        <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{t("moderation.reasonHelp")}</span>
      </label>
    </Dialog>
  );
}
