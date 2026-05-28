import { useEffect, useRef } from 'react';
import { useSession } from '@/components/providers/session-provider';
import { useRealtime } from '@/components/providers/realtime-provider';
import { realtimeChannel } from '@/lib/realtime/channels';
import type { MessageListener } from '@/lib/realtime/types';

export type DocumentEvent = {
  type: 'brick.created' | 'brick.updated' | 'brick.deleted' | 'brick.reordered' | 'document.updated';
  payload: any;
};

export function useDocumentRealtime(documentId: string, onEvent?: (event: DocumentEvent) => void) {
  const { user } = useSession();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const realtime = useRealtime();

  useEffect(() => {
    if (!user || !documentId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.document(documentId));

    const listener: MessageListener = (message) => {
      onEventRef.current?.({
        type: message.name as DocumentEvent['type'],
        payload: message.data,
      });
    };

    channel.subscribeAll(listener);

    return () => {
      try { channel.unsubscribeAll(listener); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, documentId, realtime]);
}
