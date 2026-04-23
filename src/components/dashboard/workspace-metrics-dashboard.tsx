"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  LayoutGrid,
  Minus,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { listTeamMetrics, type TeamMetricsResponse, type TeamMetricsTrend } from "@/lib/api/contracts";

const WINDOW_OPTIONS = [7, 30, 90] as const;

type WindowDays = (typeof WINDOW_OPTIONS)[number];

function formatAction(action: string) {
  return action.replace(/\./g, " ").replace(/_/g, " ");
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getMemberDisplayName(member: { name: string; alias: string | null; displayName?: string | null } | null | undefined) {
  if (!member) {
    return "User";
  }

  return member.alias || member.displayName || member.name || "User";
}

function getActivityBoardId(activity: TeamMetricsResponse["recentActivity"][number]): string | null {
  if (activity.scope === "board") {
    return activity.scopeId;
  }

  const payload = (activity.payload ?? {}) as { boardId?: unknown };
  return typeof payload.boardId === "string" && payload.boardId ? payload.boardId : null;
}

function buildSeries(windowDays: WindowDays, series: TeamMetricsResponse["activitySeries"], locale: string) {
  const seriesByDate = new Map(series.map((point) => [point.date, point]));
  const now = new Date();
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  const values: Array<{
    date: string;
    label: string;
    activityCount: number;
    assignmentsCount: number;
    completionsCount: number;
    createdCardsCount: number;
  }> = [];

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    const dateKey = date.toISOString().slice(0, 10);
    const point = seriesByDate.get(dateKey);

    values.push({
      date: dateKey,
      label: formatter.format(new Date(`${dateKey}T12:00:00Z`)),
      activityCount: point?.activityCount ?? 0,
      assignmentsCount: point?.assignmentsCount ?? 0,
      completionsCount: point?.completionsCount ?? 0,
      createdCardsCount: point?.createdCardsCount ?? 0,
    });
  }

  return values;
}

function getTrendTone(metric: TeamMetricsTrend["metric"], trend: TeamMetricsTrend["direction"]): "up" | "down" | "flat" {
  if (trend === "flat") {
    return "flat";
  }

  if (metric === "createdCards") {
    return trend === "up" ? "down" : "up";
  }

  return trend;
}

function formatPercent(value: number | null, locale: string) {
  if (value === null) {
    return "-";
  }

  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

export function WorkspaceMetricsDashboard() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = useTranslations("dashboard");
  const { user, accessToken, activeTeamId } = useSession();
  const { role, isAdmin, isLoading: isRoleLoading } = useActiveTeamRole(activeTeamId, accessToken, user?.id);

  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [metrics, setMetrics] = useState<TeamMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [selectedBoardId, setSelectedBoardId] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [selectedScope, setSelectedScope] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!isRoleLoading && activeTeamId && accessToken && role && !isAdmin) {
      router.replace("/");
    }
  }, [activeTeamId, accessToken, isAdmin, isRoleLoading, router, role]);

  useEffect(() => {
    if (!accessToken || !activeTeamId || isRoleLoading || !isAdmin) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listTeamMetrics(activeTeamId, accessToken, windowDays)
      .then((nextMetrics) => {
        if (!cancelled) {
          setMetrics(nextMetrics);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(typeof err?.message === "string" ? err.message : t("metrics.errors.load"));
          setMetrics(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTeamId, isAdmin, isRoleLoading, windowDays]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const activitySeries = useMemo(() => buildSeries(windowDays, metrics?.activitySeries ?? [], locale), [locale, metrics?.activitySeries, windowDays]);

  const boardNameById = useMemo(() => {
    return new Map((metrics?.boards ?? []).map((board) => [board.id, board.name]));
  }, [metrics?.boards]);

  const memberByUserId = useMemo(() => {
    return new Map((metrics?.members ?? []).map((member) => [member.id, member]));
  }, [metrics?.members]);

  const userFilterOptions = useMemo(() => {
    const options = (metrics?.members ?? []).map((member) => ({
      id: member.id,
      name: getMemberDisplayName(member),
    }));

    const hasSystem = (metrics?.recentActivity ?? []).some((activity) => activity.actorId === "i18n.system");
    if (hasSystem) {
      options.push({ id: "i18n.system", name: t("metrics.system.label") });
    }

    return options;
  }, [metrics?.members, metrics?.recentActivity, t]);

  const actionFilterOptions = useMemo(() => {
    return Array.from(new Set((metrics?.recentActivity ?? []).map((activity) => activity.action))).sort();
  }, [metrics?.recentActivity]);

  const scopeFilterOptions = useMemo(() => {
    return Array.from(new Set((metrics?.recentActivity ?? []).map((activity) => activity.scope))).sort();
  }, [metrics?.recentActivity]);

  const normalizedSearch = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const dateFromKey = dateFrom || null;
  const dateToKey = dateTo || null;

  const filteredActivitySeries = useMemo(() => {
    if (!dateFromKey && !dateToKey) {
      return activitySeries;
    }

    return activitySeries.filter((point) => {
      if (dateFromKey && point.date < dateFromKey) {
        return false;
      }
      if (dateToKey && point.date > dateToKey) {
        return false;
      }
      return true;
    });
  }, [activitySeries, dateFromKey, dateToKey]);

  const filteredRecentActivity = useMemo(() => {
    return (metrics?.recentActivity ?? []).filter((activity) => {
      const activityDateKey = activity.createdAt.slice(0, 10);
      if (dateFromKey && activityDateKey < dateFromKey) {
        return false;
      }
      if (dateToKey && activityDateKey > dateToKey) {
        return false;
      }

      if (selectedUserId !== "all" && activity.actorId !== selectedUserId) {
        return false;
      }

      if (selectedAction !== "all" && activity.action !== selectedAction) {
        return false;
      }

      if (selectedScope !== "all" && activity.scope !== selectedScope) {
        return false;
      }

      const boardId = getActivityBoardId(activity);
      if (selectedBoardId !== "all" && boardId !== selectedBoardId) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const actorLabel = activity.actorId === "i18n.system"
        ? t("metrics.system.label")
        : getMemberDisplayName(memberByUserId.get(activity.actorId) ?? null) || activity.actorId;
      const boardLabel = boardId ? boardNameById.get(boardId) ?? "" : "";
      const haystack = `${actorLabel} ${formatAction(activity.action)} ${boardLabel}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [
    boardNameById,
    dateFromKey,
    dateToKey,
    memberByUserId,
    metrics?.recentActivity,
    normalizedSearch,
    selectedAction,
    selectedBoardId,
    selectedScope,
    selectedUserId,
    t,
  ]);

  const filteredMembers = useMemo(() => {
    return (metrics?.members ?? []).filter((member) => {
      if (selectedUserId !== "all" && member.id !== selectedUserId) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = `${getMemberDisplayName(member)} ${member.primaryEmail} ${member.role}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [metrics?.members, normalizedSearch, selectedUserId]);

  const topMembers = useMemo(() => {
    return [...filteredMembers]
      .sort((left, right) => right.completedCardsCount - left.completedCardsCount || right.activityCount - left.activityCount)
      .map((member) => ({
        ...member,
        displayName: getMemberDisplayName(member),
      }))
      .slice(0, 8);
  }, [filteredMembers]);

  const boardPortfolio = useMemo(() => {
    return [...(metrics?.boards ?? [])]
      .filter((board) => {
        if (selectedBoardId !== "all" && board.id !== selectedBoardId) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return board.name.toLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => right.overdueCardsCount - left.overdueCardsCount || right.staleCardsCount - left.staleCardsCount || right.activityCount - left.activityCount)
      .slice(0, 8);
  }, [metrics?.boards, normalizedSearch, selectedBoardId]);

  const trendByMetric = useMemo(() => {
    return new Map((metrics?.trends ?? []).map((trend) => [trend.metric, trend]));
  }, [metrics?.trends]);

  const focusMembers = useMemo(() => {
    return topMembers.map((member) => {
      const executionRate = member.assignmentsCount > 0 ? (member.completedCardsCount / member.assignmentsCount) * 100 : null;

      return {
        ...member,
        executionRate,
      };
    });
  }, [topMembers]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedUserId("all");
    setSelectedBoardId("all");
    setSelectedAction("all");
    setSelectedScope("all");
    setDateFrom("");
    setDateTo("");
  };

  const summaryCards = metrics
    ? [
        {
          label: t("metrics.cards.activeMembers"),
          value: metrics.kpis.activeMemberCount,
          helper: `${formatPercent(metrics.kpis.collaborationRatePct, locale)} ${t("metrics.cards.ofTeam")}`,
          icon: Users,
          trend: trendByMetric.get("activity"),
        },
        {
          label: t("metrics.cards.completions"),
          value: metrics.windowSummary.completionsCount,
          helper: `${numberFormatter.format(metrics.previousWindowSummary.completionsCount)} ${t("metrics.cards.prevWindow")}`,
          icon: CheckCircle2,
          trend: trendByMetric.get("completions"),
        },
        {
          label: t("metrics.cards.intake"),
          value: metrics.windowSummary.createdCardsCount,
          helper: `${numberFormatter.format(metrics.windowSummary.assignmentsCount)} ${t("metrics.cards.assignments")}`,
          icon: LayoutGrid,
          trend: trendByMetric.get("createdCards"),
        },
        {
          label: t("metrics.cards.completionRate"),
          value: metrics.kpis.completionRatePct === null ? "-" : `${metrics.kpis.completionRatePct}%`,
          helper: `${metrics.kpis.avgCycleTimeHours === null ? "-" : numberFormatter.format(metrics.kpis.avgCycleTimeHours)}h ${t("metrics.cards.cycle")}`,
          icon: Target,
          trend: trendByMetric.get("completions"),
        },
      ]
    : [];

  if (!accessToken) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,rgba(216,255,114,0.18),transparent_58%)]" />
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#d8ff72]/10 blur-3xl" />
        <div className="absolute right-0 top-28 h-[24rem] w-[24rem] rounded-full bg-[#3a4722]/25 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:84px_84px] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="rounded-[32px] border border-border/60 bg-card/65 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-2">{t("metrics.title")}</h1>
              <p className="text-muted-foreground">{t("metrics.subtitle")}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-border/70 bg-background/80 p-1 shadow-sm">
                {WINDOW_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setWindowDays(option)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${windowDays === option ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"}`}
                  >
                    {t(`metrics.rangeOptions.${option}`)}
                  </button>
                ))}
              </div>
              <div className="rounded-full border border-border/70 bg-background/80 px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t("metrics.rangeLabel")}: {t(`metrics.rangeOptions.${windowDays}`)}
              </div>
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-border/60 bg-background/70 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                {t("metrics.filters.title")}
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                {t("metrics.filters.reset")}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.search")}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("metrics.filters.searchPlaceholder")}
                    className="h-9 w-full rounded-xl border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.user")}
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                >
                  <option value="all">{t("metrics.filters.allUsers")}</option>
                  {userFilterOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.board")}
                <select
                  value={selectedBoardId}
                  onChange={(event) => setSelectedBoardId(event.target.value)}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                >
                  <option value="all">{t("metrics.filters.allBoards")}</option>
                  {(metrics?.boards ?? []).map((board) => (
                    <option key={board.id} value={board.id}>{board.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.action")}
                <select
                  value={selectedAction}
                  onChange={(event) => setSelectedAction(event.target.value)}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                >
                  <option value="all">{t("metrics.filters.allActions")}</option>
                  {actionFilterOptions.map((action) => (
                    <option key={action} value={action}>{formatAction(action)}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.scope")}
                <select
                  value={selectedScope}
                  onChange={(event) => setSelectedScope(event.target.value)}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                >
                  <option value="all">{t("metrics.filters.allScopes")}</option>
                  {scopeFilterOptions.map((scope) => (
                    <option key={scope} value={scope}>{scope}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.dateFrom")}
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {t("metrics.filters.dateTo")}
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
                />
              </label>
            </div>
          </section>

          {error ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
          ) : null}

          {isLoading || isRoleLoading ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-2xl border border-border/60 bg-background/50" />
              ))}
            </div>
          ) : metrics ? (
            <>
              <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  const trend = card.trend;
                  const trendTone = trend ? getTrendTone(trend.metric, trend.direction) : "flat";
                  const TrendIcon = trendTone === "up" ? ArrowUpRight : trendTone === "down" ? ArrowDownRight : Minus;
                  const trendClass = trendTone === "up"
                    ? "text-emerald-400"
                    : trendTone === "down"
                      ? "text-red-400"
                      : "text-muted-foreground";

                  return (
                    <article key={card.label} className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon className="h-4 w-4" />
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                        </div>
                        {trend ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${trendClass}`}>
                            <TrendIcon className="h-3.5 w-3.5" />
                            {trend.deltaPct === null ? t("metrics.trend.new") : `${trend.deltaPct > 0 ? "+" : ""}${trend.deltaPct}%`}
                          </span>
                        ) : (
                          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{windowDays}d</span>
                        )}
                      </div>
                      <p className="mt-4 text-3xl font-semibold tracking-tight">{typeof card.value === "number" ? numberFormatter.format(card.value) : card.value}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{card.helper}</p>
                    </article>
                  );
                })}
              </section>

              <section className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.deliveryFlow")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.sections.deliveryFlowHint")}</p>
                    </div>
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredActivitySeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 16 }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area type="monotone" dataKey="createdCardsCount" stroke="#fb7185" fill="#fb7185" fillOpacity={0.14} strokeWidth={2} />
                        <Area type="monotone" dataKey="completionsCount" stroke="#a3e635" fill="#a3e635" fillOpacity={0.12} strokeWidth={2} />
                        <Area type="monotone" dataKey="assignmentsCount" stroke="#7dd3fc" fill="#7dd3fc" fillOpacity={0.1} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#fb7185]" />{t("metrics.legend.created")}</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#a3e635]" />{t("metrics.legend.completed")}</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#7dd3fc]" />{t("metrics.legend.assigned")}</span>
                  </div>
                </article>

                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.executionHealth")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.sections.executionHealthHint")}</p>
                    </div>
                    <Gauge className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("metrics.health.open")}</p>
                      <p className="mt-1 text-2xl font-semibold">{numberFormatter.format(metrics.kpis.openCards)}</p>
                    </div>
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-red-300">{t("metrics.health.overdue")}</p>
                      <p className="mt-1 text-2xl font-semibold text-red-200">{numberFormatter.format(metrics.kpis.overdueOpenCards)}</p>
                    </div>
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-amber-300">{t("metrics.health.dueSoon")}</p>
                      <p className="mt-1 text-2xl font-semibold text-amber-100">{numberFormatter.format(metrics.kpis.dueSoonCards)}</p>
                    </div>
                    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-orange-300">{t("metrics.health.stale")}</p>
                      <p className="mt-1 text-2xl font-semibold text-orange-100">{numberFormatter.format(metrics.kpis.staleOpenCards)}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-border/60 bg-card/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t("metrics.health.workloadBalance")}</p>
                        <p className="text-xs text-muted-foreground">{t("metrics.health.workloadBalanceHint")}</p>
                      </div>
                      <Target className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-muted/60">
                        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(6, metrics.kpis.workloadBalanceScore)}%` }} />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {numberFormatter.format(metrics.kpis.workloadBalanceScore)} / 100
                      </p>
                    </div>
                  </div>
                </article>
              </section>

              <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.memberDelivery")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.sections.memberDeliveryHint")}</p>
                    </div>
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topMembers} layout="vertical" margin={{ top: 8, right: 8, left: 16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis dataKey="displayName" type="category" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 16 }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Bar dataKey="completedCardsCount" fill="hsl(var(--accent))" radius={[0, 10, 10, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.workloadRisk")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.sections.workloadRiskHint")}</p>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {metrics.workloadInsights.overloadedMembers.length > 0 ? (
                      metrics.workloadInsights.overloadedMembers.map((member) => (
                        <div key={member.id} className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{member.name}</p>
                              <p className="text-xs text-muted-foreground">{numberFormatter.format(member.assignmentsCount)} {t("metrics.table.assignments")}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                              <p className="uppercase tracking-[0.12em]">{t("metrics.table.completedCards")}</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{numberFormatter.format(member.completedCardsCount)}</p>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                              <p className="uppercase tracking-[0.12em]">{t("metrics.table.activity")}</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{numberFormatter.format(member.activityCount)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                        {t("metrics.empty.noOverloadedMembers")}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-card/70 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("metrics.sections.lowUtilization")}</p>
                    {metrics.workloadInsights.underutilizedMembers.length > 0 ? (
                      metrics.workloadInsights.underutilizedMembers.map((member) => (
                        <div key={member.id} className="flex items-center justify-between gap-2 text-sm">
                          <span>{member.name}</span>
                          <span className="text-xs text-muted-foreground">{t("metrics.health.noRecentLoad")}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("metrics.empty.noUnderutilizedMembers")}</p>
                    )}
                  </div>
                </article>
              </section>

              <section className="mt-6 rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.boardPortfolio")}</h2>
                    <p className="text-sm text-muted-foreground">{t("metrics.sections.boardPortfolioHint")}</p>
                  </div>
                  <SquareKanban className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {boardPortfolio.length > 0 ? (
                    boardPortfolio.map((board) => (
                      <article key={board.id} className="rounded-2xl border border-border/60 bg-card/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{board.name}</p>
                            <p className="text-xs text-muted-foreground">{numberFormatter.format(board.cardsCount)} {t("metrics.table.cards")}</p>
                          </div>
                          <span className="rounded-full border border-border/60 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {board.completionRatePct === null ? "-" : `${board.completionRatePct}%`}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                            <p className="text-muted-foreground">{t("metrics.health.open")}</p>
                            <p className="mt-1 text-sm font-semibold">{numberFormatter.format(board.openCardsCount)}</p>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                            <p className="text-muted-foreground">{t("metrics.health.overdue")}</p>
                            <p className="mt-1 text-sm font-semibold">{numberFormatter.format(board.overdueCardsCount)}</p>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                            <p className="text-muted-foreground">{t("metrics.health.stale")}</p>
                            <p className="mt-1 text-sm font-semibold">{numberFormatter.format(board.staleCardsCount)}</p>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                            <p className="text-muted-foreground">{t("metrics.table.activity")}</p>
                            <p className="mt-1 text-sm font-semibold">{numberFormatter.format(board.activityCount)}</p>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                      {t("metrics.empty.noBoards")}
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.memberDeepDive")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.sections.memberDeepDiveHint")}</p>
                    </div>
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        <tr className="border-b border-border/60">
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.member")}</th>
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.role")}</th>
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.assignments")}</th>
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.createdCards")}</th>
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.completedCards")}</th>
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.activity")}</th>
                          <th className="pb-3 pr-4 font-medium">{t("metrics.table.executionRate")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {focusMembers.length > 0 ? focusMembers.map((member) => (
                          <tr key={member.id} className="border-b border-border/40 last:border-b-0">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-accent/10 text-xs font-semibold text-accent">
                                  {member.avatarUrl ? <img src={member.avatarUrl} alt={member.displayName} className="h-full w-full object-cover" /> : member.displayName.slice(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{member.displayName}</p>
                                  <p className="text-xs text-muted-foreground">{member.primaryEmail}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-4 capitalize text-muted-foreground">{member.role}</td>
                            <td className="py-3 pr-4 font-medium">{numberFormatter.format(member.assignmentsCount)}</td>
                            <td className="py-3 pr-4 font-medium">{numberFormatter.format(member.createdCardsCount)}</td>
                            <td className="py-3 pr-4 font-medium">{numberFormatter.format(member.completedCardsCount)}</td>
                            <td className="py-3 pr-4 font-medium">{numberFormatter.format(member.activityCount)}</td>
                            <td className="py-3 pr-4 font-medium">{member.executionRate === null ? "-" : `${member.executionRate.toFixed(1)}%`}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td className="py-4 text-sm text-muted-foreground" colSpan={7}>
                              {t("metrics.empty.noMembers")}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.recentActivity")}</h2>
                      <p className="text-sm text-muted-foreground">{numberFormatter.format(filteredRecentActivity.length)} {t("metrics.events")}</p>
                    </div>
                    <Clock3 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                    {filteredRecentActivity.length > 0 ? filteredRecentActivity.map((activity) => {
                      const actor = activity.actorId === "i18n.system" ? t("metrics.system.label") : getMemberDisplayName(memberByUserId.get(activity.actorId) ?? null) || activity.actorId.slice(0, 8);
                      return (
                        <div key={activity.id} className="rounded-2xl border border-border/60 bg-card/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{actor}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{formatAction(activity.action)}</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                        {t("metrics.empty.noRecentActivity")}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-border/60 bg-card/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t("metrics.sections.automation")}</p>
                        <p className="text-xs text-muted-foreground">{t("metrics.summary.automation")}</p>
                      </div>
                      <Zap className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("metrics.automation.runs")}</p>
                        <p className="mt-1 text-lg font-semibold">{numberFormatter.format(metrics.automation.monthlyRuns)}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("metrics.automation.activeScripts")}</p>
                        <p className="mt-1 text-lg font-semibold">{numberFormatter.format(metrics.automation.activeScriptCount)}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("metrics.automation.limit")}</p>
                        <p className="mt-1 text-lg font-semibold">{metrics.automation.limit === null ? "∞" : numberFormatter.format(metrics.automation.limit)}</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("metrics.automation.remaining")}</p>
                        <p className="mt-1 text-lg font-semibold">{metrics.automation.remaining === null ? "∞" : numberFormatter.format(metrics.automation.remaining)}</p>
                      </div>
                    </div>
                  </div>
                </article>
              </section>
            </>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border/60 bg-background/50 p-8 text-sm text-muted-foreground">
              {t("metrics.empty.noData")}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
