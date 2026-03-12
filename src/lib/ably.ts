import Ably from 'ably';

let client: Ably.Realtime | null = null;
let clientToken: string | null = null;

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Lazy singleton Ably Realtime client.
 * Uses authCallback so the Bearer access token can be sent to the backend
 * /ably/auth endpoint, which embeds the userId as clientId in the Ably token.
 */
export function getAblyClient(accessToken: string): Ably.Realtime {
  // Re-create client if the token changed (e.g. after re-login)
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
    console.error('[Ably] Connection failed');
  });

  return client;
}
