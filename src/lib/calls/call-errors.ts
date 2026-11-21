/** Maps the call API's error bodies (`{ code, message, ... }`, status 409) and browser media errors to UI notices. i18n: rooms:call.notice.<kind>. */

export type CallNotice =
  | { kind: "callFull"; max: number }
  | { kind: "callEnded" }
  | { kind: "screenshareBusy"; sharerName: string }
  | { kind: "notInCall" }
  | { kind: "forbidden" }
  | { kind: "screenDenied" }
  | { kind: "screenSystem" }
  | { kind: "screenNoSource" }
  | { kind: "screenUnsupported" }
  | { kind: "screenInsecure" }
  | { kind: "screenFailed" }
  | { kind: "mediaDenied" }
  | { kind: "mediaNotFound" }
  | { kind: "audioOnly" };

export function noticeFromApiError(status: number, body: unknown): CallNotice | null {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = typeof b.code === "string" ? b.code : "";
  if (status === 403) return { kind: "forbidden" };
  if (code === "call_full") return { kind: "callFull", max: typeof b.max === "number" ? b.max : 6 };
  if (code === "call_ended") return { kind: "callEnded" };
  if (code === "not_in_call") return { kind: "notInCall" };
  if (code === "screenshare_busy") {
    const sharer = b.sharer && typeof b.sharer === "object" ? (b.sharer as Record<string, unknown>) : {};
    return { kind: "screenshareBusy", sharerName: typeof sharer.displayName === "string" ? sharer.displayName : "" };
  }
  return null;
}

/** getUserMedia failures at join time. */
export function noticeFromMediaError(err: unknown): CallNotice {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  return name === "NotFoundError" || name === "OverconstrainedError" ? { kind: "mediaNotFound" } : { kind: "mediaDenied" };
}

export const NOTICE_I18N_KEY: Record<CallNotice["kind"], string> = {
  callFull: "call.notice.callFull",
  callEnded: "call.notice.callEnded",
  screenshareBusy: "call.notice.screenshareBusy",
  notInCall: "call.notice.notInCall",
  forbidden: "call.notice.forbidden",
  screenDenied: "call.notice.screenDenied",
  screenSystem: "call.notice.screenSystem",
  screenNoSource: "call.notice.screenNoSource",
  screenUnsupported: "call.notice.screenUnsupported",
  screenInsecure: "call.notice.screenInsecure",
  screenFailed: "call.notice.screenFailed",
  mediaDenied: "call.notice.mediaDenied",
  mediaNotFound: "call.notice.mediaNotFound",
  audioOnly: "call.notice.audioOnly",
};
