"use client";

import { useEffect, useRef } from "react";
import { MicOff, VideoOff, Monitor } from "lucide-react";
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
  t,
}: RoomCallParticipantProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
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
