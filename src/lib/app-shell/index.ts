/**
 * Killio App bridge.
 *
 * Killio App (Killio-App/, Rust + Tauri) loads this same frontend inside a native window and injects
 * `window.__KILLIO_APP__` and `window.killioApp` before any page script runs. Everything that should
 * only exist inside the app (switching server, screenshots, device tools for the agent) goes through
 * this file, so the web build keeps behaving exactly as before: outside the app `isKillioApp()` is
 * false and `killioApp()` is null.
 */

export interface KillioAppInfo {
  version: string;
  /** "windows" | "macos" | "linux" | "android" | "ios" */
  platform: string;
  /** Native features this build of the app has, e.g. "screenshot". */
  features: string[];
  /** Origin of the server the app is connected to. */
  tenant: string | null;
}

export interface KillioAppScreenshot {
  mime: "image/png";
  width: number;
  height: number;
  /** PNG bytes, base64 encoded. */
  data: string;
}

export interface KillioAppBridge {
  isApp: true;
  info(): Promise<KillioAppInfo>;
  /** Leaves this server and shows the app's server picker. */
  switchTenant(): Promise<void>;
  /** Captures the primary screen. Rejects where the app cannot do it (see `info().features`). */
  captureScreenshot(): Promise<KillioAppScreenshot>;
  /** Opens a link in the system browser instead of inside the app window. */
  openExternal(url: string): Promise<void>;
  /** Missing in app builds older than the "accounts" feature: check `info().features` or use the helpers below. */
  reportAccounts?(accounts: KillioAppAccountProfile[]): Promise<void>;
  listAccounts?(): Promise<KillioAppAccount[]>;
  openAccount?(tenant: string, accountId: string): Promise<void>;
  /** Desktop builds with the "apps" feature: the apps installed on this computer. */
  listApps?(): Promise<KillioAppInstalledApp[]>;
  /** Opens one of the apps `listApps` returned; any other value is refused by the app. */
  openApp?(pkg: string): Promise<void>;
}

export interface KillioAppInstalledApp {
  label: string;
  /** Opaque id to hand back to `openApp`. */
  package: string;
}

/** What this server's page tells the app about a signed-in account. Never a token. */
export interface KillioAppAccountProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

/** An account signed in on any server the app knows. */
export interface KillioAppAccount extends KillioAppAccountProfile {
  /** Origin of the server the account lives on. */
  tenant: string;
  tenantName: string;
  /** True when it belongs to the server this page is on. */
  here: boolean;
}

/** URL fragment the app adds when it opens a server to switch to one of its accounts. */
export const APP_ACCOUNT_HASH = "killio-account=";

/** Accounts signed in on OTHER servers. Empty on the web and in app builds without the feature. */
export async function listOtherServerAccounts(): Promise<KillioAppAccount[]> {
  const bridge = killioApp();
  if (!bridge?.listAccounts) return [];
  try {
    return (await bridge.listAccounts()).filter((account) => !account.here);
  } catch {
    return [];
  }
}

/** Keeps the app's cross-server account list in step with this server's accounts. No-op on the web. */
export function reportAccountsToApp(accounts: KillioAppAccountProfile[]): void {
  const bridge = killioApp();
  if (!bridge?.reportAccounts) return;
  void bridge.reportAccounts(accounts).catch(() => { /* the list is a convenience; never break the session over it */ });
}

/** The account id the app asked this page to switch to, if any; the fragment is removed once read. */
export function takeRequestedAccountId(): string | null {
  if (!isKillioApp()) return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.startsWith(APP_ACCOUNT_HASH)) return null;
  const id = decodeURIComponent(hash.slice(APP_ACCOUNT_HASH.length));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return id || null;
}

declare global {
  interface Window {
    __KILLIO_APP__?: { shell: string; bridge: number };
    killioApp?: KillioAppBridge;
  }
}

/** True only inside Killio App. Always false during server rendering. */
export function isKillioApp(): boolean {
  return typeof window !== "undefined" && window.__KILLIO_APP__ !== undefined;
}

export function killioApp(): KillioAppBridge | null {
  return isKillioApp() ? window.killioApp ?? null : null;
}

/** A screenshot from the app as a File, ready for the same upload paths a picked image uses. */
export async function captureScreenshotFile(name = `screenshot-${Date.now()}.png`): Promise<File> {
  const bridge = killioApp();
  if (!bridge) throw new Error("Screenshots need Killio App.");
  const shot = await bridge.captureScreenshot();
  const binary = atob(shot.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: shot.mime });
}
