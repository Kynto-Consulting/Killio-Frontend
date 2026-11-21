"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gavel, LayoutDashboard, Lock, Mail, ShieldCheck, UserPlus, Users, UsersRound } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { InviteMemberModal } from "@/components/ui/invite-member-modal";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";
import { AuditTab } from "@/components/roles/audit-tab";
import { GroupsTab } from "@/components/roles/groups-tab";
import { InvitesTab } from "@/components/roles/invites-tab";
import { MembersTab } from "@/components/roles/members-tab";
import { OverviewTab } from "@/components/roles/overview-tab";
import { RolesTab } from "@/components/roles/roles-tab";
import { SettingsProvider, buildActor, type SettingsCtx, type SettingsMember } from "@/components/roles/settings-context";
import { TabBar, btnPrimary, type TabDef } from "@/components/roles/ui";
import { useTeamGroups } from "@/hooks/use-team-groups";
import { invalidateTeamPermissions, useTeamPermissions } from "@/hooks/use-team-permissions";
import { invalidateTeamRoles, useTeamRoles } from "@/hooks/use-team-roles";
import { useTeamRealtime } from "@/hooks/useTeamRealtime";
import { apiCache, cacheKey, CACHE_TTL } from "@/lib/api-cache";
import { listTeamMembers, listTeams, type TeamRole, type TeamView } from "@/lib/api/contracts";

type TabId = "overview" | "members" | "invites" | "roles" | "groups" | "audit";

export default function TeamsPage() {
  return (
    <OfflineRouteFallback view="teams">
      <Suspense fallback={null}>
        <TeamsPageInner />
      </Suspense>
    </OfflineRouteFallback>
  );
}

/**
 * Workspace settings: one tab bar on top (Overview, Members, Invitations, Roles, Groups, Moderation).
 * Tabs a person cannot use are not shown; which ones those are comes from `me/permissions`, not from role names.
 */
function TeamsPageInner() {
  const { accessToken, activeTeamId, user } = useSession();
  const t = useTranslations("roles");
  const tt = useTranslations("teams");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [team, setTeam] = useState<TeamView | null>(null);
  const [members, setMembers] = useState<SettingsMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const perms = useTeamPermissions(activeTeamId, accessToken, user?.id);
  const { roles, isLoading: rolesLoading, error: rolesError } = useTeamRoles(activeTeamId);
  const { groups } = useTeamGroups(activeTeamId);

  const reloadMembers = useCallback(async () => {
    if (!accessToken || !activeTeamId) return;
    try {
      const list = (await listTeamMembers(activeTeamId, accessToken)) as SettingsMember[];
      apiCache.set(cacheKey.members(activeTeamId), list, CACHE_TTL.MEMBERS);
      setMembers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setMembersLoading(false);
    }
  }, [accessToken, activeTeamId]);

  // Team + members (cached copy first so the screen paints at once).
  useEffect(() => {
    if (!accessToken || !activeTeamId || !user?.id) return;
    const cachedTeams = apiCache.get<TeamView[]>(cacheKey.teams(user.id));
    const cachedMembers = apiCache.get<SettingsMember[]>(cacheKey.members(activeTeamId));
    setTeam(cachedTeams?.find((x) => x.id === activeTeamId) ?? null);
    if (cachedMembers) {
      setMembers(cachedMembers);
      setMembersLoading(false);
    } else {
      setMembers([]);
      setMembersLoading(true);
    }
    listTeams(accessToken)
      .then((teams) => {
        apiCache.set(cacheKey.teams(user.id), teams, CACHE_TTL.TEAMS);
        setTeam(teams.find((x) => x.id === activeTeamId) ?? null);
      })
      .catch(console.error);
    void reloadMembers();
  }, [accessToken, activeTeamId, user?.id, reloadMembers]);

  // Somebody joined, left or changed roles: refresh this screen too (permissions refresh in their own hook).
  useTeamRealtime(activeTeamId, (e) => {
    const name = String(e.type ?? "");
    if (name.startsWith("member.") || name.startsWith("role.")) {
      void reloadMembers();
      if (activeTeamId) invalidateTeamRoles(activeTeamId);
    }
  });

  const personal = !!team?.isPersonal;
  const can = perms.can;
  const available = useMemo(() => {
    const ids: TabId[] = ["overview", "members"];
    if (!personal) {
      if (can("members.invite") || can("invites.manage") || can("members.manage")) ids.push("invites");
      if (can("roles.manage") || can("members.manage_roles") || can("members.manage")) ids.push("roles");
      ids.push("groups");
      if (can("audit.view") || can("members.ban") || can("members.kick")) ids.push("audit");
    }
    return ids;
  }, [can, personal]);

  const requested = params.get("tab") as TabId | null;
  // While permissions are loading keep the requested tab (no flash to Overview); afterwards fall back if it is not allowed.
  const tab: TabId = requested && (available.includes(requested) || !perms.isReady) ? requested : "overview";
  const setTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const tabDefs: TabDef[] = available.map((id) => ({
    id,
    label: t(`tabs.${id}`),
    icon: { overview: <LayoutDashboard className="h-4 w-4" />, members: <Users className="h-4 w-4" />, invites: <Mail className="h-4 w-4" />, roles: <ShieldCheck className="h-4 w-4" />, groups: <UsersRound className="h-4 w-4" />, audit: <Gavel className="h-4 w-4" /> }[id],
    badge: id === "members" && members.length ? members.length : null,
  }));

  const ctx: SettingsCtx | null = useMemo(() => {
    if (!activeTeamId || !accessToken) return null;
    return {
      teamId: activeTeamId,
      accessToken,
      userId: user?.id ?? null,
      team,
      perms,
      actor: buildActor(perms, roles),
      roles,
      rolesError,
      rolesLoading,
      groups,
      members,
      membersLoading,
      reloadMembers,
      reloadRoles: () => invalidateTeamRoles(activeTeamId),
    };
  }, [activeTeamId, accessToken, user?.id, team, perms, roles, rolesError, rolesLoading, groups, members, membersLoading, reloadMembers]);

  const myLegacyRole = (members.find((m) => m.id === user?.id)?.role ?? "guest") as TeamRole;
  const canInvite = !personal && (can("members.invite") || can("members.manage"));

  if (!ctx) {
    return <div className="p-8 text-center text-sm text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-8 sm:py-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
              <span className="truncate">{team?.name ?? tt("title")}</span>
              {personal && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--memphis-line)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden /> {t("personalBadge")}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <button type="button" className={btnPrimary} disabled={!canInvite} title={canInvite ? undefined : personal ? tt("personalWorkspaceInviteHelp") : tt("roleCannotInviteHelp")} onClick={() => setInviteOpen(true)}>
            {canInvite ? <UserPlus className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}
            {tt("invitePeople")}
          </button>
        </header>

        <TabBar tabs={tabDefs} active={tab} onChange={setTab} label={t("tabs.label")} />

        <SettingsProvider value={ctx}>
          <div role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} tabIndex={-1} className="min-w-0 focus:outline-none">
            {tab === "overview" && <OverviewTab onRenamed={(name) => setTeam((prev) => (prev ? { ...prev, name } : prev))} />}
            {tab === "members" && <MembersTab />}
            {tab === "invites" && <InvitesTab />}
            {tab === "roles" && <RolesTab />}
            {tab === "groups" && <GroupsTab />}
            {tab === "audit" && <AuditTab />}
          </div>
        </SettingsProvider>
      </div>

      <InviteMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        teamName={team?.name}
        teamId={activeTeamId ?? ""}
        accessToken={accessToken ?? ""}
        inviterRole={myLegacyRole}
        onInvited={() => {
          invalidateTeamPermissions(activeTeamId ?? undefined);
          return reloadMembers();
        }}
      />
    </div>
  );
}
