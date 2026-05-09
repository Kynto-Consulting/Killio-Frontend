"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getAblyClient } from "@/lib/ably";
import {
  listRoomMessages,
  sendRoomMessage,
  addReaction,
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

  // Initial load
  useEffect(() => {
    if (!roomId || !accessToken) return;
    setIsLoading(true);
    listRoomMessages(roomId, accessToken, 50)
      .then((msgs) => {
        setMessages(msgs.map((m) => ({ ...m, status: "sent" as MessageStatus })));
        setHasMore(msgs.length === 50);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [roomId, accessToken]);

  // Ably subscription
  useEffect(() => {
    if (!roomId || !accessToken) return;

    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`room:${roomId}`);

    const onMessage = (msg: any) => {
      const payload = msg.data as RoomMessage;
      setMessages((prev) => {
        // Replace any temp message with same content+userId within 10s
        // Also match AI messages with their bot- placeholders
        const tempIdx = prev.findIndex(
          (m) =>
            (m.id.startsWith("temp-") || m.id.startsWith("bot-")) &&
            (m.userId === payload.userId || (m.type === "ai" && payload.type === "ai")) &&
            m.content === payload.content &&
            Math.abs(new Date(m.createdAt).getTime() - new Date(payload.createdAt).getTime()) < 15_000
        );
        if (tempIdx !== -1) {
          const updated = [...prev];
          updated[tempIdx] = { ...payload, status: "sent" };
          return updated;
        }
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, { ...payload, status: "sent" }];
      });

      // Auto-publish delivered for messages from others
      if (payload.userId !== currentUser?.id && currentUser?.id) {
        channel.publish("room.message.delivered", {
          messageId: payload.id,
          userId: currentUser.id,
        }).catch(() => {});
      }
    };

    const onReaction = (msg: any) => {
      const { messageId, emoji, userId, action } = msg.data as {
        messageId: string;
        emoji: string;
        userId: string;
        action: "add" | "remove";
      };
      // Skip events from self — the optimistic update in handleAddReaction already handles them
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

    const onDelivered = (msg: any) => {
      const { messageId, userId } = msg.data as { messageId: string; userId: string };
      if (userId === currentUser?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          if (statusPriority(m.status) < statusPriority("delivered")) {
            return { ...m, status: "delivered" };
          }
          return m;
        })
      );
    };

    const onRead = (msg: any) => {
      const { messageIds, userId } = msg.data as { messageIds: string[]; userId: string };
      if (userId === currentUser?.id) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (!messageIds.includes(m.id)) return m;
          if (statusPriority(m.status) < statusPriority("read")) {
            return { ...m, status: "read" };
          }
          return m;
        })
      );
    };

    const onTypingStart = (msg: any) => {
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

    const onTypingStop = (msg: any) => {
      const { userId } = msg.data as { userId: string };
      const timer = typingTimers.current.get(userId);
      if (timer) {
        clearTimeout(timer);
        typingTimers.current.delete(userId);
      }
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    };

    channel.subscribe("room.message", onMessage);
    channel.subscribe("room.message.reaction", onReaction);
    channel.subscribe("room.message.delivered", onDelivered);
    channel.subscribe("room.message.read", onRead);
    channel.subscribe("room.typing.start", onTypingStart);
    channel.subscribe("room.typing.stop", onTypingStop);

    return () => {
      channel.unsubscribe("room.message", onMessage);
      channel.unsubscribe("room.message.reaction", onReaction);
      channel.unsubscribe("room.message.delivered", onDelivered);
      channel.unsubscribe("room.message.read", onRead);
      channel.unsubscribe("room.typing.start", onTypingStart);
      channel.unsubscribe("room.typing.stop", onTypingStop);
    };
  }, [roomId, accessToken, currentUser?.id]);

  const sendMessage = useCallback(
    async (content: string, metadata?: any) => {
      if (!roomId || !accessToken || !content.trim()) return;
      setIsSending(true);
      // Optimistic insert
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
        // Replace temp with real message (Ably may also deliver it, handled in onMessage)
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...real, status: "sent" } : m))
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
        );
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
      // Optimistic update
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
        // Revert on error — reload messages
        listRoomMessages(roomId, accessToken, 50).then((msgs) =>
          setMessages(msgs.map((msg) => ({ ...msg, status: "sent" as MessageStatus })))
        ).catch(() => {});
      }
    },
    [roomId, accessToken, currentUser]
  );

  const markAsRead = useCallback(
    (messageIds: string[]) => {
      if (!roomId || !accessToken || !currentUser?.id || messageIds.length === 0) return;
      const ably = getAblyClient(accessToken);
      const channel = ably.channels.get(`room:${roomId}`);
      channel.publish("room.message.read", { messageIds, userId: currentUser.id }).catch(() => {});
    },
    [roomId, accessToken, currentUser]
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!roomId || !accessToken) return;
      const ably = getAblyClient(accessToken);
      const channel = ably.channels.get(`room:${roomId}`);

      if (isTyping && !isTypingRef.current) {
        isTypingRef.current = true;
        const displayName =
          currentUser?.displayName ?? currentUser?.name ?? currentUser?.username ?? "Someone";
        channel
          .publish("room.typing.start", { userId: currentUser?.id ?? "", displayName })
          .catch(() => {});
      }

      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          channel.publish("room.typing.stop", { userId: currentUser?.id ?? "" }).catch(() => {});
        }
      }, 2000);

      if (!isTyping && isTypingRef.current) {
        if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
        isTypingRef.current = false;
        channel.publish("room.typing.stop", { userId: currentUser?.id ?? "" }).catch(() => {});
      }
    },
    [roomId, accessToken, currentUser]
  );

  const addLocalMessage = useCallback(
    (message: RoomMessage) => {
      setMessages((prev) => [...prev, message]);
    },
    []
  );

  const updateLocalMessage = useCallback(
    (id: string, updates: Partial<RoomMessage>) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    },
    []
  );

  const publishMessage = useCallback(
    async (message: RoomMessage) => {
      if (!roomId || !accessToken) return;
      const ably = getAblyClient(accessToken);
      const channel = ably.channels.get(`room:${roomId}`);
      await channel.publish("room.message", message).catch(console.error);
    },
    [roomId, accessToken]
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
    setTyping,
  };
}
