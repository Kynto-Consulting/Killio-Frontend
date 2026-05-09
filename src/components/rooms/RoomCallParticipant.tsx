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

// ── Audio level hook — returns 0–100 ──────────────────────────────────────────
function useAudioLevel(stream: MediaStream | undefined, muted: boolean): number {
  const [level, setLevel] = useState(0);
  const animRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || muted) {
      setLevel(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      // Average of lower bins (voice range)
      const slice = data.slice(0, 32);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      setLevel(Math.min(100, (avg / 128) * 100));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animRef.current);
      ctx.close().catch(() => {});
    };
  }, [stream, muted]);

  return level;
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  // Speaking glow — don't run for local (we control our own mute)
  const audioLevel = useAudioLevel(isLocal ? undefined : stream, isMuted);
  const isSpeaking = audioLevel > 15;

  // Glow intensity mapped 0–1
  const glowOpacity = isSpeaking ? Math.min(1, (audioLevel - 15) / 60) : 0;
  const glowSize = isSpeaking ? Math.round(4 + glowOpacity * 12) : 0;

  const showAdminActions = canManage && !isLocal && peerId && hovered;

  return (
    <div
      className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={
        isSpeaking
          ? {
              boxShadow: `0 0 ${glowSize}px ${Math.round(glowSize * 0.6)}px rgba(99,102,241,${(glowOpacity * 0.8).toFixed(2)})`,
              outline: `2px solid rgba(99,102,241,${(glowOpacity * 0.9).toFixed(2)})`,
              transition: "box-shadow 80ms ease-out, outline 80ms ease-out",
            }
          : {
              boxShadow: "none",
              outline: "2px solid transparent",
              transition: "box-shadow 200ms ease-in, outline 200ms ease-in",
            }
      }
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
