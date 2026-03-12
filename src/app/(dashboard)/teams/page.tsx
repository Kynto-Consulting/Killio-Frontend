"use client";

import { Users, UserPlus, Shield, MoreHorizontal, Lock } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useEffect, useState } from "react";
import { listTeams, listTeamMembers, TeamView, TeamMemberSummary } from "@/lib/api/contracts";
import { InviteMemberModal } from "@/components/ui/invite-member-modal";

export default function TeamsPage() {
  const { accessToken, activeTeamId, user } = useSession();
  const [activeTeam, setActiveTeam] = useState<TeamView | null>(null);
  const [members, setMembers] = useState<TeamMemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [activeMemberMenu, setActiveMemberMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    
    setIsLoading(true);

    listTeams(accessToken).then((teams) => {
      const team = teams.find(t => t.id === activeTeamId);
      if (team) setActiveTeam(team);
    }).catch(console.error);

    listTeamMembers(activeTeamId, accessToken)
      .then(setMembers)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">Teams & Access</h1>
            {activeTeam?.isPersonal && (
              <span className="flex items-center text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded-md">
                <Lock className="w-3 h-3 mr-1" /> Personal Workspace
              </span>
            )}
          </div>
          <p className="text-muted-foreground">Manage your team members and their permissions across the workspace.</p>
        </div>
        <button 
          disabled={activeTeam?.isPersonal}
          onClick={() => !activeTeam?.isPersonal && setIsInviteModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group"
          title={activeTeam?.isPersonal ? "You cannot invite members to your Personal Workspace." : ""}
        >
          {activeTeam?.isPersonal ? <Lock className="mr-2 h-4 w-4 opacity-70" /> : <UserPlus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" /> }
          Invite People
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm relative">
        <div className="p-4 border-b border-border/50 bg-background/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-sm w-full">
            <input 
              type="text" 
              placeholder="Filter members..." 
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{members.length} members</span>
          </div>
        </div>

        <div className="divide-y divide-border/50">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground flex justify-center">Loading members...</div>
          ) : members.map((member) => {
            const isMe = member.userId === user?.id;
            const avatarInitials = member.displayName ? member.displayName.substring(0, 2).toUpperCase() : member.primaryEmail.substring(0, 2).toUpperCase();

            return (
            <div key={member.id} className="flex items-center justify-between p-4 bg-card hover:bg-accent/5 transition-colors relative">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full border border-border bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-xs shadow-sm capitalize">
                  {avatarInitials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium leading-none text-foreground">
                      {member.displayName}
                      {isMe && <span className="ml-1 text-muted-foreground font-normal">(You)</span>}
                    </p>
                    {member.status === "active" && (
                      <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background"></span>
                    )}
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
                  <button 
                    onClick={() => setActiveMemberMenu(activeMemberMenu === member.id ? null : member.id)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-foreground text-muted-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  
                  {activeMemberMenu === member.id && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setActiveMemberMenu(null)}
                      />
                      <div className="absolute right-0 top-10 w-48 rounded-md border border-border bg-background shadow-lg z-50 py-1 text-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        <button className="w-full text-left px-3 py-2 hover:bg-accent/10 focus:bg-accent/10 outline-none transition-colors">
                          Change Role
                        </button>
                        <button className="w-full text-left px-3 py-2 hover:bg-accent/10 focus:bg-accent/10 outline-none transition-colors">
                          View Activity
                        </button>
                        <div className="my-1 border-t border-border/50" />
                        <button 
                          className="w-full text-left px-3 py-2 hover:bg-red-500/10 focus:bg-red-500/10 text-red-500 outline-none transition-colors flex items-center justify-between"
                        >
                          {isMe ? 'Leave Team' : 'Remove Member'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
      
      <InviteMemberModal 
        isOpen={isInviteModalOpen} 
        onClose={() => setIsInviteModalOpen(false)} 
        teamName={activeTeam?.name} 
      />
    </div>
  );
}
