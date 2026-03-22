import { useEffect, useState } from 'react';
import { getAblyClient } from '@/lib/ably';

export type PresenceMember = {
  clientId: string;
  data: {
    displayName: string;
    email: string;
   avatar_url?: string | null;
    avatarColor?: string;
  };
};

export function useBoardPresence(boardId: string | null | undefined, user: any, accessToken: string | null | undefined) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!boardId || !user?.id || !accessToken) return;

    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`board:${boardId}`);

    const updateMembers = async () => {
      try {
        const presenceSet = await channel.presence.get();
        // Remove duplicates if the same user drops and reconnects quickly
        const uniqueMembers = new Map<string, PresenceMember>();
        presenceSet.forEach((member: any) => {
          uniqueMembers.set(member.clientId, member as unknown as PresenceMember);
        });
        setMembers(Array.from(uniqueMembers.values()));
      } catch (err) {
        console.error("Failed to get Ably presence", err);
      }
    };

    channel.presence.subscribe('enter', updateMembers);
    channel.presence.subscribe('leave', updateMembers);
    channel.presence.subscribe('update', updateMembers);

    // Enter presence — clientId comes from the Ably token (= user.id)
    channel.presence.enter({
      displayName: user.displayName,
      email: user.email,
     avatar_url: user.avatar_url,
    }).then(updateMembers).catch(console.error);

    return () => {
      channel.presence.leave().catch(console.error);
      channel.presence.unsubscribe();
    };
  }, [boardId, user?.id, accessToken]);

  return members;
}
