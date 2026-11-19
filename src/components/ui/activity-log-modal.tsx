"use client";

import { X, History } from "lucide-react";
import { Portal } from "./portal";
import { type ActivityLogEntry } from "@/lib/api/contracts";
import { RichText } from "./rich-text";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getWorkspaceMemberLabel } from "@/lib/workspace-members";
import type { WorkspaceMemberLike } from "@/lib/workspace-members";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  activities: ActivityLogEntry[];
  teamMembers: WorkspaceMemberLike[];
  teamDocs: any[];
  allAvailableTags: any[];
  getActionTheme: (action: string) => { icon: any; badge: string; badgeClass: string };
  prettifyAction: (action: string) => string;
  fieldLabels: Record<string, string>;
  getResolverContext: (docs: any[], boards: any[], members: WorkspaceMemberLike[]) => any;
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
  const t = useTranslations("history");
  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card border border-border/60 shadow-xl rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-card">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground break-words">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 hide-scrollbar">
            {activities.map((a) => {
              const theme = getActionTheme(a.action);
              const Icon = theme.icon;
              const member = teamMembers.find((m) => m.id === a.actorId || m.userId === a.actorId);
              const actorLabel = a.actorId === 'i18n.system' ? t('system') : getWorkspaceMemberLabel(member, t('someone'));
              const changes = (a.payload as any)?.changes || {};
              const changedFields = Object.keys(changes)
                .map((k) => fieldLabels[k] || k)
                .join(", ");
              const resolverContext = getResolverContext(teamDocs, [], teamMembers);

              return (
                <div key={a.id} className="relative pl-5 pb-1 border-l border-border/30 last:border-0 group min-w-0">
                  <div className="absolute left-[-3px] top-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary transition-colors" />
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide border ${theme.badgeClass}`}
                      >
                        {theme.badge}
                      </span>
                      <time className="text-[10px] text-muted-foreground/70 ml-auto">
                        {new Date(a.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-foreground/90 leading-relaxed flex items-center gap-1.5 flex-wrap break-words [overflow-wrap:anywhere]">
                        <span className="inline-flex items-center text-foreground text-sm font-medium">
                          {actorLabel}
                        </span>
                        <span className="text-muted-foreground/80">
                          {prettifyAction(a.action)}
                        </span>
                      </p>

                      {changedFields && (
                        <p className="text-xs bg-muted/40 px-3 py-1.5 rounded-lg text-muted-foreground break-words [overflow-wrap:anywhere]">
                          {t("fieldsLabel")}: {changedFields}
                        </p>
                      )}

                      {(a.payload as any)?.text && (
                        <div className="text-sm text-foreground/80 px-3 border-l-2 border-border/40 bg-muted/30 py-2 rounded-r-lg break-words [overflow-wrap:anywhere]">
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
          
          <div className="px-5 py-3 border-t border-border/40 flex justify-end">
             <button 
                onClick={onClose}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
             >
                {t("close")}
             </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
