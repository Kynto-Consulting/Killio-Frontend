/** User groups inside a team (`/teams/:teamId/groups`) and KQL queries (`/teams/:teamId/query`). */

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface TeamGroup {
  id: string;
  teamId: string;
  name: string;
  /** What a mention uses: @ti */
  slug: string;
  color: string | null;
  description: string | null;
  createdAt: string;
  memberUserIds: string[];
  memberCount: number;
  /** Whether the current user belongs to it. */
  isMember: boolean;
}

export interface GroupInput {
  name: string;
  color?: string | null;
  description?: string | null;
  memberUserIds?: string[];
}

export class ApiRequestError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

async function call<T>(path: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new ApiRequestError(message || `Request failed (${res.status})`, res.status, payload);
  }
  return (await res.json()) as T;
}

export const listTeamGroups = (teamId: string, accessToken: string) => call<TeamGroup[]>(`/teams/${teamId}/groups`, accessToken);
export const createTeamGroup = (teamId: string, input: GroupInput, accessToken: string) => call<TeamGroup>(`/teams/${teamId}/groups`, accessToken, { method: "POST", body: input });
export const updateTeamGroup = (teamId: string, groupId: string, patch: Partial<Omit<GroupInput, "memberUserIds">>, accessToken: string) =>
  call<TeamGroup>(`/teams/${teamId}/groups/${groupId}`, accessToken, { method: "PATCH", body: patch });
export const deleteTeamGroup = (teamId: string, groupId: string, accessToken: string) => call<{ deleted: true }>(`/teams/${teamId}/groups/${groupId}`, accessToken, { method: "DELETE" });
/** Replaces the whole member list. */
export const setTeamGroupMembers = (teamId: string, groupId: string, memberUserIds: string[], accessToken: string) =>
  call<TeamGroup>(`/teams/${teamId}/groups/${groupId}/members`, accessToken, { method: "PUT", body: { memberUserIds } });
export const addTeamGroupMembers = (teamId: string, groupId: string, memberUserIds: string[], accessToken: string) =>
  call<TeamGroup>(`/teams/${teamId}/groups/${groupId}/members`, accessToken, { method: "POST", body: { memberUserIds } });
export const removeTeamGroupMember = (teamId: string, groupId: string, memberUserId: string, accessToken: string) =>
  call<TeamGroup>(`/teams/${teamId}/groups/${groupId}/members/${memberUserId}`, accessToken, { method: "DELETE" });

/** "@[group:ID:Name]": the token a mention of this group is stored as. */
export const groupMentionToken = (group: Pick<TeamGroup, "id" | "name">) => `@[group:${group.id}:${group.name}]`;

// ── KQL ──────────────────────────────────────────────────────────────────────

export interface KqlRunResult {
  columns: Array<{ key: string; label: string; kind: "dim" | "metric" }>;
  rows: Array<{ keys: string[]; labels: string[]; values: number[] }>;
  matched: number;
  total: number;
  scope?: { source: string; label: string; cards: number; qualifiers: Array<{ kind: string; name: string; id?: string }> };
}
export interface KqlRunOutput {
  title: string | null;
  result: KqlRunResult;
}

/** Runs a KQL script on the server over what the user can see. A syntax error throws ApiRequestError (status 400, details.position). */
export const runKqlQuery = (teamId: string, script: string, accessToken: string, options: { boardId?: string } = {}) =>
  call<{ outputs: KqlRunOutput[]; cards: number }>(`/teams/${teamId}/query`, accessToken, { method: "POST", body: { script, boardId: options.boardId } });
