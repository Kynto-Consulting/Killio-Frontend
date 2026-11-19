"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, RotateCw } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { BacklogControls, OwnerAvatar, STATUS_TONE } from "@/components/boards/backlog-controls";
import { groupNameOptions, relativeDueLabel, shortDate, type BacklogItem } from "@/lib/boards/backlog-common";
import type { GroupingTabConfig } from "@/lib/boards/board-tabs";
import type { ListViewList } from "@/lib/boards/list-view";
import { buildProjects } from "@/lib/boards/projects-view";
import type { TagGroup } from "@/lib/boards/sorting";

interface BoardProjectsViewProps {
  lists: ListViewList[];
  tagGroups: TagGroup[];
  locale: string;
  config: GroupingTabConfig;
  onConfigChange: (patch: Partial<Record<keyof GroupingTabConfig, string | null>>) => void;
  canEdit: boolean;
  onOpenCard: (card: any, listId: string, listName: string) => void;
}

const TONE_CLASS = { late: "text-red-600 dark:text-red-400", today: "text-amber-600 dark:text-amber-400", soon: "text-amber-600 dark:text-amber-400", future: "text-muted-foreground" } as const;

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-hidden className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
      </span>
      <span className="text-xs font-semibold tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </span>
  );
}

function TaskRow({ item, locale, onOpen }: { item: BacklogItem; locale: string; onOpen: BoardProjectsViewProps["onOpenCard"] }) {
  const t = useTranslations("board-detail");
  const rel = item.daysToDue !== null && !item.done ? relativeDueLabel(item.daysToDue, locale) : null;
  const orig = item.originalDate && item.originalDate !== item.dueDate ? shortDate(item.originalDate, locale) : "";
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.card, item.listId, item.listTitle)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary md:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]"
      >
        <span className={`max-w-[8rem] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[item.kind].chip}`}>{item.listTitle}</span>
        <span className={`min-w-0 truncate text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.title}</span>
        <span className="col-start-2 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground md:col-start-auto">
          {item.reschedules > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-medium" title={t("projects.rescheduledTitle", { count: item.reschedules })}>
              <RotateCw className="h-3 w-3" aria-hidden />
              {item.reschedules}
            </span>
          ) : null}
          <span className="flex -space-x-1">
            {item.owners.slice(0, 3).map((o) => (
              <OwnerAvatar key={o.key} owner={o} size={18} />
            ))}
          </span>
          {item.owners.length ? <span className="truncate">{item.owners.map((o) => o.name).join(", ")}</span> : null}
        </span>
        <span className="col-start-2 text-[11px] tabular-nums text-muted-foreground md:col-start-auto md:text-right">
          {item.dueDate ? shortDate(item.dueDate, locale) : t("projects.noDue")}
          {orig ? <span className="ml-1.5 opacity-70">{t("projects.original", { date: orig })}</span> : null}
        </span>
        <span className={`col-start-2 text-[11px] font-semibold md:col-start-auto md:min-w-[5.5rem] md:text-right ${rel ? TONE_CLASS[rel.tone] : ""}`}>{rel?.text ?? ""}</span>
      </button>
    </li>
  );
}

function Toggle({ expanded, onClick, controls, children }: { expanded: boolean; onClick: () => void; controls: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-expanded={expanded} aria-controls={controls} onClick={onClick} className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
      {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      {children}
    </button>
  );
}

/** "Proyectos": area > project > phase > tasks, with done/total progress and collapsible rows. Projects start expanded, phases collapsed. */
export function BoardProjectsView({ lists, tagGroups, locale, config, onConfigChange, canEdit, onOpenCard }: BoardProjectsViewProps) {
  const t = useTranslations("board-detail");
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  // Rows the user flipped from their default (project: open, phase: closed). Stored as a set of keys so it survives data refreshes.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [allMode, setAllMode] = useState<"default" | "expanded" | "collapsed">("default");
  const result = useMemo(() => buildProjects(lists, tagGroups, { ...config, ownerKey }), [lists, tagGroups, config, ownerKey]);
  const options = useMemo(() => groupNameOptions(tagGroups, lists), [tagGroups, lists]);

  const isOpen = useCallback(
    (key: string, isProject: boolean) => {
      if (allMode === "expanded") return !flipped.has(key);
      if (allMode === "collapsed") return flipped.has(key);
      return isProject ? !flipped.has(key) : flipped.has(key);
    },
    [allMode, flipped],
  );
  const toggle = (key: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const setAll = (mode: "expanded" | "collapsed") => {
    setAllMode(mode);
    setFlipped(new Set());
  };
  const anyOpen = result.areas.some((a) => a.projects.some((p) => isOpen(`${a.key}/${p.key}`, true) || p.phases.some((ph) => isOpen(`${a.key}/${p.key}/${ph.key}`, false))));

  const names = { area: t("summary.groupArea"), project: t("summary.groupProject"), phase: t("summary.groupPhase") };
  const hasRows = result.areas.some((a) => a.projects.length > 0);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BacklogControls
            owners={result.owners}
            ownerKey={ownerKey}
            onOwnerChange={setOwnerKey}
            levels={[
              { key: "areaGroup", label: names.area, value: config.areaGroup ?? "", defaultName: names.area },
              { key: "projectGroup", label: names.project, value: config.projectGroup ?? "", defaultName: names.project },
              { key: "phaseGroup", label: names.phase, value: config.phaseGroup ?? "", defaultName: names.phase },
            ]}
            groupOptions={options}
            canEdit={canEdit}
            onGroupChange={(key, value) => onConfigChange({ [key]: value })}
          />
          {hasRows ? (
            <button
              type="button"
              onClick={() => setAll(anyOpen ? "collapsed" : "expanded")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
            >
              {anyOpen ? <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />}
              {anyOpen ? t("projects.collapseAll") : t("projects.expandAll")}
            </button>
          ) : null}
        </div>

        {!hasRows ? <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{t("projects.empty")}</p> : null}

        {result.areas
          .filter((a) => a.projects.length > 0)
          .map((area) => {
            const areaTitle = area.kind === "none" ? t("summary.areaNone") : area.kind === "all" ? "" : area.name;
            return (
              <section key={area.key} aria-label={areaTitle || undefined} className="min-w-0">
                {areaTitle ? (
                  <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="truncate">{areaTitle}</span>
                    <Progress done={area.done} total={area.total} />
                  </h2>
                ) : null}
                <div className="space-y-3">
                  {area.projects.map((project) => {
                    const pKey = `${area.key}/${project.key}`;
                    const open = isOpen(pKey, true);
                    const pid = `proj-${pKey}`.replace(/[^a-zA-Z0-9_-]/g, "_");
                    return (
                      <div key={pKey} className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
                        <Toggle expanded={open} onClick={() => toggle(pKey)} controls={pid}>
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{project.kind === "none" ? t("projects.noProject") : project.name}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${project.active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                            {project.active ? t("projects.active") : t("projects.finished")}
                          </span>
                          <Progress done={project.done} total={project.total} />
                        </Toggle>
                        {open ? (
                          <div id={pid} className="space-y-0.5 border-t border-border px-2 py-1.5">
                            {project.phases.map((phase) => {
                              const phKey = `${pKey}/${phase.key}`;
                              const phOpen = isOpen(phKey, false);
                              const phid = `phase-${phKey}`.replace(/[^a-zA-Z0-9_-]/g, "_");
                              return (
                                <div key={phKey}>
                                  <Toggle expanded={phOpen} onClick={() => toggle(phKey)} controls={phid}>
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{phase.kind === "none" ? t("projects.noPhase") : phase.name}</span>
                                    {phase.allDone ? <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t("projects.subtasksDone")}</span> : null}
                                    <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                                      {phase.done}/{phase.total}
                                    </span>
                                  </Toggle>
                                  {phOpen ? (
                                    <ul id={phid} className="mb-1 ml-4 border-l border-border pl-2">
                                      {phase.tasks.map((task) => (
                                        <TaskRow key={task.id} item={task} locale={locale} onOpen={onOpenCard} />
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
