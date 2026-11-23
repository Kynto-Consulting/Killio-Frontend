import { API_BASE_URL } from "./client";

/**
 * What the assistant remembers about the person, across conversations. The assistant writes these itself
 * (its `save_user_memory` tool); this is the person's view of them: read, add, delete.
 */
export interface AssistantMemory {
  id: string;
  /** Null: remembered everywhere. Otherwise only inside that workspace. */
  teamId: string | null;
  kind: string;
  text: string;
  createdAt: string;
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json();
}

/** Newest first. With `teamId`: that workspace's memories plus the ones remembered everywhere. */
export function listMemories(accessToken: string, teamId?: string | null): Promise<AssistantMemory[]> {
  const query = new URLSearchParams({ limit: "200" });
  if (teamId) query.set("teamId", teamId);
  return request(`/vault/memories?${query.toString()}`, accessToken);
}

export function addMemory(accessToken: string, text: string, teamId?: string | null): Promise<AssistantMemory> {
  return request("/vault/memories", accessToken, { method: "POST", body: JSON.stringify({ text, teamId: teamId ?? null, kind: "note" }) });
}

export async function deleteMemory(accessToken: string, id: string): Promise<boolean> {
  const result = await request<{ removed: boolean }>(`/vault/memories/${encodeURIComponent(id)}`, accessToken, { method: "DELETE" });
  return result.removed;
}
