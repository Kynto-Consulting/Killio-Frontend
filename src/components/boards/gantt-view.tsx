"use client";

import { useMemo, useState } from "react";
import { ProfileHover } from "@/components/ui/profile-hover";
import { CalendarDays, ChartGantt, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import {
  cardProgress,
  cardSpan,
  getGanttWindow,
  initials,
  layoutBar,
  nameHue,
  nowPosition,
  parseDateMs,
  type GanttMode,
} from "@/lib/boards/gantt-layout";

export interface GanttList {
  id: string;
  title: string;
  cards: any[];
}

interface GanttViewProps {
  lists: GanttList[];
  locale: string;
  onOpenCard: (card: any, listId: string, listName: string) => void;
}

const LEFT_COL = 248;
const MIN_UNIT_WIDTH: Record<GanttMode, number> = { day: 56, week: 120, month: 40 };

function assigneeName(a: any): string {
  return a?.name || a?.displayName || a?.email || "";
}

function Avatar({ assignee }: { assignee: any }) {
  return (
    <ProfileHover name={assigneeName(assignee)} email={assignee?.email} avatarUrl={assignee?.avatar_url || assignee?.avatarUrl}>
      <AvatarFace assignee={assignee} />
    </ProfileHover>
  );
}

function AvatarFace({ assignee }: { assignee: any }) {
  const name = assigneeName(assignee);
  const url = assignee?.avatar_url || assignee?.avatarUrl;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={getUserAvatarUrl(url, assignee?.email, 24)} alt={name} className="h-6 w-6 shrink-0 rounded-full object-cover" />;
  }
  const hue = nameHue(name);
  return (
    <span
      title={name || undefined}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Gantt of a board: one row per card grouped by list, a bar from start to due date with the progress inside, a "today"
 * line and a fixed name column. Everything uses theme tokens so it reads in light and dark.
 */
export function GanttView({ lists, locale, onOpenCard }: GanttViewProps) {
  const t = useTranslations("board-detail");
  const [mode, setMode] = useState<GanttMode>("week");
  const [offset, setOffset] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [base] = useState(() => new Date());
  const nowMs = Date.now();

  const win = useMemo(() => getGanttWindow(mode, base, offset), [mode, base, offset]);
  const minWidth = win.units.length * MIN_UNIT_WIDTH[mode];

  const fmt = useMemo(
    () => ({
      month: new Intl.DateTimeFormat(locale, { month: "long" }),
      monthYear: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
      weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
      weekdayLetter: new Intl.DateTimeFormat(locale, { weekday: "narrow" }),
      day: new Intl.DateTimeFormat(locale, { day: "numeric" }),
      full: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }),
      short: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
      hour: new Intl.DateTimeFormat(locale, { hour: "2-digit" }),
      dateTime: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    }),
    [locale],
  );

  const rangeLabel = useMemo(() => {
    const first = new Date(win.startMs);
    const last = new Date(win.endMs - 1);
    return mode === "day" ? fmt.full.format(first) : `${fmt.short.format(first)} – ${fmt.short.format(last)}`;
  }, [fmt, mode, win.endMs, win.startMs]);

  // Top header row: months for week/month windows, the single date for the day window.
  const groups = useMemo(() => {
    if (mode === "day") return [{ key: "day", label: fmt.full.format(new Date(win.startMs)), span: win.units.length }];
    const out: Array<{ key: string; label: string; span: number }> = [];
    const years = new Set(win.units.map((u) => new Date(u.startMs).getFullYear()));
    for (const unit of win.units) {
      const d = new Date(unit.startMs);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.span += 1;
      else out.push({ key, label: (years.size > 1 ? fmt.monthYear : fmt.month).format(d), span: 1 });
    }
    return out;
  }, [fmt, mode, win.startMs, win.units]);

  const sections = useMemo(
    () =>
      lists.map((list) => {
        const rows = (list.cards || []).map((card) => {
          const span = cardSpan(card);
          const bar = span ? layoutBar(span, win) : null;
          return { card, span, bar, progress: cardProgress(card) };
        });
        // Dated cards inside the window first (by start), then the rest.
        rows.sort((a, b) => {
          if (!!a.bar !== !!b.bar) return a.bar ? -1 : 1;
          return (a.span?.startMs ?? Infinity) - (b.span?.startMs ?? Infinity);
        });
        return { list, rows };
      }),
    [lists, win],
  );

  const anyBar = sections.some((s) => s.rows.some((r) => r.bar));
  const today = nowPosition(win, nowMs);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const segBtn = (value: GanttMode, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => { setMode(value); setOffset(0); }}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      aria-pressed={mode === value}
    >
      {label}
    </button>
  );
  const navBtn = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <ChartGantt className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">{rangeLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-1">
            {segBtn("day", t("gantt.dayView"))}
            {segBtn("week", t("gantt.weekView"))}
            {segBtn("month", t("gantt.monthView"))}
          </div>
          <button type="button" className={navBtn} onClick={() => setOffset((o) => o - 1)} aria-label="‹"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setOffset(0)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("gantt.today")}
          </button>
          <button type="button" className={navBtn} onClick={() => setOffset((o) => o + 1)} aria-label="›"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border/60 bg-card shadow-sm">
        <div className="relative" style={{ minWidth: LEFT_COL + minWidth }}>
          {/* Header */}
          <div className="sticky top-0 z-30 border-b border-border/60 bg-card">
            <div className="flex">
              <div className="sticky left-0 z-40 flex shrink-0 items-end border-r border-border/60 bg-card px-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: LEFT_COL }}>
                {t("gantt.task")}
              </div>
              <div className="relative flex-1">
                {today !== null ? (
                  <span className="absolute bottom-0 z-40 -translate-x-1/2 translate-y-1/2 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white" style={{ left: `${today}%` }}>{t("gantt.today")}</span>
                ) : null}
                <div className="flex">
                  {groups.map((g) => (
                    <div key={g.key} className="truncate border-l border-border/60 px-3 py-1.5 text-xs font-semibold capitalize text-foreground first:border-l-0" style={{ flex: g.span }}>
                      {g.label}
                    </div>
                  ))}
                </div>
                <div className="flex border-t border-border/40">
                  {win.units.map((u) => {
                    const d = new Date(u.startMs);
                    const isToday = mode !== "day" && nowMs >= u.startMs && nowMs < u.endMs;
                    return (
                      <div key={u.startMs} className={`flex-1 border-l border-border/40 py-1 text-center text-[10px] first:border-l-0 ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                        {mode === "day" ? fmt.hour.format(d) : mode === "week" ? <>{fmt.weekday.format(d)} {fmt.day.format(d)}</> : <><span className="block leading-3">{fmt.weekdayLetter.format(d)}</span><span className="block leading-3">{fmt.day.format(d)}</span></>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="relative z-20">
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10" style={{ left: LEFT_COL }}>
              <div className="flex h-full">
                {win.units.map((u) => <div key={u.startMs} className="h-full flex-1 border-l border-border/30 first:border-l-0" />)}
              </div>
              {today !== null ? <div className="absolute inset-y-0 z-[12] w-px bg-red-500/80" style={{ left: `${today}%` }} /> : null}
            </div>
            {sections.map(({ list, rows }) => {
              const isCollapsed = collapsed.has(list.id);
              return (
                <div key={list.id}>
                  <div className="flex border-b border-border/40 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => toggle(list.id)}
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-border/60 bg-muted px-4 py-2 text-left"
                      style={{ width: LEFT_COL }}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                      <span className="truncate text-xs font-bold uppercase tracking-wide text-foreground">{list.title}</span>
                      <span className="ml-auto rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums text-muted-foreground">{rows.length}</span>
                    </button>
                    <div className="flex-1" />
                  </div>
                  {!isCollapsed && rows.map(({ card, span, bar, progress }) => {
                    const done = progress >= 100;
                    const dueMs = parseDateMs(card.dueAt);
                    const overdue = !done && dueMs !== null && dueMs < nowMs;
                    const tone = done ? { track: "bg-emerald-500/25", fill: "bg-emerald-500" } : overdue ? { track: "bg-red-500/20", fill: "bg-red-500" } : { track: "bg-primary/25", fill: "bg-primary" };
                    const tip = [card.title, span ? `${fmt.dateTime.format(new Date(span.startMs))} → ${fmt.dateTime.format(new Date(span.endMs))}` : t("gantt.noDates"), `${progress}%`].join("\n");
                    const first = (card.assignees ?? [])[0];
                    return (
                      <div key={card.id} className="group flex h-11 border-b border-border/30 hover:bg-muted/30">
                        <button
                          type="button"
                          onClick={() => onOpenCard(card, list.id, list.title)}
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-border/60 bg-card px-4 text-left group-hover:bg-muted"
                          style={{ width: LEFT_COL }}
                          title={card.title}
                        >
                          {first ? <Avatar assignee={first} /> : <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-border" />}
                          <span className="truncate text-sm text-foreground">{card.title}</span>
                        </button>
                        <div className="relative flex-1">
                          {bar && span ? (
                            <button
                              type="button"
                              onClick={() => onOpenCard(card, list.id, list.title)}
                              title={tip}
                              className={`absolute z-[11] top-2.5 h-6 overflow-hidden text-left ${tone.track} ${bar.clippedLeft ? "rounded-l-none" : "rounded-l-md"} ${bar.clippedRight ? "rounded-r-none" : "rounded-r-md"} ring-1 ring-inset ring-foreground/5 transition-shadow hover:shadow-md`}
                              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                            >
                              <span className={`absolute inset-y-0 left-0 ${tone.fill}`} style={{ width: `${progress}%` }} />
                              <span className={`relative block truncate px-2 text-[11px] font-semibold leading-6 ${progress >= 18 ? "text-white" : "text-foreground"}`}>{progress}%</span>
                            </button>
                          ) : !span ? (
                            <span className="absolute inset-y-0 left-3 flex items-center text-[11px] italic text-muted-foreground">{t("gantt.noDates")}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!anyBar ? (
        <p className="text-center text-xs text-muted-foreground">{t("gantt.emptyDescription")}</p>
      ) : null}
    </div>
  );
}
