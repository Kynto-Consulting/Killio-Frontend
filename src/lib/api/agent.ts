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
  | { type: 'tool_start'; id?: string; tool: string; input?: Record<string, unknown> }
  | { type: 'tool_done'; id?: string; tool: string; success: boolean; durationMs: number; input?: Record<string, unknown>; output?: Record<string, unknown> }
  | { type: 'tool_approval_request'; id?: string; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id?: string; tool: string; data: Record<string, unknown>; success?: boolean; durationMs?: number }
  | { type: 'delta'; text: string }
  | { 
      type: 'done'; 
      text: string; 
      conversationId: string; 
      messageId?: string;
      toolsUsed: string[];
      toolExecution?: Array<{
        toolName: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        success: boolean;
        durationMs: number;
        durationSeconds: string;
        phase: string;
        timestamp: string;
      }>;
      billedTokens?: number;
      billedCredits?: number;
      modelUsed?: string;
    }
  | { type: 'error'; message: string };

export interface AgentToolManifestEntry {
  name: string;
  category: string;
  description: string;
  tags: string[];
  /** Cannot be disabled — backend re-adds it to the allowlist regardless. */
  required?: boolean;
}

export interface AgentVfsFile {
  path: string;
  name: string;
  kind: "kd" | "kb" | "km" | "ks";
  size: number;
  content: string;
  folder: string | null;
}

export interface AgentVfsFolderMeta {
  name: string;
  color?: string;
  icon?: string;
}

/** GET /agent/vfs/scan — walks the draft-studio scratch folder
 *  /tmp/draft-studio/<slug>/ and returns every .kd/.kb/.km/.ks file
 *  inside with content embedded, plus any .kf folder-marker metadata. */
export async function scanAgentWorkspace(
  params: { slug: string; teamId: string; entityType?: string; entityId?: string },
  accessToken: string,
): Promise<{ slug: string; root: string; files: AgentVfsFile[]; folders: Record<string, AgentVfsFolderMeta> }> {
  const q = new URLSearchParams({ slug: params.slug, teamId: params.teamId });
  if (params.entityType) q.set("entityType", params.entityType);
  if (params.entityId) q.set("entityId", params.entityId);
  const res = await fetch(`${API_BASE_URL}/agent/vfs/scan?${q.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Workspace scan failed (${res.status})`);
  return res.json();
}

/** DELETE /agent/vfs/folder — wipes the scratch folder. Call after import. */
export async function deleteAgentWorkspace(
  params: { slug: string; teamId: string; entityType?: string; entityId?: string },
  accessToken: string,
): Promise<void> {
  const q = new URLSearchParams({ slug: params.slug, teamId: params.teamId });
  if (params.entityType) q.set("entityType", params.entityType);
  if (params.entityId) q.set("entityId", params.entityId);
  await fetch(`${API_BASE_URL}/agent/vfs/folder?${q.toString()}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** POST /agent/import-mesh — bulk-import a parsed .km file as a new mesh
 *  board in one round trip. Frontend decodes the KAML payload (via
 *  deserializeKmToMesh) and ships the canonical mesh state here. */
export async function importMeshFromKaml(
  body: {
    teamId: string;
    name: string;
    description?: string | null;
    visibility?: string;
    state: {
      viewport?: { x: number; y: number; zoom: number };
      rootOrder?: string[];
      bricksById?: Record<string, any>;
      connectionsById?: Record<string, any>;
    };
  },
  accessToken: string,
): Promise<{ meshId: string; url: string }> {
  const res = await fetch(`${API_BASE_URL}/agent/import-mesh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mesh import failed (${res.status})`);
  return res.json();
}

/** GET /agent/tools/manifest — every tool the backend can expose, used by
 *  the UI tool-picker. Pass the returned names back as enabledToolIds and
 *  the backend will hard-filter to only those tools for the request. */
export async function getAgentToolsManifest(accessToken: string): Promise<AgentToolManifestEntry[]> {
  const res = await fetch(`${API_BASE_URL}/agent/tools/manifest`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body?.tools) ? body.tools as AgentToolManifestEntry[] : [];
}

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
    approvalToolCall?: { id?: string; name: string; input: any };
    /** Whitelist of tool names — backend hard-filters to this set. Omit/empty = all tools. */
    enabledToolIds?: string[];
    /** Optional 4-word scratch-folder slug (used by AI Draft Studio). */
    workspaceSlug?: string;
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
      try {
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
            } catch { /* ignore malformed SSE line */ }
          }
        }
      } catch (innerErr: any) {
        if (innerErr?.name !== 'AbortError') {
          onEvent({ type: 'error', message: innerErr?.message ?? 'Stream processing error' });
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

export async function getProactiveSuggestion(
  params: { teamId: string; message: string; entityType?: string; entityId?: string },
  accessToken: string,
): Promise<{ text: string }> {
  const res = await fetch(`${API_BASE_URL}/agent/proactive-suggest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) return { text: '' };
  return res.json();
}
