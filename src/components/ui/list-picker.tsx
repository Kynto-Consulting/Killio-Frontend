"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface Option {
  id: string;
  name: string;
}

interface Props {
  value: string | null | undefined;
  options: Option[];
  onChange: (id: string) => void;
  label: string;
  /** Show a search box from this many options (default 8). */
  searchFrom?: number;
  searchPlaceholder?: string;
  className?: string;
}

/**
 * A list (state) picker that replaces the browser's own select: a pill with the current list that opens a menu with the
 * current one checked, a search box when there are many, and keyboard use (arrows, Enter, Esc). The menu keeps the board's
 * order and never leaves the screen (it opens below the pill and scrolls inside).
 */
export function ListPicker({ value, options, onChange, label, searchFrom = 8, searchPlaceholder = "…", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const current = options.find((o) => o.id === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.id === value)));
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: Option) => {
    onChange(o.id);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = shown[active];
      if (o) choose(o);
    }
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`} onKeyDown={open ? onKey : undefined}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-[12rem] items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-sm text-foreground transition-colors hover:border-border hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="truncate">{current?.name ?? "—"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[85vw] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
          {options.length >= searchFrom ? (
            <div className="relative border-b border-border p-1.5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-8 w-full rounded-md bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          ) : (
            <input ref={searchRef} className="sr-only" aria-label={label} readOnly />
          )}
          <ul ref={listRef} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
            {shown.length === 0 ? <li className="px-2.5 py-2 text-xs text-muted-foreground">—</li> : null}
            {shown.map((o, i) => {
              const on = o.id === value;
              return (
                <li key={o.id} role="option" aria-selected={on} data-index={i}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => choose(o)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${i === active ? "bg-muted" : ""} ${on ? "font-medium text-foreground" : "text-foreground/90"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    {on ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
