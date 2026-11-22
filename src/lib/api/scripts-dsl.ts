import type { ScriptGraph } from "./scripts";
import type { DslDiagnosticLike } from "../scripts-dsl/editor-utils";

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? "http://localhost:4000"
).replace(/\/$/, "");

export type DslLang = "en" | "es";

export interface DslSourceResult {
  origin: "saved" | "decompiled" | "unrepresentable";
  source?: string;
  reason?: string;
  nodeId?: string;
  version: number;
}

export interface DslCompileResult {
  ok: boolean;
  diagnostics: DslDiagnosticLike[];
  graph?: { nodes: Array<Omit<ScriptGraph["nodes"][number], "scriptId">>; edges: Array<Omit<ScriptGraph["edges"][number], "scriptId">> };
  version: number;
}

export interface DslTemplate {
  id: string;
  title: Record<DslLang, string>;
  description: Record<DslLang, string>;
  source: Record<DslLang, string>;
}

export class DslApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/scripts-dsl${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const msg = typeof body?.message === "string" ? body.message : body?.message?.message ?? `Request failed (${res.status})`;
    throw new DslApiError(res.status, msg, body?.code ?? body?.message?.code);
  }
  return res.json();
}

export const compileDslText = (teamId: string, source: string, accessToken: string) =>
  request<DslCompileResult>("/compile", accessToken, { method: "POST", body: JSON.stringify({ teamId, source }) });

export const getDslSource = (scriptId: string, teamId: string, lang: DslLang, accessToken: string) =>
  request<DslSourceResult>(`/${scriptId}/source?teamId=${encodeURIComponent(teamId)}&lang=${lang}`, accessToken);

export const attachDslSource = (scriptId: string, teamId: string, source: string, accessToken: string) =>
  request<{ version: number }>(`/${scriptId}/source-text`, accessToken, { method: "PUT", body: JSON.stringify({ teamId, source }) });

export const getDslTemplates = (accessToken: string) => request<DslTemplate[]>("/templates", accessToken);

/** Compiled graph (ids n1..) -> graph with real ids for the existing save path (`saveScriptGraph`). */
export function toScriptGraph(scriptId: string, compiled: NonNullable<DslCompileResult["graph"]>): ScriptGraph {
  const ids = new Map(compiled.nodes.map((n) => [n.id, crypto.randomUUID()]));
  return {
    nodes: compiled.nodes.map((n) => ({ ...n, id: ids.get(n.id)!, scriptId })),
    edges: compiled.edges.map((e) => ({ ...e, id: crypto.randomUUID(), scriptId, sourceNodeId: ids.get(e.sourceNodeId)!, targetNodeId: ids.get(e.targetNodeId)! })),
  };
}
