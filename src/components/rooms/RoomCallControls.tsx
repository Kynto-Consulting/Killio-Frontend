"use client";

import { useState } from "react";
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  Wand2, PhoneOff, Circle, Square,
} from "lucide-react";
import type { VideoFilter } from "@/hooks/use-room-call";

interface RoomCallControlsProps {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  isCameraFilterActive: boolean;
  activeFilter: VideoFilter;
  isRecording: boolean;
  recordingElapsed: number;
  canRecord: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onSetFilter: (filter: VideoFilter) => void;
  onToggleRecording: () => void;
  onLeave: () => void;
  t: (key: string) => string;
}

const FILTERS: { value: VideoFilter; labelKey: string }[] = [
  { value: "none", labelKey: "call.filters.none" },
  { value: "blur", labelKey: "call.filters.blur" },
  { value: "grayscale", labelKey: "call.filters.grayscale" },
  { value: "warm", labelKey: "call.filters.warm" },
];

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function RoomCallControls({
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  isCameraFilterActive,
  activeFilter,
  isRecording,
  recordingElapsed,
  canRecord,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onSetFilter,
  onToggleRecording,
  onLeave,
  t,
}: RoomCallControlsProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 bg-zinc-900/95 rounded-xl px-4 py-2 border border-zinc-700 shadow-xl">
      {/* Mic */}
      <button
        onClick={onToggleAudio}
        title={t("call.controls.toggleMic")}
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
          isAudioMuted ? "bg-red-600 text-white" : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
        }`}
      >
        {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>

      {/* Camera */}
      <button
        onClick={onToggleVideo}
        title={t("call.controls.toggleCamera")}
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
          isVideoMuted ? "bg-red-600 text-white" : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
        }`}
      >
        {isVideoMuted ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
      </button>

      {/* Filter */}
      <div className="relative">
        <button
          onClick={() => setFilterOpen((v) => !v)}
          title={t("call.filters.label")}
          disabled={isVideoMuted}
          className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
            isCameraFilterActive
              ? "bg-violet-600 text-white"
              : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
          }`}
        >
          <Wand2 className="w-4 h-4" />
        </button>

        {filterOpen && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-card border border-border rounded-xl shadow-xl p-2 w-40 space-y-1 z-10">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => { onSetFilter(f.value); setFilterOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors ${
                  activeFilter === f.value
                    ? "bg-accent/20 text-accent font-semibold"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Screen share */}
      <button
        onClick={onToggleScreenShare}
        title={isScreenSharing ? t("call.controls.stopScreen") : t("call.controls.screen")}
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
          isScreenSharing
            ? "bg-accent text-accent-foreground"
            : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
        }`}
      >
        {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
      </button>

      {/* Record */}
      {canRecord && (
        <button
          onClick={onToggleRecording}
          title={isRecording ? t("call.controls.stopRecord") : t("call.controls.record")}
          className={`flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-medium transition-colors ${
            isRecording
              ? "bg-red-600 text-white"
              : "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span>{formatTime(recordingElapsed)}</span>
            </>
          ) : (
            <Circle className="w-3.5 h-3.5 fill-current text-red-400" />
          )}
        </button>
      )}

      {/* Hang up */}
      <button
        onClick={onLeave}
        title={t("call.controls.hangUp")}
        className="flex items-center justify-center w-10 h-9 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors ml-2"
      >
        <PhoneOff className="w-4 h-4" />
      </button>
    </div>
  );
}
