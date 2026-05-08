"use client";

import { getUserAvatarUrl } from "@/lib/gravatar";
import type { RoomPresenceMember } from "@/hooks/use-room-presence";
import type { RoomMember } from "@/lib/api/rooms";

type TFn = (key: string) => string;

interface RoomMembersPanelProps {
  presenceMembers: RoomPresenceMember[];
  roomMembers: RoomMember[];
  currentUserId: string;
  t: TFn;
}

export function RoomMembersPanel({ presenceMembers, roomMembers, currentUserId, t }: RoomMembersPanelProps) {
  const onlineIds = new Set(presenceMembers.map((m) => m.clientId));
  const inCallIds = new Set(
    presenceMembers.filter((m) => m.data.status === "in-call").map((m) => m.clientId)
  );

  const online = roomMembers.filter((m) => onlineIds.has(m.userId));
  const offline = roomMembers.filter((m) => !onlineIds.has(m.userId));

  const MemberRow = ({ member }: { member: RoomMember }) => {
    const isOnline = onlineIds.has(member.userId);
    const isInCall = inCallIds.has(member.userId);
    const isYou = member.userId === currentUserId;

    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/5 transition-colors">
        <div className="relative shrink-0">
          <img
            src={getUserAvatarUrl(member.avatarUrl, member.email, 28)}
            alt={member.displayName}
            className="w-7 h-7 rounded-full border border-border"
          />
          <span
            className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-background ${
              isInCall ? "bg-accent" : isOnline ? "bg-green-500" : "bg-muted-foreground/40"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs text-foreground truncate">{member.displayName}</span>
            {isYou && <span className="text-[9px] text-muted-foreground">{t("members.you")}</span>}
          </div>
          <span className="text-[9px] text-muted-foreground">
            {isInCall ? t("members.inCall") : isOnline ? t("members.online") : t("members.offline")}
          </span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium uppercase tracking-wider">
          {member.role}
        </span>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/40 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {t("members.title")}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {online.length > 0 && (
          <div className="mb-3">
            <div className="px-2 mb-1">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {t("members.online")} — {online.length}
              </span>
            </div>
            {online.map((m) => <MemberRow key={m.userId} member={m} />)}
          </div>
        )}
        {offline.length > 0 && (
          <div>
            <div className="px-2 mb-1">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {t("members.offline")} — {offline.length}
              </span>
            </div>
            {offline.map((m) => <MemberRow key={m.userId} member={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}
