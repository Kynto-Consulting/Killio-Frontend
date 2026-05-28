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

  const realtime = useRealtime();

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
      avatar_url: user.avatarUrl ?? user.avatar_url,
    }).then(updateMembers).catch(console.error);

    return () => {
      channel.presence.leave().catch(console.error);
      channel.presence.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, user?.id, realtime]);

  useEffect(() => {
    if (!documentId || !user?.id || !realtime) return;
    const channel = realtime.getChannel(realtimeChannel.document(documentId));
    channel.presence.update({
      displayName: user.displayName,
      email: user.email,
      avatar_url: user.avatarUrl ?? user.avatar_url,
    }).catch(() => {/* not yet entered — no-op */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.avatarUrl, user?.displayName]);

  return members;
}
