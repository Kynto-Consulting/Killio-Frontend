import { API_BASE_URL } from "./client";

/** One phrase of the diary: what was heard, when, and by which client ("killio-app", a phone…). */
export interface DiaryEntry {
  documentId: string;
  brickId: string;
  text: string;
  /** Capture time, UTC epoch milliseconds. */
  ts: number;
  source: string;
  /** Who said it, when the device that heard it could tell voices apart. The text starts with "<speaker>: ". */
  speaker?: string;
}

/** What the workspace's plan allows for the diary and listening. */
export interface VaultEntitlements {
  tier: string;
  policy: {
    enabled: boolean;
    onDeviceDiary: boolean;
    /** Minutes of cloud transcription per month; 0 = not included. */
    cloudSttMinutesMonthly: number;
    screenCapture: boolean;
    localAgents: number | null;
    wakeWord: boolean;
  };
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

/** The diary of one day (YYYY-MM-DD, the person's own day), optionally filtered by words. Oldest first. */
export async function searchDiary(accessToken: string, input: { teamId: string; date: string; query?: string }): Promise<DiaryEntry[]> {
  const hits = await request<DiaryEntry[]>("/vault/diary/search", accessToken, {
    method: "POST",
    body: JSON.stringify({ teamId: input.teamId, date: input.date, ...(input.query?.trim() ? { query: input.query.trim() } : {}) }),
  });
  return (Array.isArray(hits) ? hits : []).slice().sort((a, b) => a.ts - b.ts);
}

export function getVaultEntitlements(accessToken: string, teamId: string): Promise<VaultEntitlements> {
  return request(`/vault/entitlements?teamId=${encodeURIComponent(teamId)}`, accessToken);
}
