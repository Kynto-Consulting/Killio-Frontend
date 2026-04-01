"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, Search, Home, Layout, FileText, Users, History,
  Settings, LogOut, Check, Plus, ChevronsUpDown, UserCircle, ArrowRightLeft
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MobileDrawer } from "@/components/ui/mobile-drawer"; // We might need a Drawer, let's use a simple Dialog or just inline code
import { TeamView } from "@/lib/api/contracts";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";

export function MobileNavSheet({
  teams,
  activeTeamId,
  setActiveTeamId,
  navigation,
  user,
  logout,
  boardName,
  documentName
}: {
  teams: TeamView[];
  activeTeamId: string | null;
  setActiveTeamId: (id: string) => void;
  navigation: { name: string; href: string; icon: any }[];
  user: any;
  logout: () => void;
  boardName?: string;
  documentName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  
  const activeTeam = teams.find(t => t.id === activeTeamId);
  
  const currentNav = navigation.find(n => pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href)));
  const pageLabel = boardName || documentName || currentNav?.name || tDashboard("nav.workspaces");

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
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
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm flex-col rounded-r-2xl bg-card p-0 shadow-2xl transition-transform duration-300 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left border-y-0 border-l-0 border-r sm:max-w-sm !rounded-l-none" hideCloseButton>
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <div className="flex flex-col h-full overflow-hidden">
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
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Navigation Routes */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center space-x-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent font-semibold"
                        : "text-foreground/80 hover:bg-accent/5 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4 opacity-70" />
                    <span>{item.name}</span>
                  </Link>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
