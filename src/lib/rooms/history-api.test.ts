import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  HistoryApiError, buildMessagesParams, buildSearchUrl, fetchMessagesPage, fetchReadState, isLegacyBackend, normalizeSearchResponse, putReadState,
  resetLegacyBackends, searchMessages,
} from "./history-api.ts";

const BASE = "http://api.test";
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; resetLegacyBackends(); });

type Call = { url: string; init?: RequestInit };
function mockFetch(reply: (call: Call) => { status?: number; body?: unknown; headers?: Record<string, string> }): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    const r = reply(call);
    return new Response(JSON.stringify(r.body ?? null), { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }) as typeof fetch;
  return calls;
}
const m = (n: number) => ({ id: `m${n}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString() });

test("buildMessagesParams: latest asks for the paged shape; cursors are exclusive", () => {
  assert.equal(buildMessagesParams({}).toString(), "limit=50&paged=1");
  assert.equal(buildMessagesParams({ before: "x", limit: 20 }).toString(), "limit=20&before=x");
  assert.equal(buildMessagesParams({ around: "y", threadRootId: "t" }).toString(), "limit=50&around=y&threadRootId=t");
  assert.throws(() => buildMessagesParams({ before: "a", after: "b" }), (e: unknown) => e instanceof HistoryApiError && e.code === "conflicting_cursors");
});

test("fetchMessagesPage: paged backend answer is used as is", async () => {
  const calls = mockFetch(() => ({ body: { messages: [m(1), m(2)], hasMoreBefore: true, hasMoreAfter: false } }));
  const page = await fetchMessagesPage("r1", "tok", {}, { baseUrl: BASE });
  assert.equal(page.legacy, false);
  assert.equal(page.hasMoreBefore, true);
  assert.equal(page.messages.length, 2);
  assert.match(calls[0].url, /\/rooms\/r1\/messages\?limit=50&paged=1$/);
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer tok");
  assert.equal(isLegacyBackend(BASE), false);
});

test("fetchMessagesPage: a bare array marks the backend as legacy and older pages then use the timestamp", async () => {
  const older = Array.from({ length: 50 }, (_, i) => m(i + 1));
  const calls = mockFetch(() => ({ body: older }));
  const first = await fetchMessagesPage("r1", "tok", {}, { baseUrl: BASE });
  assert.equal(first.legacy, true);
  assert.equal(first.hasMoreBefore, true);
  assert.equal(first.hasMoreAfter, false);
  assert.equal(isLegacyBackend(BASE), true);
  await fetchMessagesPage("r1", "tok", { before: "m1", beforeAt: "2026-01-01T00:00:01.000Z" }, { baseUrl: BASE });
  assert.match(calls[1].url, /before=2026-01-01T00%3A00%3A01\.000Z/);
  assert.doesNotMatch(calls[1].url, /paged/);
});

test("fetchMessagesPage: around/after against a legacy backend is 'unsupported', without a request", async () => {
  const calls = mockFetch(() => ({ body: [m(1)] }));
  await fetchMessagesPage("r1", "tok", {}, { baseUrl: BASE });
  await assert.rejects(fetchMessagesPage("r1", "tok", { around: "x" }, { baseUrl: BASE }), (e: unknown) => e instanceof HistoryApiError && e.code === "unsupported");
  assert.equal(calls.length, 1);
});

test("fetchMessagesPage: an array answer to around (backend rolled back) is unsupported too", async () => {
  mockFetch(() => ({ body: [m(1)] }));
  await assert.rejects(fetchMessagesPage("r1", "tok", { around: "x" }, { baseUrl: BASE }), (e: unknown) => e instanceof HistoryApiError && e.code === "unsupported");
});

test("fetchMessagesPage: message_in_thread exposes the thread root", async () => {
  mockFetch(() => ({ status: 400, body: { statusCode: 400, error: "Bad Request", code: "message_in_thread", message: "in a thread", threadRootId: "root-1" } }));
  await assert.rejects(fetchMessagesPage("r1", "tok", { around: "reply" }, { baseUrl: BASE }), (e: unknown) => e instanceof HistoryApiError && e.threadRootId === "root-1" && e.status === 400);
});

test("fetchMessagesPage: 403 keeps the status", async () => {
  mockFetch(() => ({ status: 403, body: { message: "no" } }));
  await assert.rejects(fetchMessagesPage("r1", "tok", {}, { baseUrl: BASE }), (e: unknown) => e instanceof HistoryApiError && e.isForbidden);
});

test("fetchReadState: normalises, and a missing endpoint is null", async () => {
  mockFetch(() => ({ body: { lastReadMessageId: "a", firstUnreadMessageId: "b", unreadCount: 4, unreadMentions: 1, unreadCapped: false } }));
  const s = await fetchReadState("r1", "tok", { baseUrl: BASE });
  assert.equal(s?.unreadCount, 4);
  assert.equal(s?.firstUnreadMessageId, "b");
  mockFetch(() => ({ status: 404, body: { message: "nope" } }));
  assert.equal(await fetchReadState("r1", "tok", { baseUrl: BASE }), null);
  mockFetch(() => ({ status: 500, body: {} }));
  await assert.rejects(fetchReadState("r1", "tok", { baseUrl: BASE }), HistoryApiError);
});

test("putReadState: sends the body and accepts both answer shapes", async () => {
  const calls = mockFetch(() => ({ body: { unreadCount: 0, unreadMentions: 0, marked: 3 } }));
  const s = await putReadState("r1", "tok", { messageId: "m9", threadRootId: "t" }, { baseUrl: BASE });
  assert.equal(calls[0].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { messageId: "m9", threadRootId: "t" });
  assert.equal(s?.unreadCount, 0);
  mockFetch(() => ({ body: { readState: { unreadCount: 2 }, marked: 1 } }));
  assert.equal((await putReadState("r1", "tok", { messageId: "m9" }, { baseUrl: BASE }))?.unreadCount, 2);
});

test("buildSearchUrl: scope picks the path; operators stay inside q", () => {
  const room = buildSearchUrl({ scope: "room", id: "r 1", q: "hola -from:ana", sort: "recent", limit: 25, cursor: "abc" }, BASE);
  assert.equal(room, `${BASE}/rooms/r%201/messages/search?q=hola+-from%3Aana&sort=recent&limit=25&cursor=abc`);
  const team = buildSearchUrl({ scope: "team", id: "t1", q: "x" }, BASE);
  assert.equal(team, `${BASE}/teams/t1/messages/search?q=x&sort=relevance`);
});

test("normalizeSearchResponse: fills defaults and skips malformed results", () => {
  const r = normalizeSearchResponse({
    query: { q: "a", text: "a", sort: "recent", scope: "room" },
    filters: { from: { include: ["ana"], exclude: [] }, before: "2026-01-02T00:00:00.000Z", pinned: true },
    results: [{ messageId: "m1", roomId: "r1", roomName: "general", snippet: "hi", author: { displayName: "Ana", isBot: true } }, { nope: 1 }, null],
    hasMore: true, nextCursor: "c", total: 12, totalCapped: true,
    warnings: [{ operator: "has", value: "x", code: "unknown_has_kind" }, { bad: true }],
  });
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].author?.isBot, true);
  assert.equal(r.results[0].threadId, null);
  assert.equal(r.filters.from.include[0], "ana");
  assert.equal(r.filters.has.include.length, 0);
  assert.equal(r.filters.pinned, true);
  assert.equal(r.total, 12);
  assert.equal(r.totalCapped, true);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.query.sort, "recent");
  const empty = normalizeSearchResponse(null);
  assert.deepEqual(empty.results, []);
  assert.equal(empty.hasMore, false);
});

test("searchMessages: 429 carries retryAfterSeconds (body, then header)", async () => {
  mockFetch(() => ({ status: 429, body: { code: "rate_limited", message: "slow", retryAfterSeconds: 12 } }));
  await assert.rejects(searchMessages({ scope: "team", id: "t", q: "x" }, "tok", { baseUrl: BASE }), (e: unknown) => e instanceof HistoryApiError && e.code === "rate_limited" && e.retryAfterSeconds === 12);
  mockFetch(() => ({ status: 429, body: {}, headers: { "retry-after": "5" } }));
  await assert.rejects(searchMessages({ scope: "team", id: "t", q: "x" }, "tok", { baseUrl: BASE }), (e: unknown) => e instanceof HistoryApiError && e.retryAfterSeconds === 5);
});

test("searchMessages: parses a good answer", async () => {
  mockFetch(() => ({ body: { query: { q: "x", text: "x", sort: "relevance", scope: "team" }, filters: {}, results: [], hasMore: false, nextCursor: null, total: 0, totalCapped: false, warnings: [] } }));
  const r = await searchMessages({ scope: "team", id: "t", q: "x" }, "tok", { baseUrl: BASE });
  assert.equal(r.total, 0);
  assert.equal(r.hasMore, false);
});
