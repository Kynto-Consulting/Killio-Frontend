"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Search as SearchIcon, X } from "lucide-react";
import { useRoomSearch } from "@/hooks/use-room-search";
import type { SearchResult, SearchScope, SearchSort } from "@/lib/rooms/history-api";
import {
  RECENT_KEY, MAX_QUERY_LENGTH, absorb, applySuggestion, canSearch, committedModel, makeChip, parseQuery, parseRecent, pushRecent, queryLength, reconcileChips, removeChip,
  removeRecent, serializeChip, serializeQuery, suggest, toggleNegation, NEGATABLE, type SearchChip, type Suggestion, type SuggestionSources,
} from "@/lib/rooms/search-query";
import { SearchResults } from "./SearchResults";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export interface RoomSearchPanelProps {
  roomId: string;
  roomName: string;
  teamId: string | null | undefined;
  accessToken: string | null | undefined;
  members: ReadonlyArray<{ id: string; name: string; email?: string | null }>;
  roles: ReadonlyArray<{ id: string; name: string }>;
  rooms: ReadonlyArray<{ id: string; name: string; kind?: string }>;
  onOpenResult: (r: SearchResult) => void;
  onClose: () => void;
  /** Opens with these operators already applied (e.g. the moderator view's "Messages" row: `from:` the person, whole team). */
  initial?: { chips: ReadonlyArray<{ key: string; value: string }>; scope?: SearchScope };
  t: TFn;
}

const DEBOUNCE_MS = 350;
const KNOWN_WARNINGS = new Set(["invalid_date", "unknown_has_kind", "invalid_value", "invalid_thread", "ignored_in_room", "not_found", "dropped", "too_many_values", "too_many_tokens", "too_many_terms", "conflicting_dates"]);
const warningText = (t: TFn, code: string, operator: string, value: string) => t(`search.warnings.${KNOWN_WARNINGS.has(code) ? code : "generic"}`, { operator: operator || "q", value });

function readRecent(): string[] {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: recents are a convenience
  }
}

const seg = "px-3 py-2 text-xs font-bold lg:px-2.5 lg:py-1 lg:text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 motion-reduce:transition-none";

/**
 * Advanced search of the rooms: operators as chips with suggestions, room / whole team scope, order, paged results and
 * recent searches. Operators travel inside `q`; the server's warnings are shown on the chips and above the results.
 */
export function RoomSearchPanel({ roomId, roomName, teamId, accessToken, members, roles, rooms, onOpenResult, onClose, initial, t }: RoomSearchPanelProps) {
  const uid = useId();
  const listId = `${uid}-suggestions`;
  const [scope, setScope] = useState<SearchScope>(initial?.scope ?? "room");
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [chips, setChips] = useState<SearchChip[]>(() => (initial?.chips ?? []).map((c) => makeChip(c.key, c.value)).filter((c): c is SearchChip => c !== null));
  const [input, setInput] = useState("");
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const search = useRoomSearch({ accessToken, scope, id: scope === "room" ? roomId : teamId });

  useEffect(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRecent(readRecent());
    inputRef.current?.focus();
    return () => {
      const el = restoreFocus.current;
      if (el && document.contains(el)) el.focus();
    };
  }, []);

  // A search in another room starts from scratch (the scope stays what the user chose).
  const lastRoom = useRef(roomId);
  useEffect(() => {
    if (lastRoom.current === roomId) return;
    lastRoom.current = roomId;
    search.clear();
  }, [roomId, search]);

  const sources: SuggestionSources = useMemo(() => ({ scope, members, roles, rooms }), [scope, members, roles, rooms]);
  const suggestions = useMemo(() => (focused ? suggest(input, caret, sources) : []), [focused, input, caret, sources]);
  useEffect(() => { setActive(-1); }, [suggestions]);

  const model = useMemo(() => committedModel(input, chips), [input, chips]);
  const q = serializeQuery(model);
  const tooLong = queryLength(model) > MAX_QUERY_LENGTH;
  const blank = model.chips.length === 0 && model.text.trim() === "";
  // What the server said about the chips applies only while the box still holds the query it answered.
  const answered = search.status === "ready" && search.meta && search.meta.query.q === q ? search.meta : null;
  const statuses = useMemo(
    () => reconcileChips(chips, scope, answered ? { filters: answered.filters, warnings: answered.warnings } : null),
    [chips, scope, answered],
  );

  // Search while typing (debounced); finished operators count at once, the word being typed does not.
  const runRef = useRef(search.run);
  runRef.current = search.run;
  const clearRef = useRef(search.clear);
  clearRef.current = search.clear;
  useEffect(() => {
    if (blank) { clearRef.current(); return; }
    if (!canSearch(model)) return;
    const timer = setTimeout(() => void runRef.current(q, sort), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, sort, scope, blank, model]);

  const remember = useCallback((query: string) => {
    setRecent((prev) => {
      const next = pushRecent(prev, query);
      writeRecent(next);
      return next;
    });
  }, []);

  const searchNow = useCallback(() => {
    // everything typed counts now, including the operator still being written
    const full = absorb(input, { text: "", chips }, false);
    setChips(full.chips);
    setInput(full.text);
    const query = serializeQuery(full);
    if (!query || !canSearch(full)) return;
    remember(query);
    void search.run(query, sort);
  }, [input, chips, sort, remember, search]);

  const accept = useCallback((s: Suggestion) => {
    const next = applySuggestion(input, caret, s);
    if (s.commit) {
      const m = absorb(next.input, { text: "", chips }, false);
      setChips(m.chips);
      const text = m.text ? `${m.text} ` : "";
      setInput(text);
      setCaret(text.length);
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(text.length, text.length));
    } else {
      setInput(next.input);
      setCaret(next.caret);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(next.caret, next.caret); });
    }
  }, [input, caret, chips]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCaret(e.target.selectionStart ?? value.length);
    if (/\s$/.test(value)) {
      const m = absorb(value, { text: "", chips }, false);
      if (m.chips.length !== chips.length) {
        setChips(m.chips);
        setInput(m.text ? `${m.text} ` : "");
        return;
      }
    }
    setInput(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const open = suggestions.length > 0;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (open) setActive((i) => (i + 1) % suggestions.length);
      else document.querySelector<HTMLElement>("[data-result]")?.focus();
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Tab" && open && !e.shiftKey && (active >= 0 || suggestions.length === 1)) {
      e.preventDefault();
      accept(suggestions[Math.max(0, active)]!);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) accept(suggestions[active]!);
      else searchNow();
    } else if (e.key === "Backspace" && input === "" && chips.length > 0) {
      e.preventDefault();
      setChips((c) => c.slice(0, -1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) setFocused(false);
      else onClose();
    }
  };

  const chipLabel = (c: SearchChip) => serializeChip(c);
  const problemText = (p: string | null, c: SearchChip): string | null =>
    p ? warningText(t, p, c.key, c.value) : null;

  const pickRecent = (query: string) => {
    const m = parseQuery(query);
    setChips(m.chips);
    setInput(m.text);
    remember(query);
    void search.run(query, sort);
    inputRef.current?.focus();
  };

  const open = (r: SearchResult) => {
    if (q) remember(q);
    onOpenResult(r);
  };

  const warnings = search.status === "ready" ? search.meta?.warnings ?? [] : [];
  const listOpen = suggestions.length > 0;

  const suggestionLabel = (s: Suggestion): { main: string; hint?: string } => {
    if (s.type === "operator") return { main: s.label, hint: t(`search.hint.${s.key}`) };
    switch (s.valueKind) {
      case "date": return { main: s.label, hint: /^\d{4}-/.test(s.label) ? t("search.date.iso") : t(`search.date.${s.label}`) };
      case "has": return { main: s.label, hint: t(`search.has.${s.label}`) };
      case "is": return { main: s.label, hint: t(`search.is.${s.label}`) };
      case "bool": return { main: s.label, hint: t(`search.bool.${s.label}`) };
      case "me": return { main: s.label, hint: t("search.me") };
      case "role": return { main: s.label, hint: t("search.roleHint") };
      default: return { main: s.label, hint: s.hint };
    }
  };

  return (
    <section role="search" aria-label={t("search.title")} className="fixed inset-0 z-[220] flex flex-col overflow-hidden bg-card pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-card-foreground lg:absolute lg:inset-auto lg:right-2 lg:top-1 lg:z-30 lg:max-h-[min(36rem,calc(100vh-8rem))] lg:w-[32rem] lg:rounded-2xl lg:border lg:border-border lg:p-0 lg:shadow-xl">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-3 lg:px-2.5 lg:py-2">
        <div role="group" aria-label={t("search.scopeLabel")} className="inline-flex overflow-hidden rounded-lg border border-border">
          <button type="button" aria-pressed={scope === "room"} onClick={() => setScope("room")} className={`${seg} ${scope === "room" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            <span className="inline-block max-w-[9rem] truncate align-bottom" title={roomName}>{t("search.scopeRoom")}</span>
          </button>
          <button type="button" aria-pressed={scope === "team"} onClick={() => setScope("team")} disabled={!teamId} className={`${seg} border-l border-border disabled:opacity-50 ${scope === "team" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            {t("search.scopeTeam")}
          </button>
        </div>
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground lg:text-[11px]">
          <span className="sr-only sm:not-sr-only">{t("search.sortLabel")}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SearchSort)} className="rounded-md border border-border bg-background px-2 py-2 text-xs font-semibold lg:px-1.5 lg:py-1 lg:text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <option value="relevance">{t("search.sortRelevance")}</option>
            <option value="recent">{t("search.sortRecent")}</option>
          </select>
        </label>
        <button type="button" onClick={onClose} aria-label={t("search.close")} className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:h-7 lg:w-7">
          <X className="h-5 w-5 lg:h-4 lg:w-4" aria-hidden />
        </button>
      </div>

      <div className="relative shrink-0 border-b border-border/60 px-3 py-3 lg:px-2.5 lg:py-2">
        <div className="flex min-h-[2.75rem] flex-wrap items-center gap-1 rounded-xl border border-border bg-background px-3 py-1.5 lg:min-h-[2.25rem] lg:px-2 lg:py-1 focus-within:ring-2 focus-within:ring-primary/40">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {statuses.map(({ chip, problem }, i) => {
            const why = problemText(problem, chip);
            const negatable = NEGATABLE.has(chip.key);
            return (
              <span
                key={`${chipLabel(chip)}-${i}`}
                className={`inline-flex items-center overflow-hidden rounded-md border text-[11px] font-mono ${problem ? "border-amber-500/70 bg-amber-100 text-amber-950 dark:bg-amber-500/15 dark:text-amber-100" : chip.negated ? "border-rose-500/50 bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100" : "border-primary/40 bg-primary/10 text-foreground"}`}
              >
                <button
                  type="button"
                  disabled={!negatable}
                  onClick={() => setChips((c) => toggleNegation({ text: "", chips: c }, i).chips)}
                  title={negatable ? t("search.toggleExclude") : undefined}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 enabled:hover:bg-black/5 dark:enabled:hover:bg-white/10"
                >
                  {problem && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />}
                  <span>{chipLabel(chip)}</span>
                  {chip.negated && <span className="sr-only">{t("search.excluded")}</span>}
                  {why && <span className="sr-only">{why}</span>}
                </button>
                <button type="button" onClick={() => setChips((c) => removeChip({ text: "", chips: c }, i).chips)} aria-label={t("search.removeFilter", { filter: chipLabel(chip) })} className="px-1 py-0.5 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 dark:hover:bg-white/10">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen && active >= 0 ? `${uid}-opt-${active}` : undefined}
            aria-label={t("search.inputLabel")}
            aria-invalid={tooLong || undefined}
            value={input}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => { if (!e.currentTarget.closest("section")?.contains(e.relatedTarget as Node | null)) setFocused(false); }}
            placeholder={chips.length === 0 ? t("search.placeholder") : ""}
            autoComplete="off"
            spellCheck={false}
            className="min-w-[8rem] flex-1 bg-transparent py-1 text-base lg:text-sm placeholder:text-muted-foreground focus-visible:outline-none"
          />
        </div>
        {tooLong && <p role="alert" className="mt-1 text-[11px] text-destructive">{t("search.errors.tooLong")} ({queryLength(model)}/{MAX_QUERY_LENGTH})</p>}

        {listOpen && (
          <ul id={listId} role="listbox" aria-label={t("search.suggestions")} className="absolute inset-x-2.5 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
            {suggestions.map((s, i) => {
              const l = suggestionLabel(s);
              return (
                <li
                  key={s.id}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => { e.preventDefault(); accept(s); }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 text-xs ${i === active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <span className="font-mono font-semibold">{l.main}</span>
                  {l.hint && <span className={`min-w-0 flex-1 truncate ${i === active ? "opacity-90" : "text-muted-foreground"}`}>{l.hint}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {warnings.length > 0 && (
        <ul aria-label={t("search.warningsLabel")} className="shrink-0 space-y-0.5 border-b border-border bg-amber-50 px-3 py-1.5 text-[11px] text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          {warnings.map((w, i) => (
            <li key={`${w.code}-${w.operator}-${w.value}-${i}`} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
              <span>{warningText(t, w.code, w.operator, w.value)}</span>
            </li>
          ))}
        </ul>
      )}

      <SearchResults
        status={search.status}
        results={search.results}
        meta={search.meta}
        failure={search.failure}
        moreFailure={search.moreFailure}
        loadingMore={search.loadingMore}
        hasMore={search.hasMore}
        cooldown={search.cooldown}
        showRoom={scope === "team"}
        recent={recent}
        isBlank={blank}
        onOpen={open}
        onLoadMore={() => void search.loadMore()}
        onRetry={searchNow}
        onPickRecent={pickRecent}
        onRemoveRecent={(query) => setRecent((prev) => { const next = removeRecent(prev, query); writeRecent(next); return next; })}
        t={t}
      />
    </section>
  );
}
