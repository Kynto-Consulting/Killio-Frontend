const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://localhost:4000'
).replace(/\/$/, '');

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type NodeKind =
  | 'github.trigger.commit'
  | 'core.trigger.manual'
  | 'core.trigger.webhook'
  | 'core.transform.json_normalize'
  | 'core.transform.regex'
  | 'core.transform.regex_extract_files'
  | 'core.transform.join_fields'
  | 'core.transform.hash_join'
  | 'core.condition.regex_match'
  | 'core.condition.field_compare'
  | 'core.transform.json_map'
  | 'core.transform.template'
  | 'core.transform.iterator'
  | 'core.transform.text_split_lines'
  | 'core.transform.regex_extract_groups'
  | 'core.transform.regex_extract_mentions'
  | 'core.transform.context_window'
  | 'core.transform.hash_compose'
  | 'core.transform.coalesce'
  | 'core.transform.array_compact'
  | 'killio.action.create_card'
  | 'killio.action.update_card'
  | 'killio.action.move_card'
  | 'killio.action.assign_card'
  | 'killio.table.read'
  | 'killio.table.write'
  | 'core.logic.if_else'
  | 'core.logic.loop'
  | 'core.action.delay'
  | 'core.logic.switch'
  | 'core.transform.set_field'
  | 'core.filter.dedup'
  | 'core.filter.first_seen'
  | 'core.action.http_request'
  | 'core.action.js_code';

export interface ScriptNodeData {
  id: string;
  scriptId: string;
  nodeKind: NodeKind;
  label: string | null;
  config: Record<string, any>;
  positionX: number;
  positionY: number;
}

export interface ScriptEdgeData {
  id: string;
  scriptId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface ScriptGraph {
  nodes: ScriptNodeData[];
  edges: ScriptEdgeData[];
}

export interface ScriptSummary {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: Record<string, any>;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptRunLog {
  id: string;
  scriptId: string;
  status: 'running' | 'completed' | 'failed';
  triggerPayload: Record<string, any>;
  nodeOutputs: Record<string, any>;
  errorMessage: string | null;
  itemsProcessed: number;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface KillioTableRow {
  id: string;
  scriptId: string;
  teamId: string;
  externalKey: string;
  cardId: string | null;
  data: Record<string, any>;
  lastAction: string | null;
  createdAt: string;
  updatedAt: string;
  cardTitle?: string | null;
}

export interface SharedKillioTable {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  columns: Array<{ key: string; label: string; type?: string }>;
  isArchived: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedKillioTableRow {
  id: string;
  tableId: string;
  teamId: string;
  externalKey: string;
  data: Record<string, any>;
  sourceScriptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptMonthlyUsage {
  planTier: 'free' | 'pro' | 'enterprise';
  executed: number;
  limit: number | null;
  remaining: number | null;
  periodStart: string;
  periodEnd: string;
  billingEmail: string;
}

export interface ScriptPresetDefinition {
  id: string;
  name: string;
  description: string;
  applySummary: string;
}

export interface ApplyScriptPresetResult {
  presetId: string;
  message: string;
  killioTable: {
    id: string;
    name: string;
    created: boolean;
  };
  scripts: Array<{
    id: string;
    name: string;
  }>;
}

// ──────────────────────────────────────────────
// API Functions
// ──────────────────────────────────────────────

export async function listScripts(teamId: string, accessToken: string): Promise<ScriptSummary[]> {
  const res = await fetch(`${BASE_URL}/scripts?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch scripts');
  return res.json();
}

export async function createScript(
  params: {
    teamId: string;
    name: string;
    description?: string;
    triggerConfig?: Record<string, any>;
  },
  accessToken: string,
): Promise<ScriptSummary> {
  const res = await fetch(`${BASE_URL}/scripts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to create script');
  return res.json();
}

export async function getScript(id: string, teamId: string, accessToken: string): Promise<ScriptSummary> {
  const res = await fetch(`${BASE_URL}/scripts/${id}?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch script');
  return res.json();
}

export async function updateScript(
  id: string,
  params: { teamId: string; name?: string; description?: string; triggerConfig?: Record<string, any> },
  accessToken: string,
): Promise<ScriptSummary> {
  const res = await fetch(`${BASE_URL}/scripts/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to update script');
  return res.json();
}

export async function saveScriptGraph(
  id: string,
  teamId: string,
  graph: ScriptGraph,
  accessToken: string,
): Promise<ScriptSummary> {
  const res = await fetch(`${BASE_URL}/scripts/${id}/graph`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, graph }),
  });
  if (!res.ok) throw new Error('Failed to save script graph');
  return res.json();
}

export async function getScriptGraph(id: string, teamId: string, accessToken: string): Promise<ScriptGraph> {
  const res = await fetch(`${BASE_URL}/scripts/${id}/graph?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch script graph');
  return res.json();
}

export async function toggleScript(
  id: string,
  teamId: string,
  isActive: boolean,
  accessToken: string,
): Promise<{ ok: boolean; isActive: boolean }> {
  const res = await fetch(`${BASE_URL}/scripts/${id}/toggle`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, isActive }),
  });
  if (!res.ok) throw new Error('Failed to toggle script');
  return res.json();
}

export async function deleteScript(id: string, teamId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/scripts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId }),
  });
  if (!res.ok) throw new Error('Failed to delete script');
}

export async function getScriptRuns(id: string, teamId: string, accessToken: string): Promise<ScriptRunLog[]> {
  const res = await fetch(`${BASE_URL}/scripts/${id}/runs?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch run logs');
  return res.json();
}

  export async function getLatestRunOutputs(id: string, teamId: string, accessToken: string): Promise<ScriptRunLog | null> {
    const res = await fetch(`${BASE_URL}/scripts/${id}/runs/latest?teamId=${encodeURIComponent(teamId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch latest run');
    const body: ScriptRunLog | null = await res.json();
    return body;
  }

export async function getScriptTable(id: string, teamId: string, accessToken: string): Promise<KillioTableRow[]> {
  const res = await fetch(`${BASE_URL}/scripts/${id}/table?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch script table');
  return res.json();
}

export async function runManualScript(
  id: string,
  teamId: string,
  accessToken: string,
  payload?: { data?: Record<string, any>; items?: Array<{ externalKey?: string; data?: Record<string, any> }> },
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/scripts/${id}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, payload }),
  });
  if (!res.ok) throw new Error('Failed to run script manually');
  return res.json();
}

export async function getScriptsUsage(
  teamId: string,
  accessToken: string,
): Promise<ScriptMonthlyUsage> {
  const res = await fetch(`${BASE_URL}/scripts/usage?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch scripts usage');
  return res.json();
}

export async function listScriptPresets(teamId: string, accessToken: string): Promise<ScriptPresetDefinition[]> {
  const res = await fetch(`${BASE_URL}/scripts/presets?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch script presets');
  return res.json();
}

export async function applyScriptPreset(
  presetId: string,
  params: {
    teamId: string;
    repoFullName?: string;
    branch?: string;
    boardId?: string;
    listId?: string;
    regexPattern?: string;
    regexFlags?: string;
    mentionRegex?: string;
    killioTableName?: string;
  },
  accessToken: string,
): Promise<ApplyScriptPresetResult> {
  const res = await fetch(`${BASE_URL}/scripts/presets/${encodeURIComponent(presetId)}/apply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    let errorMessage = 'Failed to apply script preset';
    try {
      const payload = await res.json();
      if (typeof payload?.message === 'string') {
        errorMessage = payload.message;
      } else if (Array.isArray(payload?.message) && typeof payload.message[0] === 'string') {
        errorMessage = payload.message[0];
      }
    } catch {
      // Keep default message when response body is not JSON.
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function listSharedTables(teamId: string, accessToken: string): Promise<SharedKillioTable[]> {
  const res = await fetch(`${BASE_URL}/scripts/tables?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch shared tables');
  return res.json();
}

export async function createSharedTable(
  params: {
    teamId: string;
    name: string;
    description?: string;
    columns?: Array<{ key: string; label: string; type?: string }>;
  },
  accessToken: string,
): Promise<SharedKillioTable> {
  const res = await fetch(`${BASE_URL}/scripts/tables`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to create shared table');
  return res.json();
}

export async function getSharedTableRows(
  tableId: string,
  teamId: string,
  accessToken: string,
): Promise<SharedKillioTableRow[]> {
  const res = await fetch(`${BASE_URL}/scripts/tables/${tableId}/rows?teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch shared table rows');
  return res.json();
}

export async function upsertSharedTableRow(
  tableId: string,
  params: {
    teamId: string;
    externalKey: string;
    data?: Record<string, any>;
  },
  accessToken: string,
): Promise<SharedKillioTableRow> {
  const res = await fetch(`${BASE_URL}/scripts/tables/${tableId}/rows`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to upsert shared table row');
  return res.json();
}
