/** Groups with access to a board or a document (`/boards/:id/group-access`, `/documents/:id/group-access`). */

import { ApiRequestError } from "@/lib/api/groups";
import type { GroupAccessRole } from "@/lib/groups/access";

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export type GroupAccessScope = "board" | "document";

export interface GroupAccessEntry {
  groupId: string;
  name: string;
  slug: string;
  color: string | null;
  role: GroupAccessRole;
  memberCount: number;
}

const base = (scope: GroupAccessScope, id: string) => `${API}/${scope === "board" ? "boards" : "documents"}/${id}/group-access`;

async function call<T>(url: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
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

export const listGroupAccess = (scope: GroupAccessScope, id: string, accessToken: string) => call<GroupAccessEntry[]>(base(scope, id), accessToken);
export const setGroupAccess = (scope: GroupAccessScope, id: string, groupId: string, role: GroupAccessRole, accessToken: string) =>
  call<GroupAccessEntry[]>(`${base(scope, id)}/${groupId}`, accessToken, { method: "PUT", body: { role } });
export const removeGroupAccess = (scope: GroupAccessScope, id: string, groupId: string, accessToken: string) =>
  call<{ success: true }>(`${base(scope, id)}/${groupId}`, accessToken, { method: "DELETE" });
