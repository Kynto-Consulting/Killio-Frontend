"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, Search, Home, Layout, FileText, Users, History,
  Settings, LogOut, Check, Plus, ChevronsUpDown, UserCircle, ArrowRightLeft, Sparkles, Loader2, ChevronRight, GitBranch
} from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { BoardSummary, TeamView } from "@/lib/api/contracts";
import { DocumentSummary } from "@/lib/api/documents";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";

export function MobileNavSheet({
  teams,
  activeTeamId,
  setActiveTeamId,
  navigation,
  boards,
  recentDocuments,
  isFetchingBoards = false,
  isFetchingDocuments = false,
  user,
  logout,
  onCreateWorkspace,
  boardName,
  documentName
}: {
  teams: TeamView[];
  activeTeamId: string | null;
  setActiveTeamId: (id: string) => void;
  navigation: { name: string; href: string; icon: any }[];
  boards: BoardSummary[];
  recentDocuments: DocumentSummary[];
  isFetchingBoards?: boolean;
  isFetchingDocuments?: boolean;
  user: any;
  logout: () => void;
  onCreateWorkspace?: () => void;
  boardName?: string;
  documentName?: string;
}) {
  const pathname = usePathname();
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const isPathActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const [isOpen, setIsOpen] = useState(false);
  const [isBoardsOpen, setIsBoardsOpen] = useState(() => pathname.startsWith("/b"));
  const [ismeshsOpen, setIsmeshsOpen] = useState(() => pathname.startsWith("/m"));
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(() => pathname.startsWith("/d"));
  
  const activeTeam = teams.find(t => t.id === activeTeamId);
  const recentBoardLinks = boards
    .filter((board) => board.boardType !== "mesh")
    .slice(0, 3)
    .map((board) => ({ id: board.id, label: board.name, href: `/b/${board.id}` }));
  const recentMeshLinks = boards
    .filter((board) => board.boardType === "mesh")
    .slice(0, 3)
    .map((board) => ({ id: board.id, label: board.name, href: `/m/${board.id}` }));
  const recentDocumentLinks = recentDocuments.slice(0, 3).map((document) => ({ id: document.id, label: document.title, href: `/d/${document.id}` }));
  
  const currentNav = navigation.find(n => pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href)));
  const pageLabel = boardName || documentName || (pathname.startsWith("/m") ? tDashboard("nav.meshs") : currentNav?.name) || tDashboard("nav.workspaces");

  useEffect(() => {
    if (pathname.startsWith("/b")) {
      setIsBoardsOpen(true);
    }
    if (pathname.startsWith("/m")) {
      setIsmeshsOpen(true);
    }
    if (pathname.startsWith("/d")) {
      setIsDocumentsOpen(true);
    }
  }, [pathname]);

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
  }) => {
    const itemClassName = isActive
      ? "bg-accent/10 text-accent font-semibold"
      : "text-foreground/80 hover:bg-accent/5 hover:text-foreground";

    return (
      <div key={key} className="flex flex-col">
        <div className={`group flex items-center rounded-md transition-colors ${itemClassName}`}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
            className="ml-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </button>

          {href ? (
            <Link
              href={href}
              onClick={() => setIsOpen(false)}
              className="flex min-w-0 flex-1 items-center space-x-3 py-2.5 pr-3 text-sm font-medium"
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              <span className="truncate">{name}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              className="flex min-w-0 flex-1 items-center space-x-3 py-2.5 pr-3 text-left text-sm font-medium"
            >
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
              <span className="truncate">{name}</span>
            </button>
          )}
        </div>

        {isOpen && (
          <div className="ml-5 mt-1 border-l border-border/70 pl-4">
            <div className="space-y-1 py-1">
              {isLoading ? (
                <div className="flex justify-center p-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : items.length > 0 ? (
                items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground/75 transition-all hover:bg-accent/10 hover:text-foreground"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border transition-colors group-hover:bg-accent" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))
              ) : (
                <div className="px-3 py-1.5 text-sm text-muted-foreground">{emptyLabel}</div>
              )}

              {href ? (
                <Link
                  href={href}
                  onClick={() => setIsOpen(false)}
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
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2 py-1.5 -ml-2 rounded-md hover:bg-accent/10 transition-colors max-w-[200px] sm:max-w-xs"
      >
        <div className="flex items-center justify-center h-5 w-5 rounded bg-primary/20 text-[10px] font-bold text-primary shrink-0">
          {activeTeam?.icon || activeTeam?.name.charAt(0).toUpperCase() || "W"}
        </div>
        <span className="text-sm font-semibold truncate shrink-0 max-w-[80px]">
          {activeTeam?.name || tDashboard("teamSwitcher.selectWorkspace")}
        </span>
        <span className="text-muted-foreground/50 text-sm">/</span>
        <span className="text-sm font-medium truncate">
          {pageLabel}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {/* Notion like Navigation Drawer */}
      {isOpen && (
        <Portal>
          <div 
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          >
            <div 
              className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm flex-col rounded-r-2xl bg-card p-0 shadow-2xl transition-transform duration-300 animate-in slide-in-from-left border-y-0 border-l-0 border-r sm:max-w-sm !rounded-l-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sr-only">Menu</div>
              <div className="flex flex-col h-full overflow-hidden text-foreground">
                {/* Workspace Header Switcher */}
                <div className="p-4 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-sm font-bold text-primary border border-primary/20">
                         {activeTeam?.icon || activeTeam?.name.charAt(0).toUpperCase() || "W"}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold leading-tight">{activeTeam?.name || "Workspace"}</span>
                        <span className="text-xs text-muted-foreground">Killio</span>
                      </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-accent/10 rounded-md">
                      <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

            {/* Navigation Routes */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {navigation.map((item) => {
                const isActive = isPathActive(item.href);
                const isScriptsMenu = item.href === "/integrations";

                if (item.href === "/b") {
                  return (
                    <div key={item.name} className="space-y-1">
                      {renderExpandableItem({
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
                      })}

                      {renderExpandableItem({
                        key: "mesh-boards",
                        href: "/m",
                        name: tDashboard("nav.meshs"),
                        icon: GitBranch,
                        isOpen: ismeshsOpen,
                        onToggle: () => setIsmeshsOpen((current) => !current),
                        isActive: isPathActive("/m"),
                        items: recentMeshLinks,
                        isLoading: isFetchingBoards,
                        emptyLabel: tDashboard("nav.nomeshsYet"),
                      })}
                    </div>
                  );
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
                    isLoading: isFetchingDocuments,
                    emptyLabel: tDashboard("nav.noDocumentsYet"),
                  });
                }

                return (
                  <div key={item.name} className="flex flex-col">
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center space-x-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive && !isScriptsMenu
                          ? "bg-accent/10 text-accent font-semibold"
                          : isActive && isScriptsMenu
                          ? "bg-accent/5 text-foreground font-semibold"
                          : "text-foreground/80 hover:bg-accent/5 hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 opacity-70" />
                      <span>{item.name}</span>
                    </Link>
                    {isActive && isScriptsMenu && (
                      <div
                        id="sidebar-scripts-options-mobile"
                        className="ml-[1.4rem] mt-1 space-y-1 border-l border-border pl-3"
                      ></div>
                    )}
                  </div>
                );
              })}

              <div className="h-px bg-border/50 my-4 mx-2"></div>
              
              <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Workspaces
              </h3>
              
              <div className="space-y-1">
                {teams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => {
                      setActiveTeamId(team.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      activeTeamId === team.id ? "bg-accent/5 text-foreground font-semibold" : "text-foreground/70 hover:bg-accent/5 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <span className="text-base h-4 w-4 flex items-center justify-center">{team.icon || team.name.charAt(0).toUpperCase()}</span>
                      <span className="truncate">{team.name}</span>
                    </div>
                    {activeTeamId === team.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCreateWorkspace?.();
                  }}
                  className="w-full flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10"
                >
                  <Plus className="h-4 w-4" />
                  <span>{tDashboard("teamSwitcher.createWorkspace")}</span>
                </button>
                <Link
                  href="/pricing"
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-accent/5 hover:text-foreground"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{tDashboard("teamSwitcher.upgrade")}</span>
                </Link>
              </div>
            </div>

            {/* Footer with User Actions */}
            <div className="border-t border-border/50 p-2">
               <button
                  className="flex w-full items-center justify-between rounded-lg hover:bg-accent/5 p-2 transition-colors focus:outline-none"
                  onClick={() => setIsOpen(false)}
                >
                  <div className="flex items-center space-x-2 overflow-hidden">
                    <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden border border-border shadow-sm bg-accent/10">
                      <img 
                        src={getUserAvatarUrl(undefined, user?.email, 32)} 
                        alt={user?.displayName || "User"} 
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col items-start overflow-hidden">
                      <span className="text-sm font-medium w-full text-left truncate leading-tight">{user?.displayName || "Account"}</span>
                    </div>
                  </div>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>
            </div>
          </div>
          </div>
        </Portal>
      )}
    </>
  );
}
