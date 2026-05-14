import { useEffect, useState } from 'react';
import { useRealtime } from '@/components/providers/realtime-provider';
import { realtimeChannel } from '@/lib/realtime/channels';
import type { PresenceMember } from '@/lib/realtime/types';

export type { PresenceMember };

export function useDocumentPresence(
  documentId: string | null | undefined,
  user: any,
  accessToken?: string | null | undefined,
) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  let realtime: ReturnType<typeof useRealtime> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    realtime = useRealtime();
  } catch {
    // Provider not mounted yet — no-op
  }

  useEffect(() => {
    if (!documentId || !user?.id || !realtime) return;

    const channel = realtime.getChannel(realtimeChannel.document(documentId));

    const updateMembers = async () => {
      try {
        const presenceSet = await channel.presence.get();
        const uniqueMembers = new Map<string, PresenceMember>();
        presenceSet.forEach((member) => {
          uniqueMembers.set(member.clientId, member);
        });
        setMembers(Array.from(uniqueMembers.values()));
      } catch (err) {
        console.error("Failed to get document presence", err);
      }
    };

    const handler = () => { updateMembers(); };

    channel.presence.subscribe(['enter', 'leave', 'update'], handler);

    channel.presence.enter({
      displayName: user.displayName,
      email: user.email,
      avatar_url: user.avatar_url,
    }).then(updateMembers).catch(console.error);

    return () => {
      channel.presence.leave().catch(console.error);
      channel.presence.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, user?.id, realtime]);

  return members;
}
