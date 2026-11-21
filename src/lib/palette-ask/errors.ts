/** Maps a failed /agent/chat/stream into one of the states the palette can show. */

export type AskErrorKind = "no_credits" | "cap_reached" | "rate_limit" | "offline" | "unknown";

export type AskErrorInput = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

const NETWORK_MESSAGE = /failed to fetch|networkerror|network error|load failed|network request failed/i;

export function classifyAskError(error: AskErrorInput, online: boolean = true): AskErrorKind {
  const code = String(error.code ?? "").toUpperCase();
  const message = String(error.message ?? "");
  const status = typeof error.status === "number" ? error.status : null;

  if (code === "PER_USER_CAP_REACHED") return "cap_reached";
  if (status === 402 || /CREDIT/.test(code) || /insufficient credits|no credits|sin cr[eé]ditos/i.test(message)) return "no_credits";
  if (status === 429 || /RATE_?LIMIT|TOO_MANY/.test(code)) return "rate_limit";
  if (!online) return "offline";
  if (status === null && !code && NETWORK_MESSAGE.test(message)) return "offline";
  return "unknown";
}

/** The ≥80 % usage notice. `percent` is 0-100; anything not finite is ignored. */
export function shouldShowUsageNotice(percent: number | null | undefined): boolean {
  return typeof percent === "number" && Number.isFinite(percent) && percent >= 80 && percent < 100;
}
