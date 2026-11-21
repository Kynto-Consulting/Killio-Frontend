"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Search } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { buildColumnMenu, entryBlock, searchMenu, type MenuEntry } from "@/lib/query-flow/column-menu-config";
import { registerPopup } from "@/lib/query-flow/escape";
import type { ColumnType, ValueCount } from "@/lib/query-flow/profile";
import { cn } from "@/lib/utils";

export interface ColumnMenuProps {
  x: number;
  y: number;
  column: string;
  type: ColumnType;
  selectedCount: number;
  sorted: boolean;
  /** Values of the column (checkbox list), most frequent first. */
  values: ValueCount[];
  /** Toggle state of `view:<key>` commands (the profile / distribution rows show a check). */
  toggles: Record<string, boolean>;
  onCommand: (command: string) => void;
  onKeepValues: (values: string[]) => void;
  onClose: () => void;
}

const PANEL = "w-60 rounded-lg border border-border bg-popover p-1 text-xs text-popover-foreground shadow-xl";

/**
 * The column menu of Power Query (the chevron of a header): search box, sort, filters with the value checklist, change type,
 * column operations and per-type Transform submenus. Keyboard: type to search, arrows, Enter, Esc. Drawn in a portal and
 * flipped when it would leave the viewport.
 */
export function ColumnMenu({ x, y, column, type, selectedCount, sorted, values, toggles, onCommand, onKeepValues, onClose }: ColumnMenuProps) {
  const t = useTranslations("query-flow");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [openPath, setOpenPath] = useState<string[]>([]);
  const [focus, setFocus] = useState(0);
  const [valueSearch, setValueSearch] = useState("");
  // submenus are drawn with fixed positions (the list scrolls, so an absolute flyout would be clipped)
  const [flyPos, setFlyPos] = useState<Record<string, { left: number; top: number }>>({});
  const [picked, setPicked] = useState<string[]>(() => values.map((v) => v.value));

  const entries = useMemo(() => buildColumnMenu({ type, sorted }), [type, sorted]);
  const labelOf = (id: string) => t(`cm.${id}`);
  const matches = useMemo(() => searchMenu(entries, query, (id) => t(`cm.${id}`)), [entries, query, t]);

  useEffect(() => registerPopup(), []);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [onClose]);
  if (typeof document === "undefined") return null;

  const ctx = { selectedCount, sorted };
  const left = Math.max(8, Math.min(x, window.innerWidth - 256));
  const top = Math.max(8, Math.min(y, window.innerHeight - 460));
  const flip = left + 2 * 244 > window.innerWidth;

  const openSub = (entry: MenuEntry, depth: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setFlyPos((m) => ({ ...m, [entry.id]: { left: flip ? Math.max(8, r.left - 244) : r.right + 2, top: Math.max(8, Math.min(r.top - 4, window.innerHeight - 340)) } }));
    setOpenPath((p) => [...p.slice(0, depth), entry.id]);
  };

  const run = (entry: MenuEntry) => {
    if (entryBlock(entry, ctx) || !entry.command) return;
    onClose();
    onCommand(entry.command);
  };
  const reason = (entry: MenuEntry): string | undefined => {
    const b = entryBlock(entry, ctx);
    return b === "engine" ? t("ribbon.needsEngineHint") : b === "multi" ? t("cm.needsMulti") : b === "nosort" ? t("cm.noSort") : undefined;
  };
  const viewKey = (entry: MenuEntry) => (entry.command?.startsWith("view:") ? entry.command.slice(5) : "");

  // rows of the deepest open level, for the arrow keys
  const levelEntries = (): MenuEntry[] => {
    let list = entries;
    for (const id of openPath) { const found = list.find((x) => x.id === id); if (found?.children) list = found.children; }
    return list.filter((x) => !x.separator && !x.values);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (openPath.length > 0) setOpenPath((p) => p.slice(0, -1)); else onClose(); return; }
    const rows = query ? matches.map((m) => m.entry) : levelEntries();
    if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => (rows.length ? (f + 1) % rows.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => (rows.length ? (f - 1 + rows.length) % rows.length : 0)); }
    else if (e.key === "ArrowRight" && !query) { const row = rows[focus]; if (row?.children) { e.preventDefault(); setOpenPath((p) => [...p, row.id]); setFocus(0); } }
    else if (e.key === "ArrowLeft" && !query && openPath.length > 0) { e.preventDefault(); setOpenPath((p) => p.slice(0, -1)); setFocus(0); }
    else if (e.key === "Enter") {
      const row = rows[Math.min(focus, rows.length - 1)];
      if (!row) return;
      e.preventDefault();
      if (row.children) { setOpenPath((p) => [...p, row.id]); setFocus(0); } else run(row);
    }
  };

  const renderLevel = (list: MenuEntry[], depth: number): React.ReactNode => {
    const visible = list.filter((x) => !x.separator && !x.values);
    return list.map((entry) => {
      if (entry.separator) return <div key={entry.id} role="separator" className="my-1 h-px bg-border" />;
      if (entry.values) {
        const shown = values.filter((v) => v.value.toLowerCase().includes(valueSearch.trim().toLowerCase()));
        const allPicked = picked.length === values.length;
        return (
          <div key="values" className="px-1 pb-1">
            <input value={valueSearch} onChange={(ev) => setValueSearch(ev.target.value)} placeholder={t("colMenu.search")} aria-label={t("colMenu.search")} className="mb-1 h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground" />
            <label className="flex items-center gap-2 px-1 py-0.5 text-foreground">
              <input type="checkbox" checked={allPicked} onChange={(ev) => setPicked(ev.target.checked ? values.map((v) => v.value) : [])} />
              {t("colMenu.selectAll")}
            </label>
            <ul className="max-h-36 overflow-y-auto">
              {shown.map((v) => (
                <li key={v.value}>
                  <label className="flex items-center gap-2 rounded px-1 py-0.5 text-foreground hover:bg-muted">
                    <input type="checkbox" checked={picked.includes(v.value)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, v.value] : p.filter((z) => z !== v.value)))} />
                    <span className="min-w-0 flex-1 truncate">{v.value}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{v.count}</span>
                  </label>
                </li>
              ))}
              {shown.length === 0 ? <li className="px-1 py-1 text-muted-foreground">{t("profile.noValues")}</li> : null}
            </ul>
            <div className="mt-1 flex justify-end">
              <button type="button" disabled={picked.length === 0 || allPicked} onClick={() => { onClose(); onKeepValues(picked); }} className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("dialog.ok")}</button>
            </div>
          </div>
        );
      }
      const index = visible.indexOf(entry);
      const isFocus = depth === openPath.length && !query && index === focus;
      const opened = openPath[depth] === entry.id;
      const why = reason(entry);
      const on = viewKey(entry) ? !!toggles[viewKey(entry)] : false;
      return (
        <div key={entry.id + (entry.command ?? "")} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup={entry.children ? "menu" : undefined}
            aria-expanded={entry.children ? opened : undefined}
            disabled={!!why && !entry.children}
            title={why}
            onMouseEnter={(ev) => { if (entry.children) openSub(entry, depth, ev.currentTarget); else setOpenPath((p) => p.slice(0, depth)); setFocus(Math.max(0, index)); }}
            onClick={(ev) => (entry.children ? openSub(entry, depth, ev.currentTarget) : run(entry))}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent", (opened || isFocus) && "bg-accent text-accent-foreground")}
          >
            <span className="w-3.5 shrink-0">{on ? <Check className="h-3.5 w-3.5" /> : null}</span>
            <span className="min-w-0 flex-1 truncate">{labelOf(entry.id)}</span>
            {entry.hint ? <span className="shrink-0 text-[10px] text-muted-foreground">{entry.hint}</span> : null}
            {entry.children ? <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          </button>
          {entry.children && opened ? (
            <div role="menu" aria-label={labelOf(entry.id)} style={{ position: "fixed", left: flyPos[entry.id]?.left ?? 0, top: flyPos[entry.id]?.top ?? 0, zIndex: 2001 }} className={cn(PANEL, "max-h-[60vh] overflow-y-auto")}>
              {renderLevel(entry.children, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });
  };

  return createPortal(
    <div ref={rootRef} role="menu" aria-label={column} onKeyDown={onKeyDown} style={{ position: "fixed", left, top, zIndex: 2000 }} className={PANEL}>
      <div className="relative mb-1 px-1 pt-1">
        <Search className="pointer-events-none absolute left-3 top-[13px] h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <input ref={searchRef} value={query} onChange={(e) => { setQuery(e.target.value); setFocus(0); }} placeholder={t("cm.search")} aria-label={t("cm.search")} className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground" />
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {query ? (
          matches.length > 0 ? (
            matches.map((m, i) => {
              const why = reason(m.entry);
              return (
                <button key={m.entry.id + i} type="button" role="menuitem" disabled={!!why} title={why} onClick={() => run(m.entry)} onMouseEnter={() => setFocus(i)} className={cn("flex w-full flex-col rounded-md px-2 py-1 text-left text-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60", i === focus && "bg-accent text-accent-foreground")}>
                  <span className="truncate">{labelOf(m.entry.id)}</span>
                  {m.path.length > 0 ? <span className="truncate text-[10px] text-muted-foreground">{m.path.join(" › ")}</span> : null}
                </button>
              );
            })
          ) : (
            <p className="px-2 py-2 text-muted-foreground">{t("cm.noResults")}</p>
          )
        ) : (
          renderLevel(entries, 0)
        )}
      </div>
    </div>,
    document.body,
  );
}
