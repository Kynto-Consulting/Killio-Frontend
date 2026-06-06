"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Layout, Settings, UserCircle, History, Search, Plus, Loader2, Check, ChevronsUpDown, Users, LogOut, ArrowRightLeft, FileText, Zap, BarChart3, Sparkles, ChevronRight, GitBranch, MessageSquare, Lock, AlertTriangle, Workflow } from "lucide-react";
import { CommandPalette } from "@/components/ui/command-palette";
import { CreateWorkspaceModal } from "@/components/ui/create-workspace-modal";
import { ProfileSettingsModal } from "@/components/ui/profile-settings-modal";
import { AppPreferencesModal } from "@/components/ui/preferences-modal";
import { SwitchAccountModal } from "@/components/ui/switch-account-modal";
import { NotificationCenter } from "@/components/ui/notification-center";
import { CardTimerWidget } from "@/components/ui/card-timer-widget";
import { RoomVideoCall } from "@/components/rooms/RoomVideoCall";
import { RoomCallControls } from "@/components/rooms/RoomCallControls";
import { PushPermissionBanner } from "@/components/rooms/PushPermissionBanner";
import { useSession } from "@/components/providers/session-provider";
import { useLocalWorkspace, LocalWorkspaceProvider } from "@/components/providers/local-workspace-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useCall } from "@/components/providers/call-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { useVersionCheck } from "@/hooks/use-version-check";
import { useEffect, useState } from "react";
import { RefreshCw, HardDrive, CloudUpload, Trash2 } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { warmCache, warmImages, warmEntities } from "@/lib/warm-cache";
import { PublishWorkspaceModal } from "@/components/ui/publish-workspace-modal";
import { publishLocalWorkspace, type WorkspaceFile } from "@/lib/local-workspace/publish-workspace";
import { readAssetFile } from "@/lib/local-workspace/assets";
import { listTeams, listTeamBoards, createTeam, createInvite, BoardSummary, TeamView, TeamRole, getBoard } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary } from "@/lib/api/documents";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { useRouter } from "next/navigation";
import { apiCache, CACHE_TTL, cacheKey } from "@/lib/api-cache";
import { SkeletonSidebarLink } from "@/components/ui/skeleton";

export function LayoutWeb({ children }: { children: React.ReactNode }) {
  // Mount the Local workspace context here (client) so it reliably wraps the
  // switcher + pages; the dashboard segment layout uses an async server
  // component which can drop client context.
  return (
    <LocalWorkspaceProvider>
      <LayoutWebInner>{children}</LayoutWebInner>
    </LocalWorkspaceProvider>
  );
}

function LayoutWebInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const layoutParam = (searchParams.get("layout") ?? "").toLowerCase();
  const isLayoutDisabled = layoutParam === "false" || layoutParam === "0" || layoutParam === "off";
  const tDashboard = useTranslations("dashboard");
  const tShare = useTranslations("share-local");
  const tCommon = useTranslations("common");
  const tRooms = useTranslations("rooms");
  const tIntegrations = useTranslations("integrations");
  const isPathActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  // Scripts group sub-routes (real routes, owned by the sidebar). Each forces
  // its tab on the shared integrations workspace component.
  const scriptsSubRoutes = [
    { href: "/integrations", label: tIntegrations("tabs.integrations") },
    { href: "/scripts", label: tIntegrations("tabs.scripts") },
    { href: "/integrations/table", label: tIntegrations("tabs.table") },
    { href: "/integrations/env", label: tIntegrations("tabs.envVars") },
  ];
  // True on any of the 4 Scripts sub-routes (incl. the standalone /scripts).
  const isScriptsRouteActive = isPathActive("/integrations") || pathname === "/scripts";

  const navigation = [
    { name: tDashboard("nav.workspaces"), href: "/", icon: LayoutDashboard },
    { name: tDashboard("nav.teams"), href: "/teams", icon: Users },
    { name: tDashboard("nav.statistics"), href: "/metrics", icon: BarChart3 },
    { name: tDashboard("nav.marketplace"), href: "/marketplace", icon: Sparkles },
    { name: tDashboard("nav.scripts"), href: "/integrations", icon: Zap },
    { name: tDashboard("nav.boards"), href: "/b", icon: Layout },
    { name: tDashboard("nav.meshs"), href: "/m", icon: GitBranch },
    { name: tDashboard("nav.documents"), href: "/d", icon: FileText },
    { name: tDashboard("nav.graph"), href: "/graph", icon: Workflow },
    { name: tDashboard("nav.rooms"), href: "/rooms", icon: MessageSquare },
    { name: tDashboard("nav.activityHistory"), href: "/history", icon: History },
  ];

  const { user, activeTeamId, setActiveTeamId, accessToken, logout, accounts } = useSession();
  const { isAdmin: canAccessScripts } = useActiveTeamRole(activeTeamId, accessToken, user?.id);
  const localWs = useLocalWorkspace();
  const localMode = localWs.mode === "local";

  // In a Local workspace only disk-backed routes remain (boards/meshes/docs +
  // home); cloud-only sections are hidden. Otherwise filter by permissions.
  const LOCAL_ALLOWED = new Set(["/", "/b", "/m", "/d", "/graph"]);
  const navigationItems = navigation.filter(item => {
    if (localMode) return LOCAL_ALLOWED.has(item.href);
    if (item.href === "/metrics" || item.href === "/integrations") return canAccessScripts;
    return true;
  });
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isFetchingBoards, setIsFetchingBoards] = useState(false);
  const [isTeamSwitcherOpen, setIsTeamSwitcherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [isWsPublishOpen, setIsWsPublishOpen] = useState(false);
  const online = useOnline();
  const [isOfflineSwitchOpen, setIsOfflineSwitchOpen] = useState(false);
  // First time the dashboard mounts online, prefetch every top-level route
  // so the service worker pre-caches the app shell. Lets the user open the
  // PWA cold + offline and still navigate without ever having clicked.
  useEffect(() => {
    if (!online) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const id = window.setTimeout(() => { void warmCache(); }, 2500);
    return () => window.clearTimeout(id);
  }, [online]);
  // Force the avatar(s) into the image cache so they show up offline. Cheap +
  // dedup'd by the SW (CacheFirst).
  useEffect(() => {
    if (!online) return;
    const urls = [user?.avatarUrl as string | undefined, ...(accounts ?? []).map((a) => a.user?.avatarUrl as string | undefined)];
    void warmImages(urls);
  }, [online, user?.avatarUrl, accounts]);
  // Mutually-exclusive workspace selector: entering a local workspace clears
  // any active online team, and entering an online team is already handled by
  // each click site calling exitLocal(). This catches programmatic / restored
  // local mode (e.g. reconnect on boot) so both indicators don't stay lit.
  useEffect(() => {
    if (localMode && activeTeamId) setActiveTeamId(null);
  }, [localMode, activeTeamId, setActiveTeamId]);
  // When the user drops offline while in an online workspace, prompt to
  // switch to (or create) a local workspace — the cloud one can't load
  // without network.
  useEffect(() => {
    if (online) { setIsOfflineSwitchOpen(false); return; }
    if (localMode) return;
    setIsOfflineSwitchOpen(true);
  }, [online, localMode]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isSwitchAccountModalOpen, setIsSwitchAccountModalOpen] = useState(false);
  const [isBoardsOpen, setIsBoardsOpen] = useState(() => isPathActive("/b"));
  const [ismeshsOpen, setIsmeshsOpen] = useState(false);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(() => isPathActive("/d"));
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(() => isPathActive("/marketplace"));
  const [isScriptsOpen, setIsScriptsOpen] = useState(() => isPathActive("/integrations") || pathname === "/scripts");

  const [recentDocuments, setRecentDocuments] = useState<DocumentSummary[]>([]);
  const [isFetchingDocs, setIsFetchingDocs] = useState(false);
  // Force-precache every known entity detail page once boards/docs load —
  // users shouldn't depend on visiting each one individually. Throttled per-
  // URL to 1h via localStorage; honors online + sw availability.
  useEffect(() => {
    if (!online) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (!boards.length && !recentDocuments.length) return;
    const id = window.setTimeout(() => {
      void warmEntities({
        docs: recentDocuments.map((d) => ({ id: d.id })),
        boards: boards.map((b) => ({ id: b.id })),
        meshes: boards.filter((b: any) => (b.kind ?? "kb") === "km").map((b) => ({ id: b.id })),
        perKindCap: 30,
      });
    }, 4000);
    return () => window.clearTimeout(id);
  }, [online, boards, recentDocuments]);
  const [hasTimers, setHasTimers] = useState(false);
  const { call, settingsModalOpen, setSettingsModalOpen, canvasRef, localVideoRef } = useCall();
  const { updateAvailable } = useVersionCheck();
  const [dismissedBanners, setDismissedBanners] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("killio_dismissed_banners");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const dismissBanner = (id: string) => {
    const next = [...dismissedBanners, id];
    setDismissedBanners(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("killio_dismissed_banners", JSON.stringify(next));
    }
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("killio_sidebar_collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("killio_sidebar_collapsed", String(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed]);


  const activeTeam = teams.find(t => t.id === activeTeamId);
  const currentPlan = activeTeam?.planTier || 'free';
  const isActiveTeamArchived = !!activeTeam?.isArchived;
  const showUpgradeBanner = currentPlan === 'free' && !dismissedBanners.includes('upgrade_to_pro') && !isSidebarCollapsed && !isActiveTeamArchived;

  useEffect(() => {
    if (isPathActive("/b")) {
      setIsBoardsOpen(true);
    }
    if (isPathActive("/m")) {
      setIsmeshsOpen(true);
    }
    if (isPathActive("/d")) {
      setIsDocumentsOpen(true);
    }
    if (isPathActive("/marketplace")) {
      setIsMarketplaceOpen(true);
    }
    if (isPathActive("/integrations") || pathname === "/scripts") {
      setIsScriptsOpen(true);
    }
  }, [pathname]);

  const applyTeams = (fetchedTeams: TeamView[]) => {
    setTeams(fetchedTeams);
    if (fetchedTeams.length === 0) {
      if (activeTeamId) setActiveTeamId(null);
      return;
    }
    const hasValidActiveTeam = !!activeTeamId && fetchedTeams.some((t) => t.id === activeTeamId);
    if (!hasValidActiveTeam) setActiveTeamId(fetchedTeams[0].id);
  };

  useEffect(() => {
    if (!accessToken || !user?.id) return;
    const key = cacheKey.teams(user.id);

    // Show cached data instantly (no spinner)
    const cached = apiCache.get<TeamView[]>(key);
    if (cached) applyTeams(cached);

    // Always re-fetch in background to keep data fresh
    listTeams(accessToken).then((fresh) => {
      apiCache.set(key, fresh, CACHE_TTL.TEAMS);
      applyTeams(fresh);
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.id]);

  // Local workspace: sidebar boards/meshes/docs come from the folder.
  useEffect(() => {
    if (!localMode) return;
    setBoards(localWs.files.filter((f) => f.kind === "kb" || f.kind === "km").map((f) => ({
      id: f.path, name: f.name.replace(/\.(kb|km)$/, ""), boardType: f.kind === "km" ? "mesh" : "kanban", updatedAt: new Date(f.lastModified || Date.now()).toISOString(),
    })) as unknown as BoardSummary[]);
    setRecentDocuments(localWs.files.filter((f) => f.kind === "kd").map((f) => ({
      id: f.path, title: f.name.replace(/\.kd$/, ""), updatedAt: new Date(f.lastModified || Date.now()).toISOString(),
    })) as unknown as DocumentSummary[]);
    setIsFetchingBoards(false); setIsFetchingDocs(false);
  }, [localMode, localWs.files]);

  useEffect(() => {
    if (localMode || !accessToken || !activeTeamId) return;

    const bKey = cacheKey.boards(activeTeamId);
    const dKey = cacheKey.documents(activeTeamId);

    // Serve from cache immediately — no spinner if cached
    const cachedBoards = apiCache.get<BoardSummary[]>(bKey);
    const cachedDocs   = apiCache.get<DocumentSummary[]>(dKey);

    if (cachedBoards) setBoards(cachedBoards);
    if (cachedDocs)   setRecentDocuments(cachedDocs);

    if (!cachedBoards) setIsFetchingBoards(true);
    if (!cachedDocs)   setIsFetchingDocs(true);

    // Fetch both in parallel (no waterfall)
    Promise.all([
      listTeamBoards(activeTeamId, accessToken),
      listDocuments(activeTeamId, accessToken),
    ]).then(([freshBoards, freshDocs]) => {
      apiCache.set(bKey, freshBoards, CACHE_TTL.BOARDS);
      apiCache.set(dKey, freshDocs,   CACHE_TTL.DOCUMENTS);
      setBoards(freshBoards);
      setRecentDocuments(freshDocs);
    }).catch(console.error)
      .finally(() => { setIsFetchingBoards(false); setIsFetchingDocs(false); });
  }, [accessToken, activeTeamId]);

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

  if (isLayoutDisabled) {
    return <main className="min-h-screen bg-background text-foreground">{children}</main>;
  }

  if (!accessToken && !localMode) {
    return <main className="min-h-screen bg-background text-foreground">{children}</main>;
  }

  const recentBoardLinks = boards.filter((board) => board.boardType !== "mesh").slice(0, 3).map((board) => ({
    id: board.id,
    label: board.name,
    href: `/b/${board.id}`,
  }));

  const recentMeshLinks = boards.filter((board) => board.boardType === "mesh").slice(0, 3).map((board) => ({
    id: board.id,
    label: board.name,
    href: `/m/${board.id}`,
  }));

  const recentDocumentLinks = recentDocuments.slice(0, 3).map((document) => ({
    id: document.id,
    label: document.title,
    href: `/d/${document.id}`,
  }));

  // Prefetch board details in the background so clicking a board link is instant.
  // Skip in local mode: ids are .kb/.km file paths, not cloud board ids — a cloud
  // GET /boards/<file>.km would 403.
  if (accessToken && !localMode) {
    [...recentBoardLinks, ...recentMeshLinks].forEach(({ id }) => {
      apiCache.prefetch(
        cacheKey.board(id),
        () => getBoard(id, accessToken),
        CACHE_TTL.BOARD_DETAIL,
      );
    });
  }

  const renderExpandableItem = ({
    key,
    href,
    name,
    icon: Icon,
    isOpen,
    onToggle,
    isActive,
    items,
    isLoading,
    emptyLabel,
    isCollapsed,
  }: {
    key: string;
    href?: string;
    name: string;
    icon: typeof Layout;
    isOpen: boolean;
    onToggle: () => void;
    isActive: boolean;
    items: { id: string; label: string; href: string }[];
    isLoading: boolean;
    emptyLabel: string;
    isCollapsed: boolean;
  }) => {
    const itemClassName = isActive
      ? "bg-accent/10 text-foreground"
      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground";

    return (
      <div key={key} className="flex flex-col">
        <div className={`group flex items-center rounded-md transition-colors ${itemClassName} ${isCollapsed ? "justify-center px-0" : "pl-3"}`}>

          {href ? (
            <Link
              href={href}
              title={isCollapsed ? name : undefined}
              className={`flex min-w-0 items-center space-x-3 py-2 text-sm font-medium ${isCollapsed ? "justify-center w-full px-0" : "flex-1 pr-3"}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`} />
              {!isCollapsed && <span className="truncate">{name}</span>}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              title={isCollapsed ? name : undefined}
              className={`flex min-w-0 items-center space-x-3 py-2 text-left text-sm font-medium ${isCollapsed ? "justify-center w-full px-0" : "flex-1 pr-3"}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`} />
              {!isCollapsed && <span className="truncate">{name}</span>}
            </button>
          )}

          {!isCollapsed && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            </button>
          )}

        </div>

        {isOpen && !isCollapsed && (
          <div className="ml-5 mt-1 border-l border-border/70 pl-4">
            <div className="space-y-1 py-1">
              {isLoading && items.length === 0 ? (
                <div className="space-y-1 py-1">
                  <SkeletonSidebarLink />
                  <SkeletonSidebarLink className="opacity-70" />
                  <SkeletonSidebarLink className="opacity-40" />
                </div>
              ) : items.length > 0 ? (
                items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground/75 transition-all hover:bg-accent/10 hover:text-foreground"
                    onMouseEnter={() => {
                      if (!accessToken || localMode) return;
                      // On-hover prefetch for boards/meshes
                      if (item.href.startsWith('/b/') || item.href.startsWith('/m/')) {
                        apiCache.prefetch(cacheKey.board(item.id), () => getBoard(item.id, accessToken), CACHE_TTL.BOARD_DETAIL);
                      }
                    }}
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))
              ) : (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">{emptyLabel}</div>
              )}

              {href ? (
                <Link
                  href={href}
                  className="flex items-center rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
                >
                  {tDashboard("nav.viewAll")}
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-accent/30 selection:text-foreground">
      <CommandPalette />
      {/* Offline → online-workspace switch prompt. Keeps the session alive
          and steers the user into a local workspace they can actually use. */}
      {isOfflineSwitchOpen && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setIsOfflineSwitchOpen(false); }}>
          <div className="w-[min(420px,92vw)] rounded-2xl border border-cyan-300/25 bg-popover p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-foreground">{tDashboard("offlineSwitch.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tDashboard("offlineSwitch.body")}</p>
            {localWs.workspaces.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-card/40">
                {localWs.workspaces.map((lw) => (
                  <button key={lw.id} type="button"
                    onClick={() => { void localWs.selectLocalWorkspace(lw.id); setIsOfflineSwitchOpen(false); }}
                    className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/10">
                    {lw.name}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button"
                onClick={() => { setIsOfflineSwitchOpen(false); void localWs.createLocalWorkspace(); }}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90">
                {tDashboard("offlineSwitch.createLocal")}
              </button>
              <button type="button"
                onClick={() => setIsOfflineSwitchOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40">
                {tDashboard("offlineSwitch.close")}
              </button>
            </div>
          </div>
        </div>
      )}
      <CreateWorkspaceModal
        isOpen={isCreateWorkspaceModalOpen}
        onClose={() => setIsCreateWorkspaceModalOpen(false)}
        onSubmit={handleCreateTeamSubmit}
      />
      <PublishWorkspaceModal
        isOpen={isWsPublishOpen}
        onClose={() => setIsWsPublishOpen(false)}
        online={online}
        canPublish={!!accessToken && !!activeTeamId}
        itemCount={localWs.files.filter((f) => f.kind === "kd" || f.kind === "km" || f.kind === "kb").length}
        run={async (onProgress) => {
          const dir = localWs.getDir();
          const entries = localWs.files.filter((f) => f.kind === "kd" || f.kind === "km" || f.kind === "kb");
          const wsFiles: WorkspaceFile[] = [];
          for (const f of entries) {
            try { wsFiles.push({ path: f.path, kind: f.kind as WorkspaceFile["kind"], text: await localWs.readFile(f.path) }); } catch { /* skip unreadable */ }
          }
          return publishLocalWorkspace(
            wsFiles,
            { teamId: activeTeamId as string, accessToken: accessToken as string },
            {
              onProgress,
              readAsset: dir ? async (name: string) => { try { return await readAssetFile(dir, name); } catch { return null; } } : undefined,
            },
          );
        }}
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
      <aside className={`hidden flex-col border-r border-border bg-card/30 backdrop-blur-sm md:flex transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "w-16" : "w-64"}`}>
        <div className={`flex h-14 items-center border-b border-border px-4 ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/" className="flex items-center space-x-2 transition-opacity hover:opacity-80">
            <img src="/killio_white.webp" alt="Killio" className="h-6 w-auto" />
            {!isSidebarCollapsed && <span className="font-semibold tracking-tight text-lg">Killio</span>}
          </Link>
          {!isSidebarCollapsed && (
            <button
              onClick={() => setIsSidebarCollapsed(true)}
              className="p-1 rounded-md hover:bg-accent/10 text-muted-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>

        {isSidebarCollapsed && (
          <div className="flex justify-center py-2 border-b border-border/50">
            <button
              onClick={() => setIsSidebarCollapsed(false)}
              className="p-2 rounded-md hover:bg-accent/10 text-muted-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            {/* Archived workspace banner */}
            {isActiveTeamArchived && (
              <div className="mb-3 mx-1 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-red-300">{tDashboard("teamSwitcher.archivedBannerTitle")}</p>
                  <p className="text-[10px] text-red-400/80 leading-snug mt-0.5">{tDashboard("teamSwitcher.archivedBannerBody")}</p>
                </div>
              </div>
            )}

            {navigationItems.map((item) => {
              const isScriptsMenu = item.href === "/integrations";
              const isMarketplaceMenu = item.href === "/marketplace";
              // Scripts group spans 4 real routes; highlight the parent on any of them.
              const isActive = isScriptsMenu
                ? isScriptsRouteActive
                : isPathActive(item.href);
              const isNestedMenu = isScriptsMenu || isMarketplaceMenu;
              // Archived workspace: only /teams is accessible
              const isBlockedByArchive = isActiveTeamArchived && item.href !== "/teams";

              if (isBlockedByArchive) {
                return (
                  <div key={item.name} title={tDashboard("teamSwitcher.archivedTooltip")}
                    className={`flex items-center space-x-3 rounded-md py-2 text-sm font-medium cursor-not-allowed opacity-35 ${isSidebarCollapsed ? "justify-center px-0" : "px-3"} text-muted-foreground`}>
                    <Lock className="h-4 w-4 opacity-60" />
                    {!isSidebarCollapsed && <span>{item.name}</span>}
                  </div>
                );
              }

              if (item.href === "/b") {
                return renderExpandableItem({
                  key: item.href,
                  href: item.href,
                  name: item.name,
                  icon: item.icon,
                  isOpen: isBoardsOpen,
                  onToggle: () => setIsBoardsOpen((current) => !current),
                  isActive,
                  items: recentBoardLinks,
                  isLoading: isFetchingBoards,
                  emptyLabel: tDashboard("nav.noBoardsYet"),
                  isCollapsed: isSidebarCollapsed,
                });
              }

              if (item.href === "/m") {
                return renderExpandableItem({
                  key: "mesh",
                  href: "/m",
                  name: item.name,
                  icon: item.icon,
                  isOpen: ismeshsOpen,
                  onToggle: () => setIsmeshsOpen((current) => !current),
                  isActive,
                  items: recentMeshLinks,
                  isLoading: isFetchingBoards,
                  emptyLabel: tDashboard("nav.nomeshsYet"),
                  isCollapsed: isSidebarCollapsed,
                });
              }

              if (item.href === "/d") {
                return renderExpandableItem({
                  key: item.href,
                  href: item.href,
                  name: item.name,
                  icon: item.icon,
                  isOpen: isDocumentsOpen,
                  onToggle: () => setIsDocumentsOpen((current) => !current),
                  isActive,
                  items: recentDocumentLinks,
                  isLoading: isFetchingDocs,
                  emptyLabel: tDashboard("nav.noDocumentsYet"),
                  isCollapsed: isSidebarCollapsed,
                });
              }

              if (isMarketplaceMenu) {
                return (
                  <div key={item.name} className="flex flex-col">
                    <div className={`group flex items-center rounded-md transition-colors ${isSidebarCollapsed ? "justify-center px-0" : "pl-3"} ${isActive ? "bg-accent/5 text-foreground" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"}`}>
                      <button
                        type="button"
                        onClick={() => isSidebarCollapsed ? router.push(item.href) : setIsMarketplaceOpen((v) => !v)}
                        title={isSidebarCollapsed ? item.name : undefined}
                        className={`flex min-w-0 items-center space-x-3 py-2 text-left text-sm font-medium ${isSidebarCollapsed ? "justify-center w-full px-0" : "flex-1 pr-3"}`}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`} />
                        {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                      </button>
                      {!isSidebarCollapsed && (
                        <button
                          type="button"
                          onClick={() => setIsMarketplaceOpen((v) => !v)}
                          className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isMarketplaceOpen ? "rotate-90" : ""}`} />
                        </button>
                      )}
                    </div>
                    {isMarketplaceOpen && !isSidebarCollapsed && (
                      <div className="ml-5 mt-1 border-l border-border/70 pl-3">
                        <div className="space-y-1 py-1">
                          <Link
                            href="/marketplace"
                            className={`flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${pathname === "/marketplace" ? "bg-accent/10 text-foreground" : "text-foreground/75 hover:bg-accent/10 hover:text-foreground"}`}
                          >
                            {tDashboard("nav.marketplaceHome")}
                          </Link>
                          <Link
                            href="/marketplace/profile"
                            className={`flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${pathname === "/marketplace/profile" ? "bg-accent/10 text-foreground" : "text-foreground/75 hover:bg-accent/10 hover:text-foreground"}`}
                          >
                            {tDashboard("nav.marketplaceSellerProfile")}
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              if (isScriptsMenu) {
                return (
                  <div key={item.name} className="flex flex-col">
                    <div className={`group flex items-center rounded-md transition-colors ${isSidebarCollapsed ? "justify-center px-0" : "pl-3"} ${isActive ? "bg-accent/5 text-foreground" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"}`}>
                      <button
                        type="button"
                        onClick={() => isSidebarCollapsed ? router.push(item.href) : setIsScriptsOpen((v) => !v)}
                        title={isSidebarCollapsed ? item.name : undefined}
                        className={`flex min-w-0 items-center space-x-3 py-2 text-left text-sm font-medium ${isSidebarCollapsed ? "justify-center w-full px-0" : "flex-1 pr-3"}`}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`} />
                        {!isSidebarCollapsed && <span className="truncate">{item.name}</span>}
                      </button>
                      {!isSidebarCollapsed && (
                        <button
                          type="button"
                          onClick={() => setIsScriptsOpen((v) => !v)}
                          aria-label={isScriptsOpen ? `Collapse ${item.name}` : `Expand ${item.name}`}
                          className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isScriptsOpen ? "rotate-90" : ""}`} />
                        </button>
                      )}
                    </div>
                    {/* Real sub-route links (no longer portaled from the page). */}
                    {isScriptsOpen && !isSidebarCollapsed && (
                      <div className="ml-5 mt-1 space-y-1 border-l border-border/70 pl-3">
                        {scriptsSubRoutes.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={`flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${
                              pathname === sub.href
                                ? "bg-accent/10 text-foreground"
                                : "text-foreground/75 hover:bg-accent/10 hover:text-foreground"
                            }`}
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={item.name} className="flex flex-col">
                  <Link
                    href={item.href}
                    title={isSidebarCollapsed ? item.name : undefined}
                    className={`flex items-center space-x-3 rounded-md py-2 text-sm font-medium transition-colors ${isSidebarCollapsed ? "justify-center px-0" : "px-3"} ${isActive && !isNestedMenu
                      ? "bg-accent/20 text-accent font-semibold"
                      : isActive && isNestedMenu
                        ? "bg-accent/5 text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                      }`}
                  >
                    <item.icon className={`h-4 w-4 ${isActive ? "opacity-100" : "opacity-70"}`} />
                    {!isSidebarCollapsed && <span>{item.name}</span>}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border p-4 relative">
          {showUpgradeBanner && (
            <div className="mb-4 relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 p-3 shadow-lg animate-in fade-in slide-in-from-bottom-4 group/banner">
              <button
                onClick={() => dismissBanner('upgrade_to_pro')}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <Plus className="h-3 w-3 rotate-45" />
              </button>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  PRO
                </div>
                <p className="text-[11px] text-white/90 leading-snug">
                  Unlock AI automation, premium rooms & custom meshs.
                </p>
                <button
                  onClick={() => router.push("/pricing")}
                  className="mt-1 w-full bg-white text-indigo-700 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors shadow-sm"
                >
                  Upgrade Now
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`flex w-full items-center justify-between rounded-lg hover:bg-accent/10 p-2 transition-colors cursor-pointer group focus:outline-none focus:ring-1 focus:ring-accent ${isSidebarCollapsed ? "justify-center" : ""}`}
          >
            <div className={`flex items-center space-x-2 ${isSidebarCollapsed ? "" : "overflow-hidden"}`}>
              <div className={`h-8 w-8 shrink-0 rounded-full overflow-hidden border border-border shadow-sm bg-accent/10 ${isSidebarCollapsed ? "mx-auto" : ""}`}>
                <img
                  src={getUserAvatarUrl(user?.avatarUrl, user?.email, 32)}
                  alt={user?.username || user?.displayName || tCommon("account.fallbackUser")}
                  className="h-full w-full object-cover"
                />
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium w-full text-left truncate">{user?.username || user?.displayName || "Loading..."}</span>
                  <span className="text-xs text-muted-foreground w-full text-left truncate capitalize">
                    {localMode
                      ? "Local"
                      : `${currentPlan === 'max' ? 'Max' : currentPlan === 'pro' ? 'Pro' : currentPlan === 'enterprise' ? 'Enterprise' : 'Free'} ${tDashboard("accountMenu.plan")}`}
                  </span>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && <ChevronsUpDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 ml-2" />}
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
          <div className="flex flex-1 items-center min-w-0 pr-4">
            {/* Global Search / Command Palette trigger */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-cmdk"))}
              className="flex w-full max-w-sm items-center space-x-2 rounded-md border border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent/5 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-accent md:w-80 flex-shrink-0"
            >
              <Search className="h-4 w-4 opacity-70 flex-shrink-0" />
              <span className="truncate">{tDashboard("search.placeholder")}</span>
              <span className="ml-auto hidden rounded bg-muted/50 px-1.5 py-0.5 text-xs font-semibold tracking-widest text-muted-foreground md:inline-block flex-shrink-0">
                ⌘K
              </span>
            </button>
            <div id="navbar-usage-slot" className="ml-4 flex items-center min-w-0 overflow-hidden"></div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* Team Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsTeamSwitcherOpen(!isTeamSwitcherOpen)}
                className="flex items-center space-x-2 rounded-md hover:bg-accent/10 px-3 py-1.5 transition-colors border border-transparent hover:border-border"
              >
                <div className={`h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold ${localMode ? "bg-cyan-500/20 text-cyan-300" : isActiveTeamArchived ? "bg-red-500/20 text-red-400" : "bg-primary/20 text-primary"}`}>
                  {localMode
                    ? <HardDrive className="h-3 w-3" />
                    : isActiveTeamArchived
                      ? <Lock className="h-3 w-3" />
                      : (activeTeam?.icon || activeTeam?.name.substring(0, 1).toUpperCase() || "W")
                  }
                </div>
                <span className={`text-sm font-medium hidden sm:inline-block max-w-[120px] truncate ${isActiveTeamArchived && !localMode ? "line-through text-muted-foreground" : ""}`}>
                  {localMode ? (localWs.active?.name || tDashboard("teamSwitcher.localWorkspace")) : (activeTeam?.name || tDashboard("teamSwitcher.selectWorkspace"))}
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {isTeamSwitcherOpen && (
                <div className="absolute top-10 right-0 z-[120] w-56 rounded-xl border border-border bg-card p-1 shadow-lg animate-in fade-in slide-in-from-top-2">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tDashboard("teamSwitcher.yourWorkspaces")}</div>
                  <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
                    {/* Hide online workspaces while offline — they're unreachable
                        and selecting one would 401-loop. Local workspaces stay. */}
                    {(online ? teams : []).map(team => (
                      <button
                        key={team.id}
                        onClick={() => {
                          localWs.exitLocal();
                          setActiveTeamId(team.id);
                          setIsTeamSwitcherOpen(false);
                        }}
                        className={`w-full text-left px-2 py-2 text-sm rounded-md transition-colors flex items-center justify-between ${team.isArchived ? "opacity-60 hover:bg-red-500/10" : "hover:bg-accent/10"}`}
                      >
                        <div className="flex items-center truncate gap-2">
                          {team.isArchived
                            ? <Lock className="h-3.5 w-3.5 shrink-0 text-red-400" />
                            : <span className="text-base leading-none">{team.icon || team.name.charAt(0).toUpperCase()}</span>
                          }
                          <span className={`truncate pr-2 ${team.isArchived ? "line-through text-muted-foreground" : ""}`}>{team.name}</span>
                          {team.isArchived && <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 shrink-0">{tDashboard("teamSwitcher.archivedBadge")}</span>}
                        </div>
                        {activeTeamId === team.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                  {localWs.workspaces.length > 0 && (
                    <>
                      <div className="h-px bg-border/50 my-1"></div>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <HardDrive className="h-3 w-3" /> {tDashboard("teamSwitcher.localWorkspaces")}
                      </div>
                      <div className="space-y-0.5 mt-1 max-h-40 overflow-y-auto">
                        {localWs.workspaces.map((lw) => {
                          const isActive = localMode && localWs.activeId === lw.id;
                          return (
                          <div key={lw.id} className="group flex items-center rounded-md transition-colors hover:bg-accent/10">
                            <button
                              onClick={() => { void localWs.selectLocalWorkspace(lw.id); setIsTeamSwitcherOpen(false); }}
                              className="flex-1 text-left px-2 py-2 text-sm flex items-center justify-between min-w-0"
                            >
                              <div className="flex items-center truncate gap-2">
                                <HardDrive className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                                <span className="truncate pr-2">{lw.name}</span>
                              </div>
                              {isActive && <Check className="h-4 w-4 text-cyan-300 shrink-0" />}
                            </button>
                            {isActive && (
                              <button
                                title={tShare("wsButton")}
                                onClick={(e) => { e.stopPropagation(); setIsTeamSwitcherOpen(false); setIsWsPublishOpen(true); }}
                                className="mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent/15 hover:text-accent transition-colors"
                              >
                                <CloudUpload className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              title={tDashboard("teamSwitcher.unlinkLocal")}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (typeof window !== "undefined" && !window.confirm(tDashboard("teamSwitcher.unlinkConfirm"))) return;
                                void localWs.removeLocalWorkspace(lw.id);
                                if (isActive) localWs.exitLocal();
                              }}
                              className="mr-1 hidden shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 transition-colors group-hover:flex"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div className="h-px bg-border/50 my-1"></div>
                  <button onClick={() => {
                    setIsTeamSwitcherOpen(false);
                    setIsCreateWorkspaceModalOpen(true);
                  }} className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center text-accent">
                    <Plus className="h-4 w-4 mr-2" /> {tDashboard("teamSwitcher.createWorkspace")}
                  </button>
                  {localWs.supported && (
                    <button onClick={() => { setIsTeamSwitcherOpen(false); void localWs.createLocalWorkspace(); }}
                      className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center text-cyan-300">
                      <HardDrive className="h-4 w-4 mr-2" /> {tDashboard("teamSwitcher.createLocal")}
                    </button>
                  )}
                  <Link
                    href="/pricing"
                    onClick={() => setIsTeamSwitcherOpen(false)}
                    className="w-full text-left px-2 py-2 text-sm hover:bg-accent/10 rounded-md transition-colors flex items-center"
                  >
                    <Sparkles className="h-4 w-4 mr-2" /> {tDashboard("teamSwitcher.upgrade")}
                  </Link>
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-border/80 hidden sm:block mx-1"></div>

            <NotificationCenter />
          </div>
        </header>

        {/* New version banner */}
        {updateAvailable && (
          <div className="flex items-center justify-center gap-3 bg-accent text-accent-foreground px-4 py-2 text-sm font-medium animate-in slide-in-from-top-1 duration-300 shrink-0">
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>Nueva versión disponible.</span>
            <button
              onClick={() => window.location.reload()}
              className="underline underline-offset-2 font-semibold hover:opacity-80 transition-opacity"
            >
              Refrescar
            </button>
          </div>
        )}

        {/* Global Push Permission Banner */}
        <PushPermissionBanner accessToken={accessToken} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background/50">
          {children}
        </main>

        <CardTimerWidget 
          teamBoards={boards} 
          teamDocs={recentDocuments} 
          onTimersChange={setHasTimers}
        />

        {call.isInCall && (
          <RoomVideoCall
            localStream={call.localStream}
            screenStream={call.screenStream}
            peers={call.peers}
            isScreenSharing={call.isScreenSharing}
            isCameraFilterActive={call.isCameraFilterActive}
            canvasRef={canvasRef}
            localVideoRef={localVideoRef}
            localDisplayName={user?.displayName || user?.username || "You"}
            localUserId={user?.id}
            isAudioMuted={call.isAudioMuted}
            isVideoMuted={call.isVideoMuted}
            liveCaption={call.liveCaption}
            transcriptSegments={call.transcriptSegments}
            activeFilter={call.activeFilter}
            onSetFilter={call.setFilter}
            backgroundBlur={call.backgroundBlur}
            onSetBackgroundBlur={call.setBackgroundBlur}
            skinSmooth={call.skinSmooth}
            onSetSkinSmooth={call.setSkinSmooth}
            backgroundRemoval={call.backgroundRemoval}
            onSetBackgroundRemoval={call.setBackgroundRemoval}
            virtualBackgroundUrl={call.virtualBackgroundUrl}
            onSetVirtualBackgroundUrl={call.setVirtualBackgroundUrl}
            backgroundColor={call.backgroundColor}
            onSetBackgroundColor={call.setBackgroundColor}
            currentVideoDeviceId={call.currentVideoDeviceId}
            onSwitchCamera={call.switchCamera}
            settingsModalOpen={settingsModalOpen}
            onSetSettingsModalOpen={setSettingsModalOpen}
            captionSettings={call.captionSettings}
            onSetCaptionSettings={call.setCaptionSettings}
            bottomOffset={hasTimers ? 240 : 0}
            callControls={
              <RoomCallControls
                isAudioMuted={call.isAudioMuted}
                isVideoMuted={call.isVideoMuted}
                isScreenSharing={call.isScreenSharing}
                isCameraFilterActive={call.isCameraFilterActive}
                activeFilter={call.activeFilter}
                isRecording={call.isRecording}
                recordingElapsed={call.recordingElapsed}
                canRecord={true} // Simplified for global
                onOpenSettings={() => setSettingsModalOpen(true)}
                onToggleAudio={call.toggleAudio}
                onToggleVideo={call.toggleVideo}
                onToggleScreenShare={call.toggleScreenShare}
                onSetFilter={call.setFilter}
                onToggleRecording={call.toggleRecording}
                onLeave={call.leaveCall}
                t={tRooms}
              />
            }
            t={tRooms}
          />
        )}
      </div>
    </div>
  );
}
