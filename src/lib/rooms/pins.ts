/**
 * Pins with expiry of a room (UI side). Pure helpers, tested in pins.test.ts: expiry choices and their request body,
 * the server summary (limit, presets, rights), the countdown text, ordering, the reduction of pin events and the
 * clock correction (the server's `serverNow` against the browser clock).
 *
 * The server clears expired pins lazily, so the client MUST drop a pin locally when `pinExpiresAt` arrives.
 */

export interface PinFields {
  id: string;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  pinExpiresAt?: string | null;
}

export type PinPresetId = "1h" | "24h" | "7d" | "30d" | "never";

export const PRESET_MINUTES: Record<Exclude<PinPresetId, "never">, number> = { "1h": 60, "24h": 1440, "7d": 10080, "30d": 43200 };
export const DEFAULT_PRESET_IDS: readonly PinPresetId[] = ["1h", "24h", "7d", "30d"];

/* ───────────────────────── Clock correction ───────────────────────── */

let clockOffsetMs = 0;

/** Learns the difference between the server clock and this browser's (server minus client). Ignores a bad value. */
export function syncServerClock(serverNow: unknown, clientNow = Date.now()): number {
  const t = typeof serverNow === "string" || typeof serverNow === "number" ? new Date(serverNow).getTime() : NaN;
  if (Number.isFinite(t)) clockOffsetMs = t - clientNow;
  return clockOffsetMs;
}

/** "Now" on the server's clock. */
export const pinNow = (clientNow = Date.now()): number => clientNow + clockOffsetMs;
export const getClockOffset = (): number => clockOffsetMs;
export const resetClockOffset = (): void => { clockOffsetMs = 0; };

/* ───────────────────────── Summary and rights ───────────────────────── */

export interface PinPresetOption {
  id: string;
  /** null = no expiry. */
  minutes: number | null;
}

export interface PinSummary {
  limit: number;
  count: number;
  maxDurationMinutes: number | null;
  presets: PinPresetOption[];
  canPin: boolean;
  canPinPermanent: boolean;
  canUnpinOthers: boolean;
  serverNow: string | null;
}

export interface PinCaps {
  limit: number | null;
  count: number | null;
  maxDurationMinutes: number | null;
  canPin: boolean;
  canPinPermanent: boolean;
  canUnpinOthers: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function normalizePreset(raw: unknown): PinPresetOption | null {
  if (typeof raw === "string") {
    if (raw === "never") return { id: raw, minutes: null };
    return raw in PRESET_MINUTES ? { id: raw, minutes: PRESET_MINUTES[raw as keyof typeof PRESET_MINUTES] } : null;
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const id = [r.id, r.preset, r.key, r.name].find((v) => typeof v === "string") as string | undefined;
    if (!id) return null;
    if (id === "never") return { id, minutes: null };
    const minutes = num(r.minutes) ?? num(r.durationMinutes) ?? (id in PRESET_MINUTES ? PRESET_MINUTES[id as keyof typeof PRESET_MINUTES] : null);
    return minutes && minutes > 0 ? { id, minutes } : null;
  }
  return null;
}

/** Accepts the summary of `GET /rooms/:id/pins/summary`; null when it does not look like one. */
export function normalizePinSummary(raw: unknown): PinSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const limit = num(r.limit);
  if (limit === null) return null;
  const presets = (Array.isArray(r.presets) ? r.presets : []).map(normalizePreset).filter((p): p is PinPresetOption => p !== null);
  return {
    limit,
    count: Math.max(0, num(r.count) ?? 0),
    maxDurationMinutes: num(r.maxDurationMinutes),
    presets,
    canPin: r.canPin === true,
    canPinPermanent: r.canPinPermanent === true,
    canUnpinOthers: r.canUnpinOthers === true,
    serverNow: typeof r.serverNow === "string" ? r.serverNow : null,
  };
}

/** The summary is authoritative once loaded (the room controls still switch pinning off, e.g. for a muted member); before that, the permission keys decide. */
export function resolvePinCaps(
  summary: PinSummary | null,
  fallback: { canPin: boolean; canPinPermanent?: boolean; canUnpinOthers?: boolean }
): PinCaps {
  if (summary) {
    return {
      limit: summary.limit, count: summary.count, maxDurationMinutes: summary.maxDurationMinutes,
      canPin: summary.canPin && fallback.canPin, canPinPermanent: summary.canPinPermanent, canUnpinOthers: summary.canUnpinOthers,
    };
  }
  return {
    limit: null, count: null, maxDurationMinutes: null,
    canPin: fallback.canPin, canPinPermanent: Boolean(fallback.canPinPermanent), canUnpinOthers: Boolean(fallback.canUnpinOthers),
  };
}

/** Presets the picker offers: the server's list (or the four defaults), "never" only with the right, nothing above the maximum. */
export function pickerPresets(summary: PinSummary | null, canPinPermanent: boolean): PinPresetOption[] {
  const base = summary && summary.presets.length > 0
    ? summary.presets
    : DEFAULT_PRESET_IDS.map((id) => ({ id, minutes: PRESET_MINUTES[id as keyof typeof PRESET_MINUTES] }));
  const max = summary?.maxDurationMinutes ?? null;
  const timed = base.filter((p) => p.minutes !== null && (canPinPermanent || max === null || p.minutes <= max));
  const never = canPinPermanent ? [{ id: "never", minutes: null as number | null }] : [];
  return [...timed, ...never];
}

/** Can this user take the pin off the message? Their own pins always; other people's only with the right. */
export function canUnpinMessage(message: PinFields, currentUserId: string, caps: Pick<PinCaps, "canUnpinOthers">): boolean {
  if (!message.pinnedAt) return false;
  if (currentUserId && message.pinnedBy && message.pinnedBy === currentUserId) return true;
  return caps.canUnpinOthers;
}

/* ───────────────────────── Expiry choice -> request ───────────────────────── */

export type ExpiryChoice =
  | { kind: "preset"; id: string; minutes: number | null }
  | { kind: "custom"; at: number };

export interface PinBody {
  expiresAt?: string;
  durationMinutes?: number;
  preset?: PinPresetId;
  replaceOldest?: boolean;
}

/** Body of PUT / PATCH. At most one date field; a known preset travels as its name, an unknown one as minutes. */
export function buildPinBody(choice: ExpiryChoice, replaceOldest = false): PinBody {
  let body: PinBody;
  if (choice.kind === "custom") body = { expiresAt: new Date(choice.at).toISOString() };
  else if (choice.id === "never" || choice.minutes === null) body = { preset: "never" };
  else if (choice.id in PRESET_MINUTES) body = { preset: choice.id as PinPresetId };
  else body = { durationMinutes: choice.minutes };
  return replaceOldest ? { ...body, replaceOldest: true } : body;
}

/** When the choice would expire (server clock, ms), or null for no expiry. */
export function computeExpiry(choice: ExpiryChoice, now: number): number | null {
  if (choice.kind === "custom") return choice.at;
  return choice.minutes === null ? null : now + choice.minutes * 60_000;
}

export type CustomDateCheck = "ok" | "invalid" | "past" | "tooSoon" | "tooFar";

/** Validates a custom expiry: in the future (at least a minute) and within the maximum duration when there is one. */
export function validateCustomExpiry(at: number, now: number, maxDurationMinutes: number | null, canPinPermanent: boolean): CustomDateCheck {
  if (!Number.isFinite(at)) return "invalid";
  if (at <= now) return "past";
  if (at - now < 60_000) return "tooSoon";
  if (!canPinPermanent && maxDurationMinutes !== null && at - now > maxDurationMinutes * 60_000) return "tooFar";
  return "ok";
}

/** Value of a `datetime-local` input (`YYYY-MM-DDTHH:mm`, local time) -> ms; NaN when empty or malformed. */
export function parseLocalDateTime(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : NaN;
}

/** ms -> value of a `datetime-local` input in local time. */
export function toLocalDateTimeValue(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ───────────────────────── Countdown ───────────────────────── */

/** Readable remaining time: "2d 3h", "3h 5m", "12m", "45s". Rounds up, so it never says 0 while time is left. */
export function formatPinCountdown(ms: number): string {
  if (!(ms > 0)) return "0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 && minutes < 5 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

/** Milliseconds until the pin expires on the server clock; null when it has no expiry (or the date is unreadable). */
export function pinTimeLeft(m: PinFields, now: number): number | null {
  if (!m.pinExpiresAt) return null;
  const t = Date.parse(m.pinExpiresAt);
  return Number.isNaN(t) ? null : t - now;
}

/** A pin is in force when it exists and has not reached its expiry. */
export function isPinActive(m: PinFields, now: number): boolean {
  if (!m.pinnedAt) return false;
  const left = pinTimeLeft(m, now);
  return left === null || left > 0;
}

/** How often a countdown must repaint: every second in the last two minutes, otherwise every 15 s. */
export function pinTickInterval(minLeftMs: number | null): number {
  return minLeftMs !== null && minLeftMs <= 120_000 ? 1000 : 15_000;
}

/* ───────────────────────── Ordering and expiry sweep ───────────────────────── */

/** Newest pin first (ties by id, so the order is stable). */
export function sortPins<M extends PinFields>(list: readonly M[]): M[] {
  return [...list].sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "") || a.id.localeCompare(b.id));
}

/** Oldest active pin (the one "replace the oldest" would take). */
export function oldestPin<M extends PinFields>(list: readonly M[]): M | undefined {
  const sorted = sortPins(list.filter((m) => m.pinnedAt));
  return sorted[sorted.length - 1];
}

/** Clears the pin of every message whose expiry has passed. Returns the same array when nothing changed. */
export function expirePins<M extends PinFields>(list: readonly M[], now: number): M[] {
  let changed = false;
  const out = list.map((m) => {
    if (m.pinnedAt && !isPinActive(m, now)) {
      changed = true;
      return { ...m, pinnedAt: null, pinnedBy: null, pinExpiresAt: null };
    }
    return m;
  });
  return changed ? out : (list as M[]);
}

/** Earliest expiry (ms) among the pins in force, or null when none can expire. */
export function nextPinExpiry(list: readonly PinFields[], now: number): number | null {
  let next: number | null = null;
  for (const m of list) {
    if (!isPinActive(m, now) || !m.pinExpiresAt) continue;
    const t = Date.parse(m.pinExpiresAt);
    if (!Number.isNaN(t) && (next === null || t < next)) next = t;
  }
  return next;
}

/** `setTimeout` cannot wait longer than 2^31-1 ms (about 24.8 days): longer waits are taken in steps. */
export const MAX_TIMER_MS = 2_147_000_000;
export const clampTimerDelay = (ms: number): number => Math.min(Math.max(ms, 0), MAX_TIMER_MS);

/* ───────────────────────── Events ───────────────────────── */

export type PinReason = "manual" | "expired" | "replaced";

export interface PinPatch {
  messageId: string;
  pinned: boolean;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  pinExpiresAt?: string | null;
  reason?: PinReason;
  unpinnedBy?: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Reads `room.message.pinned` / `room.message.unpinned` (and a message DTO of PUT / PATCH / DELETE). Null without a message id. */
export function normalizePinEvent(name: string, data: unknown): PinPatch | null {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const messageId = str(d.messageId) ?? str(d.id);
  if (!messageId) return null;
  const unpinnedName = name.endsWith(".unpinned");
  const pinned = unpinnedName ? false : typeof d.pinned === "boolean" ? d.pinned : name.endsWith(".pinned") ? true : Boolean(d.pinnedAt);
  const reason = d.reason === "manual" || d.reason === "expired" || d.reason === "replaced" ? d.reason : undefined;
  if (!pinned) return { messageId, pinned: false, reason, unpinnedBy: str(d.unpinnedBy) };
  return {
    messageId, pinned: true,
    pinnedAt: str(d.pinnedAt),
    pinnedBy: str(d.pinnedBy),
    pinExpiresAt: str(d.pinExpiresAt),
  };
}

/** Patches derived from the DTO that PUT / PATCH / DELETE answer with (plus the message `replaceOldest` unpinned). */
export function patchesFromPinResponse(dto: unknown, fallbackMessageId: string): PinPatch[] {
  const d = (dto && typeof dto === "object" ? dto : {}) as Record<string, unknown>;
  const id = str(d.id) ?? str(d.messageId) ?? fallbackMessageId;
  const pinned = Boolean(d.pinned) || Boolean(d.pinnedAt);
  const out: PinPatch[] = [
    pinned
      ? { messageId: id, pinned: true, pinnedAt: str(d.pinnedAt), pinnedBy: str(d.pinnedBy), pinExpiresAt: str(d.pinExpiresAt) }
      : { messageId: id, pinned: false, reason: "manual" },
  ];
  const replaced = str(d.replacedMessageId);
  if (replaced) out.push({ messageId: replaced, pinned: false, reason: "replaced" });
  return out;
}

/** Applies one patch to a list of messages (the live copy or the panel's fetched copy). Unknown ids leave the list as it is. */
export function applyPinPatch<M extends PinFields>(list: readonly M[], patch: PinPatch, now = pinNow()): M[] {
  let changed = false;
  const out = list.map((m) => {
    if (m.id !== patch.messageId) return m;
    changed = true;
    if (!patch.pinned) return { ...m, pinnedAt: null, pinnedBy: null, pinExpiresAt: null };
    return {
      ...m,
      pinnedAt: patch.pinnedAt ?? m.pinnedAt ?? new Date(now).toISOString(),
      pinnedBy: patch.pinnedBy ?? m.pinnedBy ?? null,
      // An event always says the expiry (null = none): a missing field must not keep an old one.
      pinExpiresAt: patch.pinExpiresAt ?? null,
    };
  });
  return changed ? out : (list as M[]);
}

/** Does the patch pin a message the list does not hold (so the panel should fetch the pin list again)? */
export function patchNeedsRefetch(list: readonly PinFields[], patch: PinPatch): boolean {
  return patch.pinned && !list.some((m) => m.id === patch.messageId);
}

/* ───────────────────────── Errors ───────────────────────── */

export type PinErrorKind = "limit" | "limitOthers" | "permanentForbidden" | "notActive" | "invalidDate" | "forbidden" | "generic";

export interface PinErrorInfo {
  kind: PinErrorKind;
  limit?: number;
  count?: number;
  oldestMessageId?: string;
}

const pick = (obj: Record<string, unknown> | undefined, key: string): unknown => {
  if (!obj) return undefined;
  if (key in obj) return obj[key];
  const nested = obj.details;
  return nested && typeof nested === "object" ? (nested as Record<string, unknown>)[key] : undefined;
};

/** Maps the backend error (`status`, `code`, body in `data`) to what the UI explains and offers. */
export function classifyPinError(err: unknown): PinErrorInfo {
  const e = (err && typeof err === "object" ? err : {}) as { status?: number; code?: string; data?: Record<string, unknown> };
  const code = e.code ?? (typeof e.data?.code === "string" ? e.data.code : undefined);
  const info = {
    limit: num(pick(e.data, "limit")) ?? undefined,
    count: num(pick(e.data, "count")) ?? undefined,
    oldestMessageId: str(pick(e.data, "oldestMessageId")) ?? undefined,
  };
  if (code === "room_pin_limit") return { kind: e.status === 403 ? "limitOthers" : "limit", ...info };
  if (code === "room_pin_permanent_forbidden") return { kind: "permanentForbidden" };
  if (code === "room_pin_not_active") return { kind: "notActive" };
  if (e.status === 400) return { kind: "invalidDate" };
  if (e.status === 403) return { kind: "forbidden" };
  return { kind: "generic" };
}
