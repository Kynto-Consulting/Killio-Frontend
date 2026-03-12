"use client";

import { History as HistoryIcon, User, Layout, Copy, Edit2, Tag, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { listTeamActivity, ActivityLogEntry } from "@/lib/api/contracts";

export default function HistoryPage() {
  const { accessToken, activeTeamId, user } = useSession();
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    setIsLoading(true);
    listTeamActivity(activeTeamId, accessToken)
      .then(setActivities)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const getIconForAction = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes("create")) return Copy;
    if (a.includes("comment")) return Edit2;
    if (a.includes("invite") || a.includes("member")) return User;
    if (a.includes("label") || a.includes("tag")) return Tag;
    return Layout;
  };

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-4xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Activity History</h1>
          <p className="text-muted-foreground">Recent changes across all your teams, boards, and lists.</p>
        </div>
        <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm h-9 px-4">
          <HistoryIcon className="mr-2 h-4 w-4 opacity-70" />
          Filter Logs
        </button>
      </div>

      <div className="relative mt-8">
        {/* Vertical Line */}
        <div className="absolute top-4 bottom-4 left-6 w-px bg-border max-md:hidden"></div>

        <div className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center p-8 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : activities.length === 0 ? (
            <div className="pl-12 text-muted-foreground text-sm">No recent activity in this team.</div>
          ) : activities.map((event) => {
            const Icon = getIconForAction(event.action);
            const isMe = event.actorId === user?.id;
            
            return (
              <div key={event.id} className="relative flex items-start gap-4 md:gap-6 group">
                {/* Timeline dot */}
                <div className="absolute left-[22px] top-4 h-2 w-2 rounded-full bg-accent ring-4 ring-background max-md:hidden"></div>
                
                <div className="h-10 w-10 shrink-0 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground shadow-sm md:ml-[34px] group-hover:border-accent group-hover:text-accent transition-colors z-10">
                  <Icon className="h-4 w-4" />
                </div>
                
                <div className="flex-1 rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 shadow-sm hover:shadow-md hover:border-accent/40 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="text-sm font-medium leading-relaxed">
                      <span className="font-semibold text-foreground mr-1">{isMe ? "You" : "Team Member"}</span>
                      <span className="text-muted-foreground mr-1">{event.action}</span>
                      <span className="font-semibold text-foreground hover:text-accent cursor-pointer transition-colors max-w-xs truncate inline-block align-bottom">{event.entityType} ({event.scope})</span>
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString(undefined, {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
