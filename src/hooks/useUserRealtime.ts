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

export type UserEvent = {
  type: 'notification.created';
  payload: Record<string, any>;
};

export function useUserRealtime(onEvent?: (event: UserEvent) => void) {
  const { user, accessToken } = useSession();

  useEffect(() => {
    if (!user || !accessToken) return;

    const ably = getAblyInstance(accessToken);
    const channelName = `user:${user.id}`;
    const channel = ably.channels.get(channelName);

    const subscription = (message: Ably.Message) => {
      if (onEvent) {
        onEvent(message.data as UserEvent);
      }
    };

    channel.subscribe(subscription);

    return () => {
      channel.unsubscribe(subscription);
      // We don't detach channel immediately since other hooks might use it.
    };
  }, [user, accessToken, onEvent]);
}
