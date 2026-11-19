"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CircleDot, Lock } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { BacklogControls, STATUS_TONE } from "@/components/boards/backlog-controls";
import { groupNameOptions, relativeDueLabel } from "@/lib/boards/backlog-common";
import type { GroupingTabConfig } from "@/lib/boards/board-tabs";
import type { ListViewList } from "@/lib/boards/list-view";
import type { TagGroup } from "@/lib/boards/sorting";
import { buildSummary, DUE_SOON_DAYS, type AreaSummary } from "@/lib/boards/summary-view";

interface BoardSummaryViewProps {
  lists: ListViewList[];
  tagGroups: TagGroup[];
  locale: string;
  config: GroupingTabConfig;
  onConfigChange: (patch: Partial<Record<keyof GroupingTabConfig, string | null>>) => void;
  canEdit: boolean;
  onOpenCard: (card: any, listId: string, listName: string) => void;
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof CircleDot; label: string; value: number; tone?: "bad" | "warn" | "muted" }) {
  const color = value > 0 && tone === "bad" ? "text-red-600 dark:text-red-400" : value > 0 && tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2">
      <div className={`text-xl font-bold tabular-nums leading-none ${color}`}>{value}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

function AreaCard({ area, locale, onOpen }: { area: AreaSummary; locale: string; onOpen: (card: any, listId: string, listName: string) => void }) {
  const t = useTranslations("board-detail");
  const title = area.kind === "none" ? t("summary.areaNone") : area.kind === "all" ? t("summary.areaAll") : area.name;
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-semibold text-foreground" title={title}>
          {title}
        </h2>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("summary.cardCount", { count: area.total })}</span>
      </header>

      {area.empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("summary.emptyArea")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi icon={CircleDot} label={t("summary.kpiOpen")} value={area.open} />
            <Kpi icon={AlertTriangle} label={t("summary.kpiOverdue")} value={area.overdue} tone="bad" />
            <Kpi icon={CalendarClock} label={t("summary.kpiDueSoon", { days: DUE_SOON_DAYS })} value={area.dueSoon} tone="warn" />
            <Kpi icon={Lock} label={t("summary.kpiBlocked")} value={area.blocked} tone="bad" />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">{t("summary.progress")}</span>
              <span className="text-muted-foreground">{t("summary.progressDone", { percent: area.progress })}</span>
            </div>
            <div
              role="img"
              aria-label={`${t("summary.progress")}: ${area.statuses.map((s) => `${s.title} ${s.count}`).join(", ")}`}
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            >
              {area.statuses.map((s) => (
                <div key={s.listId} className={`${STATUS_TONE[s.kind].bar} h-full transition-[width]`} style={{ width: `${(s.count / area.total) * 100}%` }} title={`${s.title}: ${s.count}`} />
              ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {area.statuses.map((s) => (
                <li key={s.listId} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${STATUS_TONE[s.kind].bar}`} />
                  <span className="max-w-[9rem] truncate">{s.title}</span>
                  <span className="font-semibold tabular-nums text-foreground">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary.mostOverdue")}</h3>
            {area.topOverdue.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("summary.noOverdue")}</p>
            ) : (
              <ul className="space-y-1">
                {area.topOverdue.map(({ item, daysLate, project }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(item.card, item.listId, item.listTitle)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{item.title}</span>
                        {project ? <span className="block truncate text-[11px] text-muted-foreground">{project}</span> : null}
                      </span>
                      <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">{relativeDueLabel(-daysLate, locale).text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{t("summary.rescheduled", { count: area.rescheduled })}</p>
        </>
      )}
    </section>
  );
}

/** "Resumen": one card per area with KPIs, status distribution and the most overdue cards. Read-only; clicking a card opens it. */
export function BoardSummaryView({ lists, tagGroups, locale, config, onConfigChange, canEdit, onOpenCard }: BoardSummaryViewProps) {
  const t = useTranslations("board-detail");
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const summary = useMemo(() => buildSummary(lists, tagGroups, { ...config, ownerKey }), [lists, tagGroups, config, ownerKey]);
  const options = useMemo(() => groupNameOptions(tagGroups, lists), [tagGroups, lists]);
  const defaultArea = t("summary.groupLabel");

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-4 p-4">
        <BacklogControls
          owners={summary.owners}
          ownerKey={ownerKey}
          onOwnerChange={setOwnerKey}
          levels={[{ key: "areaGroup", label: defaultArea, value: config.areaGroup ?? "", defaultName: defaultArea }]}
          groupOptions={options}
          canEdit={canEdit}
          onGroupChange={(key, value) => onConfigChange({ [key]: value })}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {summary.areas.map((area) => (
            <AreaCard key={area.key} area={area} locale={locale} onOpen={onOpenCard} />
          ))}
        </div>
      </div>
    </div>
  );
}
