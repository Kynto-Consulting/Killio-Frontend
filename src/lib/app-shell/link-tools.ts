/**
 * The device tools that only open a link, as pure functions (no imports) so they can be tested alone.
 * See client-actions.ts for how they are run.
 */

export type Input = Record<string, unknown>;

export const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const q = encodeURIComponent;
const digits = (value: unknown): string => text(value).replace(/[^\d+]/g, "");
const handle = (value: unknown): string => text(value).replace(/^@/, "").replace(/[^\w.]/g, "");

/** A web link only: the model must not hand the system an arbitrary scheme. */
function webUrl(value: unknown): string | null {
  const url = text(value);
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

/** "spotify:track:ID" → its open.spotify.com address, which opens the app when installed. */
function spotifyUrl(input: Input): string | null {
  const uri = text(input.uri);
  const fromUri = /^spotify:(track|album|artist|playlist|show|episode):([A-Za-z0-9]+)$/.exec(uri);
  if (fromUri) return `https://open.spotify.com/${fromUri[1]}/${fromUri[2]}`;
  if (/^https:\/\/open\.spotify\.com\//i.test(uri)) return uri;
  const query = text(input.query);
  return query ? `https://open.spotify.com/search/${q(query)}` : "https://open.spotify.com/";
}

/** Windows Settings pages, by the name the tool accepts. Only these can be opened. */
export const WINDOWS_SETTINGS: Record<string, string> = {
  home: "ms-settings:",
  display: "ms-settings:display",
  sound: "ms-settings:sound",
  notifications: "ms-settings:notifications",
  bluetooth: "ms-settings:bluetooth",
  network: "ms-settings:network",
  wifi: "ms-settings:network-wifi",
  apps: "ms-settings:appsfeatures",
  "default-apps": "ms-settings:defaultapps",
  storage: "ms-settings:storagesense",
  battery: "ms-settings:batterysaver",
  privacy: "ms-settings:privacy",
  microphone: "ms-settings:privacy-microphone",
  camera: "ms-settings:privacy-webcam",
  updates: "ms-settings:windowsupdate",
  "date-time": "ms-settings:dateandtime",
  language: "ms-settings:regionlanguage",
  accounts: "ms-settings:yourinfo",
};

/** macOS System Settings panes (macOS 13+ identifiers), by the name the tool accepts. */
export const MACOS_SETTINGS: Record<string, string> = {
  general: "com.apple.systempreferences.GeneralSettings",
  displays: "com.apple.Displays-Settings.extension",
  sound: "com.apple.Sound-Settings.extension",
  notifications: "com.apple.Notifications-Settings.extension",
  bluetooth: "com.apple.BluetoothSettings",
  network: "com.apple.Network-Settings.extension",
  wifi: "com.apple.wifi-settings-extension",
  battery: "com.apple.Battery-Settings.extension",
  privacy: "com.apple.settings.PrivacySecurity.extension",
  microphone: "com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
  camera: "com.apple.settings.PrivacySecurity.extension?Privacy_Camera",
  "screen-recording": "com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
  accessibility: "com.apple.Accessibility-Settings.extension",
  updates: "com.apple.Software-Update-Settings.extension",
  "date-time": "com.apple.Date-Time-Settings.extension",
  keyboard: "com.apple.Keyboard-Settings.extension",
};

/**
 * Tools that only open a link. Each returns the link for its input, or null when the input is not usable.
 * This table is the whole behaviour of these tools.
 */
export const LINK_TOOLS: Record<string, (input: Input) => string | null> = {
  open_browser: (i) => webUrl(i.url),
  open_deeplink: (i) => webUrl(i.uri),
  open_app: (i) => webUrl(i.url),
  call_number: (i) => (digits(i.number) ? `tel:${digits(i.number)}` : null),
  send_sms: (i) => {
    const numbers = (Array.isArray(i.numbers) ? i.numbers : []).map(digits).filter(Boolean);
    const body = text(i.body);
    return body ? `sms:${numbers.join(",")}?body=${q(body)}` : null;
  },
  whatsapp_message: (i) => {
    const phone = digits(i.phone).replace(/^\+/, "");
    return phone ? `https://wa.me/${phone}${text(i.text) ? `?text=${q(text(i.text))}` : ""}` : null;
  },
  whatsapp_call: (i) => {
    const phone = digits(i.phone).replace(/^\+/, "");
    return phone ? `https://wa.me/${phone}` : null;
  },
  spotify_play: spotifyUrl,
  spotify_open: spotifyUrl,
  youtube_search: (i) => (text(i.query) ? `https://www.youtube.com/results?search_query=${q(text(i.query))}` : null),
  youtube_open: (i) => {
    const id = text(i.videoId);
    if (/^[\w-]{6,20}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
    const url = webUrl(i.url);
    return url && /^https:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i.test(url) ? url : null;
  },
  maps_search: (i) => (text(i.query) ? `https://www.google.com/maps/search/?api=1&query=${q(text(i.query))}` : null),
  maps_navigate: (i) => (text(i.destination) ? `https://www.google.com/maps/dir/?api=1&destination=${q(text(i.destination))}` : null),
  instagram_open: (i) => (handle(i.username) ? `https://www.instagram.com/${handle(i.username)}/` : "https://www.instagram.com/"),
  gmail_compose: (i) => {
    const params = [text(i.subject) && `subject=${q(text(i.subject))}`, text(i.body) && `body=${q(text(i.body))}`].filter(Boolean).join("&");
    const to = text(i.to).replace(/[\s?&#]/g, "");
    return `mailto:${to}${params ? `?${params}` : ""}`;
  },
  twitter_search: (i) => (text(i.query) ? `https://x.com/search?q=${q(text(i.query))}` : null),
  x_open: (i) => {
    const url = webUrl(i.url);
    if (url) return /^https:\/\/(www\.)?(x|twitter)\.com\//i.test(url) ? url : null;
    return handle(i.username) ? `https://x.com/${handle(i.username)}` : "https://x.com/";
  },
  telegram_open: (i) => (handle(i.username) ? `https://t.me/${handle(i.username)}` : "https://web.telegram.org/"),
  tiktok_search: (i) => (text(i.query) ? `https://www.tiktok.com/search?q=${q(text(i.query))}` : null),
  play_store_open: (i) => {
    const pkg = text(i.package);
    if (/^[A-Za-z][\w.]+$/.test(pkg)) return `https://play.google.com/store/apps/details?id=${pkg}`;
    return text(i.query) ? `https://play.google.com/store/search?q=${q(text(i.query))}&c=apps` : "https://play.google.com/store/apps";
  },
  // ── One operating system only (device-tools.ts offers each only there) ──
  windows_open_settings: (i) => (Object.hasOwn(WINDOWS_SETTINGS, text(i.page)) ? WINDOWS_SETTINGS[text(i.page)] : null),
  macos_open_settings: (i) => (Object.hasOwn(MACOS_SETTINGS, text(i.pane)) ? "x-apple.systempreferences:" + MACOS_SETTINGS[text(i.pane)] : null),
  apple_run_shortcut: (i) => {
    const name = text(i.name);
    if (!name) return null;
    return "shortcuts://run-shortcut?name=" + q(name) + (text(i.input) ? "&input=text&text=" + q(text(i.input)) : "");
  },
  uber_request: (i) =>
    text(i.dropoff) ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${q(text(i.dropoff))}` : "https://m.uber.com/ul/",
};

