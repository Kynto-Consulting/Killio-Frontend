const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export type AgentEntityScope = 'board' | 'document' | 'mesh' | 'script' | 'team';

export interface AgentConversation {
  id: string;
  teamId: string;
  userId: string;
  entityType: string | null;
  entityId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentStreamEvent =
  | { type: 'tool_start'; tool: string; input?: Record<string, unknown> }
  | { type: 'tool_done'; tool: string; success: boolean; durationMs: number }
  | { type: 'tool_approval_request'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; data: Record<string, unknown> }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; conversationId: string; toolsUsed: string[] }
  | { type: 'error'; message: string };

/**
 * Streams an agentic chat response from the new /agent/chat/stream endpoint.
 * Returns a cancel function.
 */
export function streamAgentChat(
  body: {
    conversationId?: string;
    entityType?: AgentEntityScope;
    entityId?: string;
    teamId: string;
    message: string;
    approvalDecision?: 'approved' | 'rejected';
    approvalToolCall?: { name: string; input: any };
  },
  accessToken: string,
  onEvent: (event: AgentStreamEvent) => void,
): () => void {
  const ctrl = new AbortController();
  const url = `${API_BASE_URL}/agent/chat/stream`;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ type: 'error', message: `Agent stream failed (${res.status})` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line) as AgentStreamEvent;
            onEvent(event);
          } catch {}
        }
      }
    })
    .catch((err) => {
      if (err?.name !== 'AbortError') {
        onEvent({ type: 'error', message: err?.message ?? 'Stream error' });
      }
    });

  return () => ctrl.abort();
}

export async function listAgentConversations(
  teamId: string,
  accessToken: string,
): Promise<AgentConversation[]> {
  const res = await fetch(`${API_BASE_URL}/agent/conversations?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  return res.json();
}
export async function getAgentMessages(
  conversationId: string,
  accessToken: string,
): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/agent/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  return res.json();
}
