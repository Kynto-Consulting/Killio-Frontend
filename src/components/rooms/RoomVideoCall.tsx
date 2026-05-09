"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Minimize2, Maximize2, Expand, Shrink, Captions, CaptionsOff } from "lucide-react";
import type { CallPeer } from "@/hooks/use-room-call";
import { RoomCallParticipant } from "./RoomCallParticipant";

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
  /** Live interim STT text (current sentence being spoken) */
  liveCaption?: string;
  /** Finalized transcript segments for this session */
  transcriptSegments?: { text: string; ts: number }[];
  t: (key: string, params?: Record<string, string | number>) => string;
}

type ViewMode = "mini" | "panel" | "fullscreen";

// ── Live transcript overlay ────────────────────────────────────────────────────

function LiveTranscriptPanel({
  liveCaption,
  transcriptSegments,
  t,
}: {
  liveCaption: string;
  transcriptSegments: { text: string; ts: number }[];
  t: (key: string) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptSegments.length, liveCaption]);

  return (
    <div className="bg-black/70 backdrop-blur-sm rounded-xl border border-zinc-700/50 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-zinc-700/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          {t("call.transcript.live")}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="px-3 py-2 max-h-32 overflow-y-auto space-y-1 scroll-smooth"
      >
        {transcriptSegments.length === 0 && !liveCaption && (
          <p className="text-[11px] text-zinc-500 italic">{t("call.transcript.waiting")}</p>
        )}

        {/* Finalized segments */}
        {transcriptSegments.map((seg, i) => (
          <p key={i} className="text-xs text-zinc-200 leading-snug">
            {seg.text}
          </p>
        ))}

        {/* Live interim text */}
        {liveCaption && (
          <p className="text-xs text-zinc-400 italic leading-snug animate-pulse">
            {liveCaption}
          </p>
        )}
      </div>
    </div>
  );
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
  t,
}: RoomVideoCallProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("panel");
  const [captionsVisible, setCaptionsVisible] = useState(true);

  const sharingPeer = peers.find((p) => p.isScreenSharing);
  const hasScreenShare = isScreenSharing || !!sharingPeer;

  const hasCaptions = liveCaption.length > 0 || transcriptSegments.length > 0;

  // Fix: set srcObject on the hidden video element after it mounts
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !localStream) return;
    if (video.srcObject !== localStream) {
      video.srcObject = localStream;
      video.play().catch(() => {});
    }
  }, [localStream, localVideoRef]);

  // Also set canvas dimensions when the canvas mounts (for filter)
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

  const participantTile = useCallback(
    (p: (typeof allParticipants)[number]) => (
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
        t={t}
      />
    ),
    [canManageCall, canvasRef, isCameraFilterActive, onDisableScreen, onKickParticipant, onMuteParticipant, t]
  );

  // Shared captions toggle button
  const captionsToggle = (
    <button
      onClick={() => setCaptionsVisible((v) => !v)}
      title={captionsVisible ? t("call.transcript.hideCaptions") : t("call.transcript.showCaptions")}
      className={`p-1 transition-colors rounded ${
        captionsVisible && hasCaptions
          ? "text-accent"
          : "text-zinc-400 hover:text-white"
      }`}
    >
      {captionsVisible ? (
        <Captions className="w-3.5 h-3.5" />
      ) : (
        <CaptionsOff className="w-3.5 h-3.5" />
      )}
    </button>
  );

  // ── Mini mode ─────────────────────────────────────────────────────────────
  if (viewMode === "mini") {
    return (
      <div className="fixed bottom-4 right-4 z-[200] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-48 overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700">
          <span className="text-[10px] text-zinc-300 font-medium">{t("call.inCall")}</span>
          <div className="flex gap-1">
            {captionsToggle}
            <button
              onClick={() => setViewMode("panel")}
              className="p-0.5 text-zinc-400 hover:text-white"
              title="Expand"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => setViewMode("fullscreen")}
              className="p-0.5 text-zinc-400 hover:text-white"
              title="Fullscreen"
            >
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
            t={t}
          />
        </div>
        {captionsVisible && hasCaptions && (
          <div className="px-1.5 pb-1.5">
            <LiveTranscriptPanel
              liveCaption={liveCaption}
              transcriptSegments={transcriptSegments}
              t={t}
            />
          </div>
        )}
        <div className="flex justify-center py-1.5">{callControls}</div>
        <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
      </div>
    );
  }

  // ── Fullscreen mode ────────────────────────────────────────────────────────
  if (viewMode === "fullscreen") {
    return (
      <div className="fixed inset-0 z-[500] bg-zinc-950 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-zinc-200 font-medium">
              {t("call.inCall")} · {t("call.participants").replace("{count}", String(allParticipants.length))}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {captionsToggle}
            <button
              onClick={() => setViewMode("panel")}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors"
              title="Exit fullscreen"
            >
              <Shrink className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("mini")}
              className="p-1.5 text-zinc-400 hover:text-white transition-colors"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video area */}
        <div className="flex-1 overflow-hidden p-3">
          {hasScreenShare ? (
            <div className="flex gap-3 h-full">
              <div className="flex-1 bg-black rounded-xl overflow-hidden">
                {isScreenSharing && screenStream ? (
                  <video autoPlay playsInline muted ref={(v) => { if (v) v.srcObject = screenStream; }} className="w-full h-full object-contain" />
                ) : sharingPeer?.stream ? (
                  <video autoPlay playsInline ref={(v) => { if (v) v.srcObject = sharingPeer.stream!; }} className="w-full h-full object-contain" />
                ) : null}
              </div>
              <div className="flex flex-col gap-2 w-36 overflow-y-auto">
                {allParticipants.map(participantTile)}
              </div>
            </div>
          ) : (
            <div
              className="grid gap-2 h-full"
              style={{
                gridTemplateColumns: allParticipants.length === 1 ? "1fr" : allParticipants.length <= 4 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
                gridAutoRows: "1fr",
              }}
            >
              {allParticipants.map(participantTile)}
            </div>
          )}
        </div>

        {/* Live transcript — above controls */}
        {captionsVisible && hasCaptions && (
          <div className="px-6 pb-2 shrink-0">
            <LiveTranscriptPanel
              liveCaption={liveCaption}
              transcriptSegments={transcriptSegments}
              t={t}
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-center py-3 border-t border-zinc-800 shrink-0">
          {callControls}
        </div>

        <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
      </div>
    );
  }

  // ── Panel mode (default) ───────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 z-[200] bg-zinc-900/95 border border-zinc-700 rounded-2xl shadow-2xl w-[480px] max-h-[520px] flex flex-col overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-200 font-medium">
            {t("call.inCall")} · {t("call.participants").replace("{count}", String(allParticipants.length))}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {captionsToggle}
          <button
            onClick={() => setViewMode("fullscreen")}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            title="Fullscreen"
          >
            <Expand className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("mini")}
            className="p-1 text-zinc-400 hover:text-white transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 overflow-hidden p-2 min-h-0">
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
              gridTemplateColumns: allParticipants.length === 1 ? "1fr" : allParticipants.length <= 4 ? "1fr 1fr" : "1fr 1fr 1fr",
            }}
          >
            {allParticipants.map(participantTile)}
          </div>
        )}
      </div>

      {/* Live captions */}
      {captionsVisible && hasCaptions && (
        <div className="px-2 pb-1 shrink-0">
          <LiveTranscriptPanel
            liveCaption={liveCaption}
            transcriptSegments={transcriptSegments}
            t={t}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center py-2 px-3 border-t border-zinc-700/60 shrink-0">
        {callControls}
      </div>

      {/* Hidden video for canvas filter source — MUST be always mounted */}
      <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
    </div>
  );
}
