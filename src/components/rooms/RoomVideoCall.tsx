"use client";

import { useState } from "react";
import { Minimize2, Maximize2 } from "lucide-react";
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
  t: (key: string, params?: Record<string, string | number>) => string;
}

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
  t,
}: RoomVideoCallProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const sharingPeer = peers.find((p) => p.isScreenSharing);
  const hasScreenShare = isScreenSharing || !!sharingPeer;

  const allParticipants = [
    { id: "local", displayName: localDisplayName, stream: localStream ?? undefined, isLocal: true, audioMuted: isAudioMuted, videoMuted: isVideoMuted, isScreenSharing },
    ...peers.map((p) => ({ id: p.peerId, displayName: p.displayName, stream: p.stream, isLocal: false, audioMuted: p.audioMuted, videoMuted: p.videoMuted, isScreenSharing: p.isScreenSharing, avatarUrl: p.avatarUrl })),
  ];

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[200] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-48 overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700">
          <span className="text-[10px] text-zinc-300 font-medium">{t("call.inCall")}</span>
          <button onClick={() => setIsMinimized(false)} className="p-0.5 text-zinc-400 hover:text-white">
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
        <div className="p-1.5">
          <RoomCallParticipant
            stream={localStream ?? undefined}
            displayName={localDisplayName}
            isLocal
            isMuted={isAudioMuted}
            isVideoOff={isVideoMuted}
            canvasRef={isCameraFilterActive ? canvasRef : undefined}
            t={t}
          />
        </div>
        <div className="flex justify-center py-1.5">{callControls}</div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[200] bg-zinc-900/95 border border-zinc-700 rounded-2xl shadow-2xl w-[480px] max-h-[420px] flex flex-col overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-200 font-medium">
            {t("call.inCall")} · {t("call.participants").replace("{count}", String(allParticipants.length))}
          </span>
        </div>
        <button onClick={() => setIsMinimized(true)} className="p-1 text-zinc-400 hover:text-white transition-colors">
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 overflow-hidden p-2">
        {hasScreenShare ? (
          <div className="flex gap-2 h-full">
            {/* Screen share: primary large */}
            <div className="flex-1 bg-black rounded-xl overflow-hidden">
              {isScreenSharing && screenStream ? (
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={(v) => { if (v) v.srcObject = screenStream; }}
                  className="w-full h-full object-contain"
                />
              ) : sharingPeer?.stream ? (
                <video
                  autoPlay
                  playsInline
                  ref={(v) => { if (v) v.srcObject = sharingPeer.stream!; }}
                  className="w-full h-full object-contain"
                />
              ) : null}
            </div>
            {/* Thumbnails */}
            <div className="flex flex-col gap-1.5 w-24 overflow-y-auto">
              {allParticipants.map((p) => (
                <RoomCallParticipant
                  key={p.id}
                  stream={p.stream}
                  displayName={p.displayName}
                  isLocal={p.isLocal}
                  isMuted={p.audioMuted}
                  isVideoOff={p.videoMuted}
                  isScreenSharing={p.isScreenSharing}
                  canvasRef={p.isLocal && isCameraFilterActive ? canvasRef : undefined}
                  t={t}
                />
              ))}
            </div>
          </div>
        ) : (
          // Gallery grid
          <div
            className="grid gap-1.5 h-full"
            style={{
              gridTemplateColumns: allParticipants.length === 1 ? "1fr" : allParticipants.length <= 4 ? "1fr 1fr" : "1fr 1fr 1fr",
            }}
          >
            {allParticipants.map((p) => (
              <RoomCallParticipant
                key={p.id}
                stream={p.stream}
                displayName={p.displayName}
                isLocal={p.isLocal}
                isMuted={p.audioMuted}
                isVideoOff={p.videoMuted}
                isScreenSharing={p.isScreenSharing}
                canvasRef={p.isLocal && isCameraFilterActive ? canvasRef : undefined}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-center py-2 px-3 border-t border-zinc-700/60 shrink-0">
        {callControls}
      </div>

      {/* Hidden video for canvas filter source */}
      <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
    </div>
  );
}
