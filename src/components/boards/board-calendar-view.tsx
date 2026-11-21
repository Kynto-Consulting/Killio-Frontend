"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { groupByDueDay, monthGrid, shiftMonth } from "@/lib/boards/calendar-view";
import type { ListViewList } from "@/lib/boards/list-view";

interface BoardCalendarViewProps {
  lists: ListViewList[];
  locale: string;
  onOpenCard: (card: any, listId: string, listName: string) => void;
}

const MAX_PER_DAY = 3;

/** Experimental view: a month grid with each card on the day it is due. Read-only: open a card to edit it. */
export function BoardCalendarView({ lists, locale, onOpenCard }: BoardCalendarViewProps) {
  const t = useTranslations("board-detail");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [expanded, setExpanded] = useState<string | null>(null);

  const owner = useMemo(() => {
    const m = new Map<string, { listId: string; listName: string }>();
    for (const l of lists) for (const c of l.cards) m.set(c.id, { listId: l.id, listName: l.title });
    return m;
  }, [lists]);
  const { byDay, undated } = useMemo(() => groupByDueDay(lists.flatMap((l) => l.cards)), [lists]);
  const cells = useMemo(() => monthGrid(month), [month]);
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i))); // 2024-01-01 is a Monday
  }, [locale]);

  const open = (card: any) => {
    const o = owner.get(card.id);
    if (o) onOpenCard(card, o.listId, o.listName);
  };
  const chip = (card: any) => (
    <button
      key={card.id}
      type="button"
      onClick={() => open(card)}
      title={card.title}
      className="block w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-[11px] font-medium text-foreground hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {card.title}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label={t("calendar.prev")} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="min-w-[10rem] text-center text-sm font-semibold capitalize text-foreground">{monthLabel}</h2>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label={t("calendar.next")} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="h-8 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted">
          {t("calendar.today")}
        </button>
        <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("viewTabs.inDevelopment")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <div className="grid min-w-[44rem] grid-cols-7 border-b border-border bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {weekdays.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid min-w-[44rem] grid-cols-7 auto-rows-[minmax(6.5rem,1fr)]">
          {cells.map((cell) => {
            const cards = byDay.get(cell.day) ?? [];
            const showAll = expanded === cell.day;
            const shown = showAll ? cards : cards.slice(0, MAX_PER_DAY);
            return (
              <div key={cell.day} className={`min-w-0 space-y-1 border-b border-r border-border p-1.5 ${cell.inMonth ? "" : "bg-muted/30"}`}>
                <div className={`text-[11px] font-semibold ${cell.isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : cell.inMonth ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {Number(cell.day.slice(8))}
                </div>
                {shown.map(chip)}
                {cards.length > MAX_PER_DAY ? (
                  <button type="button" onClick={() => setExpanded(showAll ? null : cell.day)} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
                    {showAll ? t("calendar.less") : t("calendar.more", { count: cards.length - MAX_PER_DAY })}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 ? (
        <p className="shrink-0 text-xs text-muted-foreground">{t("calendar.undated", { count: undated.length })}</p>
      ) : null}
    </div>
  );
}
