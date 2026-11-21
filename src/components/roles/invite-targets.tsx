"use client";

import { useMemo } from "react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTeamGroups } from "@/hooks/use-team-groups";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { useTeamRoles } from "@/hooks/use-team-roles";
import type { TeamGroup } from "@/lib/api/groups";
import { summarizeInvite, type Actor, type TeamRole } from "@/lib/roles/model";
import { buildActor } from "./settings-context";
import { RolePicker } from "./role-picker";
import { RoleChip, cx } from "./ui";

/** Roles, groups and who-I-am for the invite surfaces that live outside the settings screen (the invite modal). */
export function useInviteContext(teamId: string | null | undefined) {
  const { accessToken, user } = useSession();
  const perms = useTeamPermissions(teamId, accessToken, user?.id);
  const { roles, error } = useTeamRoles(teamId);
  const { groups } = useTeamGroups(teamId);
  const actor = useMemo(() => buildActor(perms, roles), [perms, roles]);
  return { roles, groups, actor, perms, rolesAvailable: roles.length > 0 && !error, canGroups: perms.can("groups.manage") };
}

/**
 * Pick the roles and/or groups an invitation hands out, with a plain summary of what the person receives.
 * Only manageable roles are selectable (the rest show why they are not).
 */
export function InviteTargets({ roles, groups, actor, roleIds, groupIds, onRoleIds, onGroupIds, canGroups, disabled }: { roles: TeamRole[]; groups: TeamGroup[]; actor: Actor; roleIds: string[]; groupIds: string[]; onRoleIds: (ids: string[]) => void; onGroupIds: (ids: string[]) => void; canGroups: boolean; disabled?: boolean }) {
  const t = useTranslations("roles");
  const summary = summarizeInvite({ roleIds, groupIds, roles, groups });
  const defaultRole = roles.find((r) => r.isDefault);
  const toggleGroup = (id: string) => onGroupIds(groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id]);

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-xs font-semibold text-foreground">{t("invite.roles")}</span>
        <RolePicker roles={roles} value={roleIds} onChange={onRoleIds} actor={actor} disabled={disabled} />
      </div>
      {groups.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-semibold text-foreground">{t("invite.groups")}</span>
          {!canGroups && <p className="mb-1 text-[11px] text-muted-foreground">{t("invite.groupsNeedPermission")}</p>}
          <ul role="group" aria-label={t("invite.groups")} className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {groups.map((g) => (
              <li key={g.id}>
                <label className={cx("flex items-center gap-3 px-3 py-2 text-sm", !canGroups || disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent/10")}>
                  <input type="checkbox" className="h-4 w-4" disabled={!canGroups || disabled} checked={groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-black/20" style={{ background: g.color ?? "hsl(var(--muted-foreground))" }} />
                  <span className="truncate">{g.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-dashed border-[var(--memphis-line)] bg-muted/30 px-3 py-2" aria-live="polite">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("invite.summaryTitle")}</div>
        <div className="flex flex-wrap items-center gap-1">
          {summary.usesDefault ? (
            <>
              <span className="text-xs text-foreground">{t("invite.summaryDefault")}</span>
              {defaultRole && <RoleChip name={defaultRole.name} color={defaultRole.color} />}
            </>
          ) : (
            summary.roles.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} />)
          )}
          {summary.viaGroupRoles.map((r) => <RoleChip key={r.id} name={r.name} color={r.color} muted title={t("invite.viaGroupRole")} />)}
        </div>
        {summary.groups.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("invite.summaryGroups", { groups: summary.groups.map((g) => g.name).join(", ") })}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">{t("invite.summaryNote")}</p>
      </div>
    </div>
  );
}
