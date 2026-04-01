"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { listTeams, listTeamBoards, createTeam, createInvite, BoardSummary, TeamView, TeamRole } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary } from "@/lib/api/documents";

export function useDashboardState() {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  
  const { user, activeTeamId, setActiveTeamId, accessToken, logout } = useSession();
  
  // Navigation
  const navigation = [
    { name: tDashboard("nav.workspaces"), href: "/", icon: "LayoutDashboard" },
    { name: tDashboard("nav.boards"), href: "/b", icon: "Layout" },
    { name: tDashboard("nav.documents"), href: "/d", icon: "FileText" },
    { name: tDashboard("nav.teams"), href: "/teams", icon: "Users" },
    { name: tDashboard("nav.activityHistory"), href: "/history", icon: "History" },
  ];

  const [teams, setTeams] = useState<TeamView[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isFetchingBoards, setIsFetchingBoards] = useState(false);
  const [isTeamSwitcherOpen, setIsTeamSwitcherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isSwitchAccountModalOpen, setIsSwitchAccountModalOpen] = useState(false);
  const [recentDocuments, setRecentDocuments] = useState<DocumentSummary[]>([]);
  const [isFetchingDocs, setIsFetchingDocs] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    listTeams(accessToken)
      .then((fetchedTeams) => {
        setTeams(fetchedTeams);
        if (fetchedTeams.length === 0) {
          if (activeTeamId) {
            setActiveTeamId(null);
          }
          return;
        }

        const hasValidActiveTeam = !!activeTeamId && fetchedTeams.some((team) => team.id === activeTeamId);
        if (!hasValidActiveTeam) {
          setActiveTeamId(fetchedTeams[0].id);
        }
      })
      .catch(console.error);
  }, [accessToken, activeTeamId, setActiveTeamId]);

  useEffect(() => {
    if (!accessToken || !activeTeamId || teams.length === 0) return;
    if (!teams.some((team) => team.id === activeTeamId)) return;

    setIsFetchingBoards(true);
    listTeamBoards(activeTeamId, accessToken)
      .then((fetchedBoards) => {
        setBoards(fetchedBoards);
      })
      .catch(console.error)
      .finally(() => setIsFetchingBoards(false));

    setIsFetchingDocs(true);
    listDocuments(activeTeamId, accessToken)
      .then((fetchedDocs) => {
        setRecentDocuments(fetchedDocs);
      })
      .catch(console.error)
      .finally(() => setIsFetchingDocs(false));
  }, [accessToken, activeTeamId, teams]);

  const handleCreateTeamSubmit = async (payload: { name: string; icon?: string; invites: { email: string; role: Exclude<TeamRole, 'owner'> }[] }) => {
    if (!accessToken) return;
    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `ws-${Date.now()}`;

    const newTeam = await createTeam({ name: payload.name, slug, icon: payload.icon }, accessToken);

    if (payload.invites.length > 0) {
      await Promise.allSettled(
        payload.invites.map(invite => createInvite(invite, newTeam.id, accessToken))
      );
    }

    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    setActiveTeamId(newTeam.id);
  };

  return {
    user,
    activeTeamId,
    setActiveTeamId,
    accessToken,
    logout,
    navigation,
    teams,
    boards,
    isFetchingBoards,
    isTeamSwitcherOpen,
    setIsTeamSwitcherOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isCreateWorkspaceModalOpen,
    setIsCreateWorkspaceModalOpen,
    isProfileModalOpen,
    setIsProfileModalOpen,
    isPreferencesModalOpen,
    setIsPreferencesModalOpen,
    isSwitchAccountModalOpen,
    setIsSwitchAccountModalOpen,
    recentDocuments,
    isFetchingDocs,
    handleCreateTeamSubmit,
    tDashboard,
    tCommon,
  };
}