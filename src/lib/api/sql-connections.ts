/** Read-only SQL connections of a team (`/teams/:teamId/sql-connections`). Passwords are write-only: no response ever carries one. */

const API = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface SqlConnection {
  id: string;
  name: string;
  driver: "postgres";
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: "require" | "disable";
  sslRejectUnauthorized: boolean;
  membersCanQuery: boolean;
  hasPassword: boolean;
  /** Name of the vault key that holds the password (never its value). */
  passwordEnvVar: string | null;
  /** True when the vault entry belongs to this connection (it is deleted with it). */
  passwordManaged: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface SqlConnectionInput {
  name: string;
  host: string;
  port?: number;
  database: string;
  username: string;
  /** Exactly one of `password` (stored encrypted in the team vault) or `passwordEnvVar` (an existing vault key). */
  password?: string;
  passwordEnvVar?: string;
  sslMode?: "require" | "disable";
  sslRejectUnauthorized?: boolean;
  membersCanQuery?: boolean;
}

export interface SqlTestResult { ok: boolean; latencyMs?: number; error?: string }

export class SqlApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SqlApiError";
    this.status = status;
  }
}

async function call<T>(teamId: string, path: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}/teams/${encodeURIComponent(teamId)}/sql-connections${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let payload: { message?: string | string[] } | null = null;
    try {
      payload = await res.json();
    } catch {
      /* not JSON */
    }
    const message = Array.isArray(payload?.message) ? payload?.message.join(", ") : payload?.message;
    throw new SqlApiError(message || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const listSqlConnections = (teamId: string, token: string) => call<SqlConnection[]>(teamId, "", token);
export const createSqlConnection = (teamId: string, token: string, input: SqlConnectionInput) => call<SqlConnection>(teamId, "", token, { method: "POST", body: input });
export const deleteSqlConnection = (teamId: string, token: string, id: string) => call<{ ok: boolean }>(teamId, `/${encodeURIComponent(id)}`, token, { method: "DELETE" });
export const testSqlConnection = (teamId: string, token: string, id: string) => call<SqlTestResult>(teamId, `/${encodeURIComponent(id)}/test`, token, { method: "POST" });
