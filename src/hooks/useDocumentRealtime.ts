import { useEffect } from 'react';
import * as Ably from 'ably';
import { useSession } from '@/components/providers/session-provider';

let ablyInstance: Ably.Realtime | null = null;

function getAblyInstance(token: string) {
  if (!ablyInstance) {
    ablyInstance = new Ably.Realtime({
      authUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/ably/auth?token=${token}`,
    });
  }
  return ablyInstance;
}

export type DocumentEvent = {
  type: 'brick.created' | 'brick.updated' | 'brick.deleted' | 'brick.reordered' | 'document.updated';
  payload: any;
};

export function useDocumentRealtime(documentId: string, onEvent?: (event: DocumentEvent) => void) {
  const { user, accessToken } = useSession();

  useEffect(() => {
    if (!user || !accessToken || !documentId) return;

    const ably = getAblyInstance(accessToken);
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
