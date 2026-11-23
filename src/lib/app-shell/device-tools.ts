/**
 * Which device tools Killio App offers the agent on each kind of device. Pure (no imports).
 *
 * The app sends this list to the backend with every message, so the model is never offered a tool the
 * device in the user's hands cannot run: no "call this number" on a desktop, no screenshot upload on a
 * phone that cannot take one. Add a tool here and implement it in client-actions.ts.
 */

export type DeviceKind = "desktop" | "mobile";

const MOBILE_PLATFORMS = new Set(["android", "ios"]);

export function deviceKind(platform: string): DeviceKind {
  return MOBILE_PLATFORMS.has(platform) ? "mobile" : "desktop";
}

/** Work the same everywhere: they open a website / installed app, or use the webview itself. */
const EVERYWHERE = [
  "open_browser", "open_deeplink", "open_app",
  "whatsapp_message", "gmail_compose",
  "spotify_play", "spotify_open",
  "youtube_search", "youtube_open",
  "maps_search", "maps_navigate",
  "instagram_open", "twitter_search", "x_open", "telegram_open", "tiktok_search",
  "clipboard_read", "clipboard_write", "get_location", "device_info", "vault_disconnect",
];

/** Need a phone: a dialer, an SMS app, a share sheet, a battery, a ride app. */
const MOBILE_ONLY = ["call_number", "send_sms", "whatsapp_call", "uber_request", "share_text", "battery_status"];

/** Need one specific platform. */
const PLATFORM_ONLY: Record<string, string[]> = {
  windows: ["windows_open_settings"],
  macos: ["macos_open_settings", "apple_run_shortcut"],
  linux: [],
  android: ["play_store_open", "vibrate"],
  ios: ["apple_run_shortcut"],
};

/** Need a native feature the installed app reports in `info().features`. */
const FEATURE_TOOLS: Record<string, { tools: string[]; kinds: DeviceKind[] }> = {
  screenshot: { tools: ["vault_upload_screenshot"], kinds: ["desktop"] },
  // Start Menu on Windows, Applications on macOS, .desktop entries on Linux.
  apps: { tools: ["list_installed_apps", "search_app", "open_installed_app"], kinds: ["desktop"] },
};

/** The device tools to offer on `platform` ("windows" | "macos" | "linux" | "android" | "ios"). */
export function deviceToolsFor(platform: string, features: string[]): string[] {
  const kind = deviceKind(platform);
  const tools = [...EVERYWHERE];
  if (kind === "mobile") tools.push(...MOBILE_ONLY);
  tools.push(...(PLATFORM_ONLY[platform] ?? []));
  for (const [feature, { tools: featureTools, kinds }] of Object.entries(FEATURE_TOOLS)) {
    if (features.includes(feature) && kinds.includes(kind)) tools.push(...featureTools);
  }
  return tools;
}

/** Case- and accent-insensitive match of an app name, best matches first. */
export function searchApps<T extends { label: string }>(apps: T[], query: string): T[] {
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const needle = fold(query);
  if (!needle) return [];
  const rank = (label: string) => {
    const name = fold(label);
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    return name.includes(needle) ? 2 : -1;
  };
  return apps
    .map((app) => ({ app, score: rank(app.label) }))
    .filter((entry) => entry.score >= 0)
    .sort((x, y) => x.score - y.score || x.app.label.length - y.app.label.length)
    .map((entry) => entry.app);
}
