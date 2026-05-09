"use client";

import { useEffect, useRef, useState } from "react";
import {
  Minimize2, Maximize2, Expand, Shrink,
  Captions, CaptionsOff, Settings, X,
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

// ── Caption settings panel ─────────────────────────────────────────────────────

function CaptionSettingsPanel({
  settings,
  onChange,
  onClose,
  t,
}: {
  settings: CaptionSettings;
  onChange: (s: CaptionSettings) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const COLORS = [
    { label: "White",  value: "#ffffff" },
    { label: "Yellow", value: "#facc15" },
    { label: "Cyan",   value: "#22d3ee" },
    { label: "Green",  value: "#4ade80" },
    { label: "Orange", value: "#fb923c" },
  ];

  return (
    <div className="absolute bottom-full mb-2 right-0 w-72 bg-zinc-900/98 border border-zinc-700 rounded-2xl shadow-2xl backdrop-blur-sm overflow-hidden z-30">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60">
        <span className="text-sm font-semibold text-zinc-100">{t("call.transcript.settings")}</span>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-300">{t("call.transcript.showCaptions")}</span>
          <button
            onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
            className={`w-10 h-5 rounded-full transition-colors relative ${settings.enabled ? "bg-accent" : "bg-zinc-600"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>

        {settings.enabled && (
          <>
            {/* Mode */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{t("call.transcript.mode")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["subtitle", "sidebar"] as CaptionMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => onChange({ ...settings, mode: m })}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      settings.mode === m
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {t(`call.transcript.mode_${m}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{t("call.transcript.fontSize")}</p>
              <div className="flex gap-1.5">
                {(["sm", "md", "lg", "xl"] as CaptionStyle["fontSize"][]).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => onChange({ ...settings, fontSize: sz })}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      settings.fontSize === sz
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {sz.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{t("call.transcript.color")}</p>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => onChange({ ...settings, color: c.value })}
                    title={c.label}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      settings.color === c.value ? "border-white scale-110" : "border-zinc-600"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>

            {/* Font */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{t("call.transcript.font")}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["sans", "serif", "mono"] as CaptionStyle["font"][]).map((f) => (
                  <button
                    key={f}
                    onClick={() => onChange({ ...settings, font: f })}
                    className={`py-1.5 rounded-lg border text-xs transition-all ${
                      settings.font === f
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-zinc-600 text-zinc-400 hover:border-zinc-500"
                    } ${f === "sans" ? "font-sans" : f === "serif" ? "font-serif" : "font-mono"}`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
  t,
}: RoomVideoCallProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("panel");
  const [captionSettings, setCaptionSettings] = useState<CaptionSettings>(DEFAULT_CAPTION_SETTINGS);
  const [captionPanelOpen, setCaptionPanelOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

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
      video.play().catch(() => {});
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

  // Shared captions button (opens settings panel)
  const captionsBtn = (
    <div className="relative">
      <button
        onClick={() => setCaptionPanelOpen((v) => !v)}
        title={t("call.transcript.settings")}
        className={`p-1 transition-colors rounded ${
          captionSettings.enabled ? "text-accent" : "text-zinc-400 hover:text-white"
        }`}
      >
        {captionSettings.enabled ? (
          <Captions className="w-3.5 h-3.5" />
        ) : (
          <CaptionsOff className="w-3.5 h-3.5" />
        )}
      </button>

      {captionPanelOpen && (
        <div className={
          viewMode === "mini" 
            ? "absolute bottom-full mb-2 right-0 w-72 z-30" 
            : "fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        }>
          <div className={viewMode === "mini" ? "" : "w-full max-w-sm"}>
            <CaptionSettingsPanel
              settings={captionSettings}
              onChange={setCaptionSettings}
              onClose={() => setCaptionPanelOpen(false)}
              t={t}
            />
          </div>
        </div>
      )}
    </div>
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
            {captionsBtn}
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
            {captionsBtn}
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
          {captionsBtn}
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
        {/* We wrap callControls to inject the onOpenSettings prop if needed, 
            but since it's already a ReactNode, we assume the parent passed it correctly 
            or we use a cloneElement if we must. Actually, RoomCallControls already expects it. */}
        {callControls}
      </div>
      
      <RoomCallSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
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
        onToggleAudio={() => {}} // Handle via callControls generally, but modal can have its own
        localStream={localStream}
        t={t}
      />

      <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
    </div>
  );
}
