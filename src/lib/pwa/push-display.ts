/**
 * Pure part of the service worker's push handling: what a received push becomes on screen and which
 * window a click should reuse. Kept free of worker globals so it can be unit tested.
 */

export type PushMessage = {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
  kind?: string;
  appName?: string;
};

export type DisplayedNotification = {
  title: string;
  options: { body: string; icon: string; badge: string; tag?: string; data: { url: string; kind?: string } };
};

const FALLBACK_ICON = "/icon-192.png";

/** Same-origin paths only; anything else opens the app root. */
export function safeTargetPath(url: unknown): string {
  if (typeof url !== "string") return "/";
  const value = url.trim();
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

function isUsableIcon(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("https://") || (value.startsWith("/") && !value.startsWith("//")));
}

export function parsePushData(raw: string | null | undefined): PushMessage {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PushMessage) : { body: String(parsed) };
  } catch {
    return { body: raw };
  }
}

/** Title falls back to the instance's name, icon to the logo the server sent (then to the static one). */
export function toNotification(message: PushMessage): DisplayedNotification {
  const icon = isUsableIcon(message.icon) ? message.icon : FALLBACK_ICON;
  return {
    title: message.title?.trim() || message.appName?.trim() || "Killio",
    options: {
      body: message.body ?? "",
      icon,
      badge: isUsableIcon(message.badge) ? message.badge : icon,
      tag: message.tag || undefined,
      data: { url: safeTargetPath(message.url), kind: message.kind },
    },
  };
}

/** The open window of this app a click should focus (and navigate), if any. */
export function pickWindowToFocus<T extends { url: string }>(clients: readonly T[], origin: string): T | undefined {
  return clients.find((c) => {
    try {
      return new URL(c.url).origin === origin;
    } catch {
      return false;
    }
  });
}
