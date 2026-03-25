"use client";

import { X, History } from "lucide-react";
import { Portal } from "./portal";
import { type ActivityLogEntry } from "@/lib/api/contracts";
import { RichText } from "./rich-text";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  activities: ActivityLogEntry[];
  teamMembers: any[];
  teamDocs: any[];
  allAvailableTags: any[];
  getActionTheme: (action: string) => { icon: any; badge: string; badgeClass: string };
  prettifyAction: (action: string) => string;
  fieldLabels: Record<string, string>;
  getResolverContext: (docs: any[], boards: any[], members: any[]) => any;
};

export function ActivityLogModal({
  isOpen,
  onClose,
  title,
  activities,
  teamMembers,
  teamDocs,
  allAvailableTags,
  getActionTheme,
  prettifyAction,
  fieldLabels,
  getResolverContext
}: Props) {
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-bold text-sm tracking-tight">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar">
            {activities.map((a) => {
              const theme = getActionTheme(a.action);
              const Icon = theme.icon;
              const member = teamMembers.find((m) => m.id === a.actorId || m.userId === a.actorId);
              const changes = (a.payload as any)?.changes || {};
              const changedFields = Object.keys(changes)
                .map((k) => fieldLabels[k] || k)
                .join(", ");
              const resolverContext = getResolverContext(teamDocs, [], teamMembers);

              return (
                <div key={a.id} className="relative pl-8 pb-2 border-l border-border/40 last:border-0 group">
                  <div className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-border ring-2 ring-background group-hover:bg-accent transition-colors" />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border shadow-sm ${theme.badgeClass}`}
                      >
                        {theme.badge}
                      </span>
                      <time className="text-[10px] text-muted-foreground font-medium ml-auto">
                        {new Date(a.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        <span className="font-bold text-foreground">
                          {member?.displayName || "Alguien"}
                        </span>
                        <span className="text-muted-foreground/80">
                          {" "}
                          {prettifyAction(a.action)}
                        </span>
                      </p>

                      {changedFields && (
                        <p className="text-xs bg-muted/40 px-3 py-1.5 rounded-lg border border-border/30 text-muted-foreground italic">
                          Campos: {changedFields}
                        </p>
                      )}

                      {(a.payload as any)?.text && (
                        <div className="text-sm text-foreground/80 px-3 border-l-2 border-border/50 bg-muted/20 py-2 rounded-r-lg">
                          <RichText
                            content={(a.payload as any).text}
                            context={resolverContext}
                            availableTags={allAvailableTags}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="p-4 border-t border-border/50 bg-muted/10 flex justify-end">
             <button 
                onClick={onClose}
                className="px-4 py-2 bg-foreground text-background rounded-xl text-sm font-bold shadow-lg hover:opacity-90 transition-opacity"
             >
                Cerrar
             </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
