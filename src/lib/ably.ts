import Ably from 'ably';

let client: Ably.Realtime | null = null;
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Lazy singleton Ably Realtime client.
 * Authenticates via the backend proxy route `/ably/auth`
 * so the secret ABLY_API_KEY is never exposed to the browser.
 */
export function getAblyClient(): Ably.Realtime {
  if (client) return client;

  client = new Ably.Realtime({
    authUrl: `${API}/ably/auth`,
    autoConnect: true,
  });

  client.connection.on('failed', () => {
    console.error('[Ably] Connection failed');
  });

  return client;
}
