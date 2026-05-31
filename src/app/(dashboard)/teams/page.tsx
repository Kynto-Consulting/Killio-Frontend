"use client";

import { UserPlus, Lock, MoreHorizontal, Shield } from "lucide-react";
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
  updateTeamMemberAlias,
  updateTeamMemberRole,
  renameTeam,
  deleteTeam,
} from "@/lib/api/contracts";
import { InviteMemberModal } from "@/components/ui/invite-member-modal";
import { UserProfileCard } from "@/components/rooms/UserProfileCard";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { apiCache, cacheKey, CACHE_TTL } from "@/lib/api-cache";
import { OfflineRouteFallback } from "@/components/ui/offline-route-fallback";

const MEMBER_COLORS = ["#22d3ee", "#6366f1", "#f472b6", "#fb923c", "#a78bfa", "#34d399", "#fbbf24", "#f87171"];

function memberColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length];
}

function roleBadgeStyle(role: string): React.CSSProperties {
  if (role === "owner" || role === "admin") {
    return { color: "#818cf8", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)" };
  }
  if (role === "guest") {
    return { color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" };
  }
  return { color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" };
}

export default function TeamsPage() {
  return (
    <OfflineRouteFallback view="teams">
      <TeamsPageInner />
    </OfflineRouteFallback>
  );
}

function TeamsPageInner() {
  const { accessToken, activeTeamId, user } = useSession();
  const t = useTranslations("teams");

  const [activeTeam, setActiveTeam] = useState<TeamView | null>(null);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ memberId: string; isSelf: boolean } | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [activeMemberMenu, setActiveMemberMenu] = useState<string | null>(null);
  const [inlineInviteEmail, setInlineInviteEmail] = useState("");
  const [inlineInviteRole, setInlineInviteRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInlineInviting, setIsInlineInviting] = useState(false);
  const [isMutatingMember, setIsMutatingMember] = useState<string | null>(null);
  const [isMutatingInvite, setIsMutatingInvite] = useState<string | null>(null);
  const [editingAliasMemberId, setEditingAliasMemberId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [profileCard, setProfileCard] = useState<{ member: TeamMemberSummary; anchor: { x: number; y: number } } | null>(null);

  // Workspace settings
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);

  const myMembership = useMemo(() => members.find((member) => member.id === user?.id), [members, user?.id]);
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
    owner: [t("roleCapabilities.owner.0"), t("roleCapabilities.owner.1"), t("roleCapabilities.owner.2"), t("roleCapabilities.owner.3")],
    admin: [t("roleCapabilities.admin.0"), t("roleCapabilities.admin.1"), t("roleCapabilities.admin.2"), t("roleCapabilities.admin.3")],
    member: [t("roleCapabilities.member.0"), t("roleCapabilities.member.1"), t("roleCapabilities.member.2"), t("roleCapabilities.member.3")],
    guest: [t("roleCapabilities.guest.0"), t("roleCapabilities.guest.1"), t("roleCapabilities.guest.2"), t("roleCapabilities.guest.3")],
  }), [t]);

  const reloadInvites = async () => {
    if (!accessToken || !activeTeamId || !canInvite) return;
    setIsLoadingInvites(true);
    try {
      setInvites(await listTeamInvites(activeTeamId, accessToken));
    } catch { setInvites([]); }
    finally { setIsLoadingInvites(false); }
  };

  const reloadMembers = async () => {
    if (!accessToken || !activeTeamId) return;
    setIsLoading(true);
    try { setMembers(await listTeamMembers(activeTeamId, accessToken)); }
    catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const sendInlineInvite = async () => {
    if (!accessToken || !activeTeamId || !canInvite || !inlineInviteEmail.trim() || isInlineInviting) return;
    setInviteError(null);
    setIsInlineInviting(true);
    try {
      const invite = await createInvite({ email: inlineInviteEmail.trim(), role: inlineInviteRole }, activeTeamId, accessToken);
      if (invite.deliveryStatus !== "sent") {
        setInviteError(
          invite.deliveryStatus === "skipped"
            ? t("inviteDeliverySkipped")
            : t("inviteDeliveryFailed"),
        );
      }
      setInlineInviteEmail("");
      await reloadInvites();
    } catch (err: any) {
      setInviteError(typeof err?.message === "string" ? err.message : t("inviteSendError"));
    } finally { setIsInlineInviting(false); }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!accessToken || !activeTeamId || isMutatingInvite) return;
    setIsMutatingInvite(inviteId);
    try {
      await revokeTeamInvite(activeTeamId, inviteId, accessToken);
      await reloadInvites();
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("inviteRevokeError"), "error");
    } finally { setIsMutatingInvite(null); }
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
    } finally { setIsMutatingMember(null); }
  };

  const handleUpdateMemberAlias = async (memberId: string, alias: string | null) => {
    if (!accessToken || !activeTeamId || isMutatingMember) return;
    setIsMutatingMember(memberId);
    try {
      await updateTeamMemberAlias(activeTeamId, memberId, alias, accessToken);
      setEditingAliasMemberId(null);
      setAliasDraft("");
      setActiveMemberMenu(null);
      await reloadMembers();
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("aliasUpdateError"), "error");
    } finally { setIsMutatingMember(null); }
  };

  const handleRemoveMember = (memberId: string, isSelf: boolean) => {
    if (!accessToken || !activeTeamId || isMutatingMember) return;
    setConfirmRemoveMember({ memberId, isSelf });
  };

  const handleRemoveMemberConfirm = async () => {
    if (!confirmRemoveMember || !accessToken || !activeTeamId) return;
    const { memberId, isSelf } = confirmRemoveMember;
    setConfirmRemoveMember(null);
    setIsMutatingMember(memberId);
    try {
      await removeTeamMember(activeTeamId, memberId, accessToken);
      setActiveMemberMenu(null);
      await reloadMembers();
      if (isSelf) window.location.href = "/";
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("removeMemberError"), "error");
    } finally { setIsMutatingMember(null); }
  };

  useEffect(() => {
    if (!accessToken || !activeTeamId || !user?.id) return;

    // Serve cached team data instantly
    const teamsCacheKey = cacheKey.teams(user.id);
    const membersCacheKey = cacheKey.members(activeTeamId);
    const cachedTeams = apiCache.get<import("@/lib/api/contracts").TeamView[]>(teamsCacheKey);
    const cachedMembers = apiCache.get<import("@/lib/api/contracts").TeamMemberSummary[]>(membersCacheKey);
    if (cachedTeams) {
      const team = cachedTeams.find((t) => t.id === activeTeamId);
      if (team) { setActiveTeam(team); setNameDraft(team.name); }
    }
    if (cachedMembers) {
      setMembers(cachedMembers);
      const me = cachedMembers.find((m) => m.id === user?.id);
      const role = me?.role ?? "guest";
      if (["owner", "admin", "member"].includes(role)) {
        // will also be set by the fresh fetch below
      }
    }

    setIsLoading(true);
    listTeams(accessToken).then((teams) => {
      apiCache.set(teamsCacheKey, teams, CACHE_TTL.TEAMS);
      const team = teams.find((t) => t.id === activeTeamId);
      if (team) { setActiveTeam(team); setNameDraft(team.name); }
    }).catch(console.error);
    listTeamMembers(activeTeamId, accessToken).then((nextMembers) => {
      apiCache.set(membersCacheKey, nextMembers, CACHE_TTL.MEMBERS);
      setMembers(nextMembers);
      const me = nextMembers.find((m) => m.id === user?.id);
      const role = me?.role ?? "guest";
      if (["owner", "admin", "member"].includes(role)) {
        listTeamInvites(activeTeamId, accessToken).then(setInvites).catch(console.error).finally(() => setIsLoadingInvites(false));
      } else { setIsLoadingInvites(false); }
    }).catch(console.error).finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId, user?.id]);

  const pendingInvites = invites.filter((i) => i.status === "pending");
  const activeMembers = members.filter((m) => m.status === "active");
  const adminCount = members.filter((m) => ["admin", "owner"].includes(m.role)).length;

  const handleRenameWorkspace = async () => {
    if (!accessToken || !activeTeamId || isSavingName) return;
    setIsSavingName(true);
    try {
      const result = await renameTeam(activeTeamId, nameDraft.trim(), accessToken);
      setActiveTeam((prev) => prev ? { ...prev, name: result.name } : prev);
      toast(t("workspaceNameSaved"), "success");
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("workspaceNameError"), "error");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!accessToken || !activeTeamId || isDeletingWorkspace) return;
    if (deleteConfirmName.trim() !== (activeTeam?.name ?? "")) return;
    setIsDeletingWorkspace(true);
    try {
      await deleteTeam(activeTeamId, accessToken);
      window.location.href = "/";
    } catch (err: any) {
      toast(typeof err?.message === "string" ? err.message : t("deleteWorkspaceError"), "error");
      setIsDeletingWorkspace(false);
    }
  };

  // ── STYLES ────────────────────────────────────────────────────────────────
  const surface: React.CSSProperties = { background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14 };
  const cardHeader: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" };
  const cardBody: React.CSSProperties = { padding: "16px 20px" };

  return (
    <div style={{ background: "#020408", color: "rgba(255,255,255,0.92)", minHeight: "100%" }}>
      {/* Ambient glow */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at top, rgba(216,255,114,0.08), transparent 55%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "28px 32px", maxWidth: 1160, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              {t("title")}
              {activeTeam?.isPersonal && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "#818cf8", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Lock style={{ width: 10, height: 10 }} /> {activeTeam.name}
                </span>
              )}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{t("subtitle")}</p>
          </div>
          <button
            disabled={!canInvite}
            onClick={() => canInvite && setIsInviteModalOpen(true)}
            title={activeTeam?.isPersonal ? t("personalWorkspaceInviteTitle") : !canInvite ? t("roleCannotInviteTitle") : ""}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", height: 36, borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: canInvite ? "pointer" : "default", border: "none", background: canInvite ? "#d8ff72" : "rgba(255,255,255,0.06)", color: canInvite ? "#0a1200" : "rgba(255,255,255,0.35)", transition: "all .15s", opacity: canInvite ? 1 : 0.6 }}
          >
            {canInvite ? <UserPlus style={{ width: 14, height: 14 }} /> : <Lock style={{ width: 14, height: 14 }} />}
            {t("invitePeople")}
          </button>
        </div>

        {/* ── STAT TILES ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { v: members.length, l: t("members") },
            { v: activeMembers.length, l: t("activeThisWeek") },
            { v: pendingInvites.length, l: t("pendingInvites") },
            { v: adminCount, l: t("admins") },
          ].map((tile, i) => (
            <div key={i} style={{ ...surface, padding: "18px 20px" }}>
              <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1 }}>{tile.v}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{tile.l}</div>
            </div>
          ))}
        </div>

        {/* ── INVITE BAR ── */}
        {canInvite && (
          <div style={surface}>
            <div style={cardHeader}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("inviteWorkspace")}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {t("allowedRoles")} {inviteRoleOptions.join(", ")}
                </div>
              </div>
            </div>
            <div style={cardBody}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="email"
                  value={inlineInviteEmail}
                  onChange={(e) => setInlineInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendInlineInvite()}
                  placeholder={t("inviteEmailPlaceholder")}
                  disabled={!canInvite || isInlineInviting}
                  style={{ flex: 1, minWidth: 200, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.9)", fontSize: 13, padding: "0 14px", outline: "none" }}
                />
                <select
                  value={inlineInviteRole}
                  onChange={(e) => setInlineInviteRole(e.target.value as Exclude<TeamRole, "owner">)}
                  disabled={!canInvite || isInlineInviting}
                  style={{ height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.75)", fontSize: 13, padding: "0 12px", outline: "none" }}
                >
                  {inviteRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <button
                  onClick={sendInlineInvite}
                  disabled={!canInvite || !inlineInviteEmail.trim() || isInlineInviting}
                  style={{ height: 34, padding: "0 16px", borderRadius: 10, border: "none", background: "#d8ff72", color: "#0a1200", fontSize: 12, fontWeight: 700, cursor: (!canInvite || !inlineInviteEmail.trim()) ? "default" : "pointer", opacity: (!canInvite || !inlineInviteEmail.trim()) ? 0.5 : 1, transition: "opacity .15s" }}
                >
                  {isInlineInviting ? "..." : t("sendInvite")}
                </button>
              </div>
              {inviteError && <p style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>{inviteError}</p>}
              {inviteDisabledReason && <p style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.42)" }}>{inviteDisabledReason}</p>}
            </div>
          </div>
        )}

        {/* ── MEMBER CARDS GRID ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("members")}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{members.length} {t("total")} · {t("sortedByRole")}</span>
          </div>

          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.42)" }}>{t("loadingMembers")}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {members.map((member) => {
                const isMe = member.id === user?.id;
                const color = memberColor(member.id);
                const isActive = member.status === "active";
                const isAliasEditing = editingAliasMemberId === member.membershipId;
                const canEditAlias = canManageMembers || isMe;

                return (
                  <div
                    key={member.membershipId}
                    style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 18, position: "relative", transition: "border-color .15s, transform .15s", cursor: "default" }}
                  >
                    {/* Role badge + you badge */}
                    <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 4, alignItems: "center" }}>
                      {isMe && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, letterSpacing: "0.06em", color: "#d8ff72", background: "rgba(216,255,114,0.1)", border: "1px solid rgba(216,255,114,0.22)" }}>
                          {t("you")}
                        </span>
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", ...roleBadgeStyle(member.role) }}>
                        {member.role}
                      </span>
                    </div>

                    {/* Avatar + name + email */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingRight: 60 }}>
                      <div
                        onClick={!isMe && activeTeamId ? (e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setProfileCard({ member, anchor: { x: Math.min(rect.right + 8, window.innerWidth - 270), y: Math.min(rect.top, window.innerHeight - 300) } });
                        } : undefined}
                        style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, border: `1.5px solid ${color}44`, background: `${color}18`, color, flexShrink: 0, overflow: "hidden", cursor: !isMe && activeTeamId ? "pointer" : "default" }}
                      >
                        {member.avatarUrl
                          ? <img src={getUserAvatarUrl(member.avatarUrl, member.primaryEmail, 40)} alt={member.alias || member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : (member.alias || member.name).slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {member.alias || member.name}
                          </span>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isActive ? "#4ade80" : "rgba(255,255,255,0.15)" }} />
                        </div>
                        {member.alias && (
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</div>
                        )}
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: member.alias ? 0 : 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {member.primaryEmail}
                        </div>
                      </div>
                    </div>

                    {/* Mini stat grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)" }}>{t("statusLabel")}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, color: isActive ? "#4ade80" : "rgba(255,255,255,0.42)" }}>{isActive ? t("statusActive") : t("statusAway")}</div>
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)" }}>{t("aliasBadge")}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, color: member.alias ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {member.alias || "—"}
                        </div>
                      </div>
                    </div>

                    {/* Actions dropdown trigger */}
                    {(canManageMembers || isMe) && (
                      <div style={{ position: "absolute", bottom: 14, right: 14 }}>
                        <div style={{ position: "relative" }}>
                          <button
                            onClick={() => {
                              const next = activeMemberMenu === member.membershipId ? null : member.membershipId;
                              setActiveMemberMenu(next);
                              if (!next) { setEditingAliasMemberId(null); setAliasDraft(""); }
                            }}
                            style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                          >
                            <MoreHorizontal style={{ width: 14, height: 14 }} />
                          </button>

                          {activeMemberMenu === member.membershipId && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => { setActiveMemberMenu(null); setEditingAliasMemberId(null); setAliasDraft(""); }} />
                              <div style={{ position: "absolute", right: 0, bottom: 36, width: 220, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "#0d1117", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 50, padding: "4px 0", fontSize: 13 }}>
                                {canEditAlias && (
                                  <>
                                    <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>{t("workspaceAlias")}</div>
                                    {isAliasEditing ? (
                                      <div style={{ padding: "4px 12px 8px" }}>
                                        <input
                                          value={aliasDraft}
                                          onChange={(e) => setAliasDraft(e.target.value)}
                                          placeholder={t("aliasPlaceholder")}
                                          style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12, padding: "0 10px", outline: "none", marginBottom: 6 }}
                                        />
                                        <div style={{ display: "flex", gap: 6 }}>
                                          <button
                                            onClick={() => handleUpdateMemberAlias(member.membershipId, aliasDraft.trim() ? aliasDraft : null)}
                                            disabled={isMutatingMember === member.membershipId}
                                            style={{ borderRadius: 6, background: "#d8ff72", color: "#0a1200", border: "none", padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                                          >{t("saveAlias")}</button>
                                          <button
                                            onClick={() => { setEditingAliasMemberId(null); setAliasDraft(""); }}
                                            style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", padding: "4px 10px", fontSize: 11, cursor: "pointer" }}
                                          >{t("cancelAlias")}</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ paddingBottom: 4 }}>
                                        <button
                                          onClick={() => { setEditingAliasMemberId(member.membershipId); setAliasDraft(member.alias || ""); }}
                                          style={{ width: "100%", textAlign: "left", padding: "7px 12px", background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 13 }}
                                        >{t("editAlias")}</button>
                                        {member.alias && (
                                          <button
                                            onClick={() => handleUpdateMemberAlias(member.membershipId, null)}
                                            disabled={isMutatingMember === member.membershipId}
                                            style={{ width: "100%", textAlign: "left", padding: "7px 12px", background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 13 }}
                                          >{t("clearAlias")}</button>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                  </>
                                )}

                                {canManageMembers && !isMe && member.role !== "owner" && (
                                  <>
                                    <div style={{ padding: "6px 12px 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>{t("changeRole")}</div>
                                    {(["admin", "member", "guest"] as const).map((nextRole) => (
                                      <button
                                        key={nextRole}
                                        onClick={() => handleChangeMemberRole(member.membershipId, nextRole)}
                                        disabled={member.role === nextRole || isMutatingMember === member.membershipId}
                                        style={{ width: "100%", textAlign: "left", padding: "7px 12px", background: "transparent", border: "none", color: member.role === nextRole ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)", cursor: member.role === nextRole ? "default" : "pointer", fontSize: 13, textTransform: "capitalize" }}
                                      >{nextRole}</button>
                                    ))}
                                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                  </>
                                )}

                                {((canManageMembers && !isMe && member.role !== "owner") || (isMe && member.role !== "owner")) && (
                                  <button
                                    onClick={() => handleRemoveMember(member.membershipId, isMe)}
                                    disabled={isMutatingMember === member.membershipId}
                                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13 }}
                                  >{isMe ? t("leaveTeam") : t("removeMember")}</button>
                                )}
                                {!((canManageMembers && !isMe && member.role !== "owner") || (isMe && member.role !== "owner")) && !canEditAlias && (
                                  <div style={{ padding: "8px 12px", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>{t("noActions")}</div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── PENDING INVITES TABLE ── */}
        {canInvite && (
          <div style={surface}>
            <div style={cardHeader}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("pendingInvitesTitle")}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {isLoadingInvites ? t("loadingInvites") : t("awaitingResponse", { count: pendingInvites.length })}
                </div>
              </div>
              <Shield style={{ width: 16, height: 16, color: "rgba(255,255,255,0.3)" }} />
            </div>
            <div style={{ overflowX: "auto" }}>
              {isLoadingInvites ? (
                <div style={{ padding: "20px 20px", fontSize: 13, color: "rgba(255,255,255,0.42)" }}>{t("loadingInvites")}</div>
              ) : invites.length === 0 ? (
                <div style={{ padding: "20px 20px", fontSize: 13, color: "rgba(255,255,255,0.42)" }}>{t("noInvitesYet")}</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {(["email", "role", "status", "delivery", "action"] as const).map((h) => (
                        <th key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", padding: "10px 20px", textAlign: "left" }}>{t(`tableHeaders.${h}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite) => (
                      <tr key={invite.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "11px 20px", fontSize: 13, color: "#fff", fontWeight: 500 }}>{invite.email}</td>
                        <td style={{ padding: "11px 20px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>{invite.role}</span>
                        </td>
                        <td style={{ padding: "11px 20px" }}>
                          <span style={invite.status === "pending"
                            ? { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }
                            : { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }
                          }>{invite.status}</span>
                        </td>
                        <td style={{ padding: "11px 20px" }}>
                          <span style={invite.deliveryStatus === "sent"
                            ? { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "#86efac", background: "rgba(134,239,172,0.1)", border: "1px solid rgba(134,239,172,0.22)" }
                            : invite.deliveryStatus === "skipped"
                              ? { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }
                              : { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.06em", textTransform: "uppercase", color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }
                          }>{invite.deliveryStatus}</span>
                        </td>
                        <td style={{ padding: "11px 20px" }}>
                          {canInvite && invite.status === "pending" && (
                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              disabled={isMutatingInvite === invite.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.07)", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: isMutatingInvite === invite.id ? 0.5 : 1 }}
                            >
                              {t("revoke")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── ROLE CAPABILITIES ── */}
        <div style={surface}>
          <div style={cardHeader}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("currentRole")} <span style={{ textTransform: "capitalize", color: "#d8ff72" }}>{myRole}</span></div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{t("activePermissions")}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>{t("roleMatrix")}</span>
          </div>
          <div style={{ ...cardBody, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {roleCapabilities[myRole].map((cap) => (
              <div key={cap} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.2)", padding: "8px 12px", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{cap}</div>
            ))}
          </div>
        </div>

        {/* ── WORKSPACE SETTINGS (admin + owner only) ── */}
        {["owner", "admin"].includes(myRole) && !activeTeam?.isPersonal && (
          <div style={surface}>
            <div style={cardHeader}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("workspaceSettings")}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {myRole === "owner" ? t("deleteWorkspace") + " · " : ""}{t("workspaceName")}
                </div>
              </div>
            </div>
            <div style={cardBody}>

              {/* Rename */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
                  {t("workspaceName")}
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRenameWorkspace()}
                    maxLength={64}
                    placeholder={t("workspaceNamePlaceholder")}
                    style={{ flex: 1, minWidth: 0, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.9)", fontSize: 13, padding: "0 14px", outline: "none" }}
                  />
                  <button
                    onClick={handleRenameWorkspace}
                    disabled={isSavingName || !nameDraft.trim() || nameDraft.trim() === activeTeam?.name}
                    style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "#d8ff72", color: "#0a1200", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (isSavingName || !nameDraft.trim() || nameDraft.trim() === activeTeam?.name) ? 0.5 : 1, transition: "opacity .15s", whiteSpace: "nowrap" }}
                  >
                    {isSavingName ? t("savingWorkspaceName") : t("saveWorkspaceName")}
                  </button>
                </div>
              </div>

              {/* Delete — owner only */}
              {myRole === "owner" && (
                <div style={{ borderTop: "1px solid rgba(248,113,113,0.15)", paddingTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                    {t("dangerZone")}
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.6 }}>
                    {t("deleteWorkspaceHint")}
                  </p>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>
                    {t("confirmDeleteWorkspace")} <span style={{ color: "#f87171", fontFamily: "monospace" }}>{activeTeam?.name}</span>
                  </label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      placeholder={activeTeam?.name ?? ""}
                      style={{ flex: 1, minWidth: 0, height: 38, borderRadius: 10, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.04)", color: "rgba(255,255,255,0.9)", fontSize: 13, padding: "0 14px", outline: "none" }}
                    />
                    <button
                      onClick={handleDeleteWorkspace}
                      disabled={isDeletingWorkspace || deleteConfirmName.trim() !== (activeTeam?.name ?? "")}
                      style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.12)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (isDeletingWorkspace || deleteConfirmName.trim() !== (activeTeam?.name ?? "")) ? 0.4 : 1, transition: "opacity .15s", whiteSpace: "nowrap" }}
                    >
                      {isDeletingWorkspace ? "..." : t("confirmDeleteWorkspaceBtn")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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

      {profileCard && activeTeamId && (
        <UserProfileCard
          userId={profileCard.member.id}
          displayName={profileCard.member.alias || profileCard.member.name}
          email={profileCard.member.primaryEmail}
          avatarUrl={profileCard.member.avatarUrl ? getUserAvatarUrl(profileCard.member.avatarUrl, profileCard.member.primaryEmail, 48) : undefined}
          teamId={activeTeamId}
          anchor={profileCard.anchor}
          onClose={() => setProfileCard(null)}
        />
      )}

      {confirmRemoveMember && (
        <ConfirmDeleteModal
          isOpen={!!confirmRemoveMember}
          onClose={() => setConfirmRemoveMember(null)}
          onConfirm={handleRemoveMemberConfirm}
          title={confirmRemoveMember.isSelf ? t("confirmLeaveTitle") : t("confirmRemoveTitle")}
          description={confirmRemoveMember.isSelf ? t("confirmLeave") : t("confirmRemove")}
          itemName=""
        />
      )}
    </div>
  );
}
