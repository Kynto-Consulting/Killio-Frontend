"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import type { IRealtimeChannel } from "@/lib/realtime/types";
import {
  listRoomMessages,
  sendRoomMessage,
  addReaction,
  markMessagesAsRead,
  markAllMessagesAsRead,
  RoomMessage,
  MessageStatus,
} from "@/lib/api/rooms";

interface TypingUser {
  userId: string;
  displayName: string;
}

type CurrentUser = {
  id?: string;
  displayName?: string | null;
  name?: string | null;
  username?: string | null;
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
  currentUser?: CurrentUser | null
) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const channelRef = useRef<IRealtimeChannel | null>(null);

  let realtime: ReturnType<typeof useRealtime> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    realtime = useRealtime();
  } catch {
    // Provider not mounted yet — no-op
  }

  // Initial load
  useEffect(() => {
    if (!roomId || !accessToken) return;
    setIsLoading(true);
    listRoomMessages(roomId, accessToken, 50)
      .then((msgs) => {
        setMessages(msgs); // Now msgs already have the correct status from backend
        setHasMore(msgs.length === 50);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [roomId, accessToken]);

  // Realtime subscription
  useEffect(() => {
    if (!roomId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.room(roomId));
    channelRef.current = channel;

    const onMessage = (msg: { name: string; data: unknown; clientId?: string }) => {
      const payload = msg.data as RoomMessage;
      setMessages((prev) => {
        const nonceId = (payload.metadata as any)?.localBotId;
        if (nonceId) {
          const nonceIdx = prev.findIndex((m) => m.id === nonceId);
          if (nonceIdx !== -1) {
            const updated = [...prev];
            updated[nonceIdx] = { ...payload, status: "sent" };
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
          const updated = [...prev];
          updated[tempIdx] = { ...payload, status: "sent" };
          return updated;
        }

        const existingIdx = prev.findIndex((m) => m.id === payload.id);
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = { ...payload, status: "sent" };
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
      const { messageId, emoji, userId, action } = msg.data as {
        messageId: string;
        emoji: string;
        userId: string;
        action: "add" | "remove";
      };
      if (userId === currentUser?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
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

    channel.subscribe("room.message", onMessage);
    channel.subscribe("room.message.reaction", onReaction);
    channel.subscribe("room.message.delivered", onDelivered);
    channel.subscribe("room.message.read", onRead);
    channel.subscribe("room.typing.start", onTypingStart);
    channel.subscribe("room.typing.stop", onTypingStop);

    return () => {
      try { channel.unsubscribe("room.message", onMessage); } catch {}
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
    async (content: string, metadata?: any) => {
      if (!roomId || !accessToken || !content.trim()) return;
      setIsSending(true);
      const tempId = `temp-${Date.now()}`;
      const optimistic: RoomMessage = {
        id: tempId,
        roomId,
        userId: currentUser?.id ?? "",
        content,
        type: "text",
        metadata,
        createdAt: new Date().toISOString(),
        status: "sending",
        user: {
          displayName: currentUser?.displayName ?? currentUser?.name ?? currentUser?.username ?? "You",
          email: "",
        },
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        const real = await sendRoomMessage(roomId, content, accessToken, metadata);
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...real, status: "sent" } : m)));
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
      } finally {
        setIsSending(false);
      }
    },
    [roomId, accessToken, currentUser]
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
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m.reactions ?? {}) };
          const users = [...(reactions[emoji] ?? [])];
          if (!users.includes(currentUser.id!)) {
            reactions[emoji] = [...users, currentUser.id!];
          } else {
            reactions[emoji] = users.filter((u) => u !== currentUser.id);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          }
          return { ...m, reactions };
        })
      );
      try {
        await addReaction(roomId, messageId, emoji, accessToken);
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
    markAsRead,
    markAllAsRead,
    setTyping,
  };
}
