/**
 * Quality of a shared screen in a mesh call.
 *
 * In a mesh the sharer uploads one copy per viewer, so the upload budget is divided by the number of viewers. Text on a screen
 * needs resolution more than frame rate. The numbers are starting points, not measured on real networks (see the audit): the
 * browser still adapts below them when the link is bad.
 */

export const SCREEN_MAX_BITRATE_BPS = 2_500_000;
export const SCREEN_MIN_BITRATE_BPS = 400_000;
export const UPLOAD_BUDGET_BPS = 6_000_000;
export const CAMERA_BITRATE_WHILE_SHARING_BPS = 250_000;

/** Bitrate per viewer: the budget split between viewers, clamped to [min, max]. */
export function screenBitratePerViewer(viewers: number, budget: number = UPLOAD_BUDGET_BPS): number {
  const n = Math.max(1, Math.floor(viewers));
  return Math.round(Math.min(SCREEN_MAX_BITRATE_BPS, Math.max(SCREEN_MIN_BITRATE_BPS, budget / n)));
}

/** Frame rate falls as viewers are added so the detail survives. */
export function screenFramerate(viewers: number): number {
  return viewers <= 2 ? 15 : viewers <= 4 ? 10 : 8;
}

export interface ScreenCaptureRequest {
  video: MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
  /** Chromium hints, ignored elsewhere: do not offer this very tab, welcome system audio, allow switching the shared surface. */
  selfBrowserSurface?: "exclude" | "include";
  systemAudio?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
}

export function screenCaptureRequest(wantAudio: boolean): ScreenCaptureRequest {
  return {
    video: { frameRate: { ideal: 15, max: 30 } },
    audio: wantAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    selfBrowserSurface: "exclude",
    systemAudio: wantAudio ? "include" : "exclude",
    surfaceSwitching: "include",
  };
}

export type CaptureErrorKind = "denied" | "system" | "noSource" | "unsupported" | "insecure" | "other";

/** Maps what getDisplayMedia throws to something the UI can say. NotAllowedError is both "denied" and "closed the picker". */
export function classifyCaptureError(err: unknown, env: { hasApi: boolean; secure: boolean }): CaptureErrorKind {
  if (!env.secure) return "insecure";
  if (!env.hasApi) return "unsupported";
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotReadableError" || name === "AbortError") return "system";
  if (name === "NotFoundError") return "noSource";
  if (name === "TypeError") return "unsupported";
  return "other";
}
