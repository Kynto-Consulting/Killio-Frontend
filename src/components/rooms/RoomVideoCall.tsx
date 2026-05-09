"use client";

import { useEffect, useRef, useState } from "react";
import {
  Minimize2, Maximize2, Expand, Shrink,
  MicOff, UserX, MonitorOff,
} from "lucide-react";
import type { CallPeer, VideoFilter } from "@/hooks/use-room-call";
import { RoomCallParticipant, type CaptionStyle } from "./RoomCallParticipant";
import { RoomCallSettingsModal } from "./RoomCallSettingsModal";

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = "mini" | "panel" | "fullscreen";
type CaptionMode = "subtitle" | "sidebar";

interface CaptionSettings {
  enabled: boolean;
  mode: CaptionMode;
  fontSize: CaptionStyle["fontSize"];
  color: string;
  font: CaptionStyle["font"];
}

const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  enabled: false,
  mode: "subtitle",
  fontSize: "md",
  color: "#ffffff",
  font: "sans",
};

// ── Sidebar transcript panel ───────────────────────────────────────────────────

function SidebarTranscript({
  liveCaption,
  transcriptSegments,
  captionStyle,
  t,
}: {
  liveCaption: string;
  transcriptSegments: { text: string; ts: number }[];
  captionStyle: CaptionSettings;
  t: (k: string) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptSegments.length, liveCaption]);

  const FONT_SIZE_MAP = { sm: "text-xs", md: "text-sm", lg: "text-base", xl: "text-lg" };
  const FONT_MAP = { sans: "font-sans", serif: "font-serif", mono: "font-mono" };

  return (
    <div className="w-56 shrink-0 bg-black/60 backdrop-blur-sm border-l border-zinc-700/50 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-zinc-700/40 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          {t("call.transcript.live")}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto scroll-smooth"
      >
        {transcriptSegments.length === 0 && !liveCaption && (
          <p className="text-[11px] text-zinc-500 italic">{t("call.transcript.waiting")}</p>
        )}
        {transcriptSegments.map((seg, i) => (
          <p
            key={i}
            className={`${FONT_SIZE_MAP[captionStyle.fontSize]} ${FONT_MAP[captionStyle.font]} leading-snug`}
            style={{ color: captionStyle.color }}
          >
            {seg.text}
          </p>
        ))}
        {liveCaption && (
          <p
            className={`${FONT_SIZE_MAP[captionStyle.fontSize]} ${FONT_MAP[captionStyle.font]} leading-snug opacity-60 italic animate-pulse`}
            style={{ color: captionStyle.color }}
          >
            {liveCaption}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Admin bar (shown in fullscreen/panel when canManage) ───────────────────────

function AdminBar({
  peers,
  onMute,
  onKick,
  onDisableScreen,
  t,
}: {
  peers: CallPeer[];
  onMute?: (id: string) => void;
  onKick?: (id: string) => void;
  onDisableScreen?: (id: string) => void;
  t: (k: string) => string;
}) {
  if (peers.length === 0) return null;
  return (
    <div className="px-3 py-1.5 border-t border-zinc-800 shrink-0 flex items-center gap-2 overflow-x-auto">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 shrink-0">
        {t("call.admin.label")}
      </span>
      {peers.map((p) => (
        <div key={p.peerId} className="flex items-center gap-1 bg-zinc-800 rounded-lg px-2 py-1 shrink-0">
          <span className="text-xs text-zinc-300 max-w-[80px] truncate">{p.displayName}</span>
          {onMute && (
            <button
              onClick={() => onMute(p.peerId)}
              title={t("call.admin.mute")}
              className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${p.audioMuted ? "text-red-400" : "text-zinc-400 hover:text-red-400"}`}
            >
              <MicOff className="w-3 h-3" />
            </button>
          )}
          {p.isScreenSharing && onDisableScreen && (
            <button
              onClick={() => onDisableScreen(p.peerId)}
              title={t("call.admin.stopScreen")}
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-orange-400 transition-colors"
            >
              <MonitorOff className="w-3 h-3" />
            </button>
          )}
          {onKick && (
            <button
              onClick={() => onKick(p.peerId)}
              title={t("call.admin.kick")}
              className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-red-500 transition-colors"
            >
              <UserX className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface RoomVideoCallProps {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  peers: CallPeer[];
  isScreenSharing: boolean;
  isCameraFilterActive: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  localVideoRef: React.RefObject<HTMLVideoElement>;
  localDisplayName: string;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  callControls: React.ReactNode;
  canManageCall?: boolean;
  onMuteParticipant?: (peerId: string) => void;
  onKickParticipant?: (peerId: string) => void;
  onDisableScreen?: (peerId: string) => void;
  liveCaption?: string;
  transcriptSegments?: { text: string; ts: number }[];
  activeFilter: VideoFilter;
  onSetFilter: (filter: VideoFilter) => void;
  backgroundBlur: number;
  onSetBackgroundBlur: (val: number) => void;
  skinSmooth: number;
  onSetSkinSmooth: (val: number) => void;
  backgroundRemoval: boolean;
  onSetBackgroundRemoval: (val: boolean) => void;
  virtualBackgroundUrl: string | undefined;
  onSetVirtualBackgroundUrl: (url: string | undefined) => void;
  backgroundColor: string | undefined;
  onSetBackgroundColor: (color: string | undefined) => void;
  currentVideoDeviceId: string | null;
  onSwitchCamera: (deviceId: string) => void;
  settingsModalOpen: boolean;
  onSetSettingsModalOpen: (open: boolean) => void;
  captionSettings: CaptionSettings;
  onSetCaptionSettings: (s: CaptionSettings) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RoomVideoCall({
  localStream,
  screenStream,
  peers,
  isScreenSharing,
  isCameraFilterActive,
  canvasRef,
  localVideoRef,
  localDisplayName,
  isAudioMuted,
  isVideoMuted,
  callControls,
  canManageCall = false,
  onMuteParticipant,
  onKickParticipant,
  onDisableScreen,
  liveCaption = "",
  transcriptSegments = [],
  activeFilter,
  onSetFilter,
  backgroundBlur,
  onSetBackgroundBlur,
  skinSmooth,
  onSetSkinSmooth,
  backgroundRemoval,
  onSetBackgroundRemoval,
  virtualBackgroundUrl,
  onSetVirtualBackgroundUrl,
  backgroundColor,
  onSetBackgroundColor,
  currentVideoDeviceId,
  onSwitchCamera,
  settingsModalOpen,
  onSetSettingsModalOpen,
  captionSettings,
  onSetCaptionSettings,
  t,
}: RoomVideoCallProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("panel");

  const sharingPeer = peers.find((p) => p.isScreenSharing);
  const hasScreenShare = isScreenSharing || !!sharingPeer;

  // Whether to show live caption text as subtitle on local tile
  const activeCaptionText =
    captionSettings.enabled && captionSettings.mode === "subtitle"
      ? liveCaption || (transcriptSegments.length > 0 ? transcriptSegments[transcriptSegments.length - 1].text : "")
      : undefined;

  const showSidebar =
    captionSettings.enabled &&
    captionSettings.mode === "sidebar" &&
    (liveCaption.length > 0 || transcriptSegments.length > 0);

  // Fix: set srcObject on the hidden video element after it mounts
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !localStream) {
      if (video) video.srcObject = null;
      return;
    }
    if (video.srcObject !== localStream) {
      video.srcObject = localStream;
      video.play().catch(() => { });
    }
  }, [localStream, localVideoRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = localVideoRef.current;
    if (!canvas || !video) return;
    if (video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  }, [canvasRef, localVideoRef, isCameraFilterActive]);

  const allParticipants = [
    {
      id: "local",
      displayName: localDisplayName,
      stream: isCameraFilterActive ? undefined : (localStream ?? undefined),
      isLocal: true,
      audioMuted: isAudioMuted,
      videoMuted: isVideoMuted,
      isScreenSharing,
    },
    ...peers.map((p) => ({
      id: p.peerId,
      displayName: p.displayName,
      stream: p.stream,
      isLocal: false,
      audioMuted: p.audioMuted,
      videoMuted: p.videoMuted,
      isScreenSharing: p.isScreenSharing,
      avatarUrl: p.avatarUrl,
    })),
  ];

  const captionStyle: CaptionStyle = {
    fontSize: captionSettings.fontSize,
    color: captionSettings.color,
    font: captionSettings.font,
  };

  const participantTile = (p: (typeof allParticipants)[number]) => (
    <RoomCallParticipant
      key={p.id}
      stream={p.stream}
      displayName={p.displayName}
      isLocal={p.isLocal}
      isMuted={p.audioMuted}
      isVideoOff={p.videoMuted}
      isScreenSharing={p.isScreenSharing}
      canvasRef={p.isLocal && isCameraFilterActive ? canvasRef : undefined}
      canManage={canManageCall}
      peerId={p.id}
      onMute={onMuteParticipant}
      onKick={onKickParticipant}
      onDisableScreen={onDisableScreen}
      captionText={p.isLocal ? activeCaptionText : undefined}
      captionStyle={captionStyle}
      scaleMode={viewMode !== "mini" ? "contain" : "cover"}
      t={t}
    />
  );

  // Video grid shared sub-component
  const videoGrid = (compact = false) => (
    <div className={`flex flex-1 overflow-hidden ${compact ? "p-2" : "p-3"} min-h-0`}>
      <div className={`flex flex-1 overflow-hidden ${showSidebar ? "gap-0" : ""}`}>
        <div className="flex-1 overflow-hidden">
          {hasScreenShare ? (
            <div className="flex gap-2 h-full">
              <div className="flex-1 bg-black rounded-xl overflow-hidden">
                {isScreenSharing && screenStream ? (
                  <video autoPlay playsInline muted ref={(v) => { if (v) v.srcObject = screenStream; }} className="w-full h-full object-contain" />
                ) : sharingPeer?.stream ? (
                  <video autoPlay playsInline ref={(v) => { if (v) v.srcObject = sharingPeer.stream!; }} className="w-full h-full object-contain" />
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5 w-24 overflow-y-auto">
                {allParticipants.map(participantTile)}
              </div>
            </div>
          ) : (
            <div
              className="grid gap-1.5 h-full"
              style={{
                gridTemplateColumns:
                  allParticipants.length === 1
                    ? "1fr"
                    : allParticipants.length <= 4
                      ? "1fr 1fr"
                      : "1fr 1fr 1fr",
              }}
            >
              {allParticipants.map(participantTile)}
            </div>
          )}
        </div>

        {/* Sidebar transcript — doesn't push the grid, floats over on mobile */}
        {showSidebar && (
          <SidebarTranscript
            liveCaption={liveCaption}
            transcriptSegments={transcriptSegments}
            captionStyle={captionSettings}
            t={t}
          />
        )}
      </div>
    </div>
  );

  // ── Mini mode ────────────────────────────────────────────────────────────────
  if (viewMode === "mini") {
    return (
      <div className="fixed bottom-4 right-4 z-[200] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-52">
        <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700">
          <span className="text-[10px] text-zinc-300 font-medium">{t("call.inCall")}</span>
          <div className="flex gap-0.5">
            <button onClick={() => setViewMode("panel")} className="p-0.5 text-zinc-400 hover:text-white" title="Expand">
              <Maximize2 className="w-3 h-3" />
            </button>
            <button onClick={() => setViewMode("fullscreen")} className="p-0.5 text-zinc-400 hover:text-white" title="Fullscreen">
              <Expand className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="p-1.5">
          <RoomCallParticipant
            stream={isCameraFilterActive ? undefined : (localStream ?? undefined)}
            displayName={localDisplayName}
            isLocal
            isMuted={isAudioMuted}
            isVideoOff={isVideoMuted}
            canvasRef={isCameraFilterActive ? canvasRef : undefined}
            captionText={activeCaptionText}
            captionStyle={captionStyle}
            t={t}
          />
        </div>
        <div className="flex justify-center py-1.5">{callControls}</div>
        <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
      </div>
    );
  }

  // ── Fullscreen mode ──────────────────────────────────────────────────────────
  if (viewMode === "fullscreen") {
    return (
      <div className="fixed inset-0 z-[500] bg-zinc-950 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-zinc-200 font-medium">
              {t("call.inCall")} · {t("call.participants").replace("{count}", String(allParticipants.length))}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode("panel")} className="p-1.5 text-zinc-400 hover:text-white" title="Exit fullscreen">
              <Shrink className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("mini")} className="p-1.5 text-zinc-400 hover:text-white" title="Minimize">
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {videoGrid(false)}

        {/* Admin bar */}
        {canManageCall && peers.length > 0 && (
          <AdminBar
            peers={peers}
            onMute={onMuteParticipant}
            onKick={onKickParticipant}
            onDisableScreen={onDisableScreen}
            t={t}
          />
        )}

        <div className="flex justify-center py-3 border-t border-zinc-800 shrink-0">
          {callControls}
        </div>
        <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
      </div>
    );
  }

  // ── Panel mode (default) ─────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 z-[200] bg-zinc-900/95 border border-zinc-700 rounded-2xl shadow-2xl w-[520px] max-h-[520px] flex flex-col backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-200 font-medium">
            {t("call.inCall")} · {t("call.participants").replace("{count}", String(allParticipants.length))}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setViewMode("fullscreen")} className="p-1 text-zinc-400 hover:text-white" title="Fullscreen">
            <Expand className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setViewMode("mini")} className="p-1 text-zinc-400 hover:text-white" title="Minimize">
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {videoGrid(true)}

      {/* Admin bar */}
      {canManageCall && peers.length > 0 && (
        <AdminBar
          peers={peers}
          onMute={onMuteParticipant}
          onKick={onKickParticipant}
          onDisableScreen={onDisableScreen}
          t={t}
        />
      )}

      <div className="flex justify-center py-2 px-3 border-t border-zinc-700/60 shrink-0">
        {callControls}
      </div>

      <RoomCallSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => onSetSettingsModalOpen(false)}
        currentFilter={activeFilter}
        onSetFilter={onSetFilter}
        backgroundBlur={backgroundBlur}
        onSetBackgroundBlur={onSetBackgroundBlur}
        skinSmooth={skinSmooth}
        onSetSkinSmooth={onSetSkinSmooth}
        backgroundRemoval={backgroundRemoval}
        onSetBackgroundRemoval={onSetBackgroundRemoval}
        virtualBackgroundUrl={virtualBackgroundUrl}
        onSetVirtualBackgroundUrl={onSetVirtualBackgroundUrl}
        backgroundColor={backgroundColor}
        onSetBackgroundColor={onSetBackgroundColor}
        currentVideoDeviceId={currentVideoDeviceId}
        onSwitchCamera={onSwitchCamera}
        isAudioMuted={isAudioMuted}
        onToggleAudio={() => { }} 
        localStream={localStream}
        captionSettings={captionSettings}
        onSetCaptionSettings={onSetCaptionSettings}
        t={t}
      />

      <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
    </div>
  );
}
