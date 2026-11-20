/**
 * What the current browser/device can do about installing the app and receiving push, as a plain
 * state the settings UI renders. iOS only delivers Web Push to an installed (home-screen) app.
 */

export type PushUiState =
  | "unsupported" // no service worker / PushManager / Notification
  | "needs-install" // iOS/iPadOS in a normal Safari tab: install first
  | "not-configured" // the server has no VAPID keys
  | "denied" // the user blocked notifications in the browser
  | "off" // can be enabled
  | "on"; // permission granted and this device is subscribed

export type PushEnv = {
  userAgent: string;
  maxTouchPoints?: number;
  platform?: string;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: "default" | "granted" | "denied" | null;
  subscribed: boolean;
  serverConfigured: boolean | null; // null = not known yet
};

export function isIosDevice(env: Pick<PushEnv, "userAgent" | "maxTouchPoints" | "platform">): boolean {
  if (/iPad|iPhone|iPod/i.test(env.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac with touch.
  return (env.platform === "MacIntel" || /Macintosh/i.test(env.userAgent)) && (env.maxTouchPoints ?? 0) > 1;
}

export function resolvePushUiState(env: PushEnv): PushUiState {
  if (isIosDevice(env) && !env.standalone) return "needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.serverConfigured === false) return "not-configured";
  if (env.permission === "denied") return "denied";
  if (env.permission === "granted" && env.subscribed) return "on";
  return "off";
}

export type InstallUiState =
  | "installed" // already running as an app
  | "prompt" // the browser offers a native install prompt
  | "ios-manual" // iOS: Share -> Add to Home Screen
  | "unavailable"; // nothing to offer (already dismissed, unsupported, or not eligible yet)

export function resolveInstallUiState(input: {
  standalone: boolean;
  hasDeferredPrompt: boolean;
  userAgent: string;
  maxTouchPoints?: number;
  platform?: string;
}): InstallUiState {
  if (input.standalone) return "installed";
  if (input.hasDeferredPrompt) return "prompt";
  if (isIosDevice(input)) return "ios-manual";
  return "unavailable";
}
