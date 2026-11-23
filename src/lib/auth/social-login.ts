/**
 * Social sign-in (Google, Microsoft, Bloomx) from the browser.
 *
 * The browser keeps a secret `verifier` in sessionStorage and sends only its S256 challenge to the API. When the provider
 * sends the person back, the API hands the SPA a one-time `code`; the code is worth nothing without the verifier, so a
 * callback link opened in ANOTHER browser (login CSRF) cannot be redeemed. Tokens never travel in a URL.
 */

import { killioApp } from "../app-shell/index.ts";

export type SocialProvider = "google" | "microsoft" | "bloomx";

export type SocialAvailability = { google: boolean; microsoft: boolean; bloomx: boolean; bloomxMode?: string };

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

const VERIFIER_KEY = "killio_social_verifier";

function base64Url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createExchangeSecret(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function readExchangeVerifier(): string | null {
  try {
    return sessionStorage.getItem(VERIFIER_KEY);
  } catch {
    return null;
  }
}

export function clearExchangeVerifier(): void {
  try {
    sessionStorage.removeItem(VERIFIER_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Only same-site relative paths survive (the API sanitizes again). */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export async function fetchSocialProviders(): Promise<SocialAvailability> {
  try {
    const res = await fetch(`${API}/auth/social/providers`, { cache: "no-store" });
    if (!res.ok) return { google: false, microsoft: false, bloomx: false };
    return (await res.json()) as SocialAvailability;
  } catch {
    return { google: false, microsoft: false, bloomx: false };
  }
}

/** Leaves the app for the provider (the API validates everything and answers with a redirect). */
export async function startSocialLogin(provider: SocialProvider, opts: { returnTo?: string; bloomx?: string } = {}): Promise<void> {
  const { verifier, challenge } = await createExchangeSecret();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const url = new URL(`${API}/auth/social/${provider}/start`);
  url.searchParams.set("challenge", challenge);
  url.searchParams.set("returnTo", safeReturnPath(opts.returnTo));
  if (opts.bloomx) url.searchParams.set("bloomx", opts.bloomx);
  // Killio App: the provider opens in the person's own browser, where they are already signed in to Google,
  // Microsoft or their Bloomx. The secret stays here; the browser hands the one-time code back to the app
  // (see appHandoffUrl) and this window finishes the exchange on /login/social.
  const app = killioApp();
  if (app) {
    await app.openExternal(url.toString());
    return;
  }
  window.location.assign(url.toString());
}

/**
 * The link that hands a sign-in started in Killio App back to it. Only the one-time code travels: it is worth
 * nothing without the secret the app kept, so another program answering this link gains nothing.
 */
export function appHandoffUrl(code: string, origin: string): string {
  return `killio://auth/social?code=${encodeURIComponent(code)}&server=${encodeURIComponent(origin)}`;
}

/** Bloomx step 1: the person typed an instance URL or an email; the API validates it and answers with the instance. */
export async function resolveBloomxInstance(input: string): Promise<{ origin: string; host: string }> {
  const res = await fetch(`${API}/auth/social/bloomx/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.code ?? data?.message?.code ?? "invalid_request";
    throw new SocialLoginClientError(typeof code === "string" ? code : "invalid_request");
  }
  return data as { origin: string; host: string };
}

export class SocialLoginClientError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function exchangeSocialCode(code: string, verifier: string) {
  const res = await fetch(`${API}/auth/social/exchange`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SocialLoginClientError(data?.code ?? data?.message?.code ?? "invalid_exchange");
  return data as { user: any; accessToken: string; refreshToken: string; expiresInSeconds: number; returnTo?: string };
}
