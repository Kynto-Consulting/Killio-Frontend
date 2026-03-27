import { useEffect } from 'react';
import * as Ably from 'ably';
import { useSession } from '@/components/providers/session-provider';
import { getAblyClient } from '@/lib/ably';

export type DocumentEvent = {
  type: 'brick.created' | 'brick.updated' | 'brick.deleted' | 'brick.reordered' | 'document.updated';
  payload: any;
};

export function useDocumentRealtime(documentId: string, onEvent?: (event: DocumentEvent) => void) {
  const { user, accessToken } = useSession();

  useEffect(() => {
    if (!user || !accessToken || !documentId) return;

    const ably = getAblyClient(accessToken);
    const channelName = `document:${documentId}`;
    const channel = ably.channels.get(channelName);

    const subscription = (message: Ably.Message) => {
      if (onEvent) {
        onEvent({ type: message.name as DocumentEvent['type'], payload: message.data });
      }
    };

    channel.subscribe(subscription);

    return () => {
      channel.unsubscribe(subscription);
      // We don't detach channel immediately since other active hooks might use it.
    };
  }, [user, accessToken, documentId, onEvent]);
}
