"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, FileText, Download, Copy, Check, Bot,
  Clock, Loader2, User, ChevronRight, Captions,
} from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { AgentChatPanel } from "@/components/agent";
import { useRoomCallHistory } from "@/hooks/use-room-call-history";
import {
  getMyRoomPermissions, getRoom,
  transcriptToDocument,
  type Room, type CallTranscript, type RoomCall,
} from "@/lib/api/rooms";

// ── helpers ────────────────────────────────────────────────────────────────────

function msToTimestamp(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const USER_COLORS = [
  "text-indigo-400", "text-emerald-400", "text-amber-400",
  "text-rose-400", "text-sky-400", "text-violet-400", "text-teal-400",
];

function getUserColor(userId: string, map: Map<string, string>): string {
  if (!map.has(userId)) {
    map.set(userId, USER_COLORS[map.size % USER_COLORS.length]);
  }
  return map.get(userId)!;
}

// ── Transcript document view ───────────────────────────────────────────────────

function TranscriptDocument({ transcript, call }: { transcript: CallTranscript; call: RoomCall }) {
  const colorMap = useRef(new Map<string, string>());

  return (
    <div className="space-y-0.5">
      {transcript.segments.map((seg, i) => {
        const color = getUserColor(seg.userId, colorMap.current);
        const showHeader =
          i === 0 || transcript.segments[i - 1].userId !== seg.userId;
        return (
          <div key={i} className={showHeader ? "mt-4" : ""}>
            {showHeader && (
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${color}`}>{seg.displayName}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{msToTimestamp(seg.startMs)}</span>
              </div>
            )}
            <p className="text-sm text-zinc-200 leading-relaxed pl-0">{seg.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Call list sidebar ──────────────────────────────────────────────────────────

function CallListSidebar({
  calls,
  selectedCallId,
  onSelect,
  t,
}: {
  calls: RoomCall[];
  selectedCallId: string | null;
  onSelect: (call: RoomCall) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="w-64 shrink-0 border-r border-zinc-800 overflow-y-auto">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{t("transcripts.callHistory")}</h2>
      </div>
      {calls.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-xs gap-2">
          <Captions className="w-8 h-8 opacity-30" />
          <p>{t("transcripts.noCalls")}</p>
        </div>
      )}
      <div className="py-1">
        {calls.map((call) => (
          <button
            key={call.id}
            onClick={() => onSelect(call)}
            className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-2 group ${
              selectedCallId === call.id
                ? "bg-accent/10 border-l-2 border-accent"
                : "hover:bg-zinc-800/50 border-l-2 border-transparent"
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-zinc-300 truncate">
                {formatDate(call.startedAt)}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  call.transcriptStatus === "complete"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : call.transcriptStatus === "partial"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-zinc-700 text-zinc-500"
                }`}>
                  {t(`transcripts.status_${call.transcriptStatus}`)}
                </span>
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RoomTranscriptsPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken, user } = useSession();
  const t = useTranslations("rooms");
  const teamId = (user as any)?.activeTeamId ?? "";

  const [room, setRoom] = useState<Room | null>(null);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);

  const { calls, isLoading: callsLoading, getTranscript } = useRoomCallHistory(
    canAccess ? roomId : null,
    accessToken
  );

  const [selectedCall, setSelectedCall] = useState<RoomCall | null>(null);
  const [transcript, setTranscript] = useState<CallTranscript | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [toDocLoading, setToDocLoading] = useState(false);
  const [toDocDone, setToDocDone] = useState<string | null>(null); // document id
  const [showCopilot, setShowCopilot] = useState(false);

  // Permission check + room load
  useEffect(() => {
    if (!roomId || !accessToken) return;
    Promise.all([
      getRoom(roomId, accessToken),
      getMyRoomPermissions(roomId, accessToken),
    ]).then(([r, perms]) => {
      setRoom(r);
      // canCall is the proxy for room membership / read access
      setCanAccess(perms.canCall || perms.canPost);
    }).catch(() => setCanAccess(false));
  }, [roomId, accessToken]);

  // Auto-select call from query param
  useEffect(() => {
    const callId = searchParams.get("callId");
    if (callId && calls.length > 0) {
      const found = calls.find((c) => c.id === callId);
      if (found) handleSelectCall(found);
    }
  }, [calls, searchParams]);

  const handleSelectCall = useCallback(async (call: RoomCall) => {
    setSelectedCall(call);
    setTranscript(null);
    setToDocDone(null);
    setTranscriptLoading(true);
    try {
      const t = await getTranscript(call.id);
      setTranscript(t);
    } finally {
      setTranscriptLoading(false);
    }
  }, [getTranscript]);

  const handleCopyAll = useCallback(() => {
    if (!transcript) return;
    const text = transcript.segments
      .map((s) => `[${msToTimestamp(s.startMs)}] ${s.displayName}: ${s.text}`)
      .join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }, [transcript]);

  const handleToDocument = useCallback(async () => {
    if (!selectedCall || !roomId || !accessToken || !teamId) return;
    setToDocLoading(true);
    try {
      const result = await transcriptToDocument(roomId, selectedCall.id, teamId, accessToken);
      setToDocDone(result.documentId);
    } catch (e) {
      console.error(e);
    } finally {
      setToDocLoading(false);
    }
  }, [selectedCall, roomId, accessToken, teamId]);

  // ── Permission loading ───────────────────────────────────────────────────────
  if (canAccess === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (canAccess === false) {
    return (
      <div className="flex h-full items-center justify-center text-center text-zinc-500">
        <div>
          <Captions className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("transcripts.noAccess")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-zinc-950 overflow-hidden">
      {/* Call list sidebar */}
      <CallListSidebar
        calls={calls}
        selectedCallId={selectedCall?.id ?? null}
        onSelect={handleSelectCall}
        t={t}
      />

      {/* Main transcript area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href={`/rooms/${roomId}`}
              className="text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-zinc-100">
                {room?.name ?? "Room"} · {t("transcripts.title")}
              </h1>
              {selectedCall && (
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {formatDate(selectedCall.startedAt)}
                  {selectedCall.endedAt && ` → ${formatDate(selectedCall.endedAt)}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {transcript && (
              <>
                {/* Copy */}
                <button
                  onClick={handleCopyAll}
                  title={t("transcripts.copyAll")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                >
                  {copiedAll ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedAll ? t("transcripts.copied") : t("transcripts.copyAll")}
                </button>

                {/* Transform to Document */}
                {toDocDone ? (
                  <Link
                    href={`/d/${toDocDone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-xs text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t("transcripts.openDocument")}
                  </Link>
                ) : (
                  <button
                    onClick={handleToDocument}
                    disabled={toDocLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 border border-accent/40 text-xs text-accent hover:bg-accent/30 disabled:opacity-50 transition-colors"
                  >
                    {toDocLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    {t("transcripts.toDocument")}
                  </button>
                )}
              </>
            )}

            {/* Copilot toggle */}
            <button
              onClick={() => setShowCopilot((v) => !v)}
              title={t("header.copilot")}
              className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                showCopilot
                  ? "bg-violet-600/20 text-violet-400 border border-violet-500/40"
                  : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
              }`}
            >
              <Bot className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: transcript + copilot */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Document area */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {!selectedCall && !callsLoading && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
                <Captions className="w-12 h-12 opacity-20" />
                <p className="text-sm">{t("transcripts.selectCall")}</p>
              </div>
            )}

            {transcriptLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
              </div>
            )}

            {!transcriptLoading && transcript && (
              <div className="max-w-3xl mx-auto">
                {/* Document header */}
                <div className="mb-8 pb-6 border-b border-zinc-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Captions className="w-5 h-5 text-accent" />
                    <h2 className="text-xl font-bold text-zinc-100">{t("transcripts.documentTitle")}</h2>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {room?.name} · {formatDate(selectedCall!.startedAt)}
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <User className="w-3 h-3" />
                      {[...new Set(transcript.segments.map((s) => s.displayName))].join(", ")}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {transcript.segments.length} {t("transcripts.segments")}
                    </div>
                  </div>
                </div>

                {/* Transcript body */}
                {transcript.segments.length === 0 ? (
                  <div className="text-center py-12 text-zinc-600">
                    <p className="text-sm">{t("transcripts.empty")}</p>
                  </div>
                ) : (
                  <TranscriptDocument transcript={transcript} call={selectedCall!} />
                )}

                {/* Copilot hint */}
                {transcript.segments.length > 0 && !showCopilot && (
                  <div className="mt-8 pt-6 border-t border-zinc-800/60">
                    <p className="text-xs text-zinc-600 text-center">
                      {t("transcripts.copilotHint")}{" "}
                      <button onClick={() => setShowCopilot(true)} className="text-accent hover:underline">
                        {t("transcripts.openCopilot")}
                      </button>
                    </p>
                  </div>
                )}
              </div>
            )}

            {!transcriptLoading && transcript && transcript.segments.length === 0 && selectedCall?.transcriptStatus === "none" && (
              <div className="max-w-3xl mx-auto text-center py-12 text-zinc-600">
                <p className="text-sm">{t("transcripts.notRecorded")}</p>
              </div>
            )}
          </div>

          {/* Copilot panel */}
          {showCopilot && (
            <div className="w-80 shrink-0 border-l border-zinc-800 flex flex-col overflow-hidden">
              <AgentChatPanel
                teamId={teamId}
                entityType="team"
                entityId={teamId}
                onClose={() => setShowCopilot(false)}
                initialMessage={
                  transcript && selectedCall
                    ? `@[transcript:${roomId}:${selectedCall.id}:Transcript ${formatDate(selectedCall.startedAt)}]`
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
