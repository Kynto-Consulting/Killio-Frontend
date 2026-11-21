"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrow, ArrowUpNarrowWide, BarChart2, Braces, Calculator, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Code2, Copy, Database, Eraser, Eye, FlaskConical, Filter, GitBranch, GitMerge, Hash, Heading1,
  Layers, List, Move, Network, PanelLeft, PanelRight, Pencil, RefreshCw, Replace, Rows3, RotateCw, ScanSearch, Scissors, Sigma, Square, Table2, Trash2, Type, Wand2, type LucideIcon,
} from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { fitGroups, pageScroll, scrollState, wheelToSideways } from "@/lib/query-flow/ribbon-fit";
import { RIBBON, TAB_IDS, type Entry, type MenuItem as RibbonMenuItem, type Needs, type RibbonGroup, type RibbonItem, type TabId } from "@/lib/query-flow/ribbon-config";
import { cn } from "@/lib/utils";
import { FloatingMenu, type MenuItem } from "./fields";

const ICONS: Record<string, LucideIcon> = {
  check: Check, database: Database, refresh: RefreshCw, columns: Table2, columnOff: Trash2, rowsKeep: Rows3, rowsRemove: Eraser, sortAsc: ArrowUpNarrowWide, sortDesc: ArrowDownWideNarrow,
  split: Scissors, group: Sigma, type: Type, header: Heading1, replace: Replace, merge: GitMerge, append: Layers, detect: ScanSearch, rename: Pencil, replaceErr: Eraser, fill: ArrowDownWideNarrow,
  pivot: RotateCw, unpivot: RotateCw, move: Move, list: List, text: Type, extract: Scissors, calc: Calculator, sci: FlaskConical, round: Calculator, calendar: Calendar, transpose: RotateCw,
  reverse: ArrowUpNarrowWide, count: Hash, fx: Braces, branch: GitBranch, hash: Hash, copy: Copy, wand: Wand2, sum: Sigma, lag: Move, panelRight: PanelRight, panelLeft: PanelLeft, mono: Code2,
  space: Eye, quality: BarChart2, bars: BarChart2, profile: BarChart2, top: Filter, all: Database, code: Code2, diagram: Network, schema: Table2,
};

export interface RibbonProps {
  tab: TabId;
  onTab: (tab: TabId) => void;
  hasSteps: boolean;
  /** Something is selected: buttons that need a column work (without one the editor asks for it). */
  hasColumn: boolean;
  /** Toggle state by `view:<key>`. */
  toggles: Record<string, boolean>;
  /** Compact mode: only the tab names; a click on a tab opens its groups as a flyout. */
  compact: boolean;
  onCompact: (compact: boolean) => void;
  onCommand: (command: string, needs?: Needs) => void;
}

/**
 * The Home / Transform / Add Column / View ribbon. The tab names stay fixed; the groups scroll sideways (wheel, chevrons) and, when
 * the width is short, the groups with the lowest priority collapse into one dropdown each. It only dispatches command ids.
 */
export function Ribbon({ tab, onTab, hasSteps, hasColumn, toggles, compact, onCompact, onCommand }: RibbonProps) {
  const t = useTranslations("query-flow");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [flyout, setFlyout] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [scroll, setScroll] = useState({ canLeft: false, canRight: false });
  const groups = RIBBON[tab];

  const fit = useMemo(() => fitGroups(groups.map((g) => ({ id: g.id, items: g.items.length, collapse: g.collapse })), width - 48), [groups, width]);

  // width of the strip, and the chevron / fade state
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => { setWidth(el.clientWidth || 1200); setScroll(scrollState(el.scrollLeft, el.clientWidth, el.scrollWidth)); };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [tab, compact, flyout, fit.collapsed.length]);

  // the wheel scrolls the ribbon sideways (a non-passive listener, so the page does not scroll)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const d = wheelToSideways(e.deltaX, e.deltaY);
      if (d === 0) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tab, compact, flyout]);

  // the flyout of the compact ribbon closes on an outside click
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[role=menu]")) setFlyout(false); };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [flyout]);

  const blockedReason = (needs: Needs | undefined, engine: boolean | undefined): string | null => {
    if (engine) return t("ribbon.needsEngineHint");
    if (needs && !hasSteps) return t("ribbon.needsSource");
    return null;
  };
  const toggleKey = (command: string | undefined) => (command && command.startsWith("view:") ? command.slice(5) : "");
  const run = (command: string, needs?: Needs) => { setFlyout(false); onCommand(command, needs); };

  const itemsOf = (entries: RibbonMenuItem[]): MenuItem[] =>
    entries.map((m, i): MenuItem => {
      if ("sep" in m) return { key: `sep${i}`, label: "", separator: true };
      if ("heading" in m) return { key: `h${i}`, label: t(`rb.${m.heading}`), heading: true };
      const entry: Entry = m;
      const reason = blockedReason(entry.needs, entry.engine);
      return { key: entry.id + i, label: t(`rb.${entry.id}`), disabled: !!reason, hint: reason ?? (entry.needs === "column" && !hasColumn ? t("ribbon.pickColumnHint") : undefined), onSelect: () => run(entry.command, entry.needs) };
    });

  const button = (item: RibbonItem) => {
    const Icon = ICONS[item.icon] ?? Square;
    const reason = blockedReason(item.needs, item.engine);
    const pressed = item.toggle ? !!toggles[toggleKey(item.command)] : undefined;
    return (
      <button
        key={item.id}
        type="button"
        disabled={!!reason && !item.menu}
        title={reason ?? (item.needs === "column" && !hasColumn ? t("ribbon.pickColumnHint") : t(`rb.${item.id}`))}
        aria-pressed={pressed}
        aria-haspopup={item.menu ? "menu" : undefined}
        onClick={(e) => {
          if (item.menu) {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 2, items: itemsOf(item.menu) });
          } else if (item.command) run(item.command, item.needs);
        }}
        className={cn(
          "inline-flex h-12 min-w-[60px] max-w-[88px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-transparent px-1 text-[11px] leading-tight text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent",
          pressed && "border-primary/40 bg-primary/10",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex items-center gap-0.5 text-center">
          <span className="line-clamp-2">{t(`rb.${item.id}`)}</span>
          {item.menu ? <ChevronDown className="h-3 w-3 shrink-0" aria-hidden /> : null}
        </span>
      </button>
    );
  };

  /** A collapsed group: one dropdown with every button of the group (menus are flattened under a heading). */
  const collapsedGroup = (g: RibbonGroup) => (
    <button
      key={g.id}
      type="button"
      aria-haspopup="menu"
      title={t(`rb.${g.id}`)}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const items: MenuItem[] = [];
        for (const item of g.items) {
          if (item.menu) { items.push({ key: `h-${item.id}`, label: t(`rb.${item.id}`), heading: true }, ...itemsOf(item.menu)); continue; }
          const reason = blockedReason(item.needs, item.engine);
          items.push({ key: item.id, label: t(`rb.${item.id}`), disabled: !!reason, hint: reason ?? undefined, onSelect: () => item.command && run(item.command, item.needs) });
        }
        setMenu({ x: r.left, y: r.bottom + 2, items });
      }}
      className="inline-flex h-12 min-w-[78px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-card px-1 text-[11px] text-foreground hover:bg-muted"
    >
      <span className="line-clamp-2 text-center leading-tight">{t(`rb.${g.id}`)}</span>
      <ChevronDown className="h-3 w-3" aria-hidden />
    </button>
  );

  const strip = (
    <div className="relative bg-background">
      <div ref={scrollRef} onScroll={(e) => setScroll(scrollState(e.currentTarget.scrollLeft, e.currentTarget.clientWidth, e.currentTarget.scrollWidth))} className="flex items-stretch gap-1 overflow-x-auto px-6 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => (
          fit.collapsed.includes(g.id) ? (
            <div key={g.id} role="group" aria-label={t(`rb.${g.id}`)} className="flex shrink-0 flex-col border-r border-border pr-1.5">{collapsedGroup(g)}</div>
          ) : (
            <div key={g.id} role="group" aria-label={t(`rb.${g.id}`)} className="flex shrink-0 flex-col border-r border-border pr-1.5 last:border-r-0">
              <div className="flex flex-1 items-start gap-0.5">{g.items.map(button)}</div>
              <p className="px-1 text-center text-[10px] text-muted-foreground">{t(`rb.${g.id}`)}</p>
            </div>
          )
        ))}
      </div>
      {scroll.canLeft ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
          <button type="button" aria-label={t("ribbon.scrollLeft")} title={t("ribbon.scrollLeft")} onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ left: pageScroll(el.scrollLeft, el.clientWidth, el.scrollWidth, -1), behavior: "smooth" }); }} className="absolute left-0 top-1/2 inline-flex h-7 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-border bg-card text-foreground hover:bg-muted"><ChevronLeft className="h-3.5 w-3.5" /></button>
        </>
      ) : null}
      {scroll.canRight ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
          <button type="button" aria-label={t("ribbon.scrollRight")} title={t("ribbon.scrollRight")} onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ left: pageScroll(el.scrollLeft, el.clientWidth, el.scrollWidth, 1), behavior: "smooth" }); }} className="absolute right-0 top-1/2 inline-flex h-7 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-border bg-card text-foreground hover:bg-muted"><ChevronRight className="h-3.5 w-3.5" /></button>
        </>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef} className="relative border-b border-border bg-card" role="toolbar" aria-label={t("ribbon.title")}>
      <div className="flex items-end border-b border-border px-2 pt-1">
        <div role="tablist" className="flex min-w-0 flex-1 gap-0.5">
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => { onTab(id); if (compact) setFlyout((open) => (tab === id ? !open : true)); }}
              className={cn("rounded-t-md px-3 py-1 text-xs font-medium", tab === id && (!compact || flyout) ? "border border-b-0 border-border bg-background text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {t(`rb.tab_${id}`)}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={compact} title={compact ? t("ribbon.expand") : t("ribbon.collapse")} aria-label={compact ? t("ribbon.expand") : t("ribbon.collapse")} onClick={() => { onCompact(!compact); setFlyout(false); }} className="mb-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          {compact ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {!compact ? strip : null}
      {compact && flyout ? <div className="absolute inset-x-0 top-full z-30 border-b border-border shadow-lg">{strip}</div> : null}
      {menu ? <FloatingMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
