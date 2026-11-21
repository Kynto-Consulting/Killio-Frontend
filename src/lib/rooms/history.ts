/**
 * History of a room, Discord style: the list holds a WINDOW of the conversation (oldest to newest), not all of it.
 *
 *   - the initial window is the latest page, or the page around the first unread message;
 *   - scrolling up adds the previous page (`before`), scrolling down adds the next one (`after`) when the window was
 *     reached by a jump (`around`), and the window is bounded: far away messages are dropped and the matching edge flag
 *     (`hasMoreBefore` / `hasMoreAfter`) tells the UI there is more on that side;
 *   - messages that arrive live are added only when the window touches the present (`hasMoreAfter === false`); otherwise
 *     they are counted in `pendingNew` and fetched when the user goes to the latest messages.
 *
 * Everything here is pure (no React, no fetch): the reducer, the page normaliser (the backend answers a bare array
 * until it has pagination, and `{ messages, hasMoreBefore, hasMoreAfter, anchorMessageId }` when paginated) and the read
 * state helpers. Tested in history.test.ts. Relative imports only: node runs the tests without the `@/` alias.
 */

export const PAGE_SIZE = 50;
/** Messages kept in memory (not counting the ones that must never be dropped). Above it the far edge is trimmed. */
export const MAX_WINDOW = 300;
/** Where a trim stops: leaves room to keep scrolling in the same direction before trimming again. */
export const TRIM_TO = 220;

export interface HistoryMessage {
  id: string;
  createdAt: string;
  deleted?: boolean;
}

export interface HistoryPage<M extends HistoryMessage = HistoryMessage> {
  /** Oldest to newest. */
  messages: M[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  anchorMessageId: string | null;
  /** The backend answered a bare array (no pagination yet): `hasMoreAfter` is always false, `hasMoreBefore` is a guess. */
  legacy: boolean;
}

export type HistoryDirection = "latest" | "before" | "after" | "around";

export function timeOf(m: Pick<HistoryMessage, "createdAt">): number {
  const t = Date.parse(m.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/** Chronological order; ties (same millisecond) fall back to the id so the order is stable between pages. */
export function compareMessages(a: HistoryMessage, b: HistoryMessage): number {
  const d = timeOf(a) - timeOf(b);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortMessages<M extends HistoryMessage>(messages: readonly M[]): M[] {
  return [...messages].sort(compareMessages);
}

/** Optimistic and bot placeholders are local: they have no server id yet and must survive a window change. */
export function isLocalMessage(m: Pick<HistoryMessage, "id"> & { status?: string }): boolean {
  return m.id.startsWith("temp-") || m.id.startsWith("bot-") || m.status === "failed";
}

/**
 * Reads the answer of `GET /rooms/:id/messages` however the backend sent it. Deleted tombstones are dropped. For a bare
 * array `limit` is the requested page size: a full page suggests there is more before it.
 */
export function normalizePage<M extends HistoryMessage>(
  raw: unknown,
  opts: { limit?: number; direction?: HistoryDirection; normalize?: (m: M) => M } = {},
): HistoryPage<M> {
  const limit = opts.limit ?? PAGE_SIZE;
  const prep = (list: unknown): M[] => {
    const out: M[] = [];
    if (!Array.isArray(list)) return out;
    for (const item of list) {
      if (!item || typeof item !== "object" || typeof (item as M).id !== "string") continue;
      const m = item as M;
      if (m.deleted) continue;
      out.push(opts.normalize ? opts.normalize(m) : m);
    }
    return sortMessages(out);
  };
  if (Array.isArray(raw)) {
    const messages = prep(raw);
    return { messages, hasMoreBefore: raw.length >= limit, hasMoreAfter: false, anchorMessageId: null, legacy: true };
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const anchor = typeof body.anchorMessageId === "string" ? body.anchorMessageId : null;
  return {
    messages: prep(body.messages),
    hasMoreBefore: body.hasMoreBefore === true,
    hasMoreAfter: body.hasMoreAfter === true,
    anchorMessageId: anchor,
    legacy: false,
  };
}

// ── Reducer ────────────────────────────────────────────────────────────────

export interface HistoryState<M extends HistoryMessage = HistoryMessage> {
  messages: M[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  /** Live messages that arrived while the window did not touch the present. */
  pendingNew: number;
}

export function emptyHistory<M extends HistoryMessage>(): HistoryState<M> {
  return { messages: [], hasMoreBefore: false, hasMoreAfter: false, pendingNew: 0 };
}

export interface WindowRules<M extends HistoryMessage> {
  /** Messages that are never dropped by a trim (open thread replies, local placeholders). */
  protect?: (m: M) => boolean;
  max?: number;
  trimTo?: number;
}

export type HistoryAction<M extends HistoryMessage> =
  /** A fresh window (initial load, jump, back to the latest messages). */
  | { type: "replace"; page: HistoryPage<M>; keepLocal?: boolean }
  | { type: "prepend"; page: HistoryPage<M> }
  | { type: "append"; page: HistoryPage<M> }
  /** A message that arrived live (new or already known). */
  | { type: "live"; message: M }
  /** Any other change of the loaded messages (edit, reaction, pin, delete, optimistic send). */
  | { type: "map"; fn: (messages: M[]) => M[] }
  | { type: "reset" };

/** Merges `incoming` into `current` by id (incoming wins field by field), ordered. */
export function mergeById<M extends HistoryMessage>(current: readonly M[], incoming: readonly M[]): M[] {
  const byId = new Map<string, M>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) {
    const known = byId.get(m.id);
    byId.set(m.id, known ? { ...known, ...m } : m);
  }
  return sortMessages([...byId.values()]);
}

/**
 * Drops the far edge when the window is over `max`. `edge: "top"` removes the oldest messages (the user is going down),
 * `"bottom"` the newest (going up). Protected messages stay. Returns the same array when nothing changes.
 */
export function trimWindow<M extends HistoryMessage>(
  messages: M[],
  edge: "top" | "bottom",
  rules: WindowRules<M> = {},
): { messages: M[]; trimmed: boolean } {
  const max = rules.max ?? MAX_WINDOW;
  const target = Math.min(rules.trimTo ?? TRIM_TO, max);
  const protect = rules.protect ?? isLocalMessage;
  if (messages.length <= max) return { messages, trimmed: false };
  let drop = messages.length - target;
  const kept: M[] = [];
  const ordered = edge === "top" ? messages : [...messages].reverse();
  for (const m of ordered) {
    if (drop > 0 && !protect(m)) {
      drop -= 1;
      continue;
    }
    kept.push(m);
  }
  const next = edge === "top" ? kept : kept.reverse();
  return { messages: next, trimmed: next.length !== messages.length };
}

export function historyReducer<M extends HistoryMessage>(
  state: HistoryState<M>,
  action: HistoryAction<M>,
  rules: WindowRules<M> = {},
): HistoryState<M> {
  switch (action.type) {
    case "reset":
      return emptyHistory<M>();
    case "replace": {
      const locals = action.keepLocal ? state.messages.filter((m) => isLocalMessage(m as M & { status?: string })) : [];
      const fresh = locals.length ? mergeById(action.page.messages, locals) : action.page.messages;
      return { messages: fresh, hasMoreBefore: action.page.hasMoreBefore, hasMoreAfter: action.page.hasMoreAfter, pendingNew: 0 };
    }
    case "prepend": {
      const merged = mergeById(state.messages, action.page.messages);
      const { messages, trimmed } = trimWindow(merged, "bottom", rules);
      return {
        messages,
        hasMoreBefore: action.page.hasMoreBefore,
        // trimming the newest messages detaches the window from the present
        hasMoreAfter: state.hasMoreAfter || trimmed,
        pendingNew: state.pendingNew,
      };
    }
    case "append": {
      const merged = mergeById(state.messages, action.page.messages);
      const { messages, trimmed } = trimWindow(merged, "top", rules);
      return {
        messages,
        hasMoreBefore: state.hasMoreBefore || trimmed,
        hasMoreAfter: action.page.hasMoreAfter,
        pendingNew: action.page.hasMoreAfter ? state.pendingNew : 0,
      };
    }
    case "live": {
      const known = state.messages.some((m) => m.id === action.message.id);
      if (known) return { ...state, messages: state.messages.map((m) => (m.id === action.message.id ? { ...m, ...action.message } : m)) };
      if (state.hasMoreAfter) return { ...state, pendingNew: state.pendingNew + 1 };
      return { ...state, messages: mergeById(state.messages, [action.message]) };
    }
    case "map":
      return { ...state, messages: action.fn(state.messages) };
  }
}

// ── Read state ─────────────────────────────────────────────────────────────

export interface ReadState {
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  firstUnreadMessageId: string | null;
  firstUnreadAt: string | null;
  unreadCount: number;
  unreadMentions: number;
  /** `unreadCount` is a lower bound (the server stops counting at a cap). */
  unreadCapped: boolean;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** `GET /rooms/:id/read-state` (or the `readState` of a `PUT`), tolerant to missing fields. null when it is not an object. */
export function normalizeReadState(raw: unknown): ReadState | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  return {
    lastReadMessageId: str(b.lastReadMessageId),
    lastReadAt: str(b.lastReadAt),
    firstUnreadMessageId: str(b.firstUnreadMessageId),
    firstUnreadAt: str(b.firstUnreadAt),
    unreadCount: count(b.unreadCount),
    unreadMentions: count(b.unreadMentions),
    unreadCapped: b.unreadCapped === true,
  };
}

export type ReadAuthor = HistoryMessage & { userId?: string; status?: string };

/**
 * The message the "New messages" divider goes before. The server's first unread id wins when it is loaded; otherwise the
 * first loaded message from someone else that is newer than the read pointer (`lastReadAt`, or `firstUnreadAt`).
 */
export function unreadDividerId(messages: readonly ReadAuthor[], state: ReadState | null, selfId?: string | null): string | null {
  if (!state || state.unreadCount <= 0) return null;
  if (state.firstUnreadMessageId && messages.some((m) => m.id === state.firstUnreadMessageId)) return state.firstUnreadMessageId;
  const boundary = state.firstUnreadAt ? Date.parse(state.firstUnreadAt) : state.lastReadAt ? Date.parse(state.lastReadAt) : NaN;
  if (!Number.isFinite(boundary)) return null;
  const strict = state.firstUnreadAt != null;
  const first = messages.find((m) => !isLocalMessage(m) && m.userId !== selfId && (strict ? timeOf(m) >= boundary : timeOf(m) > boundary));
  return first?.id ?? null;
}

/** Index of a message in the window, -1 when it is not loaded. */
export function indexOfMessage(messages: readonly HistoryMessage[], id: string | null | undefined): number {
  return id ? messages.findIndex((m) => m.id === id) : -1;
}

/**
 * Is `candidate` newer than what was already reported as read (`markedId`)? Both must be loaded to compare; an unknown
 * `markedId` counts as "nothing reported yet".
 */
export function shouldMarkRead(messages: readonly ReadAuthor[], markedId: string | null, candidateId: string | null): boolean {
  if (!candidateId || candidateId.startsWith("temp-") || candidateId.startsWith("bot-")) return false;
  const c = indexOfMessage(messages, candidateId);
  if (c === -1) return false;
  const m = indexOfMessage(messages, markedId);
  return c > m;
}

/** Messages from others in the window after `afterId` (all when it is unknown): the "N new messages" of the floating button. */
export function newerFromOthers(messages: readonly ReadAuthor[], afterId: string | null, selfId?: string | null): number {
  const start = indexOfMessage(messages, afterId) + 1;
  let n = 0;
  for (let i = start; i < messages.length; i += 1) {
    const m = messages[i]!;
    if (!isLocalMessage(m) && m.userId !== selfId) n += 1;
  }
  return n;
}

/** Text of the floating "go to the latest" button counter: 1..99, then "99+". */
export function formatNewCount(n: number): string {
  return n > 99 ? "99+" : String(Math.max(0, Math.floor(n)));
}

/** Debounce with a trailing call and `flush`/`cancel`. Plain timers: injectable for tests. */
export function createDebounced<A extends unknown[]>(fn: (...args: A) => void, ms: number, timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }) {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let last: A | null = null;
  const run = () => {
    handle = null;
    if (last) {
      const args = last;
      last = null;
      fn(...args);
    }
  };
  return {
    call(...args: A) {
      last = args;
      if (handle) timers.clear(handle);
      handle = timers.set(run, ms);
    },
    flush() {
      if (handle) timers.clear(handle);
      run();
    },
    cancel() {
      if (handle) timers.clear(handle);
      handle = null;
      last = null;
    },
  };
}

// ── Thread window ──────────────────────────────────────────────────────────

/** The replies of an open thread the panel shows: a contiguous range, so a page loaded earlier never leaves a gap. */
export interface ReplyRange {
  /** Replies older than this instant (ms) are hidden; null = from the first reply. */
  from: number | null;
  /** Replies newer than this instant (ms) are hidden; null = up to the latest. */
  to: number | null;
}

export function windowReplies<M extends HistoryMessage>(replies: readonly M[], range: ReplyRange | null): M[] {
  if (!range) return [...replies];
  return replies.filter((m) => {
    if (isLocalMessage(m as M & { status?: string })) return true;
    const t = timeOf(m);
    return (range.from === null || t >= range.from) && (range.to === null || t <= range.to);
  });
}

/** The range after a page was loaded: `before` / `after` say whether the thread has more on that side. */
export function rangeAfterPage(prev: ReplyRange | null, page: Pick<HistoryPage, "messages" | "hasMoreBefore" | "hasMoreAfter">, side: "replace" | "before" | "after"): ReplyRange {
  const first = page.messages[0];
  const last = page.messages[page.messages.length - 1];
  const from = page.hasMoreBefore ? (first ? timeOf(first) : prev?.from ?? null) : null;
  const to = page.hasMoreAfter ? (last ? timeOf(last) : prev?.to ?? null) : null;
  if (side === "before") return { from, to: prev ? prev.to : to };
  if (side === "after") return { from: prev ? prev.from : from, to };
  return { from, to };
}
