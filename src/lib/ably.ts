import Ably from 'ably';

let client: Ably.Realtime | null = null;

/**
 * Lazy singleton Ably Realtime client.
 * Authenticates via the Next.js proxy route `/api/ably-auth`
 * so the secret ABLY_API_KEY is never exposed to the browser.
 */
export function getAblyClient(): Ably.Realtime {
  if (client) return client;

  client = new Ably.Realtime({
    authUrl: '/api/ably-auth',
    autoConnect: true,
  });

  client.connection.on('failed', () => {
    console.error('[Ably] Connection failed');
  });

  return client;
}
