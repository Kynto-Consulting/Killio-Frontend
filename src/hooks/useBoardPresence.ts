import { useEffect, useState } from 'react';
import { getAblyClient } from '@/lib/ably';

export type PresenceMember = {
  clientId: string;
  data: {
    displayName: string;
    email: string;
    avatarColor?: string;
  };
};

export function useBoardPresence(boardId: string | null | undefined, user: any) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!boardId || !user?.id) return;

    const ably = getAblyClient();
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

    // Enter presence identifying by user.id
    channel.presence.enterClient(user.id, {
      displayName: user.displayName,
      email: user.email,
    }).then(updateMembers).catch(console.error);

    return () => {
      channel.presence.leaveClient(user.id).catch(console.error);
      channel.presence.unsubscribe();
    };
  }, [boardId, user?.id]);

  return members;
}
