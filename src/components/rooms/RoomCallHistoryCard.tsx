"use client";

import { useState } from "react";
import { Phone, Users, FileText, Download, X, Clock } from "lucide-react";
import type { RoomCall, CallTranscript } from "@/lib/api/rooms";

interface RoomCallHistoryCardProps {
  call: RoomCall;
  onViewTranscript: (callId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function formatDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return "";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function RoomCallHistoryCard({ call, onViewTranscript, t }: RoomCallHistoryCardProps) {
  const duration = formatDuration(call.startedAt, call.endedAt);
  const inProgress = !call.endedAt;
  const hasTranscript = call.transcriptStatus !== "none";

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-muted/40 border border-border/40 my-1 max-w-sm">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        inProgress ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"
      }`}>
        <Phone className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">
            {inProgress
              ? t("callHistory.inProgress")
              : t("callHistory.ended", { duration })}
          </span>
          {inProgress && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Users className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {t("callHistory.participants", { count: call.participants.length })}
          </span>
          {!inProgress && duration && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{duration}</span>
            </>
          )}
        </div>
      </div>

      {!inProgress && (
        <button
          onClick={() => onViewTranscript(call.id)}
          title={hasTranscript ? t("callHistory.viewTranscript") : t("callHistory.noTranscript")}
          disabled={!hasTranscript}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40 disabled:cursor-default hover:bg-accent/10 text-muted-foreground"
        >
          <FileText className="w-3 h-3" />
          {hasTranscript ? t("call.transcript.view") : t("callHistory.noTranscript")}
        </button>
      )}
    </div>
  );
}

interface TranscriptModalProps {
  transcript: CallTranscript | null;
  isOpen: boolean;
  onClose: () => void;
  t: (key: string) => string;
}

export function TranscriptModal({ transcript, isOpen, onClose, t }: TranscriptModalProps) {
  if (!isOpen || !transcript) return null;

  const downloadTranscript = () => {
    const lines = transcript.segments.map((s) => {
      const ts = `[${Math.floor(s.startMs / 60000).toString().padStart(2, "0")}:${Math.floor((s.startMs % 60000) / 1000).toString().padStart(2, "0")}]`;
      const confidence = s.confidence < 0.5 ? " [?]" : "";
      return `${ts} ${s.displayName}: ${s.text}${confidence}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${transcript.callId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold">{t("call.transcript.timeline")}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadTranscript}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent/10 hover:bg-accent/20 text-accent transition-colors"
            >
              <Download className="w-3 h-3" />
              {t("call.transcript.download")}
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-accent/10 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {transcript.segments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("call.transcript.unavailable")}
            </p>
          ) : (
            transcript.segments.map((seg, i) => {
              const mins = Math.floor(seg.startMs / 60000).toString().padStart(2, "0");
              const secs = Math.floor((seg.startMs % 60000) / 1000).toString().padStart(2, "0");
              const lowConf = seg.confidence < 0.5;
              return (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0 pt-0.5">
                    {mins}:{secs}
                  </span>
                  <span className="font-semibold text-foreground shrink-0">{seg.displayName}:</span>
                  <span className={lowConf ? "text-muted-foreground italic" : "text-foreground"}>
                    {seg.text}
                    {lowConf && " [?]"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
