"use client";

import { useRef, type KeyboardEvent } from "react";
import { AlertTriangle, Bot, Clock, Hash, Loader2, MessageSquare, MessagesSquare, Pin, RefreshCw, Search as SearchIcon, X } from "lucide-react";
import type { SearchResult, SearchResponse } from "@/lib/rooms/history-api";
import { plainSnippet, splitSnippet } from "@/lib/rooms/search-snippet";
import type { SearchFailure } from "@/hooks/use-room-search";

type TFn = (key: string, params?: Record<string, string | number>) => string;

const ghost = "rounded-md px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none";

/** The snippet as React text nodes: the matches in <mark>, everything else untouched text (never HTML). */
export function Snippet({ text }: { text: string }) {
  const parts = splitSnippet(text);
  if (parts.length === 0) return <span className="italic text-muted-foreground">…</span>;
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 font-semibold text-neutral-900 dark:bg-amber-400/30 dark:text-amber-100">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function ResultItem({ r, showRoom, onOpen, t }: { r: SearchResult; showRoom: boolean; onOpen: (r: SearchResult) => void; t: TFn }) {
  const author = r.author?.displayName ?? t("search.unknownAuthor");
  const when = formatWhen(r.createdAt);
  return (
    <li>
      <button
        type="button"
        data-result
        onClick={() => onOpen(r)}
        title={plainSnippet(r.snippet)}
        className="group flex w-full flex-col gap-0.5 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/70 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {showRoom && (
            <span className="inline-flex max-w-[11rem] items-center gap-0.5 truncate font-semibold text-foreground">
              {r.roomKind === "dm" ? <MessageSquare className="h-3 w-3 shrink-0" aria-hidden /> : <Hash className="h-3 w-3 shrink-0" aria-hidden />}
              <span className="truncate">{r.roomName || t("search.unknownRoom")}</span>
            </span>
          )}
          <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground/80">
            <span className="truncate">{author}</span>
            {r.author?.isBot && (
              <span className="inline-flex items-center gap-0.5 rounded bg-primary px-1 text-[9px] font-bold uppercase text-primary-foreground"><Bot className="h-2.5 w-2.5" aria-hidden />{t("search.bot")}</span>
            )}
          </span>
          {when && <time dateTime={r.createdAt} className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" aria-hidden />{when}</time>}
          {r.pinned && <span className="inline-flex items-center gap-0.5"><Pin className="h-3 w-3" aria-hidden /><span className="sr-only">{t("search.pinned")}</span></span>}
          {r.threadId && <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[10px] font-semibold"><MessagesSquare className="h-3 w-3" aria-hidden />{t("search.inThread")}</span>}
        </span>
        <span className="line-clamp-3 break-words text-[13px] leading-snug text-foreground"><Snippet text={r.snippet} /></span>
      </button>
    </li>
  );
}

function failureText(f: SearchFailure, t: TFn): string {
  switch (f.kind) {
    case "rate_limited": return t("search.errors.rateLimited", { seconds: f.retryAfterSeconds });
    case "too_long": return t("search.errors.tooLong");
    case "forbidden": return t("search.errors.forbidden");
    case "invalid_cursor": return t("search.errors.invalidCursor");
    default: return t("search.errors.failed");
  }
}

export interface SearchResultsProps {
  status: "idle" | "loading" | "ready" | "error";
  results: SearchResult[];
  meta: SearchResponse | null;
  failure: SearchFailure | null;
  moreFailure: SearchFailure | null;
  loadingMore: boolean;
  hasMore: boolean;
  cooldown: number;
  showRoom: boolean;
  recent: string[];
  onOpen: (r: SearchResult) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onPickRecent: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  /** The text box is empty, so nothing is being searched. */
  isBlank: boolean;
  t: TFn;
}

export function SearchResults(p: SearchResultsProps) {
  const { t } = p;
  const listRef = useRef<HTMLUListElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-result]") ?? []);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = i;
    if (e.key === "ArrowDown") next = Math.min(items.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else next = items.length - 1;
    e.preventDefault();
    items[next]?.focus();
  };

  if (p.status === "idle" || (p.isBlank && p.status !== "loading")) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {p.recent.length > 0 ? (
          <section aria-label={t("search.recent.title")}>
            <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("search.recent.title")}</h3>
            <ul className="space-y-0.5">
              {p.recent.map((q) => (
                <li key={q} className="flex items-center gap-1">
                  <button type="button" onClick={() => p.onPickRecent(q)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-mono">{q}</span>
                  </button>
                  <button type="button" onClick={() => p.onRemoveRecent(q)} aria-label={t("search.recent.remove", { query: q })} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center text-muted-foreground">
          <SearchIcon className="h-7 w-7 opacity-50" aria-hidden />
          <p className="text-sm font-semibold text-foreground">{t("search.idle.title")}</p>
          <p className="text-xs">{t("search.idle.hint")}</p>
        </div>
      </div>
    );
  }

  if (p.status === "loading" && p.results.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{t("search.loading")}
      </div>
    );
  }

  if (p.status === "error" && p.failure) {
    return (
      <div role="alert" className="mx-3 my-4 flex flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-5 text-center text-xs text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
        <p className="font-semibold">{failureText(p.failure, t)}</p>
        {p.failure.kind !== "too_long" && p.failure.kind !== "forbidden" && (
          <button type="button" onClick={p.onRetry} disabled={p.cooldown > 0} className={`${ghost} inline-flex items-center gap-1 border border-destructive/40 hover:bg-destructive/10 disabled:opacity-50`}>
            <RefreshCw className="h-3 w-3" aria-hidden />{p.cooldown > 0 ? t("search.errors.retryIn", { seconds: p.cooldown }) : t("errors.retry")}
          </button>
        )}
      </div>
    );
  }

  const total = p.meta?.total;
  const countText = p.results.length === 0
    ? null
    : total != null
      ? p.meta?.totalCapped ? t("search.totalCapped", { count: total.toLocaleString() }) : t("search.total", { count: total.toLocaleString() })
      : t("search.shown", { count: p.results.length });

  if (p.results.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 py-10 text-center text-muted-foreground" role="status">
        <SearchIcon className="h-8 w-8 opacity-50" aria-hidden />
        <p className="text-sm font-semibold text-foreground">{t("search.empty.title")}</p>
        <p className="text-xs">{t("search.empty.hint")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p role="status" aria-live="polite" className="shrink-0 px-3 pb-1 pt-1.5 text-[11px] text-muted-foreground">{countText}</p>
      <ul ref={listRef} onKeyDown={onKeyDown} aria-label={t("search.resultsLabel")} className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
        {p.results.map((r) => <ResultItem key={r.messageId} r={r} showRoom={p.showRoom} onOpen={p.onOpen} t={t} />)}
        {(p.hasMore || p.moreFailure) && (
          <li className="flex flex-col items-center gap-1 py-2">
            {p.moreFailure && <p role="alert" className="text-[11px] text-destructive">{failureText(p.moreFailure, t)}</p>}
            <button type="button" onClick={p.onLoadMore} disabled={p.loadingMore || p.cooldown > 0} className={`${ghost} inline-flex items-center gap-1.5 border border-border hover:bg-muted disabled:opacity-60`}>
              {p.loadingMore && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
              {p.loadingMore ? t("search.loadingMore") : p.cooldown > 0 ? t("search.errors.retryIn", { seconds: p.cooldown }) : t("search.loadMore")}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
