/**
 * Client of the paginated room history, the read state and the message search. No React and no `@/` imports (node runs
 * its tests): `fetch` is the global one and the base URL can be injected.
 *
 * Contract (backend, deployed):
 *   GET /rooms/:id/messages                 no cursor -> bare array (legacy); `before=<id>|after=<id>|around=<id>|paged=1` -> page
 *   GET /rooms/:id/read-state               PUT /rooms/:id/read-state { messageId, threadRootId? }
 *   GET /teams/:id/messages/search          GET /rooms/:id/messages/search
 */

import { PAGE_SIZE, normalizePage, normalizeReadState, type HistoryDirection, type HistoryMessage, type HistoryPage, type ReadState } from "./history.ts";

const DEFAULT_BASE = (process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class HistoryApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly data?: Record<string, unknown>;
  /** From a 429 (`retryAfterSeconds` of the body or the `Retry-After` header). */
  readonly retryAfterSeconds?: number;
  constructor(message: string, status: number, code?: string, data?: Record<string, unknown>, retryAfterSeconds?: number) {
    super(message);
    this.name = "HistoryApiError";
    this.status = status;
    this.code = code;
    this.data = data;
    this.retryAfterSeconds = retryAfterSeconds;
  }
  get isForbidden() { return this.status === 403; }
  get isUnavailable() { return this.status === 404 || this.status === 405 || this.status === 501; }
  /** The cursor message is a thread reply: `threadRootId` says which thread to open. */
  get threadRootId(): string | null {
    const v = this.code === "message_in_thread" ? this.data?.threadRootId : null;
    return typeof v === "string" ? v : null;
  }
}

async function failure(res: Response, fallback: string): Promise<HistoryApiError> {
  let message = fallback;
  let code: string | undefined;
  let data: Record<string, unknown> | undefined;
  try {
    const body = await res.clone().json();
    if (body && typeof body === "object") {
      data = body as Record<string, unknown>;
      if (typeof data.message === "string") message = data.message;
      if (typeof data.code === "string") code = data.code;
    }
  } catch {
    // not JSON: keep the fallback
  }
  let retry: number | undefined;
  const fromBody = Number(data?.retryAfterSeconds);
  const fromHeader = Number(res.headers?.get?.("retry-after"));
  if (Number.isFinite(fromBody) && fromBody > 0) retry = fromBody;
  else if (res.status === 429 && Number.isFinite(fromHeader) && fromHeader > 0) retry = fromHeader;
  return new HistoryApiError(message, res.status, code, data, retry);
}

export interface ApiOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

// ── Messages ───────────────────────────────────────────────────────────────

export interface MessagesQuery {
  limit?: number;
  /** Message id (paged backend). */
  before?: string;
  after?: string;
  around?: string;
  /** Timestamp used instead of `before` when the backend is known to be legacy. */
  beforeAt?: string;
  threadRootId?: string;
}

/** Set by the first answer that was a bare array: from then on `before` carries the timestamp. Per base URL. */
const legacyBackends = new Set<string>();
export const isLegacyBackend = (baseUrl = DEFAULT_BASE) => legacyBackends.has(baseUrl);
export const resetLegacyBackends = () => legacyBackends.clear();

export function directionOf(q: MessagesQuery): HistoryDirection {
  return q.around ? "around" : q.after ? "after" : q.before ? "before" : "latest";
}

export function buildMessagesParams(q: MessagesQuery, legacy = false): URLSearchParams {
  const p = new URLSearchParams({ limit: String(q.limit ?? PAGE_SIZE) });
  const cursors = [q.before ? "before" : null, q.after ? "after" : null, q.around ? "around" : null].filter(Boolean).length;
  if (cursors > 1) throw new HistoryApiError("Only one of before, after and around can be used", 400, "conflicting_cursors");
  if (q.before) p.set("before", legacy && q.beforeAt ? q.beforeAt : q.before);
  if (q.after) p.set("after", q.after);
  if (q.around) p.set("around", q.around);
  if (q.threadRootId) p.set("threadRootId", q.threadRootId);
  // Ask for the paged shape even for the latest page: a bare array tells us the backend is not paginated yet.
  if (!legacy && !q.before && !q.after && !q.around) p.set("paged", "1");
  return p;
}

/**
 * One page of messages. Works against both backends: a paged answer is used as is; a bare array is wrapped (`legacy`),
 * and from then on older pages are requested with the timestamp of the oldest message (`beforeAt`).
 * `after` and `around` need the paged backend: a legacy one rejects them with `unsupported`.
 */
export async function fetchMessagesPage<M extends HistoryMessage>(
  roomId: string,
  token: string,
  query: MessagesQuery,
  opts: ApiOptions & { normalize?: (m: M) => M } = {},
): Promise<HistoryPage<M>> {
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const legacy = legacyBackends.has(base);
  if (legacy && (query.after || query.around)) throw new HistoryApiError("This server does not paginate the history yet", 501, "unsupported");
  const params = buildMessagesParams(query, legacy);
  const res = await fetch(`${base}/rooms/${encodeURIComponent(roomId)}/messages?${params}`, { headers: headers(token), signal: opts.signal });
  if (!res.ok) throw await failure(res, "Failed to fetch messages");
  const raw: unknown = await res.json();
  const limit = query.limit ?? PAGE_SIZE;
  const page = normalizePage<M>(raw, { limit, direction: directionOf(query), normalize: opts.normalize });
  if (page.legacy) {
    legacyBackends.add(base);
    // a legacy backend knows nothing about after/around: what came back is the latest page
    if (query.after || query.around) throw new HistoryApiError("This server does not paginate the history yet", 501, "unsupported");
  }
  return page;
}

// ── Read state ─────────────────────────────────────────────────────────────

/** The read pointer of the caller. null when the server has no read state yet (404/405/501) or answers nonsense. */
export async function fetchReadState(roomId: string, token: string, opts: ApiOptions = {}): Promise<ReadState | null> {
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}/rooms/${encodeURIComponent(roomId)}/read-state`, { headers: headers(token), signal: opts.signal });
  if (!res.ok) {
    const err = await failure(res, "Failed to fetch read state");
    if (err.isUnavailable) return null;
    throw err;
  }
  return normalizeReadState(await res.json());
}

/** Marks the room (or a thread) as read up to `messageId`. Returns the new read state when the server sends it. */
export async function putReadState(
  roomId: string,
  token: string,
  body: { messageId: string; threadRootId?: string },
  opts: ApiOptions = {},
): Promise<ReadState | null> {
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}/rooms/${encodeURIComponent(roomId)}/read-state`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) throw await failure(res, "Failed to mark as read");
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  // `{ ...readState, marked }`, or `{ readState, marked }`: accept both shapes
  return normalizeReadState(json && typeof json.readState === "object" ? json.readState : json);
}

// ── Search ─────────────────────────────────────────────────────────────────

export type SearchSort = "relevance" | "recent";
export type SearchScope = "room" | "team";

export interface SearchWarning {
  operator: string;
  value: string;
  code: string;
}

export interface IncludeExclude<T> {
  include: T[];
  exclude: T[];
}

export interface SearchResultAuthor {
  userId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isBot: boolean;
}

export interface SearchResult {
  messageId: string;
  roomId: string;
  roomName: string;
  roomKind: string;
  /** Root of the thread this message answers in; null for a top-level message. */
  threadId: string | null;
  kind: string;
  author: SearchResultAuthor | null;
  createdAt: string;
  editedAt: string | null;
  pinned: boolean;
  /** Plain text with highlight markers U+E000 / U+E001 and fragments joined by an ellipsis. NEVER inject as HTML. */
  snippet: string;
  score: number | null;
}

export interface SearchFilters {
  terms: string[];
  phrases: string[];
  excluded: string[];
  from: IncludeExclude<string>;
  mentions: IncludeExclude<string>;
  in: IncludeExclude<string>;
  has: IncludeExclude<string>;
  after: string | null;
  before: string | null;
  pinned: boolean | null;
  is: "bot" | "human" | null;
  thread: string | null;
}

export interface SearchResponse {
  query: { q: string; text: string; sort: SearchSort; scope: SearchScope };
  filters: SearchFilters;
  results: SearchResult[];
  hasMore: boolean;
  nextCursor: string | null;
  /** First page only. */
  total: number | null;
  /** `total` is a lower bound. */
  totalCapped: boolean;
  warnings: SearchWarning[];
}

export interface SearchParams {
  scope: SearchScope;
  /** Room id (scope room) or team id (scope team). */
  id: string;
  q: string;
  sort?: SearchSort;
  limit?: number;
  cursor?: string | null;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const incEx = (v: unknown): IncludeExclude<string> => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { include: list(o.include), exclude: list(o.exclude) };
};

export function normalizeSearchResponse(raw: unknown): SearchResponse {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (b.filters && typeof b.filters === "object" ? b.filters : {}) as Record<string, unknown>;
  const q = (b.query && typeof b.query === "object" ? b.query : {}) as Record<string, unknown>;
  const results: SearchResult[] = [];
  for (const r of Array.isArray(b.results) ? b.results : []) {
    if (!r || typeof r !== "object" || typeof (r as SearchResult).messageId !== "string" || typeof (r as SearchResult).roomId !== "string") continue;
    const x = r as Partial<SearchResult>;
    results.push({
      messageId: x.messageId!,
      roomId: x.roomId!,
      roomName: x.roomName ?? "",
      roomKind: x.roomKind ?? "channel",
      threadId: typeof x.threadId === "string" ? x.threadId : null,
      kind: x.kind ?? "text",
      author: x.author && typeof x.author === "object"
        ? { userId: x.author.userId ?? null, displayName: x.author.displayName ?? null, avatarUrl: x.author.avatarUrl ?? null, isBot: x.author.isBot === true }
        : null,
      createdAt: x.createdAt ?? "",
      editedAt: x.editedAt ?? null,
      pinned: x.pinned === true,
      snippet: typeof x.snippet === "string" ? x.snippet : "",
      score: typeof x.score === "number" ? x.score : null,
    });
  }
  return {
    query: {
      q: typeof q.q === "string" ? q.q : "",
      text: typeof q.text === "string" ? q.text : "",
      sort: q.sort === "recent" ? "recent" : "relevance",
      scope: q.scope === "room" ? "room" : "team",
    },
    filters: {
      terms: list(f.terms), phrases: list(f.phrases), excluded: list(f.excluded),
      from: incEx(f.from), mentions: incEx(f.mentions), in: incEx(f.in), has: incEx(f.has),
      after: typeof f.after === "string" ? f.after : null,
      before: typeof f.before === "string" ? f.before : null,
      pinned: typeof f.pinned === "boolean" ? f.pinned : null,
      is: f.is === "bot" || f.is === "human" ? f.is : null,
      thread: typeof f.thread === "string" ? f.thread : null,
    },
    results,
    hasMore: b.hasMore === true,
    nextCursor: typeof b.nextCursor === "string" ? b.nextCursor : null,
    total: typeof b.total === "number" ? b.total : null,
    totalCapped: b.totalCapped === true,
    warnings: Array.isArray(b.warnings)
      ? b.warnings.filter((w): w is SearchWarning => !!w && typeof w === "object" && typeof (w as SearchWarning).code === "string")
          .map((w) => ({ operator: String(w.operator ?? ""), value: String(w.value ?? ""), code: w.code }))
      : [],
  };
}

export function buildSearchUrl(p: SearchParams, baseUrl = DEFAULT_BASE): string {
  const base = baseUrl.replace(/\/$/, "");
  const qs = new URLSearchParams();
  // Operators travel INSIDE `q` (negations only exist there; the server merges them with its explicit parameters).
  qs.set("q", p.q);
  qs.set("sort", p.sort ?? "relevance");
  if (p.limit) qs.set("limit", String(p.limit));
  if (p.cursor) qs.set("cursor", p.cursor);
  const path = p.scope === "room" ? `/rooms/${encodeURIComponent(p.id)}/messages/search` : `/teams/${encodeURIComponent(p.id)}/messages/search`;
  return `${base}${path}?${qs}`;
}

export async function searchMessages(p: SearchParams, token: string, opts: ApiOptions = {}): Promise<SearchResponse> {
  const res = await fetch(buildSearchUrl(p, opts.baseUrl), { headers: headers(token), signal: opts.signal });
  if (!res.ok) throw await failure(res, "Search failed");
  return normalizeSearchResponse(await res.json());
}
