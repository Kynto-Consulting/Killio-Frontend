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
import { Activity, BarChart3, CalendarDays, ChevronRight, Clock3, LayoutGrid, RotateCcw, SquareKanban, Users, Zap } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { useActiveTeamRole } from "@/hooks/use-active-team-role";
import { listTeamMetrics, type TeamMetricsResponse } from "@/lib/api/contracts";

const WINDOW_OPTIONS = [7, 30, 90] as const;

type WindowDays = (typeof WINDOW_OPTIONS)[number];

function formatAction(action: string) {
  return action.replace(/\./g, " ").replace(/_/g, " ");
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
    });
  }

  return values;
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
          setError(typeof err?.message === "string" ? err.message : "Failed to load workspace metrics.");
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

  const memberByUserId = useMemo(() => {
    return new Map((metrics?.members ?? []).map((member) => [member.userId, member]));
  }, [metrics?.members]);

  const topMembers = useMemo(() => {
    return [...(metrics?.members ?? [])].sort((left, right) => right.assignmentsCount - left.assignmentsCount || right.activityCount - left.activityCount).slice(0, 8);
  }, [metrics?.members]);

  const topBoards = useMemo(() => {
    return [...(metrics?.boards ?? [])].sort((left, right) => right.activityCount - left.activityCount || right.assignmentsCount - left.assignmentsCount).slice(0, 6);
  }, [metrics?.boards]);

  const summaryCards = metrics
    ? [
        {
          label: t("metrics.summary.members"),
          value: metrics.summary.memberCount,
          icon: Users,
        },
        {
          label: t("metrics.summary.boards"),
          value: metrics.summary.boardCount,
          icon: SquareKanban,
        },
        {
          label: t("metrics.summary.cards"),
          value: metrics.summary.cardCount,
          icon: LayoutGrid,
        },
        {
          label: t("metrics.summary.assignments"),
          value: metrics.summary.assignmentCount,
          icon: RotateCcw,
        },
        {
          label: t("metrics.summary.activity"),
          value: metrics.summary.activityCount,
          icon: Activity,
        },
        {
          label: t("metrics.summary.automation"),
          value: metrics.automation.monthlyRuns,
          icon: Zap,
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-[#d8ff72]/25 bg-[#d8ff72]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d8ff72]">
                {t("metrics.title")}
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{metrics?.teamName ?? t("metrics.title")}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{t("metrics.subtitle")}</p>
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
              <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <article key={card.label} className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon className="h-4 w-4" />
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                        </div>
                        <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          {windowDays}d
                        </span>
                      </div>
                      <p className="mt-4 text-3xl font-semibold tracking-tight">{numberFormatter.format(card.value)}</p>
                    </article>
                  );
                })}
              </section>

              <section className="mt-6 grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.activityTrend")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.subtitle")}</p>
                    </div>
                    <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={activitySeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: 16 }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area type="monotone" dataKey="activityCount" stroke="hsl(var(--accent))" fill="hsl(var(--accent))" fillOpacity={0.2} strokeWidth={2} />
                        <Area type="monotone" dataKey="assignmentsCount" stroke="#7dd3fc" fill="#7dd3fc" fillOpacity={0.12} strokeWidth={2} />
                        <Area type="monotone" dataKey="completionsCount" stroke="#a3e635" fill="#a3e635" fillOpacity={0.12} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.roleBreakdown")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.table.role")}</p>
                    </div>
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {metrics.roleBreakdown.length > 0 ? (
                      metrics.roleBreakdown.map((roleItem) => {
                        const total = metrics.summary.memberCount || 1;
                        const percent = Math.round((roleItem.count / total) * 100);
                        return (
                          <div key={roleItem.role} className="rounded-2xl border border-border/60 bg-card/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium capitalize">{roleItem.role}</span>
                              <span className="text-sm text-muted-foreground">{numberFormatter.format(roleItem.count)} · {percent}%</span>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-muted/60">
                              <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(8, percent)}%` }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                        {t("metrics.empty.noMembers")}
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

              <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.memberLoad")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.table.assignments")}</p>
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
                        <Bar dataKey="assignmentsCount" fill="hsl(var(--accent))" radius={[0, 10, 10, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.sections.boardPulse")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.table.board")}</p>
                    </div>
                    <SquareKanban className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {topBoards.length > 0 ? (
                      topBoards.map((board) => (
                        <div key={board.id} className="rounded-2xl border border-border/60 bg-card/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{board.name}</p>
                              <p className="text-xs text-muted-foreground">{numberFormatter.format(board.cardsCount)} {t("metrics.table.cards")}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                              <p className="uppercase tracking-[0.12em]">{t("metrics.table.assignments")}</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{numberFormatter.format(board.assignmentsCount)}</p>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                              <p className="uppercase tracking-[0.12em]">{t("metrics.table.activity")}</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{numberFormatter.format(board.activityCount)}</p>
                            </div>
                            <div className="rounded-xl border border-border/60 bg-background/70 p-2">
                              <p className="uppercase tracking-[0.12em]">{t("metrics.table.lastActive")}</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{board.lastActiveAt ? new Date(board.lastActiveAt).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "—"}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
                        {t("metrics.empty.noBoards")}
                      </div>
                    )}
                  </div>
                </article>
              </section>

              <section className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{t("metrics.table.member")}</h2>
                      <p className="text-sm text-muted-foreground">{t("metrics.sections.memberLoad")}</p>
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
                        </tr>
                      </thead>
                      <tbody>
                        {topMembers.length > 0 ? topMembers.map((member) => (
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
                          </tr>
                        )) : (
                          <tr>
                            <td className="py-4 text-sm text-muted-foreground" colSpan={6}>
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
                      <p className="text-sm text-muted-foreground">{numberFormatter.format(metrics.recentActivity.length)} {t("metrics.events")}</p>
                    </div>
                    <Clock3 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {metrics.recentActivity.length > 0 ? metrics.recentActivity.map((activity) => {
                      const actor = activity.actorId === "i18n.system" ? t("metrics.system.label") : memberByUserId.get(activity.actorId)?.displayName ?? activity.actorId.slice(0, 8);
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
