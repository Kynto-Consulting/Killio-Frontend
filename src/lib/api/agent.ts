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

/** Conversation persistence: ephemeral conversations are not kept in the user's history. */
export type AgentConversationMode = 'ephemeral' | 'saved';

/** Page the palette scopes a question to (the board/document/mesh currently open). */
export interface AgentPageContext {
  type: 'board' | 'document' | 'mesh';
  id: string;
}

/** Optional metadata any stream event may carry (palette phase 1). */
export interface AgentStreamMeta {
  conversationId?: string;
  mode?: AgentConversationMode;
  /** 0-100 share of the per-user monthly cap already used. */
  usagePercent?: number;
}

export type AgentStreamEvent = AgentStreamEventBase & AgentStreamMeta;

type AgentStreamEventBase =
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
      /** Draft-studio: files scanned from the scratch folder in this same
       *  request (reliable in serverless). Present when workspaceSlug was set. */
      draftFiles?: AgentVfsFile[];
      draftFolders?: Record<string, AgentVfsFolderMeta>;
    }
  | { type: 'error'; message: string; code?: string; status?: number };

/** One model in the catalog returned by GET /agent/models. */
export interface AgentModelOption {
  id: string;
  label: string;
  description: string;
  minPlanTier: string;
  /** False when the current plan tier doesn't include this model. */
  allowed: boolean;
}

/** Response of GET /agent/models?teamId&conversationId. */
export interface AgentModelOptions {
  planTier: string;
  models: AgentModelOption[];
  defaultModel: string | null;
  conversation: {
    id: string;
    model: string | null;
    changeCount: number;
    /** Once-only change already spent — the selector must lock. */
    locked: boolean;
  } | null;
}

/** GET /agent/models — model entitlements for the selector UIs. */
export async function getAgentModels(
  params: { teamId: string; conversationId?: string },
  accessToken: string,
): Promise<AgentModelOptions> {
  const q = new URLSearchParams({ teamId: params.teamId });
  if (params.conversationId) q.set('conversationId', params.conversationId);
  const res = await fetch(`${API_BASE_URL}/agent/models?${q.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
  return res.json();
}

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
  kind: "kd" | "kb" | "km" | "ks" | "kt" | "kg";
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
 *  (and .kt card templates / .kg tag groups) inside with content embedded, plus any .kf folder-marker metadata. */
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

/** One file of a POST /agent/import-draft response (same order as the request). `message` is a sentence to show verbatim. */
export interface DraftImportFileResult {
  name: string;
  kind: "kt" | "kg" | null;
  status: "created" | "skipped" | "error";
  id?: string;
  message: string;
  warnings: string[];
}

/** POST /agent/import-draft — imports .kt (card template) and .kg (tag group) files through the existing services
 *  (their permission checks apply). One bad file only fails itself. `boardIds` maps the name of a board created
 *  earlier in the same import to its id, so a .kt can point at a board that came from a .kb. */
export async function importDraftFiles(
  body: { teamId: string; files: Array<{ name: string; content: string }>; boardIds?: Record<string, string> },
  accessToken: string,
): Promise<DraftImportFileResult[]> {
  const res = await fetch(`${API_BASE_URL}/agent/import-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Import failed (${res.status})`;
    try { const j = await res.json(); const m = Array.isArray(j?.message) ? j.message.join(', ') : j?.message; if (typeof m === 'string' && m) msg = m; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const json = await res.json();
  return Array.isArray(json?.results) ? json.results as DraftImportFileResult[] : [];
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
    /** Optional 4-word scratch-folder slug (file-production mode). */
    workspaceSlug?: string;
    /** True when the caller auto-scans the folder (AI Draft Studio). Omit for
     *  entity-scoped chats so the agent emits killio_import per file. */
    autoScan?: boolean;
    /** Preferred model id for this message. Validated + clamped to plan
     *  server-side; once-only change per conversation is enforced there. */
    model?: string;
    /** Command palette: 'ephemeral' conversations are not kept in the history. */
    mode?: AgentConversationMode;
    /** Where the request comes from; the backend applies palette rules to 'palette'. */
    source?: 'palette';
    /** 'reduced': the person uses the simple interface mode; the server hides advanced tools from the model. */
    uiMode?: 'reduced';
    /** Scope the question to the page the user has open. */
    pageContext?: AgentPageContext;
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
      // Tells the backend to skip gzip compression on this response so SSE
      // deltas stream progressively instead of arriving in one buffered burst.
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      try {
        if (!res.ok || !res.body) {
          // Keep the message as it was; add the HTTP status and, when the body
          // carries one, the machine code (e.g. PER_USER_CAP_REACHED).
          let code: string | undefined;
          try {
            const payload = await res.json();
            const raw = payload?.code ?? payload?.error?.code ?? payload?.message?.code;
            if (typeof raw === 'string') code = raw;
          } catch { /* body is not JSON */ }
          onEvent({ type: 'error', message: `Agent stream failed (${res.status})`, status: res.status, code });
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

// ── Command palette (phase 1) ────────────────────────────────────────────────

export interface AiPaletteSettings {
  defaultMode: AgentConversationMode;
  /** When true the member cannot change the mode of a conversation. */
  lockMode: boolean;
  retentionDays?: number;
  perUserMonthlyCredits?: number | null;
}

const DEFAULT_AI_PALETTE_SETTINGS: AiPaletteSettings = { defaultMode: 'ephemeral', lockMode: false };

/** GET /teams/:teamId/ai-palette-settings. Any failure falls back to ephemeral + unlocked. */
export async function getAiPaletteSettings(teamId: string, accessToken: string): Promise<AiPaletteSettings> {
  try {
    const res = await fetch(`${API_BASE_URL}/teams/${encodeURIComponent(teamId)}/ai-palette-settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ...DEFAULT_AI_PALETTE_SETTINGS };
    const body = await res.json();
    return {
      ...DEFAULT_AI_PALETTE_SETTINGS,
      ...body,
      defaultMode: body?.defaultMode === 'saved' ? 'saved' : 'ephemeral',
      lockMode: body?.lockMode === true,
    };
  } catch {
    return { ...DEFAULT_AI_PALETTE_SETTINGS };
  }
}

/** PATCH /agent/conversations/:id — rename and/or promote an ephemeral conversation to saved. */
export async function updateAgentConversation(
  conversationId: string,
  patch: { title?: string; mode?: 'saved' },
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/agent/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** DELETE /agent/conversations/:id — owner only. Best effort; `keepalive` lets it survive a tab close. */
export async function deleteAgentConversation(conversationId: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/agent/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
