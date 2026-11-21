"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { Loader2, X, MessageSquare, Megaphone, ShieldOff, Sparkles, RefreshCw } from "lucide-react";
import type { RoomMessage, RoomCall, TeamRoleLite } from "@/lib/api/rooms";
import type { ResolverContext } from "@/lib/reference-resolver";
import type { DocumentSummary } from "@/lib/api/documents";
import { RoomMessageItem } from "./RoomMessageItem";
import { RoomInput } from "./RoomInput";
import { EphemeralList } from "./BotMessageExtras";
import type { EphemeralMessage } from "@/lib/rooms/ephemeral";
import { parseAiMarkup } from "@/lib/ai-markup";
import { getProactiveSuggestion } from "@/lib/api/agent";
import { useSession } from "@/components/providers/session-provider";
import type { RoomControls } from "@/lib/rooms/room-controls";
import { messageActions, type SlashCommand } from "@/lib/rooms/message-structure";
import { newerFromOthers } from "@/lib/rooms/history";
import { useRoomHistoryScroll } from "@/hooks/use-room-history-scroll";
import { EdgeStatus, JumpToLatestButton, StartOfConversation, UnreadBanner, UnreadDivider, type RoomHistoryView } from "./history/HistoryParts";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface TypingUser { userId: string; displayName: string; }

interface RoomChatAreaProps {
  messages: RoomMessage[];
  callsById: Map<string, RoomCall>;
  isLoading: boolean;
  isSending: boolean;
  hasMore: boolean;
  typingUsers: TypingUser[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: (content?: string) => void;
  onLoadMore: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onMarkRead?: (messageIds: string[]) => void;
  onTyping: () => void;
  onViewTranscript: (callId: string) => void;
  onAiTrigger: (content: string) => void;
  currentUserId: string;
  teamId?: string;
  /** Legacy flag (older callers). Prefer `controls`. */
  canPost?: boolean;
  /** What the user may do here, from the backend permissions. */
  controls?: RoomControls;
  channelType?: "text" | "announcement" | null;
  muteMinutesLeft?: number | null;
  muteReason?: string | null;
  isAiRoom?: boolean;
  showReadReceipts?: boolean;
  roomName?: string;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: any[];
  roles?: TeamRoleLite[];
  commands?: SlashCommand[];
  /** Channels of the workspace (for `channel` arguments of bot commands in the composer). */
  rooms?: Array<{ id: string; name: string }>;
  /** Private answers of bots for this person in this room (never part of `messages`). */
  ephemeral?: readonly EphemeralMessage[];
  onDismissEphemeral?: (id: string) => void;
  /** Ids of the messages the person bookmarked, and the toggle. */
  bookmarkedIds?: ReadonlySet<string>;
  onToggleBookmark?: (message: RoomMessage) => Promise<void> | void;
  myRoleIds?: readonly string[];
  myGroupIds?: readonly string[];
  /** Users that are bots (from the team member list), for rooms whose messages do not say it themselves. */
  botUserIds?: ReadonlySet<string>;
  transcripts?: Array<{ callId: string; roomId: string; roomName: string; startedAt: string }>;
  activeCallId?: string;
  resolverContext?: ResolverContext;
  availableTags?: any[];
  onOpenCopilot?: () => void;
  onToolApproval?: (toolName: string, input: any, decision: 'approved' | 'rejected') => void;
  replyTo?: RoomMessage | null;
  onReply?: (message: RoomMessage | null) => void;
  /** Optional model picker rendered next to the composer (AI rooms only). */
  modelSelector?: React.ReactNode;
  /** The permissions of this room have not arrived yet: the composer is shown but disabled, never as a "read-only" notice. */
  isCheckingAccess?: boolean;
  /** The message list could not be loaded. */
  loadError?: "forbidden" | "failed" | null;
  onReload?: () => void;
  /** Search text: when set, the list shows matches only and the empty state says so. */
  searchQuery?: string;
  onEditMessage?: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onTogglePin?: (messageId: string, action: "pin" | "change" | "unpin") => Promise<void> | void;
  /** Pin rights from the pin summary (who may unpin other people's pins). */
  pinCaps?: { canUnpinOthers: boolean };
  onOpenThread?: (rootId: string) => void;
  /** Replies per thread root, for the "N replies" chip. */
  threadReplies?: Map<string, RoomMessage[]>;
  /** Scroll to and flash this message (from the pinned panel), then call `onJumped`. */
  jumpToMessageId?: string | null;
  onJumped?: () => void;
  /** Paginated window over the room history (see use-room-history.ts). Without it the list behaves as before. */
  history?: RoomHistoryView;
  t: TFn;
}

function formatTypingText(users: TypingUser[], t: TFn): string {
  if (users.length === 0) return "";
  if (users.length === 1) return t("chat.typing_one", { name: users[0].displayName });
  if (users.length === 2) return t("chat.typing_two", { name1: users[0].displayName, name2: users[1].displayName });
  return t("chat.typing_many");
}

type Row = { kind: "divider"; label: string; key: string } | { kind: "unread"; key: string } | { kind: "message"; message: RoomMessage; showAvatar: boolean };

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function buildRows(messages: RoomMessage[], unreadBeforeId?: string | null): Row[] {
  const rows: Row[] = [];
  let lastDate = "";
  let prev: RoomMessage | null = null;
  for (const msg of messages) {
    const d = new Date(msg.createdAt).toLocaleDateString();
    const newDay = d !== lastDate;
    if (newDay) {
      lastDate = d;
      rows.push({ kind: "divider", label: d, key: `divider-${d}` });
    }
    const banner = msg.type === "system" || msg.type === "call_started" || msg.type === "call_ended";
    const prevBanner = prev ? prev.type === "system" || prev.type === "call_started" || prev.type === "call_ended" : false;
    const sameAuthor = prev && prev.userId === msg.userId && prev.type === msg.type && !prevBanner && !banner;
    const close = prev ? Math.abs(new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) < GROUP_WINDOW_MS : false;
    const unreadHere = Boolean(unreadBeforeId) && msg.id === unreadBeforeId;
    if (unreadHere) rows.push({ kind: "unread", key: "unread-divider" });
    rows.push({ kind: "message", message: msg, showAvatar: newDay || unreadHere || !sameAuthor || !close });
    prev = msg;
  }
  return rows;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

const FALLBACK_CONTROLS: RoomControls = {
  composer: "input", showReactions: true, showCall: true, call: { start: true, join: true, speak: true, video: true, screenShare: true, muteOthers: false, removeParticipants: false }, showTranscripts: true, showSettings: false, showModeration: false,
  canEditOwn: true, canDeleteOwn: true, canDeleteOthers: false, canPin: false, canMentionEveryone: false, canReply: true,
};

export function RoomChatArea({
  messages, callsById, isLoading, hasMore, typingUsers, inputValue, onInputChange, onSend, onLoadMore, onReact, onMarkRead, onTyping, onViewTranscript,
  onAiTrigger, currentUserId, teamId, canPost, controls: controlsProp, channelType, muteMinutesLeft, muteReason, isAiRoom, showReadReceipts, roomName,
  documents, boards, users, roles, commands, rooms, ephemeral, onDismissEphemeral, bookmarkedIds, onToggleBookmark, myRoleIds, myGroupIds, botUserIds, transcripts, activeCallId, resolverContext, availableTags, onOpenCopilot, onToolApproval,
  replyTo, onReply, modelSelector, isCheckingAccess, loadError, onReload, searchQuery, onEditMessage, onDeleteMessage, onTogglePin, pinCaps, onOpenThread, threadReplies, jumpToMessageId,
  onJumped, history, t,
}: RoomChatAreaProps) {
  const { accessToken } = useSession();
  const platform = usePlatform();
  const reducedMotion = usePrefersReducedMotion();
  const [proactiveSuggestion, setProactiveSuggestion] = useState<string>("");
  const suggestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = platform === "mobile";
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);

  // Legacy callers pass only `canPost`.
  const controls: RoomControls = controlsProp ?? (canPost === false ? { ...FALLBACK_CONTROLS, composer: "readonly", showReactions: false, canEditOwn: false, canDeleteOwn: false, canReply: false } : FALLBACK_CONTROLS);
  const searching = Boolean(searchQuery && searchQuery.trim());

  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setViewportHeight(vv.height);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [isMobile]);

  useEffect(() => {
    if (history) return; // the paginated list follows the present itself (use-room-history-scroll.ts)
    if (isAtBottomRef.current && !searching) {
      bottomRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [messages.length, ephemeral?.length, reducedMotion, searching, history]);

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const hs = useRoomHistoryScroll({
    scrollRef, contentRef, enabled: Boolean(history) && !searching, ids: messageIds, view: history?.view,
    hasMoreBefore: history?.hasMoreBefore ?? false, hasMoreAfter: history?.hasMoreAfter ?? false,
    loadingOlder: history?.loadingOlder ?? false, loadingNewer: history?.loadingNewer ?? false,
    olderError: history?.olderError ?? false, newerError: history?.newerError ?? false,
    onLoadOlder: history?.onLoadOlder ?? (() => {}), onLoadNewer: history?.onLoadNewer ?? (() => {}),
    onReadUpTo: history?.onReadUpTo, reducedMotion,
  });
  // The newest message the user had on screen when last at the present: the base of "N new messages".
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const [seenAtPresent, setSeenAtPresent] = useState<string | null>(null);
  useEffect(() => { if (hs.atBottom) setSeenAtPresent(lastMessageId); }, [hs.atBottom, lastMessageId]);
  const newBelow = history ? newerFromOthers(messages, seenAtPresent, currentUserId) + history.pendingNew : 0;

  useEffect(() => {
    if (!jumpToMessageId) return;
    const el = document.getElementById(`msg-${jumpToMessageId}`);
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      el.classList.add("animate-pulse-accent");
      setTimeout(() => el.classList.remove("animate-pulse-accent"), 2000);
    }
    onJumped?.();
  }, [jumpToMessageId, reducedMotion, onJumped]);

  const unreadFromOthers = useCallback(
    () => messages.filter((m) => m.userId !== currentUserId && m.status !== "read" && !m.id.startsWith("temp-")).map((m) => m.id),
    [messages, currentUserId],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (history) hs.onScroll();
    if (isAtBottomRef.current && onMarkRead && showReadReceipts) {
      const ids = unreadFromOthers();
      if (ids.length > 0) onMarkRead(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMarkRead, showReadReceipts, unreadFromOthers, history, hs.onScroll]);

  useEffect(() => {
    if (isAtBottomRef.current && onMarkRead && showReadReceipts) {
      const ids = unreadFromOthers();
      if (ids.length > 0) onMarkRead(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const unreadBeforeId = history && !searching ? history.unreadAnchorId : null;
  const rows = useMemo(() => buildRows(messages, unreadBeforeId), [messages, unreadBeforeId]);
  const typingText = formatTypingText(typingUsers, t);

  // Proactive suggestions (unchanged behaviour): only while the user can actually write.
  useEffect(() => {
    if (controls.composer !== "input" || !accessToken || !teamId || inputValue.length < 15 || inputValue.length > 200) {
      setProactiveSuggestion("");
      return;
    }
    if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current);
    suggestTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await getProactiveSuggestion({ teamId, message: inputValue, entityType: "team", entityId: teamId }, accessToken);
        if (res.text) setProactiveSuggestion((prev) => (res.text !== prev ? res.text : prev));
      } catch (err) {
        console.error("Proactive suggest error:", err);
      }
    }, 1500);
    return () => { if (suggestTimeoutRef.current) clearTimeout(suggestTimeoutRef.current); };
  }, [inputValue, teamId, accessToken, controls.composer]);

  const handleSend = (content?: string) => {
    setProactiveSuggestion("");
    onSend(content);
  };

  const rights = useMemo(
    () => ({
      canEditOwn: controls.canEditOwn, canDeleteOwn: controls.canDeleteOwn, canDeleteOthers: controls.canDeleteOthers,
      canPin: controls.canPin, canReply: controls.canReply, showReactions: controls.showReactions,
    }),
    [controls],
  );

  const pad = isMobile ? "px-2 py-2" : "px-3 py-3";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={isMobile && viewportHeight !== undefined ? { height: viewportHeight } : undefined}>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={roomName ? t("chat.logLabel", { roomName }) : t("chat.logLabelPlain")}
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${pad}`}
      >
        {loadError ? (
          <div role="alert" className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 rounded-2xl border-2 border-[var(--memphis-line)] p-6 text-center">
            {loadError === "forbidden" ? <ShieldOff className="h-8 w-8 text-muted-foreground" aria-hidden /> : <RefreshCw className="h-8 w-8 text-muted-foreground" aria-hidden />}
            <p className="text-sm font-semibold">{loadError === "forbidden" ? t("errors.noAccessTitle") : t("errors.messagesFailed")}</p>
            <p className="text-xs text-muted-foreground">{loadError === "forbidden" ? t("errors.noAccessHint") : t("errors.messagesFailedHint")}</p>
            {loadError === "failed" && onReload && (
              <button type="button" onClick={onReload} className="rounded-lg border-2 border-[var(--memphis-line)] px-3 py-1.5 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]">{t("errors.retry")}</button>
            )}
          </div>
        ) : (
          <div ref={contentRef}>
            {history && !searching && history.unreadAnchorId && history.unreadCount > 0 && <UnreadBanner h={history} t={t} />}

            {history && !searching && history.hasMoreBefore && !isLoading && (
              <>
                <div ref={hs.topSentinel} aria-hidden className="h-px" />
                <EdgeStatus edge="top" loading={history.loadingOlder} error={history.olderError} onLoad={history.onLoadOlder} t={t} />
              </>
            )}
            {history && !searching && !history.hasMoreBefore && !isLoading && messages.length > 0 && <StartOfConversation t={t} />}

            {isLoading && (
              <div className="flex justify-center py-8" role="status" aria-label={t("chat.loading")}>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
              </div>
            )}

            {!history && !isLoading && hasMore && !searching && (
              <div className="flex justify-center py-2">
                <button type="button" onClick={onLoadMore} className="rounded-md px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] motion-reduce:transition-none">
                  {t("chat.loadMore")}
                </button>
              </div>
            )}

            {!isLoading && messages.length === 0 && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-12 text-center text-muted-foreground">
                {searching ? <MessageSquare className="h-9 w-9 opacity-50" aria-hidden /> : channelType === "announcement" ? <Megaphone className="h-9 w-9 opacity-50" aria-hidden /> : <MessageSquare className="h-9 w-9 opacity-50" aria-hidden />}
                <p className="text-sm font-semibold text-foreground">{searching ? t("chat.searchEmptyTitle") : channelType === "announcement" ? t("chat.announcementEmptyTitle") : t("chat.emptyTitle")}</p>
                <p className="text-xs">{searching ? t("chat.searchEmptyHint") : controls.composer === "input" ? t("chat.noMessages") : t("chat.emptyReadOnly")}</p>
              </div>
            )}

            {rows.map((row) => {
              if (row.kind === "unread") return <UnreadDivider key={row.key} t={t} />;
              if (row.kind === "divider") {
                return (
                  <div key={row.key} className="flex items-center gap-2 py-3" role="separator" aria-label={row.label}>
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{row.label}</span>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                );
              }
              const msg = botUserIds && isUnmarkedBot(row.message, botUserIds) ? { ...row.message, user: { ...row.message.user!, isBot: true } } : row.message;
              const linkedCall = msg.callRef ? callsById.get(msg.callRef) : undefined;
              const replies = threadReplies?.get(msg.id);
              const replyTotal = Math.max(replies?.length ?? 0, msg.replyCount ?? 0);
              return (
                <RoomMessageItem
                  key={msg.id}
                  message={msg}
                  isOwn={msg.userId === currentUserId}
                  showAvatar={row.showAvatar}
                  onReact={(emoji) => onReact(msg.id, emoji)}
                  onViewTranscript={onViewTranscript}
                  linkedCall={linkedCall}
                  resolverContext={resolverContext}
                  availableTags={availableTags}
                  teamId={teamId}
                  currentUserId={currentUserId}
                  showReadReceipts={showReadReceipts}
                  onReply={controls.canReply ? onReply : undefined}
                  onOpenCopilot={onOpenCopilot}
                  onToolApproval={onToolApproval}
                  actions={messageActions(msg, currentUserId, rights)}
                  onEdit={onEditMessage ? (content) => onEditMessage(msg.id, content) : undefined}
                  onDelete={onDeleteMessage ? () => onDeleteMessage(msg.id) : undefined}
                  onTogglePin={onTogglePin ? (action) => onTogglePin(msg.id, action) : undefined}
                  pinCaps={pinCaps}
                  onOpenThread={onOpenThread ? () => onOpenThread(msg.id) : undefined}
                  bookmarked={bookmarkedIds?.has(msg.id) ?? false}
                  onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(msg) : undefined}
                  threadCount={replyTotal}
                  myRoleIds={myRoleIds}
                  myGroupIds={myGroupIds}
                  t={t}
                />
              );
            })}

            {ephemeral && ephemeral.length > 0 && onDismissEphemeral && <EphemeralList items={ephemeral} onDismiss={onDismissEphemeral} />}
            {history && !searching && history.hasMoreAfter && (
              <>
                <div ref={hs.bottomSentinel} aria-hidden className="h-px" />
                <EdgeStatus edge="bottom" loading={history.loadingNewer} error={history.newerError} onLoad={history.onLoadNewer} t={t} />
              </>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
      {history && !searching && !loadError && !hs.atBottom && messages.length > 0 && (
        <JumpToLatestButton count={newBelow} busy={history.jumping} onClick={() => (history.hasMoreAfter ? history.onGoToLatest() : hs.scrollToBottom())} t={t} />
      )}
      </div>

      <div className="min-h-[18px] shrink-0 px-4" aria-live="polite">
        {typingText && <span className="text-[11px] italic text-muted-foreground">{typingText}</span>}
      </div>

      {replyTo && controls.composer === "input" && (
        <div className={`${isMobile ? "mx-2" : "mx-4"} mb-2 flex items-center gap-3 rounded-xl border-2 border-[var(--memphis-line)] bg-muted/60 p-2 animate-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none`}>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t("chat.replyingTo", { name: replyTo.type === "ai" || replyTo.type === "ai_response" ? "AI Copilot" : (replyTo.user?.displayName || "User") })}
            </div>
            <div className="line-clamp-1 text-[11px] italic text-muted-foreground">{parseAiMarkup(replyTo.content).visibleText}</div>
          </div>
          <button type="button" onClick={() => onReply?.(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))]" aria-label={t("chat.cancelReply")} title={t("chat.cancelReply")}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {proactiveSuggestion && !replyTo && controls.composer === "input" && (
        <div className={`${isMobile ? "mx-2" : "mx-4"} group/ghost mb-2 flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2`}>
          <Sparkles className="h-3 w-3 text-violet-500" aria-hidden />
          <div className="min-w-0 flex-1 truncate text-[11px] font-medium italic text-violet-700/80 dark:text-violet-300/80">{proactiveSuggestion}</div>
          <button type="button" onClick={() => setProactiveSuggestion("")} className="rounded-md p-1 text-violet-400 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-ink))] md:opacity-0 md:group-hover/ghost:opacity-100 md:focus-visible:opacity-100" aria-label={t("chat.dismissSuggestion")}>
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}

      {modelSelector && (
        <div className={`${isMobile ? "mx-2" : "mx-4"} mb-2 flex items-center justify-end`}>{modelSelector}</div>
      )}

      <RoomInput
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        onTyping={onTyping}
        composer={isCheckingAccess ? "input" : controls.composer}
        disabled={Boolean(isCheckingAccess)}
        muteMinutesLeft={muteMinutesLeft}
        muteReason={muteReason}
        isAiRoom={isAiRoom}
        roomName={roomName}
        documents={documents}
        boards={boards}
        users={users}
        roles={roles}
        canMentionEveryone={controls.canMentionEveryone}
        commands={commands}
        rooms={rooms}
        transcripts={transcripts}
        activeCallId={activeCallId}
        onAiTrigger={onAiTrigger}
        replyTo={replyTo || undefined}
        teamId={teamId}
        t={t}
      />
    </div>
  );
}

/** A message from a bot user whose payload does not carry `isBot` yet. */
function isUnmarkedBot(message: RoomMessage, botUserIds: ReadonlySet<string>): boolean {
  return Boolean(message.user) && !message.user!.isBot && botUserIds.has(message.userId);
}
