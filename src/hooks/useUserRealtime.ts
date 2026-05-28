import { useEffect, useRef } from 'react';
import { useSession } from '@/components/providers/session-provider';
import { useRealtime } from '@/components/providers/realtime-provider';
import { realtimeChannel } from '@/lib/realtime/channels';
import type { MessageListener } from '@/lib/realtime/types';

export type UserEvent = {
  type: 'notification.created';
  payload: Record<string, any>;
};

export function useUserRealtime(onEvent?: (event: UserEvent) => void) {
  const { user } = useSession();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const realtime = useRealtime();

  useEffect(() => {
    if (!user || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.user(user.id));

    const listener: MessageListener = (message) => {
      onEventRef.current?.(message.data as UserEvent);
    };

    channel.subscribeAll(listener);

    return () => {
      try { channel.unsubscribeAll(listener); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, realtime]);
}
