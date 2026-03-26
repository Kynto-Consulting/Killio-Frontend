"use client";

import { UserPlus, Shield, MoreHorizontal, Lock } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useEffect, useMemo, useState } from "react";
import {
  createInvite,
  listTeamInvites,
  listTeams,
  listTeamMembers,
  removeTeamMember,
  revokeTeamInvite,
  TeamRole,
  TeamView,
  TeamMemberSummary,
  InviteSummary,
  updateTeamMemberRole,
} from "@/lib/api/contracts";
import { InviteMemberModal } from "@/components/ui/invite-member-modal";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";

export default function TeamsPage() {
  const { accessToken, activeTeamId, user } = useSession();
  const t = useTranslations("teams");

  const [activeTeam, setActiveTeam] = useState<TeamView | null>(null);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [activeMemberMenu, setActiveMemberMenu] = useState<string | null>(null);
  const [inlineInviteEmail, setInlineInviteEmail] = useState("");
  const [inlineInviteRole, setInlineInviteRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInlineInviting, setIsInlineInviting] = useState(false);
  const [isMutatingMember, setIsMutatingMember] = useState<string | null>(null);
  const [isMutatingInvite, setIsMutatingInvite] = useState<string | null>(null);

  const myMembership = useMemo(() => members.find((member) => member.userId === user?.id), [members, user?.id]);
  const myRole = (myMembership?.role ?? "guest") as TeamRole;

  const canInvite = !!accessToken && !!activeTeamId && !activeTeam?.isPersonal && ["owner", "admin", "member"].includes(myRole);
  const canManageMembers = ["owner", "admin"].includes(myRole);

  const inviteDisabledReason = activeTeam?.isPersonal
    ? t("personalWorkspaceInviteHelp")
    : !canInvite
      ? t("roleCannotInviteHelp")
      : null;

  const inviteRoleOptions = useMemo<Exclude<TeamRole, "owner">[]>(() => {
    if (myRole === "owner" || myRole === "admin") return ["admin", "member", "guest"];
    if (myRole === "member") return ["member", "guest"];
    return ["guest"];
  }, [myRole]);

  useEffect(() => {
    if (!inviteRoleOptions.includes(inlineInviteRole)) {
      setInlineInviteRole(inviteRoleOptions[0]);
    }
  }, [inviteRoleOptions, inlineInviteRole]);

  const roleCapabilities: Record<TeamRole, string[]> = useMemo(() => ({
    owner: [
      t("roleCapabilities.owner.0"),
      t("roleCapabilities.owner.1"),
      t("roleCapabilities.owner.2"),
      t("roleCapabilities.owner.3"),
    ],
    admin: [
      t("roleCapabilities.admin.0"),
      t("roleCapabilities.admin.1"),
      t("roleCapabilities.admin.2"),
      t("roleCapabilities.admin.3"),
    ],
    member: [
      t("roleCapabilities.member.0"),
      t("roleCapabilities.member.1"),
      t("roleCapabilities.member.2"),
      t("roleCapabilities.member.3"),
    ],
    guest: [
      t("roleCapabilities.guest.0"),
      t("roleCapabilities.guest.1"),
      t("roleCapabilities.guest.2"),
      t("roleCapabilities.guest.3"),
    ],
  }), [t]);

  const reloadInvites = async () => {
    if (!accessToken || !activeTeamId || !canInvite) return;
    setIsLoadingInvites(true);
    try {
      const nextInvites = await listTeamInvites(activeTeamId, accessToken);
      setInvites(nextInvites);
    } catch (err) {
      console.error(err);
      setInvites([]);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  const reloadMembers = async () => {
    if (!accessToken || !activeTeamId) return;
    setIsLoading(true);
    try {
      const nextMembers = await listTeamMembers(activeTeamId, accessToken);
      setMembers(nextMembers);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendInlineInvite = async () => {
    if (!accessToken || !activeTeamId || !canInvite || !inlineInviteEmail.trim() || isInlineInviting) return;
    setInviteError(null);
    setIsInlineInviting(true);
    try {
      await createInvite({ email: inlineInviteEmail.trim(), role: inlineInviteRole }, activeTeamId, accessToken);
      setInlineInviteEmail("");
      await reloadInvites();
    } catch (err: any) {
      const message = typeof err?.message === "string" ? err.message : t("inviteSendError");
      setInviteError(message);
    } finally {
      setIsInlineInviting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!accessToken || !activeTeamId || isMutatingInvite) return;
    setIsMutatingInvite(inviteId);
    try {
      await revokeTeamInvite(activeTeamId, inviteId, accessToken);
      await reloadInvites();
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("inviteRevokeError"), "error");
    } finally {
      setIsMutatingInvite(null);
    }
  };

  const handleChangeMemberRole = async (memberId: string, role: Exclude<TeamRole, "owner">) => {
    if (!accessToken || !activeTeamId || isMutatingMember) return;
    setIsMutatingMember(memberId);
    try {
      await updateTeamMemberRole(activeTeamId, memberId, role, accessToken);
      setActiveMemberMenu(null);
      await reloadMembers();
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("roleUpdateError"), "error");
    } finally {
      setIsMutatingMember(null);
    }
  };

  const handleRemoveMember = async (memberId: string, isSelf: boolean) => {
    if (!accessToken || !activeTeamId || isMutatingMember) return;

    const confirmed = window.confirm(isSelf ? t("confirmLeave") : t("confirmRemove"));
    if (!confirmed) return;

    setIsMutatingMember(memberId);
    try {
      await removeTeamMember(activeTeamId, memberId, accessToken);
      setActiveMemberMenu(null);
      await reloadMembers();
      if (isSelf) {
        window.location.href = "/";
      }
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("removeMemberError"), "error");
    } finally {
      setIsMutatingMember(null);
    }
  };

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    setIsLoading(true);

    listTeams(accessToken)
      .then((teams) => {
        const team = teams.find((t) => t.id === activeTeamId);
        if (team) setActiveTeam(team);
      })
      .catch(console.error);

    listTeamMembers(activeTeamId, accessToken)
      .then((nextMembers) => {
        setMembers(nextMembers);
        const me = nextMembers.find((m) => m.userId === user?.id);
        const role = me?.role ?? "guest";
        if (["owner", "admin", "member"].includes(role)) {
          listTeamInvites(activeTeamId, accessToken)
            .then(setInvites)
            .catch(console.error)
            .finally(() => setIsLoadingInvites(false));
        } else {
          setIsLoadingInvites(false);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId, user?.id]);

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            {activeTeam?.isPersonal && (
              <span className="flex items-center text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md">
                <Lock className="w-3 h-3 mr-1" /> {activeTeam.name}
              </span>
            )}
          </div>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <button
          disabled={!canInvite}
          onClick={() => canInvite && setIsInviteModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group"
          title={activeTeam?.isPersonal ? t("personalWorkspaceInviteTitle") : !canInvite ? t("roleCannotInviteTitle") : ""}
        >
          {!canInvite ? (
            <Lock className="mr-2 h-4 w-4 opacity-70" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
          )}
          {t("invitePeople")}
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {t("currentRole")} <span className="capitalize">{myRole}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("activePermissions")}</p>
          </div>
          <span className="text-[11px] uppercase tracking-wider rounded-md bg-primary/10 text-primary px-2 py-1">{t("roleMatrix")}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {roleCapabilities[myRole].map((capability) => (
            <div key={capability} className="text-xs rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5">
              {capability}
            </div>
          ))}
        </div>
      </div>

      {canInvite && (
        <div className="mb-6 rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold">{t("inviteWorkspace")}</h2>
            <span className="text-xs text-muted-foreground">
              {t("allowedRoles")} {inviteRoleOptions.join(", ")}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={inlineInviteEmail}
              onChange={(event) => setInlineInviteEmail(event.target.value)}
              placeholder={t("inviteEmailPlaceholder")}
              disabled={!canInvite || isInlineInviting}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <select
              value={inlineInviteRole}
              onChange={(event) => setInlineInviteRole(event.target.value as Exclude<TeamRole, "owner">)}
              disabled={!canInvite || isInlineInviting}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inviteRoleOptions.map((role) => (
                <option key={role} value={role} className="capitalize">
                  {role}
                </option>
              ))}
            </select>
            <button
              onClick={sendInlineInvite}
              disabled={!canInvite || !inlineInviteEmail.trim() || isInlineInviting}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("sendInvite")}
            </button>
          </div>
          {inviteError && <p className="mt-2 text-xs text-destructive">{inviteError}</p>}
          {inviteDisabledReason && <p className="mt-2 text-xs text-muted-foreground">{inviteDisabledReason}</p>}

          <div className="mt-4 rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("recentInvites")}</p>
              <p className="text-xs text-muted-foreground">
                {invites.length} {t("total")}
              </p>
            </div>
            {isLoadingInvites ? (
              <p className="text-xs text-muted-foreground">{t("loadingInvites")}</p>
            ) : invites.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noInvitesYet")}</p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {invites.slice(0, 8).map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between rounded-md border border-border/40 px-2.5 py-1.5 text-xs gap-2">
                    <span className="truncate max-w-[45%]">{invite.email}</span>
                    <span className="capitalize text-muted-foreground">{invite.role}</span>
                    <span className="text-muted-foreground">{invite.status}</span>
                    {canInvite && invite.status === "pending" ? (
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        disabled={isMutatingInvite === invite.id}
                        className="rounded border border-destructive/30 px-2 py-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {t("revoke")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm relative">
        <div className="p-4 border-b border-border/50 bg-background/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <input
              type="text"
              placeholder={t("filterMembers")}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {members.length} {t("members")}
            </span>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground flex justify-center">{t("loadingMembers")}</div>
          ) : (
            members.map((member) => {
              const isMe = member.userId === user?.id;

              return (
                <div key={member.id} className="flex items-center justify-between p-4 bg-card hover:bg-accent/5 transition-colors relative">
                  <div className="flex items-center gap-4">
                    <img
                      src={getUserAvatarUrl(member.avatarUrl, member.primaryEmail, 40)}
                      alt={member.displayName}
                      className="h-10 w-10 rounded-full border border-border object-cover shadow-sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium leading-none text-foreground">
                          {member.displayName}
                          {isMe && <span className="ml-1 text-muted-foreground font-normal">({t("you")})</span>}
                        </p>
                        {member.status === "active" && <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background"></span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{member.primaryEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center">
                      <Shield className="h-3 w-3 mr-1.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground capitalize">{member.role}</span>
                    </div>

                    <div className="relative">
                      {canManageMembers || isMe ? (
                        <button
                          onClick={() => setActiveMemberMenu(activeMemberMenu === member.id ? null : member.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-foreground text-muted-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      ) : null}

                      {activeMemberMenu === member.id && (canManageMembers || isMe) && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setActiveMemberMenu(null)} />
                          <div className="absolute right-0 top-10 w-56 rounded-md border border-border bg-background shadow-lg z-50 py-1 text-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            {canManageMembers && !isMe && member.role !== "owner" ? (
                              <>
                                <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{t("changeRole")}</div>
                                {(["admin", "member", "guest"] as const).map((nextRole) => (
                                  <button
                                    key={nextRole}
                                    onClick={() => handleChangeMemberRole(member.id, nextRole)}
                                    disabled={member.role === nextRole || isMutatingMember === member.id}
                                    className="w-full text-left px-3 py-1.5 hover:bg-accent/10 outline-none transition-colors capitalize disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {nextRole}
                                  </button>
                                ))}
                                <div className="my-1 border-t border-border/50" />
                              </>
                            ) : null}

                            {(canManageMembers && !isMe && member.role !== "owner") || (isMe && member.role !== "owner") ? (
                              <button
                                onClick={() => handleRemoveMember(member.id, isMe)}
                                disabled={isMutatingMember === member.id}
                                className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-500 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isMe ? t("leaveTeam") : t("removeMember")}
                              </button>
                            ) : (
                              <div className="px-3 py-2 text-xs text-muted-foreground">{t("noActions")}</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        teamName={activeTeam?.name}
        teamId={activeTeamId || ""}
        accessToken={accessToken || ""}
        inviterRole={myRole}
        onInvited={reloadInvites}
      />
    </div>
  );
}
