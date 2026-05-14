import { useEffect, useRef } from 'react';
import { useRealtime } from '@/components/providers/realtime-provider';
import { realtimeChannel } from '@/lib/realtime/channels';
import type { MessageListener } from '@/lib/realtime/types';

export type BoardEvent = {
  type:
  | 'card.moved'
  | 'card.created'
  | 'card.updated'
  | 'card.assignee_added'
  | 'card.assignee_removed'
  | 'board.updated'
  | 'brick.created'
  | 'brick.updated'
  | 'brick.reordered'
  | 'brick.deleted'
  | 'board.commented'
  | 'mesh.state.updated'
  | 'mesh.brick.created'
  | 'mesh.brick.updated'
  | 'mesh.brick.deleted'
  | 'mesh.connection.created'
  | 'mesh.connection.updated'
  | 'mesh.connection.deleted';
  payload: Record<string, unknown>;
};

/**
 * Subscribe to realtime updates for a specific board.
 *
 * @param boardId   – the board to subscribe to (`board:{boardId}` channel)
 * @param onEvent   – callback fired on every incoming event
 * @param accessToken – kept for backward-compat signature; ignored (provider manages auth)
 *
 * Usage:
 *   useBoardRealtime(boardId, (evt) => refetch());
 */
export function useBoardRealtime(
  boardId: string | null | undefined,
  onEvent: (event: BoardEvent) => void,
  accessToken?: string | null | undefined,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  let realtime: ReturnType<typeof useRealtime> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    realtime = useRealtime();
  } catch {
    // Provider not mounted yet — no-op
  }

  useEffect(() => {
    if (!boardId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.board(boardId));

    const eventsToSubscribe: BoardEvent['type'][] = [
      'card.moved',
      'card.created',
      'card.updated',
      'card.assignee_added',
      'card.assignee_removed',
      'board.updated',
      'board.commented',
      'brick.created',
      'brick.updated',
      'brick.reordered',
      'brick.deleted',
      'mesh.state.updated',
      'mesh.brick.created',
      'mesh.brick.updated',
      'mesh.brick.deleted',
      'mesh.connection.created',
      'mesh.connection.updated',
      'mesh.connection.deleted',
    ];

    const listeners: Array<{ eventName: BoardEvent['type']; listener: MessageListener }> = [];

    eventsToSubscribe.forEach((eventName) => {
      const listener: MessageListener = (message) => {
        onEventRef.current({
          type: eventName,
          payload: (message.data ?? {}) as Record<string, unknown>,
        });
      };
      listeners.push({ eventName, listener });
      channel.subscribe(eventName, listener);
    });

    return () => {
      listeners.forEach(({ eventName, listener }) => {
        try { channel.unsubscribe(eventName, listener); } catch {}
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, realtime]);
}
