import { useEffect, useRef, useCallback } from 'react';
import { getAblyClient } from '@/lib/ably';

export type BoardEvent = {
  type: 'card.moved' | 'card.created' | 'card.updated' | 'board.updated';
  payload: Record<string, unknown>;
};

/**
 * Subscribe to realtime updates for a specific board.
 *
 * @param boardId   – the board to subscribe to (`board:{boardId}` channel)
 * @param onEvent   – callback fired on every incoming event
 *
 * Usage:
 *   useBoardRealtime(boardId, (evt) => refetch());
 */
export function useBoardRealtime(
  boardId: string | null | undefined,
  onEvent: (event: BoardEvent) => void,
  accessToken: string | null | undefined,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!boardId || !accessToken) return;

    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`board:${boardId}`);

    const eventsToSubscribe: BoardEvent['type'][] = [
      'card.moved',
      'card.created',
      'card.updated',
      'board.updated',
    ];

    eventsToSubscribe.forEach((eventName) => {
      channel.subscribe(eventName, (message) => {
        onEventRef.current({
          type: eventName,
          payload: message.data as Record<string, unknown>,
        });
      });
    });

    return () => {
      channel.unsubscribe();
      // Don't detach — the singleton Ably client reuses the channel
      // and detach() leaves it in a terminal state that blocks reattachment.
    };
  }, [boardId, accessToken]);
}
