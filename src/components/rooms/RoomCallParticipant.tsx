"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MicOff, VideoOff, Monitor, UserX, MonitorOff, Settings, X } from "lucide-react";
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
  /** Live subtitle text to overlay on this tile (local only) */
  captionText?: string;
  captionStyle?: CaptionStyle;
  scaleMode?: "cover" | "contain";
  t: (key: string) => string;
}

export interface CaptionStyle {
  fontSize: "sm" | "md" | "lg" | "xl";
  color: string;
  font: "sans" | "serif" | "mono";
}

// ── Audio level hook ────────────────────────────────────────────────────────────
function useAudioLevel(stream: MediaStream | undefined, muted: boolean): number {
  const [level, setLevel] = useState(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || muted) { setLevel(0); return; }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.slice(0, 32).reduce((a, b) => a + b, 0) / 32;
      setLevel(Math.min(100, (avg / 128) * 100));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animRef.current); ctx.close().catch(() => {}); };
  }, [stream, muted]);

  return level;
}

const FONT_SIZE_MAP = { sm: "text-sm", md: "text-base", lg: "text-lg", xl: "text-2xl" };
const FONT_FAMILY_MAP = { sans: "font-sans", serif: "font-serif", mono: "font-mono" };

// ── Component ──────────────────────────────────────────────────────────────────
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
  captionText,
  captionStyle,
  scaleMode = "cover",
  t,
}: RoomCallParticipantProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  const audioLevel = useAudioLevel(isLocal ? undefined : stream, isMuted);
  const isSpeaking = audioLevel > 15;
  const glowOpacity = isSpeaking ? Math.min(1, (audioLevel - 15) / 60) : 0;
  const glowSize = isSpeaking ? Math.round(4 + glowOpacity * 12) : 0;

  const showAdminActions = canManage && !isLocal && peerId && hovered;

  const csz = captionStyle?.fontSize ?? "md";
  const cfont = captionStyle?.font ?? "sans";
  const ccolor = captionStyle?.color ?? "#ffffff";

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
      {!isVideoOff && isLocal && canvasRef ? (
        <>
          <canvas ref={canvasRef} className={`absolute inset-0 w-full h-full ${scaleMode === "cover" ? "object-cover" : "object-contain"}`} />
          <video ref={videoRef} autoPlay muted playsInline className="hidden" />
        </>
      ) : stream && !isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`absolute inset-0 w-full h-full ${scaleMode === "cover" ? "object-cover" : "object-contain"}`}
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
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors"
            >
              <MicOff className="w-3.5 h-3.5" />
            </button>
          )}
          {isScreenSharing && onDisableScreen && (
            <button
              onClick={() => onDisableScreen(peerId!)}
              title={t("call.admin.stopScreen")}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-orange-600 text-white transition-colors"
            >
              <MonitorOff className="w-3.5 h-3.5" />
            </button>
          )}
          {onKick && (
            <button
              onClick={() => onKick(peerId!)}
              title={t("call.admin.kick")}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-red-700 text-white transition-colors"
            >
              <UserX className="w-3.5 h-3.5" />
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

      {/* Subtitle overlay — only when captionText is set */}
      {captionText && (
        <div className="absolute bottom-7 left-0 right-0 flex justify-center px-3 pointer-events-none z-10">
          <span
            className={`
              px-3 py-1 rounded-lg max-w-[90%] text-center leading-snug
              bg-black/60 backdrop-blur-sm
              ${FONT_SIZE_MAP[csz]} ${FONT_FAMILY_MAP[cfont]}
            `}
            style={{ color: ccolor, textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
          >
            {captionText}
          </span>
        </div>
      )}
    </div>
  );
}
