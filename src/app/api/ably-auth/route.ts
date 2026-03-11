import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';

/**
 * GET /api/ably-auth
 * Server-side proxy that issues short-lived Ably token requests.
 * The client never sees ABLY_API_KEY.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Ably not configured' }, { status: 503 });
  }

  try {
    const rest = new Ably.Rest({ key: apiKey });
    const tokenRequest = await rest.auth.createTokenRequest({
      capability: { '*': ['subscribe', 'publish', 'presence'] },
      ttl: 3600 * 1000, // 1 hour
    });
    return NextResponse.json(tokenRequest);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 });
  }
}
