"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { IRealtimeChannel } from "@/lib/realtime/types";
import {
  listRoomMessages,
  sendRoomMessage,
  addReaction,
  editRoomMessage,
  deleteRoomMessage,
  pinRoomMessage,
  updateRoomPinExpiry,
  unpinRoomMessage,
  type PinResponse,
  markMessagesAsRead,
  markAllMessagesAsRead,
  threadRootOf,
  RoomMessage,
  MessageStatus,
} from "@/lib/api/rooms";
import { applyPinPatch, normalizePinEvent, patchesFromPinResponse, type PinBody, type PinPatch } from "@/lib/rooms/pins";
import { usePinExpiry } from "@/hooks/use-pin-expiry";

/** Event names the backend may use for the same fact; the first is the preferred one. */
const EDIT_EVENTS = ["room.message.edited", "room.message.updated"] as const;
const DELETE_EVENTS = ["room.message.deleted"] as const;
const PIN_EVENTS = ["room.message.pinned", "room.message.unpinned"] as const;

interface TypingUser {
  userId: string;
  displayName: string;
}

type CurrentUser = {
  id?: string;
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
};

function statusPriority(s?: MessageStatus): number {
  if (s === "read") return 4;
  if (s === "delivered") return 3;
  if (s === "sent") return 2;
  if (s === "sending") return 1;
  return 0;
}

export function useRoomChat(
  roomId: string | null | undefined,
  accessToken: string | null | undefined,
  currentUser?: CurrentUser | null,
  /** Creates the room on demand when there is none yet (lazy thread rooms: the first message creates it). */
  ensureRoom?: () => Promise<string | null>,
  /** Every pin change (realtime event or answer of this user's own request), for lists the hook does not own. */
  onPinPatch?: (patch: PinPatch) => void
) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const messagesRef = useRef<RoomMessage[]>([]);
  messagesRef.current = messages;
  const onPinPatchRef = useRef(onPinPatch);
  onPinPatchRef.current = onPinPatch;
  usePinExpiry(messages, setMessages);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const channelRef = useRef<IRealtimeChannel | null>(null);

  // Called unconditionally at top level to satisfy Rules of Hooks.
  // useRealtime() may return null when the provider is not yet mounted.
  const realtime = useRealtime();

  // Initial load (also re-run by `reload` after a failure)
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<"forbidden" | "failed" | null>(null);
  useEffect(() => {
    if (!roomId || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    listRoomMessages(roomId, accessToken, 50)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs); // Now msgs already have the correct status from backend
        setHasMore(msgs.length === 50);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setLoadError((err as { status?: number })?.status === 403 ? "forbidden" : "failed");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [roomId, accessToken, loadAttempt]);
  const reload = useCallback(() => setLoadAttempt((n) => n + 1), []);

  // Realtime subscription
  useEffect(() => {
    if (!roomId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.room(roomId));
    channelRef.current = channel;

    const onMessage = (msg: { name: string; data: unknown; clientId?: string }) => {
      const raw = msg.data as RoomMessage;
      const root = threadRootOf(raw as RoomMessage & { thread_root_id?: string });
      const payload: RoomMessage = root && !raw.threadRootId ? { ...raw, threadRootId: root } : raw;
      setMessages((prev) => {
        const nonceId = (payload.metadata as any)?.localBotId;
        if (nonceId) {
          const nonceIdx = prev.findIndex((m) => m.id === nonceId);
          if (nonceIdx !== -1) {
            const existing = prev[nonceIdx];
            const updated = [...prev];
            updated[nonceIdx] = {
              ...payload,
              status: "sent",
              user: payload.user
                ? { ...payload.user, avatarUrl: payload.user.avatarUrl ?? existing.user?.avatarUrl }
                : existing.user,
            };
            return updated;
          }
        }

        const tempIdx = prev.findIndex(
          (m) =>
            (m.id.startsWith("temp-") || m.id.startsWith("bot-")) &&
            (m.userId === payload.userId || (m.type === "ai" && payload.type === "ai")) &&
            Math.abs(new Date(m.createdAt).getTime() - new Date(payload.createdAt).getTime()) < 30_000
        );
        if (tempIdx !== -1) {
          const existing = prev[tempIdx];
          const updated = [...prev];
          updated[tempIdx] = {
            ...payload,
            status: "sent",
            user: payload.user
              ? { ...payload.user, avatarUrl: payload.user.avatarUrl ?? existing.user?.avatarUrl }
              : existing.user,
          };
          return updated;
        }

        const existingIdx = prev.findIndex((m) => m.id === payload.id);
        if (existingIdx !== -1) {
          const existing = prev[existingIdx];
          const updated = [...prev];
          updated[existingIdx] = {
            ...payload,
            status: "sent",
            user: payload.user
              ? { ...payload.user, avatarUrl: payload.user.avatarUrl ?? existing.user?.avatarUrl }
              : existing.user,
          };
          return updated;
        }

        return [...prev, { ...payload, status: "sent" }];
      });

      if (payload.userId !== currentUser?.id && currentUser?.id) {
        channel.publish("room.message.delivered", {
          messageId: payload.id,
          userId: currentUser.id,
        }).catch(() => {});
      }
    };

    const onReaction = (msg: { name: string; data: unknown }) => {
      const { messageId, emoji, userId, action, reactions: fullMap } = msg.data as {
        messageId: string;
        emoji: string;
        userId: string;
        action: "add" | "remove";
        /** The backend sends the resulting map of the message: the most reliable thing to show. */
        reactions?: Record<string, string[]>;
      };
      if (userId === currentUser?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          if (fullMap && typeof fullMap === "object" && !Array.isArray(fullMap)) return { ...m, reactions: fullMap };
          const reactions = { ...(m.reactions ?? {}) };
          const users = [...(reactions[emoji] ?? [])];
          if (action === "add" && !users.includes(userId)) {
            reactions[emoji] = [...users, userId];
          } else if (action === "remove") {
            reactions[emoji] = users.filter((u) => u !== userId);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          }
          return { ...m, reactions };
        })
      );
    };

    const onDelivered = (msg: { name: string; data: unknown }) => {
      const { messageId, userId } = msg.data as { messageId: string; userId: string };
      if (userId === currentUser?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          if (statusPriority(m.status) < statusPriority("delivered")) return { ...m, status: "delivered" };
          return m;
        })
      );
    };

    const onRead = (msg: { name: string; data: unknown }) => {
      const { messageIds, userId } = msg.data as { messageIds: string[]; userId: string };
      if (userId === currentUser?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (!messageIds.includes(m.id)) return m;
          if (statusPriority(m.status) < statusPriority("read")) return { ...m, status: "read" };
          return m;
        })
      );
    };

    const onTypingStart = (msg: { name: string; data: unknown }) => {
      const { userId, displayName } = msg.data as TypingUser;
      if (!userId || userId === currentUser?.id) return;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === userId)) return prev;
        return [...prev, { userId, displayName }];
      });
      const existing = typingTimers.current.get(userId);
      if (existing) clearTimeout(existing);
      typingTimers.current.set(
        userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
          typingTimers.current.delete(userId);
        }, 4000)
      );
    };

    const onTypingStop = (msg: { name: string; data: unknown }) => {
      const { userId } = msg.data as { userId: string };
      const timer = typingTimers.current.get(userId);
      if (timer) { clearTimeout(timer); typingTimers.current.delete(userId); }
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    };

    // Edits and pins: the backend sends the changed message (or at least its id and the changed fields).
    const onEdited = (msg: { name: string; data: unknown }) => {
      const d = (msg.data ?? {}) as Partial<RoomMessage> & { messageId?: string };
      const id = d.id ?? d.messageId;
      if (!id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          return {
            ...m,
            content: typeof d.content === "string" ? d.content : m.content,
            editedAt: d.editedAt ?? new Date().toISOString(),
            ...(d.metadata ? { metadata: d.metadata } : {}),
          };
        })
      );
    };

    const onDeleted = (msg: { name: string; data: unknown }) => {
      const d = (msg.data ?? {}) as { id?: string; messageId?: string };
      const id = d.id ?? d.messageId;
      if (!id) return;
      setMessages((prev) => prev.filter((m) => m.id !== id));
    };

    const onPinChanged = (msg: { name: string; data: unknown }) => {
      // pinned (also when only the expiry changes) and unpinned (manual, expired or replaced).
      const patch = normalizePinEvent(msg.name, msg.data);
      if (!patch) return;
      setMessages((prev) => applyPinPatch(prev, patch));
      onPinPatchRef.current?.(patch);
    };

    channel.subscribe("room.message", onMessage);
    EDIT_EVENTS.forEach((e) => channel.subscribe(e, onEdited));
    DELETE_EVENTS.forEach((e) => channel.subscribe(e, onDeleted));
    PIN_EVENTS.forEach((e) => channel.subscribe(e, onPinChanged));
    channel.subscribe("room.message.reaction", onReaction);
    channel.subscribe("room.message.delivered", onDelivered);
    channel.subscribe("room.message.read", onRead);
    channel.subscribe("room.typing.start", onTypingStart);
    channel.subscribe("room.typing.stop", onTypingStop);

    return () => {
      try { channel.unsubscribe("room.message", onMessage); } catch {}
      EDIT_EVENTS.forEach((e) => { try { channel.unsubscribe(e, onEdited); } catch {} });
      DELETE_EVENTS.forEach((e) => { try { channel.unsubscribe(e, onDeleted); } catch {} });
      PIN_EVENTS.forEach((e) => { try { channel.unsubscribe(e, onPinChanged); } catch {} });
      try { channel.unsubscribe("room.message.reaction", onReaction); } catch {}
      try { channel.unsubscribe("room.message.delivered", onDelivered); } catch {}
      try { channel.unsubscribe("room.message.read", onRead); } catch {}
      try { channel.unsubscribe("room.typing.start", onTypingStart); } catch {}
      try { channel.unsubscribe("room.typing.stop", onTypingStop); } catch {}
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, realtime, currentUser?.id]);

  const sendMessage = useCallback(
    async (content: string, metadata?: any, threadRootId?: string) => {
      if (!accessToken || !content.trim()) return;
      const targetRoomId = roomId ?? (ensureRoom ? await ensureRoom() : null);
      if (!targetRoomId) return;
      setIsSending(true);
      const tempId = `temp-${Date.now()}`;
      const optimistic: RoomMessage = {
        id: tempId,
        roomId: targetRoomId,
        userId: currentUser?.id ?? "",
        content,
        type: "text",
        metadata: threadRootId ? { ...(metadata ?? {}), threadRootId } : metadata,
        threadRootId,
        createdAt: new Date().toISOString(),
        status: "sending",
        user: {
          displayName: currentUser?.displayName ?? currentUser?.name ?? currentUser?.username ?? "You",
          email: "",
          avatarUrl: currentUser?.avatarUrl ?? undefined,
        },
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        const real = await sendRoomMessage(targetRoomId, content, accessToken, metadata, threadRootId);
        setMessages((prev) => {
          // A first message may create the room: the reload that follows can drop the optimistic row.
          if (!prev.some((m) => m.id === tempId)) {
            return prev.some((m) => m.id === real.id) ? prev : [...prev, { ...real, status: "sent" }];
          }
          return prev.map((m) => {
            if (m.id !== tempId) return m;
            return {
              ...real,
              status: "sent",
              user: real.user
                ? { ...real.user, avatarUrl: real.user.avatarUrl ?? m.user?.avatarUrl }
                : m.user,
            };
          });
        });
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
      } finally {
        setIsSending(false);
      }
    },
    [roomId, accessToken, currentUser, ensureRoom]
  );

  const loadMore = useCallback(async () => {
    if (!roomId || !accessToken || messages.length === 0) return;
    const oldest = messages[0].createdAt;
    try {
      const older = await listRoomMessages(roomId, accessToken, 50, oldest);
      setMessages((prev) => [
        ...older.map((m) => ({ ...m, status: "sent" as MessageStatus })),
        ...prev,
      ]);
      setHasMore(older.length === 50);
    } catch (e) {
      console.error(e);
    }
  }, [roomId, accessToken, messages]);

  const handleAddReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!roomId || !accessToken || !currentUser?.id) return;
      const current = messagesRef.current.find((m) => m.id === messageId);
      const action: "add" | "remove" = (current?.reactions?.[emoji] ?? []).includes(currentUser.id) ? "remove" : "add";
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m.reactions ?? {}) };
          const users = [...(reactions[emoji] ?? [])];
          if (action === "add") {
            if (!users.includes(currentUser.id!)) reactions[emoji] = [...users, currentUser.id!];
          } else {
            reactions[emoji] = users.filter((u) => u !== currentUser.id);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          }
          return { ...m, reactions };
        })
      );
      try {
        // The server publishes `room.message.reaction` (with the resulting map), which is what the others receive.
        await addReaction(roomId, messageId, emoji, accessToken, action);
      } catch (e) {
        console.error(e);
        listRoomMessages(roomId, accessToken, 50).then((msgs) =>
          setMessages(msgs.map((msg) => ({ ...msg, status: "sent" as MessageStatus })))
        ).catch(() => {});
      }
    },
    [roomId, accessToken, currentUser]
  );

  const markAsRead = useCallback(
    (messageIds: string[]) => {
      if (!roomId || !currentUser?.id || messageIds.length === 0 || !accessToken) return;
      const ch = channelRef.current;
      if (!ch) return;
      // Persist to DB via API
      markMessagesAsRead(roomId, messageIds, accessToken).catch(console.error);
      // Publish to Ably is now handled by the backend service for consistency,
      // but we could also do it here for zero-latency if needed.
    },
    [roomId, currentUser, accessToken]
  );

  const markAllAsRead = useCallback(async () => {
    if (!roomId || !accessToken) return;
    try {
      await markAllMessagesAsRead(roomId, accessToken);
      setMessages(prev => prev.map(m => ({ ...m, status: 'read' })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [roomId, accessToken]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!roomId) return;
      const ch = channelRef.current;
      if (!ch) return;

      if (isTyping && !isTypingRef.current) {
        isTypingRef.current = true;
        const displayName =
          currentUser?.displayName ?? currentUser?.name ?? currentUser?.username ?? "Someone";
        ch.publish("room.typing.start", { userId: currentUser?.id ?? "", displayName }).catch(() => {});
      }

      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          ch.publish("room.typing.stop", { userId: currentUser?.id ?? "" }).catch(() => {});
        }
      }, 2000);

      if (!isTyping && isTypingRef.current) {
        if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
        isTypingRef.current = false;
        ch.publish("room.typing.stop", { userId: currentUser?.id ?? "" }).catch(() => {});
      }
    },
    [roomId, currentUser]
  );

  /** Edit your own message: shown at once, restored when the server refuses. Throws so the caller can explain. */
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!roomId || !accessToken) return;
      const trimmed = content.trim();
      const before = messagesRef.current.find((m) => m.id === messageId);
      if (!before || !trimmed || trimmed === before.content) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: trimmed, editedAt: new Date().toISOString() } : m)));
      try {
        const updated = await editRoomMessage(roomId, messageId, trimmed, accessToken);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: updated.content ?? trimmed, editedAt: updated.editedAt ?? m.editedAt } : m)));
      } catch (e) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: before.content, editedAt: before.editedAt } : m)));
        throw e;
      }
    },
    [roomId, accessToken]
  );

  /** Delete a message (own, or any with the manage-messages right). Removed at once, put back when refused. */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!roomId || !accessToken) return;
      const index = messagesRef.current.findIndex((m) => m.id === messageId);
      const before = messagesRef.current[index];
      if (!before) return;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      try {
        await deleteRoomMessage(roomId, messageId, accessToken);
      } catch (e) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) return prev;
          const next = [...prev, before];
          return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
        throw e;
      }
    },
    [roomId, accessToken]
  );

  const applyPinResponse = useCallback((dto: PinResponse, messageId: string) => {
    for (const patch of patchesFromPinResponse(dto, messageId)) {
      setMessages((prev) => applyPinPatch(prev, patch));
      onPinPatchRef.current?.(patch);
    }
  }, []);

  /** Pins (PUT) or, with `change`, changes the expiry of a pin in force (PATCH). Errors are thrown for the UI to explain. */
  const pinMessage = useCallback(
    async (messageId: string, body?: PinBody, change = false): Promise<PinResponse | undefined> => {
      if (!roomId || !accessToken) return undefined;
      const dto = change && body ? await updateRoomPinExpiry(roomId, messageId, accessToken, body) : await pinRoomMessage(roomId, messageId, accessToken, body);
      applyPinResponse(dto, messageId);
      return dto;
    },
    [roomId, accessToken, applyPinResponse]
  );

  const unpinMessage = useCallback(
    async (messageId: string) => {
      if (!roomId || !accessToken) return;
      const before = messagesRef.current.find((m) => m.id === messageId);
      if (before) setMessages((prev) => applyPinPatch(prev, { messageId, pinned: false, reason: "manual" }));
      try {
        const dto = await unpinRoomMessage(roomId, messageId, accessToken);
        applyPinResponse({ ...dto, pinned: false, pinnedAt: null } as PinResponse, messageId);
      } catch (e) {
        if (before) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pinnedAt: before.pinnedAt ?? null, pinnedBy: before.pinnedBy ?? null, pinExpiresAt: before.pinExpiresAt ?? null } : m)));
        throw e;
      }
    },
    [roomId, accessToken, applyPinResponse]
  );

  /** Adds messages that are not loaded yet (a thread's replies), keeping the list ordered; known ids are left as they are. */
  const mergeMessages = useCallback((incoming: RoomMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id)).map((m) => ({ ...m, status: "sent" as MessageStatus }));
      return fresh.length === 0 ? prev : [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const addLocalMessage = useCallback((message: RoomMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateLocalMessage = useCallback((id: string, updates: Partial<RoomMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const publishMessage = useCallback(
    async (message: RoomMessage) => {
      const ch = channelRef.current;
      if (!ch) return;
      await ch.publish("room.message", message).catch(console.error);
    },
    []
  );

  return {
    messages,
    isLoading,
    isSending,
    hasMore,
    typingUsers,
    sendMessage,
    addLocalMessage,
    updateLocalMessage,
    publishMessage,
    loadMore,
    addReaction: handleAddReaction,
    editMessage,
    deleteMessage,
    pinMessage,
    unpinMessage,
    mergeMessages,
    loadError,
    reload,
    markAsRead,
    markAllAsRead,
    setTyping,
  };
}
