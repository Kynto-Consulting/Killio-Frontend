"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  X, Info, Clock, CheckCircle2, Bot, 
  Coins, Hash, BarChart3, Users, 
  Calendar, ShieldCheck, Eye, EyeOff
} from "lucide-react";
import { getMessageInfo, type RoomMessage } from "@/lib/api/rooms";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
import { format } from "date-fns";

interface MessageReadDetail {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  readAt: string;
}

interface MessageInfoData {
  messageId: string;
  metadata?: any;
  createdAt?: string;
  readBy: MessageReadDetail[];
}

interface MessageInfoPanelProps {
  roomId: string;
  message: RoomMessage;
  onClose: () => void;
  onMarkRead?: (messageIds: string[]) => void;
}

export function MessageInfoPanel({ roomId, message, onClose, onMarkRead }: MessageInfoPanelProps) {
  const { accessToken, user } = useSession();
  const realtimeProvider = useRealtime();
  const t = useTranslations("rooms");
  const [data, setData] = useState<MessageInfoData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDetails = useCallback(() => {
    if (!accessToken) return;
    getMessageInfo(roomId, message.id, accessToken)
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [roomId, message.id, accessToken]);

  useEffect(() => {
    fetchDetails();
    
    // Mark as read when panel is opened if it's from someone else
    if (onMarkRead && message.userId !== user?.id && message.status !== "read") {
      onMarkRead([message.id]);
    }
  }, [fetchDetails, onMarkRead, message.userId, user?.id, message.id, message.status]);

  useEffect(() => {
    if (!accessToken || !realtimeProvider) return;
    
    const channel = realtimeProvider.getChannel(`room:${roomId}`);
    const onRead = (msg: any) => {
      // Only refetch if this message was marked as read
      const affectedIds = msg.data?.messageIds || [];
      if (affectedIds.includes(message.id) || msg.name === 'room.message.read.all') {
        fetchDetails();
      }
    };
    
    channel.subscribe('room.message.read', onRead);
    channel.subscribe('room.message.read.all', onRead);
    
    return () => {
      channel.unsubscribe('room.message.read', onRead);
      channel.unsubscribe('room.message.read.all', onRead);
    };
  }, [roomId, message.id, accessToken, realtimeProvider, fetchDetails]);

  const isAi = message.type === "ai";
  const billedTokens = data?.metadata?.billedTokens ?? (message.metadata as any)?.billedTokens;
  const billedCredits = data?.metadata?.billedCredits ?? (message.metadata as any)?.billedCredits;
  const modelUsed = data?.metadata?.modelUsed ?? (message.metadata as any)?.modelUsed;
  const pollVotes = (message.metadata as any)?.pollVotes;

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold uppercase tracking-wider">{t("info.title") || "Detalles del Mensaje"}</h2>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Status Section */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" />
            {t("info.status")}
          </h3>
          <div className="bg-muted/30 rounded-xl p-3 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("info.sentAt")}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">
                  {(data?.createdAt || message.createdAt) ? format(new Date(data?.createdAt || message.createdAt), "HH:mm:ss") : "..."}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("info.readBy")}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{data?.readBy.length || 0} {t("members.title").toLowerCase()}</span>
                <Eye className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </div>
          </div>
        </section>

        {/* AI Usage Section */}
        {isAi && (
          <section className="space-y-3">
            <h3 className="text-[10px] font-bold text-violet-500 uppercase tracking-widest flex items-center gap-1.5">
              <Bot className="w-3 h-3" />
              {t("info.aiUsage")}
            </h3>
            <div className="bg-violet-500/5 rounded-xl p-3 border border-violet-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("info.model")}</span>
                <span className="text-xs font-mono bg-violet-500/10 px-1.5 py-0.5 rounded text-violet-600 dark:text-violet-400">
                  {modelUsed || "Claude Opus"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("info.tokens")}</span>
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3 h-3 text-violet-400" />
                  <span className="text-xs font-bold">{(billedTokens || 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("info.cost")}</span>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-3 h-3 text-amber-500" />
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-500">
                    {(billedCredits || 0).toFixed(4)} {t("info.credits")}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Poll Results Section */}
        {pollVotes && (
          <section className="space-y-3">
            <h3 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3" />
              {t("info.pollDetails")}
            </h3>
            <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/20 space-y-2">
              {Object.entries(pollVotes).map(([idx, votes]: [string, any]) => {
                const count = Array.isArray(votes) ? votes.length : 0;
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">Opción {parseInt(idx) + 1}</span>
                    <span className="text-xs font-bold">{count} {count === 1 ? 'voto' : 'votos'}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Read Receipts Section */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Users className="w-3 h-3" />
            {t("info.readBy")}
          </h3>
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex justify-center p-4">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : data?.readBy.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-2 text-center opacity-60">
                {t("info.nobodyRead")}
              </div>
            ) : (
              data?.readBy.map((reader) => (
                <div key={reader.userId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent overflow-hidden">
                      <img
                        src={getUserAvatarUrl(reader.avatarUrl, undefined, 24)}
                        alt={reader.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-xs font-medium">{reader.displayName}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(reader.readAt), "HH:mm")}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="p-4 border-t border-border/50 bg-muted/20">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground italic">
          <Calendar className="w-3 h-3" />
          {(data?.createdAt || message.createdAt) && t("info.createdAt", { date: format(new Date(data?.createdAt || message.createdAt), "PPP p") })}
        </div>
      </div>
    </div>
  );
}
