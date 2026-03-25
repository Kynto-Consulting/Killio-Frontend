import { useEffect, useState } from 'react';
import { getAblyClient } from '@/lib/ably';

export type PresenceMember = {
  clientId: string;
  data: {
    displayName: string;
    email: string;
    avatar_url?: string | null;
  };
};

export function useDocumentPresence(documentId: string | null | undefined, user: any, accessToken: string | null | undefined) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!documentId || !user?.id || !accessToken) return;

    const ably = getAblyClient(accessToken);
    const channel = ably.channels.get(`document:${documentId}`);

    const updateMembers = async () => {
      try {
        const presenceSet = await channel.presence.get();
        const uniqueMembers = new Map<string, PresenceMember>();
        presenceSet.forEach((member: any) => {
          uniqueMembers.set(member.clientId, member as unknown as PresenceMember);
        });
        setMembers(Array.from(uniqueMembers.values()));
      } catch (err) {
        console.error("Failed to get Ably doc presence", err);
      }
    };

    channel.presence.subscribe('enter', updateMembers);
    channel.presence.subscribe('leave', updateMembers);
    channel.presence.subscribe('update', updateMembers);

    channel.presence.enter({
      displayName: user.displayName,
      email: user.email,
      avatar_url: user.avatar_url,
    }).then(updateMembers).catch(console.error);

    return () => {
      channel.presence.leave().catch(console.error);
      channel.presence.unsubscribe();
    };
  }, [documentId, user?.id, accessToken]);

  return members;
}
