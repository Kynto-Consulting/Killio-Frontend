import { useEffect, useRef } from 'react';
import { useSession } from '@/components/providers/session-provider';
import { useRealtime } from '@/components/providers/realtime-provider';
import { realtimeChannel } from '@/lib/realtime/channels';
import type { MessageListener } from '@/lib/realtime/types';

export type TeamEvent = {
  type:
    | 'document.created'
    | 'document.updated'
    | 'folder.created'
    | 'folder.updated'
    | 'folder.deleted'
    | string;
  payload: any;
};

/**
 * Subscribes to the `team:<id>` channel so list views (documents/folders) update
 * live when other clients create/rename/delete documents or folders.
 */
export function useTeamRealtime(teamId: string | null | undefined, onEvent?: (event: TeamEvent) => void) {
  const { user } = useSession();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const realtime = useRealtime();

  useEffect(() => {
    if (!user || !teamId || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.team(teamId));

    const listener: MessageListener = (message) => {
      onEventRef.current?.({ type: message.name, payload: message.data });
    };

    channel.subscribeAll(listener);

    return () => {
      try { channel.unsubscribeAll(listener); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, teamId, realtime]);
}
