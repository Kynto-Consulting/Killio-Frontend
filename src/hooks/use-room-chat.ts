"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getAblyClient } from "@/lib/ably";
import {
  listRoomMessages,
  sendRoomMessage,
  addReaction,
  RoomMessage,
} from "@/lib/api/rooms";

interface TypingUser {
  userId: string;
  displayName: string;
}

export function useRoomChat(
  roomId: string | null | undefined,
  accessToken: string | null | undefined,
  currentUser?: { id?: string; displayName?: string | null; name?: string | null; username?: string | null } | null
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
        setMessages(msgs);
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
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [...prev, payload];
      });
    };

    const onReaction = (msg: any) => {
      const { messageId, emoji, userId, action } = msg.data as {
        messageId: string;
        emoji: string;
        userId: string;
        action: "add" | "remove";
      };
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

    const onTypingStart = (msg: any) => {
      const { userId, displayName } = msg.data as TypingUser;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === userId)) return prev;
        return [...prev, { userId, displayName }];
      });
      // Auto-clear after 4s
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
    channel.subscribe("room.typing.start", onTypingStart);
    channel.subscribe("room.typing.stop", onTypingStop);

    return () => {
      channel.unsubscribe("room.message", onMessage);
      channel.unsubscribe("room.message.reaction", onReaction);
      channel.unsubscribe("room.typing.start", onTypingStart);
      channel.unsubscribe("room.typing.stop", onTypingStop);
    };
  }, [roomId, accessToken]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomId || !accessToken || !content.trim()) return;
      setIsSending(true);
      try {
        await sendRoomMessage(roomId, content, accessToken);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSending(false);
      }
    },
    [roomId, accessToken]
  );

  const loadMore = useCallback(async () => {
    if (!roomId || !accessToken || messages.length === 0) return;
    const oldest = messages[0].createdAt;
    try {
      const older = await listRoomMessages(roomId, accessToken, 50, oldest);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === 50);
    } catch (e) {
      console.error(e);
    }
  }, [roomId, accessToken, messages]);

  const handleAddReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!roomId || !accessToken) return;
      try {
        await addReaction(roomId, messageId, emoji, accessToken);
      } catch (e) {
        console.error(e);
      }
    },
    [roomId, accessToken]
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!roomId || !accessToken) return;
      const ably = getAblyClient(accessToken);
      const channel = ably.channels.get(`room:${roomId}`);

      if (isTyping && !isTypingRef.current) {
        isTypingRef.current = true;
        const displayName = currentUser?.displayName ?? currentUser?.name ?? currentUser?.username ?? "Someone";
        channel.publish("room.typing.start", { userId: currentUser?.id ?? "", displayName }).catch(() => {});
      }

      // Auto-stop after 2s of no keystrokes
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      typingStopTimer.current = setTimeout(() => {
        if (isTypingRef.current) {
          isTypingRef.current = false;
          channel.publish("room.typing.stop", {}).catch(() => {});
        }
      }, 2000);

      if (!isTyping && isTypingRef.current) {
        if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
        isTypingRef.current = false;
        channel.publish("room.typing.stop", {}).catch(() => {});
      }
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
    loadMore,
    addReaction: handleAddReaction,
    setTyping,
  };
}
