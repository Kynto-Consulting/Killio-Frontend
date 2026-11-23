import { API_BASE_URL } from "./client";

/** "host" is the deployment's own AI (billed in credits); the others are the person's own account. */
export type AiProviderMode = "host" | "openai" | "anthropic";
export type OwnAiProviderKind = Exclude<AiProviderMode, "host">;

export interface OwnAiProvider {
  kind: OwnAiProviderKind;
  baseUrl: string;
  model: string;
  /** Last characters of the stored key. The key itself is never sent back. */
  keyHint: string;
  updatedAt: string;
}

export interface AiProviderState {
  /** False when the deployment does not allow personal providers. */
  enabled: boolean;
  mode: AiProviderMode;
  provider: OwnAiProvider | null;
  defaults: Record<OwnAiProviderKind, string>;
}

async function request(method: "GET" | "PUT" | "DELETE", accessToken: string, body?: unknown): Promise<AiProviderState> {
  const response = await fetch(`${API_BASE_URL}/ai/provider`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = Array.isArray(error?.message) ? error.message.join(" ") : error?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json();
}

export const getAiProvider = (accessToken: string) => request("GET", accessToken);

/** `apiKey` may be left out to keep the stored key (same vendor and URL only). */
export const saveAiProvider = (accessToken: string, settings: { kind: OwnAiProviderKind; baseUrl?: string; model: string; apiKey?: string }) =>
  request("PUT", accessToken, settings);

/** Back to the host AI; the stored key is deleted. */
export const removeAiProvider = (accessToken: string) => request("DELETE", accessToken);
