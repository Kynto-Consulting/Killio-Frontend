import { NextRequest, NextResponse } from 'next/server';

/**
 * Endpoint API para generar scripts con IA
 * Proxea las llamadas al backend de NestJS
 */
export async function POST(request: NextRequest) {
  try {
    const { userPrompt, teamId, systemPrompt, context } = await request.json();

    if (!userPrompt || !teamId) {
      return NextResponse.json(
        { error: 'Missing userPrompt or teamId' },
        { status: 400 }
      );
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_KILLIO_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:4000';

    const response = await fetch(`${backendUrl}/scripts/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({
        userPrompt,
        teamId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Backend error:', error);
      return NextResponse.json(
        { error: `Failed to generate script: ${response.statusText}` },
        { status: response.status }
      );
    }

    const generatedScript = await response.json();
    return NextResponse.json(generatedScript);
  } catch (error) {
    console.error('Error in script generation:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
