const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export const PUSH_KINDS = ["assignment", "mention", "comment", "due", "invite", "digest", "message", "other"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export type PushPreferences = { enabled: boolean; mutedKinds: PushKind[] };
export type PushStatus = { configured: boolean; devices: number; preferences: PushPreferences };

function headers(token: string): HeadersInit {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function getPushStatus(token: string): Promise<PushStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/push/status`, { headers: headers(token) });
    return res.ok ? ((await res.json()) as PushStatus) : null;
  } catch {
    return null;
  }
}

export async function savePushPreferences(token: string, prefs: PushPreferences): Promise<PushPreferences | null> {
  try {
    const res = await fetch(`${API_BASE}/push/preferences`, { method: "PUT", headers: headers(token), body: JSON.stringify(prefs) });
    return res.ok ? ((await res.json()) as PushPreferences) : null;
  } catch {
    return null;
  }
}
