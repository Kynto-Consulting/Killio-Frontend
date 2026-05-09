"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { useRoomChat } from "@/hooks/use-room-chat";
import { useRoomPresence } from "@/hooks/use-room-presence";
import { useRoomCall } from "@/hooks/use-room-call";
import { useRoomCallHistory } from "@/hooks/use-room-call-history";
import { useRoomPermissions } from "@/hooks/use-room-permissions";
import { useRoomNotifications } from "@/hooks/use-room-notifications";
import { listTeamRooms, getRoom, listRoomMembers, listTeamRoomGroups, type Room, type RoomCall, type RoomMember, type RoomGroup } from "@/lib/api/rooms";
import { AgentChatPanel } from "@/components/agent";
import { RoomsLayout } from "@/components/rooms/RoomsLayout";
import { RoomSidebar } from "@/components/rooms/RoomSidebar";
import { RoomHeader } from "@/components/rooms/RoomHeader";
import { RoomChatArea } from "@/components/rooms/RoomChatArea";
import { RoomVideoCall } from "@/components/rooms/RoomVideoCall";
import { RoomCallControls } from "@/components/rooms/RoomCallControls";
import { RoomMembersPanel } from "@/components/rooms/RoomMembersPanel";
import { RoomPermissionsModal } from "@/components/rooms/RoomPermissionsModal";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal";
import { CreateRoomGroupModal } from "@/components/rooms/CreateRoomGroupModal";
import { Loader2 } from "lucide-react";

export default function RoomDetailWeb() {
  const t = useTranslations("rooms");
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { accessToken, activeTeamId, user } = useSession();
  const { isAdmin } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [room, setRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [groups, setGroups] = useState<RoomGroup[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [isMembersPanelOpen, setIsMembersPanelOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialGroupId, setCreateInitialGroupId] = useState<string | undefined>();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showReadReceipts, setShowReadReceipts] = useState(true);

  const { permissions } = useRoomPermissions(roomId, accessToken);

  const userInfo = user
    ? {
        id: user.id,
        displayName: user.displayName ?? user.username ?? undefined,
        username: user.username ?? undefined,
        email: user.email ?? undefined,
        avatarUrl: undefined as string | undefined,
      }
    : null;

  const chatHook = useRoomChat(roomId, accessToken, user);
  const presenceMembers = useRoomPresence(roomId, userInfo, accessToken);
  const callHook = useRoomCall(roomId, userInfo, accessToken, {
    canManage: permissions.canManage,
    roomType: room?.type,
  });
  const callHistoryHook = useRoomCallHistory(roomId, accessToken);
  const { stopRing } = useRoomNotifications({
    roomId,
    roomName: room?.name,
    currentUserId: user?.id,
    accessToken,
  });

  const callsById = useMemo<Map<string, RoomCall>>(() => {
    const map = new Map<string, RoomCall>();
    callHistoryHook.calls.forEach((c) => map.set(c.id, c));
    return map;
  }, [callHistoryHook.calls]);

  useEffect(() => {
    if (!accessToken || !roomId) return;
    setIsLoadingRoom(true);
    getRoom(roomId, accessToken)
      .then((r) => {
        setRoom(r);
        setShowReadReceipts(r.showReadReceipts ?? true);
      })
      .catch(console.error)
      .finally(() => setIsLoadingRoom(false));
  }, [roomId, accessToken]);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    listTeamRooms(activeTeamId, accessToken).then(setRooms).catch(console.error);
    listTeamRoomGroups(activeTeamId, accessToken).then(setGroups).catch(console.error);
  }, [activeTeamId, accessToken]);

  useEffect(() => {
    if (!accessToken || !roomId) return;
    listRoomMembers(roomId, accessToken).then(setRoomMembers).catch(console.error);
  }, [roomId, accessToken]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    await chatHook.sendMessage(chatInput.trim());
    setChatInput("");
  }, [chatInput, chatHook]);

  const handleAiTrigger = useCallback((_content: string) => {
    setIsAiPanelOpen(true);
  }, []);

  const handleJoinCall = useCallback(() => {
    stopRing();
    callHook.joinCall();
  }, [callHook, stopRing]);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  if (isLoadingRoom) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Room not found.
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <RoomsLayout
        sidebar={(onClose) => (
          <RoomSidebar
            rooms={rooms}
            groups={groups}
            activeRoomId={roomId}
            isLoading={false}
            canCreate={isAdmin}
            onSelectRoom={(id) => { router.push(`/rooms/${id}`); onClose(); }}
            onCreateRoom={(groupId) => {
              setCreateInitialGroupId(groupId);
              setIsCreateOpen(true);
              onClose();
            }}
            onCreateGroup={() => { setIsCreateGroupOpen(true); onClose(); }}
            onClose={onClose}
            t={t}
          />
        )}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Main chat column */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <RoomHeader
              room={room}
              presenceMembers={presenceMembers}
              isInCall={callHook.isInCall}
              isAiPanelOpen={isAiPanelOpen}
              isMembersPanelOpen={isMembersPanelOpen}
              canCall={permissions.canCall}
              canManage={permissions.canManage}
              onStartCall={handleJoinCall}
              onLeaveCall={callHook.leaveCall}
              onToggleAiPanel={() => setIsAiPanelOpen((v) => !v)}
              onToggleMembersPanel={() => setIsMembersPanelOpen((v) => !v)}
              onOpenPermissions={() => setIsPermissionsOpen(true)}
              t={t}
            />
            <RoomChatArea
              messages={chatHook.messages}
              callsById={callsById}
              isLoading={chatHook.isLoading}
              isSending={chatHook.isSending}
              hasMore={chatHook.hasMore}
              typingUsers={chatHook.typingUsers}
              inputValue={chatInput}
              onInputChange={setChatInput}
              onSend={handleSend}
              onLoadMore={chatHook.loadMore}
              onReact={chatHook.addReaction}
              onMarkRead={chatHook.markAsRead}
              onTyping={() => chatHook.setTyping(true)}
              onViewTranscript={callHistoryHook.getTranscript}
              onAiTrigger={handleAiTrigger}
              currentUserId={user?.id ?? ""}
              teamId={activeTeamId ?? undefined}
              canPost={permissions.canPost}
              showReadReceipts={showReadReceipts}
              t={t}
            />
          </div>

          {/* Right panel: AI or Members */}
          {isAiPanelOpen && (
            <div className="w-80 shrink-0 border-l border-border/50 overflow-hidden flex flex-col">
              <AgentChatPanel
                teamId={activeTeamId ?? ""}
                entityType="team"
                entityId={activeTeamId ?? ""}
                onClose={() => setIsAiPanelOpen(false)}
              />
            </div>
          )}
          {!isAiPanelOpen && isMembersPanelOpen && (
            <div className="w-60 shrink-0 border-l border-border/50 overflow-hidden flex flex-col">
              <RoomMembersPanel
                presenceMembers={presenceMembers}
                roomMembers={roomMembers}
                currentUserId={user?.id ?? ""}
                t={t}
              />
            </div>
          )}
        </div>
      </RoomsLayout>

      {/* Video call overlay */}
      {callHook.isInCall && (
        <RoomVideoCall
          peers={callHook.peers}
          localStream={callHook.localStream}
          screenStream={callHook.screenStream}
          localDisplayName={user?.displayName ?? user?.username ?? "You"}
          isAudioMuted={callHook.isAudioMuted}
          isVideoMuted={callHook.isVideoMuted}
          isScreenSharing={callHook.isScreenSharing}
          isCameraFilterActive={callHook.isCameraFilterActive}
          canvasRef={callHook.canvasRef as React.RefObject<HTMLCanvasElement>}
          localVideoRef={callHook.localVideoRef as React.RefObject<HTMLVideoElement>}
          canManageCall={callHook.canManageCall}
          onMuteParticipant={callHook.muteParticipant}
          onKickParticipant={callHook.kickParticipant}
          onDisableScreen={callHook.disableParticipantScreen}
          liveCaption={callHook.liveCaption}
          transcriptSegments={callHook.transcriptSegments}
          activeFilter={callHook.activeFilter}
          onSetFilter={callHook.setFilter}
          backgroundBlur={callHook.backgroundBlur}
          onSetBackgroundBlur={callHook.setBackgroundBlur}
          skinSmooth={callHook.skinSmooth}
          onSetSkinSmooth={callHook.setSkinSmooth}
          backgroundRemoval={callHook.backgroundRemoval}
          onSetBackgroundRemoval={callHook.setBackgroundRemoval}
          virtualBackgroundUrl={callHook.virtualBackgroundUrl}
          onSetVirtualBackgroundUrl={callHook.setVirtualBackgroundUrl}
          backgroundColor={callHook.backgroundColor}
          onSetBackgroundColor={callHook.setBackgroundColor}
          currentVideoDeviceId={callHook.currentVideoDeviceId}
          onSwitchCamera={callHook.switchCamera}
          callControls={
            <RoomCallControls
              isAudioMuted={callHook.isAudioMuted}
              isVideoMuted={callHook.isVideoMuted}
              isScreenSharing={callHook.isScreenSharing}
              isCameraFilterActive={callHook.isCameraFilterActive}
              activeFilter={callHook.activeFilter}
              isRecording={callHook.isRecording}
              recordingElapsed={callHook.recordingElapsed}
              canRecord={permissions.canRecord}
              onOpenSettings={() => setSettingsModalOpen(true)}
              onToggleAudio={callHook.toggleAudio}
              onToggleVideo={callHook.toggleVideo}
              onToggleScreenShare={callHook.toggleScreenShare}
              onSetFilter={callHook.setFilter}
              onToggleRecording={callHook.toggleRecording}
              onLeave={callHook.leaveCall}
              t={t}
            />
          }
          t={t}
        />
      )}

      <RoomPermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        roomId={roomId}
        accessToken={accessToken ?? ""}
        currentUserId={user?.id ?? ""}
        showReadReceipts={showReadReceipts}
        onSettingsChange={(s) => setShowReadReceipts(s.showReadReceipts)}
        t={t}
      />

      {activeTeamId && accessToken && (
        <>
          <CreateRoomModal
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            groups={groups}
            initialGroupId={createInitialGroupId}
            onCreated={(newRoomId) => {
              setIsCreateOpen(false);
              router.push(`/rooms/${newRoomId}`);
            }}
            t={t}
          />
          <CreateRoomGroupModal
            isOpen={isCreateGroupOpen}
            onClose={() => setIsCreateGroupOpen(false)}
            teamId={activeTeamId}
            accessToken={accessToken}
            onCreated={(newGroup) => {
              setGroups((prev) => [...prev, newGroup]);
              setIsCreateGroupOpen(false);
            }}
            t={t}
          />
        </>
      )}
    </div>
  );
}
