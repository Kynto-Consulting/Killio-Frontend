import { useEffect, useCallback } from 'react';
import { useRealtime } from '@/components/providers/realtime-provider';
import { realtimeChannel } from '@/lib/realtime/channels';

export interface CreditsUpdateEvent {
  userId: string;
  credits: number;
  tokens: number;
  timestamp: string;
}

export function useTeamAiCreditsUpdate(
  teamId: string | null | undefined,
  onCreditsUsed?: (event: CreditsUpdateEvent) => void
) {
  const realtime = useRealtime();

  useEffect(() => {
    if (!teamId) return;

    const channel = realtime.getChannel(realtimeChannel.team(teamId));

    const handleCreditsUpdate = (msg: { name: string; data: unknown; clientId?: string }) => {
      if (msg.name !== 'agent.credits_used') return;
      
      const event = msg.data as CreditsUpdateEvent;
      onCreditsUsed?.(event);
    };

    channel.subscribe('agent.credits_used', handleCreditsUpdate);

    return () => {
      channel.unsubscribe('agent.credits_used', handleCreditsUpdate);
    };
  }, [teamId, realtime, onCreditsUsed]);
}
