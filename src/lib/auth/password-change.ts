/**
 * Pure helpers for the "forced password change" flow (first login with a
 * temporary password). No imports on purpose: runs under `node --test`.
 *
 * Server contract: while `user.mustChangePassword` is true the backend answers
 * every route except /auth/change-password, /auth/me, /auth/logout,
 * /auth/refresh and /tenant/config with 403 + code PASSWORD_CHANGE_REQUIRED.
 */

export const PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED";
/** NB: "/change-password" is already the password-RECOVERY page (reset with code/token). */
export const PASSWORD_CHANGE_ROUTE = "/set-password";
/** window event dispatched by the API clients when the backend demands a password change. */
export const PASSWORD_CHANGE_REQUIRED_EVENT = "auth:password-change-required";
export const MIN_PASSWORD_LENGTH = 10;

/** Routes a flagged user may still see (legal pages and the PWA offline fallback). */
const ALWAYS_ALLOWED_PATHS = ["/privacy", "/terms", "/cookies", "/offline"];

function stripQuery(path: string): string {
  return path.split("?")[0].split("#")[0];
}

export function isPasswordChangePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const clean = stripQuery(pathname).replace(/\/+$/, "") || "/";
  return clean === PASSWORD_CHANGE_ROUTE;
}

/** True when a 403 response body is the "you must set a new password" error. */
export function isPasswordChangeRequiredError(status: number, body: unknown): boolean {
  if (status !== 403) return false;
  if (!body || typeof body !== "object") return false;
  return (body as { code?: unknown }).code === PASSWORD_CHANGE_REQUIRED_CODE;
}

export function isMustChangePassword(user: { mustChangePassword?: unknown } | null | undefined): boolean {
  return user?.mustChangePassword === true;
}

export type RedirectInput = {
  pathname: string | null | undefined;
  /** False while the session is still being restored: never redirect then. */
  sessionReady: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
};

/**
 * Where to send the user, or null to stay. Flagged users are pinned to the
 * password page; the page itself sends non-flagged users home.
 */
export function decidePasswordChangeRedirect(input: RedirectInput): string | null {
  const { pathname, sessionReady, isAuthenticated, mustChangePassword } = input;
  if (!sessionReady || !isAuthenticated) return null;
  const onPage = isPasswordChangePath(pathname);
  if (mustChangePassword) {
    if (onPage) return null;
    const clean = pathname ? stripQuery(pathname) : "";
    if (ALWAYS_ALLOWED_PATHS.some((p) => clean === p || clean.startsWith(`${p}/`))) return null;
    return PASSWORD_CHANGE_ROUTE;
  }
  return onPage ? "/" : null;
}

/** Destination right after a successful login/register/verify. */
export function postLoginDestination(
  user: { mustChangePassword?: unknown } | null | undefined,
  requested: string,
): string {
  return isMustChangePassword(user) ? PASSWORD_CHANGE_ROUTE : requested;
}

export function emailLocalPart(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  return (at === -1 ? email : email.slice(0, at)).trim().toLowerCase();
}

export type PasswordIssue = "tooShort" | "containsEmail";

export type PasswordCheck = { ok: boolean; issues: PasswordIssue[] };

/** Mirrors the backend rule: min 10 chars and must not contain the email local part. */
export function checkNewPassword(password: string, email?: string | null): PasswordCheck {
  const issues: PasswordIssue[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) issues.push("tooShort");
  const local = emailLocalPart(email);
  // Very short local parts ("a", "jo") would reject almost everything; the
  // server is the authority and this is only a hint, so ignore < 3 chars.
  if (local.length >= 3 && password.toLowerCase().includes(local)) issues.push("containsEmail");
  return { ok: issues.length === 0, issues };
}

export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

/** Visual hint only (the server enforces the real rules). */
export function passwordStrength(password: string, email?: string | null): PasswordStrength {
  if (!password) return "empty";
  if (!checkNewPassword(password, email).ok) return "weak";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 14 && classes >= 3) return "strong";
  return "medium";
}
