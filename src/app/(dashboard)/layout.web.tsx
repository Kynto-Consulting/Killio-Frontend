"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Layout, Settings, UserCircle, History, Bell, Search, Plus, Loader2, Check, ChevronsUpDown, Users, LogOut, ArrowRightLeft, FileText } from "lucide-react";
import { CommandPalette } from "@/components/ui/command-palette";
import { CreateWorkspaceModal } from "@/components/ui/create-workspace-modal";
import { ProfileSettingsModal } from "@/components/ui/profile-settings-modal";
import { AppPreferencesModal } from "@/components/ui/preferences-modal";
import { SwitchAccountModal } from "@/components/ui/switch-account-modal";
import { NotificationCenter } from "@/components/ui/notification-center";
import { CardTimerWidget } from "@/components/ui/card-timer-widget";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useEffect, useState } from "react";
import { listTeams, listTeamBoards, createTeam, createInvite, BoardSummary, TeamView, TeamRole } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary } from "@/lib/api/documents";
import { getUserAvatarUrl } from "@/lib/gravatar";

export function LayoutWeb({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  const navigation = [
    { name: tDashboard("nav.workspaces"), href: "/", icon: LayoutDashboard },
    { name: tDashboard("nav.boards"), href: "/b", icon: Layout },
    { name: tDashboard("nav.documents"), href: "/d", icon: FileText },
    { name: tDashboard("nav.teams"), href: "/teams", icon: Users },
    { name: tDashboard("nav.activityHistory"), href: "/history", icon: History },
  ];

  const { user, activeTeamId, setActiveTeamId, accessToken, logout } = useSession();
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

    listTeams(accessToken).then((fetchedTeams) => {
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
    }).catch(console.error);
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

    // Dispatch invites if any
    if (payload.invites.length > 0) {
      await Promise.allSettled(
        payload.invites.map(invite => createInvite(invite, newTeam.id, accessToken))
      );
    }

    const updatedTeams = [...teams, newTeam];
    setTeams(updatedTeams);
    setActiveTeamId(newTeam.id);
  };

  if (!accessToken) {
    return <main className="min-h-screen bg-background text-foreground">{children}</main>;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-accent/30 selection:text-foreground">
      <CommandPalette />
      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceModalOpen}
        onClose={() => setIsCreateWorkspaceModalOpen(false)}
        onSubmit={handleCreateTeamSubmit}
      />
      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
      <AppPreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
      />
      <SwitchAccountModal
        isOpen={isSwitchAccountModalOpen}
        onClose={() => setIsSwitchAccountModalOpen(false)}
      />
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-card/30 backdrop-blur-sm md:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link href="/" className="flex items-center space-x-2 transition-opacity hover:opacity-80">
            <img src="/killio_white.webp" alt="Killio" className="h-6 w-auto" />
            <span className="font-semibold tracking-tight text-lg">Killio</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive
                      ? "bg-accent/20 text-accent font-semibold"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                    }`}
                >
                  <item.icon className={`h-4 w-4 ${isActive ? "opacity-100" : "opacity-70"}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 px-5">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase">
              {tDashboard("nav.recentBoards")}
            </h3>
            <div className="mt-3 space-y-1">
              {isFetchingBoards ? (
                <div className="flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : boards.length > 0 ? (
                boards.slice(0, 5).map((board) => (
                  <Link
                    key={board.id}
                    href={`/b/${board.id}`}
                    className="group flex items-center justify-between rounded-md py-1.5 px-3 text-sm text-foreground/70 hover:bg-accent/10 hover:text-accent font-medium transition-all"
                  >
                    <span className="truncate">{board.name}</span>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground px-3 py-1">{tDashboard("nav.noBoardsYet")}</div>
              )}
            </div>
          </div>

          <div className="mt-6 px-5">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase">
              {tDashboard("nav.recentDocuments")}
            </h3>
            <div className="mt-3 space-y-1">
              {isFetchingDocs ? (
                <div className="flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : recentDocuments.length > 0 ? (
                recentDocuments.slice(0, 5).map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/d/${doc.id}`}
                    className="group flex items-center justify-between rounded-md py-1.5 px-3 text-sm text-foreground/70 hover:bg-accent/10 hover:text-accent font-medium transition-all"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span className="truncate">{doc.title}</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground px-3 py-1">{tDashboard("nav.noDocumentsYet")}</div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border p-4 relative">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="flex w-full items-center justify-between rounded-lg hover:bg-accent/10 p-2 transition-colors cursor-pointer group focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <div className="flex items-center space-x-2 overflow-hidden">
              <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden border border-border shadow-sm bg-accent/10">
                <img 
                  src={getUserAvatarUrl(undefined, user?.email, 32)} 
                  alt={user?.displayName || tCommon("account.fallbackUser")} 
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex flex-col items-start overflow-hidden">
                <span className="text-sm font-medium w-full text-left truncate">{user?.displayName || "Loading..."}</span>
                <span className="text-xs text-muted-foreground w-full text-left truncate">
                  {user?.email || tCommon("account.fallbackAccount")}
                </span>
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 ml-2" />
          </button>

          {isSettingsOpen && (
            <div className="absolute bottom-16 left-4 w-60 rounded-xl border border-border bg-card p-2 shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tDashboard("accountMenu.account")}</div>

              <button
                onClick={() => { setIsSettingsOpen(false); setIsProfileModalOpen(true); }}
                className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
              >
                <UserCircle className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.profileSettings")}
              </button>

              <button
                onClick={() => { setIsSettingsOpen(false); setIsPreferencesModalOpen(true); }}
                className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
              >
                <Settings className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.appPreferences")}
              </button>

              <div className="h-px bg-border/50 my-1"></div>

              <button
                onClick={() => { setIsSettingsOpen(false); setIsSwitchAccountModalOpen(true); }}
                className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.switchAccount")}
              </button>

              <button
                onClick={logout}
                className="w-full text-left px-2 py-2 text-sm hover:bg-destructive/10 text-destructive rounded-md transition-colors flex items-center"
              >
                <LogOut className="mr-2 h-4 w-4" /> {tDashboard("accountMenu.signOut")}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="relative z-[90] flex h-14 items-center justify-between border-b border-border bg-background/60 px-4 backdrop-blur-md">
          <div className="flex flex-1 items-center">
            {/* Global Search / Command Palette trigger */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-cmdk"))}
              className="flex w-full max-w-sm items-center space-x-2 rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent/5 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-accent md:w-80"
            >
              <Search className="h-4 w-4 opacity-70" />
              <span>{tDashboard("search.placeholder")}</span>
              <span className="ml-auto hidden rounded bg-muted/50 px-1.5 py-0.5 text-xs font-semibold tracking-widest text-muted-foreground md:inline-block">
                ⌘K
              </span>
            </button>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* Team Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsTeamSwitcherOpen(!isTeamSwitcherOpen)}
                className="flex items-center space-x-2 rounded-md hover:bg-accent/10 px-3 py-1.5 transition-colors border border-transparent hover:border-border"
              >
                <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  {teams.find(t => t.id === activeTeamId)?.icon || teams.find(t => t.id === activeTeamId)?.name.substring(0, 1).toUpperCase() || "W"}
                </div>
                <span className="text-sm font-medium hidden sm:inline-block max-w-[120px] truncate">
                  {teams.find(t => t.id === activeTeamId)?.name || tDashboard("teamSwitcher.selectWorkspace")}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {isTeamSwitcherOpen && (
                <div className="absolute top-10 right-0 z-[120] w-56 rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in slide-in-from-top-2">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tDashboard("teamSwitcher.yourWorkspaces")}</div>
                  <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
                    {teams.map(team => (
                      <button
                        key={team.id}
                        onClick={() => {
                          setActiveTeamId(team.id);
                          setIsTeamSwitcherOpen(false);
                        }}
                        className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center truncate">
                          <span className="mr-2 text-base leading-none">{team.icon || team.name.charAt(0).toUpperCase()}</span>
                          <span className="truncate pr-2">{team.name}</span>
                        </div>
                        {activeTeamId === team.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <div className="h-px bg-border/50 my-1"></div>
                  <button onClick={() => {
                    setIsTeamSwitcherOpen(false);
                    setIsCreateWorkspaceModalOpen(true);
                  }} className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center text-accent">
                    <Plus className="h-4 w-4 mr-2" /> {tDashboard("teamSwitcher.createWorkspace")}
                  </button>
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-border/80 hidden sm:block mx-1"></div>

            <NotificationCenter />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background/50">
          {children}
        </main>

        <CardTimerWidget teamBoards={boards} teamDocs={recentDocuments} />
      </div>
    </div>
  );
}
