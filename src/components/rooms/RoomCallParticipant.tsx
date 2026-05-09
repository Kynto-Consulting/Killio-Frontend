"use client";

import { useEffect, useRef, useState } from "react";
import { MicOff, VideoOff, Monitor, UserX, MonitorOff } from "lucide-react";
import { getUserAvatarUrl } from "@/lib/gravatar";

interface RoomCallParticipantProps {
  stream?: MediaStream;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  canManage?: boolean;
  peerId?: string;
  onMute?: (peerId: string) => void;
  onKick?: (peerId: string) => void;
  onDisableScreen?: (peerId: string) => void;
  t: (key: string) => string;
}

export function RoomCallParticipant({
  stream,
  displayName,
  avatarUrl,
  email,
  isLocal = false,
  isMuted = false,
  isVideoOff = false,
  isScreenSharing = false,
  canvasRef,
  canManage = false,
  peerId,
  onMute,
  onKick,
  onDisableScreen,
  t,
}: RoomCallParticipantProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  const showAdminActions = canManage && !isLocal && peerId && hovered;

  return (
    <div
      className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video / Canvas */}
      {isLocal && canvasRef ? (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
          <video ref={videoRef} autoPlay muted playsInline className="hidden" />
        </>
      ) : stream && !isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <img
            src={getUserAvatarUrl(avatarUrl, email, 64)}
            alt={displayName}
            className="w-14 h-14 rounded-full border-2 border-border"
          />
          {isVideoOff && (
            <span className="text-xs text-zinc-400">{t("call.videoOff")}</span>
          )}
        </div>
      )}

      {/* Admin action overlay */}
      {showAdminActions && (
        <div className="absolute top-1.5 right-1.5 flex gap-1 z-10">
          {onMute && (
            <button
              onClick={() => onMute(peerId!)}
              title={t("call.admin.mute")}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 hover:bg-red-600 text-white transition-colors"
            >
              <MicOff className="w-3 h-3" />
            </button>
          )}
          {isScreenSharing && onDisableScreen && (
            <button
              onClick={() => onDisableScreen(peerId!)}
              title={t("call.admin.stopScreen")}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 hover:bg-orange-600 text-white transition-colors"
            >
              <MonitorOff className="w-3 h-3" />
            </button>
          )}
          {onKick && (
            <button
              onClick={() => onKick(peerId!)}
              title={t("call.admin.kick")}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 hover:bg-red-700 text-white transition-colors"
            >
              <UserX className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Name bar */}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1">
        {isScreenSharing && <Monitor className="w-3 h-3 text-accent shrink-0" />}
        <span className="text-xs text-white truncate flex-1">
          {displayName}
          {isLocal && <span className="opacity-60"> ({t("call.you")})</span>}
        </span>
        {isMuted && <MicOff className="w-3 h-3 text-red-400 shrink-0" />}
        {isVideoOff && <VideoOff className="w-3 h-3 text-red-400 shrink-0" />}
      </div>
    </div>
  );
}
