/**
 * @deprecated
 * PAR-01: This file is kept for backward compatibility only.
 *
 * All hooks have been migrated to use the IRealtimeProvider abstraction via
 * `useRealtime()` from `@/components/providers/realtime-provider`.
 *
 * If you still need a raw Ably client, use `createAblyProvider` from
 * `@/lib/realtime/ably-provider` and call `.getChannel()` on the result.
 *
 * This file will be removed in a future cleanup pass.
 */

import Ably from 'ably';

let client: Ably.Realtime | null = null;
let clientToken: string | null = null;

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** @deprecated Use createAblyProvider from @/lib/realtime/ably-provider instead */
export function getAblyClient(accessToken: string): Ably.Realtime {
  if (client && clientToken === accessToken) return client;

  client?.close();

  clientToken = accessToken;
  client = new Ably.Realtime({
    authCallback: async (_data, callback) => {
      try {
        const res = await fetch(`${API}/ably/auth`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Ably auth failed: ${res.status}`);
        const tokenRequest = await res.json();
        callback(null, tokenRequest);
      } catch (err) {
        callback((err as Error).message, null);
      }
    },
    autoConnect: true,
  });

  client.connection.on('failed', () => {
    console.error('[Ably] Connection failed — @deprecated: migrate to IRealtimeProvider');
  });

  return client;
}
