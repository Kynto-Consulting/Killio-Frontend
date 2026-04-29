"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
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
  CheckCircle2,
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

const MEMBER_COLORS = ["#22d3ee", "#6366f1", "#f472b6", "#fb923c", "#a78bfa", "#34d399", "#fbbf24", "#f87171"];

function memberColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length];
}

function formatAction(action: string) {
  return action.replace(/\./g, " ").replace(/_/g, " ");
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function getMemberDisplayName(member: { name: string; alias: string | null; displayName?: string | null } | null | undefined) {
  if (!member) return "User";
  return member.alias || member.displayName || member.name || "User";
}

function getActivityBoardId(activity: TeamMetricsResponse["recentActivity"][number]): string | null {
  if (activity.scope === "board") return activity.scopeId;
  const payload = (activity.payload ?? {}) as { boardId?: unknown };
  return typeof payload.boardId === "string" && payload.boardId ? payload.boardId : null;
}

function buildSeries(windowDays: WindowDays, series: TeamMetricsResponse["activitySeries"], locale: string) {
  const seriesByDate = new Map(series.map((point) => [point.date, point]));
  const now = new Date();
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  const values: Array<{
    date: string; label: string;
    activityCount: number; assignmentsCount: number;
    completionsCount: number; createdCardsCount: number;
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
  if (trend === "flat") return "flat";
  if (metric === "createdCards") return trend === "up" ? "down" : "up";
  return trend;
}

function formatPercent(value: number | null, locale: string) {
  if (value === null) return "-";
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

// ── SVG SPARKLINE ──────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#d8ff72", width = 120, height = 36 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - (v / max) * height * 0.88,
  }));
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

// ── SVG GAUGE RING ─────────────────────────────────────────────────────────────
function GaugeRing({ pct, size = 110, color = "#d8ff72" }: {
  pct: number; size?: number; color?: string;
}) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>{pct}%</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>Score</div>
      </div>
    </div>
  );
}

// ── RANK BADGE ─────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, { bg: string; color: string }> = {
    1: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    2: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
    3: { bg: "rgba(180,120,80,0.15)", color: "#cd7f32" },
  };
  const s = styles[rank] ?? { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.42)" };
  return (
    <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: s.bg, color: s.color, flexShrink: 0 }}>
      {rank}
    </div>
  );
}

// ── ACTIVITY DOT COLOR ─────────────────────────────────────────────────────────
function activityDotColor(action: string): string {
  if (action.includes("completed")) return "#4ade80";
  if (action.includes("assigned")) return "#818cf8";
  if (action.includes("created")) return "#22d3ee";
  if (action.includes("script")) return "#d8ff72";
  return "rgba(255,255,255,0.3)";
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
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
    if (!accessToken || !activeTeamId || isRoleLoading || !isAdmin) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listTeamMetrics(activeTeamId, accessToken, windowDays)
      .then((nextMetrics) => { if (!cancelled) setMetrics(nextMetrics); })
      .catch((err: any) => {
        if (!cancelled) {
          setError(typeof err?.message === "string" ? err.message : t("metrics.errors.load"));
          setMetrics(null);
        }
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, activeTeamId, isAdmin, isRoleLoading, windowDays]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const activitySeries = useMemo(() => buildSeries(windowDays, metrics?.activitySeries ?? [], locale), [locale, metrics?.activitySeries, windowDays]);

  const boardNameById = useMemo(() => new Map((metrics?.boards ?? []).map((b) => [b.id, b.name])), [metrics?.boards]);
  const memberByUserId = useMemo(() => new Map((metrics?.members ?? []).map((m) => [m.id, m])), [metrics?.members]);

  const userFilterOptions = useMemo(() => {
    const options = (metrics?.members ?? []).map((m) => ({ id: m.id, name: getMemberDisplayName(m) }));
    if ((metrics?.recentActivity ?? []).some((a) => a.actorId === "i18n.system")) {
      options.push({ id: "i18n.system", name: t("metrics.system.label") });
    }
    return options;
  }, [metrics?.members, metrics?.recentActivity, t]);

  const actionFilterOptions = useMemo(() => Array.from(new Set((metrics?.recentActivity ?? []).map((a) => a.action))).sort(), [metrics?.recentActivity]);
  const scopeFilterOptions = useMemo(() => Array.from(new Set((metrics?.recentActivity ?? []).map((a) => a.scope))).sort(), [metrics?.recentActivity]);
  const normalizedSearch = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const dateFromKey = dateFrom || null;
  const dateToKey = dateTo || null;

  const filteredActivitySeries = useMemo(() => {
    if (!dateFromKey && !dateToKey) return activitySeries;
    return activitySeries.filter((p) => {
      if (dateFromKey && p.date < dateFromKey) return false;
      if (dateToKey && p.date > dateToKey) return false;
      return true;
    });
  }, [activitySeries, dateFromKey, dateToKey]);

  const filteredRecentActivity = useMemo(() => {
    return (metrics?.recentActivity ?? []).filter((activity) => {
      const dateKey = activity.createdAt.slice(0, 10);
      if (dateFromKey && dateKey < dateFromKey) return false;
      if (dateToKey && dateKey > dateToKey) return false;
      if (selectedUserId !== "all" && activity.actorId !== selectedUserId) return false;
      if (selectedAction !== "all" && activity.action !== selectedAction) return false;
      if (selectedScope !== "all" && activity.scope !== selectedScope) return false;
      const boardId = getActivityBoardId(activity);
      if (selectedBoardId !== "all" && boardId !== selectedBoardId) return false;
      if (!normalizedSearch) return true;
      const actorLabel = activity.actorId === "i18n.system" ? t("metrics.system.label") : getMemberDisplayName(memberByUserId.get(activity.actorId) ?? null) || activity.actorId;
      const boardLabel = boardId ? boardNameById.get(boardId) ?? "" : "";
      return `${actorLabel} ${formatAction(activity.action)} ${boardLabel}`.toLowerCase().includes(normalizedSearch);
    });
  }, [boardNameById, dateFromKey, dateToKey, memberByUserId, metrics?.recentActivity, normalizedSearch, selectedAction, selectedBoardId, selectedScope, selectedUserId, t]);

  const filteredMembers = useMemo(() => {
    return (metrics?.members ?? []).filter((m) => {
      if (selectedUserId !== "all" && m.id !== selectedUserId) return false;
      if (!normalizedSearch) return true;
      return `${getMemberDisplayName(m)} ${m.primaryEmail} ${m.role}`.toLowerCase().includes(normalizedSearch);
    });
  }, [metrics?.members, normalizedSearch, selectedUserId]);

  const topMembers = useMemo(() => {
    return [...filteredMembers]
      .sort((a, b) => b.completedCardsCount - a.completedCardsCount || b.activityCount - a.activityCount)
      .map((m) => ({ ...m, displayName: getMemberDisplayName(m) }))
      .slice(0, 8);
  }, [filteredMembers]);

  const boardPortfolio = useMemo(() => {
    return [...(metrics?.boards ?? [])]
      .filter((b) => {
        if (selectedBoardId !== "all" && b.id !== selectedBoardId) return false;
        if (!normalizedSearch) return true;
        return b.name.toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => b.overdueCardsCount - a.overdueCardsCount || b.staleCardsCount - a.staleCardsCount || b.activityCount - a.activityCount)
      .slice(0, 8);
  }, [metrics?.boards, normalizedSearch, selectedBoardId]);

  const trendByMetric = useMemo(() => new Map((metrics?.trends ?? []).map((t) => [t.metric, t])), [metrics?.trends]);

  const focusMembers = useMemo(() => {
    return topMembers.map((m) => ({
      ...m,
      executionRate: m.assignmentsCount > 0 ? (m.completedCardsCount / m.assignmentsCount) * 100 : null,
    }));
  }, [topMembers]);

  const resetFilters = () => {
    setSearchQuery(""); setSelectedUserId("all"); setSelectedBoardId("all");
    setSelectedAction("all"); setSelectedScope("all"); setDateFrom(""); setDateTo("");
  };

  // Sparkline data from filtered series (last 14 points)
  const sparkSlice = useMemo(() => filteredActivitySeries.slice(-14), [filteredActivitySeries]);
  const sparkCompletions = useMemo(() => sparkSlice.map((d) => d.completionsCount), [sparkSlice]);
  const sparkCreated = useMemo(() => sparkSlice.map((d) => d.createdCardsCount), [sparkSlice]);
  const sparkActivity = useMemo(() => sparkSlice.map((d) => d.activityCount), [sparkSlice]);
  const sparkRate = useMemo(() => {
    return sparkSlice.map((d) => d.assignmentsCount > 0 ? Math.round((d.completionsCount / d.assignmentsCount) * 100) : 0);
  }, [sparkSlice]);

  const summaryCards = metrics
    ? [
        {
          label: t("metrics.cards.activeMembers"),
          value: metrics.kpis.activeMemberCount,
          helper: `${formatPercent(metrics.kpis.collaborationRatePct, locale)} ${t("metrics.cards.ofTeam")}`,
          iconBg: "rgba(129,140,248,0.12)",
          iconColor: "#818cf8",
          Icon: Users,
          trend: trendByMetric.get("activity"),
          sparkData: sparkActivity,
          sparkColor: "#818cf8",
        },
        {
          label: t("metrics.cards.completions"),
          value: metrics.windowSummary.completionsCount,
          helper: `${numberFormatter.format(metrics.previousWindowSummary.completionsCount)} ${t("metrics.cards.prevWindow")}`,
          iconBg: "rgba(216,255,114,0.12)",
          iconColor: "#d8ff72",
          Icon: CheckCircle2,
          trend: trendByMetric.get("completions"),
          sparkData: sparkCompletions,
          sparkColor: "#d8ff72",
        },
        {
          label: t("metrics.cards.intake"),
          value: metrics.windowSummary.createdCardsCount,
          helper: `${numberFormatter.format(metrics.windowSummary.assignmentsCount)} ${t("metrics.cards.assignments")}`,
          iconBg: "rgba(248,113,113,0.12)",
          iconColor: "#f87171",
          Icon: LayoutGrid,
          trend: trendByMetric.get("createdCards"),
          sparkData: sparkCreated,
          sparkColor: "#f87171",
        },
        {
          label: t("metrics.cards.completionRate"),
          value: metrics.kpis.completionRatePct === null ? "-" : `${metrics.kpis.completionRatePct}%`,
          helper: `${metrics.kpis.avgCycleTimeHours === null ? "-" : numberFormatter.format(metrics.kpis.avgCycleTimeHours)}h ${t("metrics.cards.cycle")}`,
          iconBg: "rgba(34,211,238,0.12)",
          iconColor: "#22d3ee",
          Icon: Target,
          trend: trendByMetric.get("completions"),
          sparkData: sparkRate,
          sparkColor: "#22d3ee",
        },
      ]
    : [];

  if (!accessToken) return null;

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: "#020408", color: "rgba(255,255,255,0.92)" }}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-96" style={{ background: "radial-gradient(circle at top, rgba(216,255,114,0.12), transparent 58%)" }} />
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(216,255,114,0.07)" }} />
        <div className="absolute right-0 top-28 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(99,102,241,0.08)" }} />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ── HEADER ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black tracking-[-0.03em] text-white">{t("metrics.title")}</h1>
            <p className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-[3px] rounded-full p-[3px]" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {WINDOW_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setWindowDays(opt)}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold transition-all"
                  style={windowDays === opt
                    ? { background: "#fff", color: "#000" }
                    : { background: "transparent", color: "rgba(255,255,255,0.42)" }}
                >
                  {t(`metrics.rangeOptions.${opt}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── FILTERS ── */}
        <section className="mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.42)" }}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t("metrics.filters.title")}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.42)" }}
            >
              <X className="h-3 w-3" />
              {t("metrics.filters.reset")}
            </button>
          </div>
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)" }}>
              <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("metrics.filters.searchPlaceholder")}
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: "rgba(255,255,255,0.85)" }}
              />
            </div>
            {[
              { value: selectedUserId, onChange: setSelectedUserId, label: t("metrics.filters.allUsers"), options: userFilterOptions.map((o) => ({ v: o.id, l: o.name })) },
              { value: selectedBoardId, onChange: setSelectedBoardId, label: t("metrics.filters.allBoards"), options: (metrics?.boards ?? []).map((b) => ({ v: b.id, l: b.name })) },
              { value: selectedAction, onChange: setSelectedAction, label: t("metrics.filters.allActions"), options: actionFilterOptions.map((a) => ({ v: a, l: formatAction(a) })) },
            ].map((sel, i) => (
              <select
                key={i}
                value={sel.value}
                onChange={(e) => sel.onChange(e.target.value)}
                className="rounded-full px-3 py-1.5 text-xs outline-none"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", color: "rgba(255,255,255,0.75)" }}
              >
                <option value="all">{sel.label}</option>
                {sel.options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            ))}
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1 rounded-full px-3 py-1.5 text-xs outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", color: "rgba(255,255,255,0.75)" }} />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1 rounded-full px-3 py-1.5 text-xs outline-none" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.025)", color: "rgba(255,255,255,0.75)" }} />
            </div>
          </div>
        </section>

        {/* ── ERROR ── */}
        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm" style={{ color: "#f87171" }}>{error}</div>
        )}

        {/* ── LOADING ── */}
        {(isLoading || isRoleLoading) && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        )}

        {/* ── DATA ── */}
        {!isLoading && !isRoleLoading && metrics && (
          <div className="mt-5 flex flex-col gap-4">

            {/* KPI ROW */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => {
                const trend = card.trend;
                const trendTone = trend ? getTrendTone(trend.metric, trend.direction) : "flat";
                const TrendIcon = trendTone === "up" ? ArrowUpRight : trendTone === "down" ? ArrowDownRight : Minus;
                const trendStyle = trendTone === "up"
                  ? { color: "#4ade80", background: "rgba(74,222,128,0.1)" }
                  : trendTone === "down"
                    ? { color: "#f87171", background: "rgba(248,113,113,0.1)" }
                    : { color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.035)" };
                return (
                  <article
                    key={card.label}
                    className="flex flex-col gap-3 rounded-[14px] p-5 transition-all"
                    style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: card.iconBg }}>
                        <card.Icon className="h-4 w-4" style={{ color: card.iconColor }} />
                      </div>
                      {trend && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold" style={trendStyle}>
                          <TrendIcon className="h-3 w-3" />
                          {trend.deltaPct === null ? t("metrics.trend.new") : `${trend.deltaPct > 0 ? "+" : ""}${trend.deltaPct}%`}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-[34px] font-black leading-none tracking-[-0.04em] text-white">
                        {typeof card.value === "number" ? numberFormatter.format(card.value) : card.value}
                      </div>
                      <div className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.42)" }}>{card.label}</div>
                      <div className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>{card.helper}</div>
                    </div>
                    <div>
                      <Sparkline data={card.sparkData} color={card.sparkColor} width={160} height={36} />
                    </div>
                  </article>
                );
              })}
            </div>

            {/* DELIVERY FLOW + EXECUTION HEALTH */}
            <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              {/* Area Chart */}
              <article className="rounded-[14px] overflow-hidden" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">{t("metrics.sections.deliveryFlow")}</h2>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.sections.deliveryFlowHint")}</p>
                  </div>
                </div>
                <div className="p-5">
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={filteredActivitySeries} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                        <defs>
                          <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#d8ff72" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#d8ff72" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="gCreate" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
                          </linearGradient>
                          <linearGradient id="gAssign" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="label" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                          labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                        />
                        <Area type="monotone" dataKey="completionsCount" stroke="#d8ff72" fill="url(#gComp)" strokeWidth={2} />
                        <Area type="monotone" dataKey="createdCardsCount" stroke="#f87171" fill="url(#gCreate)" strokeWidth={2} />
                        <Area type="monotone" dataKey="assignmentsCount" stroke="#818cf8" fill="url(#gAssign)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4">
                    {[
                      { color: "#d8ff72", label: t("metrics.legend.completed") },
                      { color: "#f87171", label: t("metrics.legend.created") },
                      { color: "#818cf8", label: t("metrics.legend.assigned") },
                    ].map((l) => (
                      <span key={l.label} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                </div>
              </article>

              {/* Execution Health */}
              <article className="rounded-[14px] overflow-hidden" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">{t("metrics.sections.executionHealth")}</h2>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.sections.executionHealthHint")}</p>
                  </div>
                  <Gauge className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: t("metrics.health.open"), value: metrics.kpis.openCards, border: "rgba(74,222,128,0.2)", bg: "rgba(74,222,128,0.06)", labelColor: "#4ade80" },
                      { label: t("metrics.health.overdue"), value: metrics.kpis.overdueOpenCards, border: "rgba(248,113,113,0.25)", bg: "rgba(248,113,113,0.07)", labelColor: "#f87171" },
                      { label: t("metrics.health.dueSoon"), value: metrics.kpis.dueSoonCards, border: "rgba(251,191,36,0.25)", bg: "rgba(251,191,36,0.07)", labelColor: "#fbbf24" },
                      { label: t("metrics.health.stale"), value: metrics.kpis.staleOpenCards, border: "rgba(129,140,248,0.25)", bg: "rgba(129,140,248,0.07)", labelColor: "#818cf8" },
                    ].map((tile) => {
                      const tileStyles = { border: tile.border, bg: tile.bg, label: tile.labelColor };
                      return (
                        <div key={tile.label} className="rounded-xl p-3.5" style={{ border: `1px solid ${tileStyles.border}`, background: tileStyles.bg }}>
                          <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: tileStyles.label }}>{tile.label}</div>
                          <div className="mt-1.5 text-[28px] font-black text-white leading-none tracking-[-0.03em]">{numberFormatter.format(tile.value)}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.25)" }}>
                    <div>
                      <div className="text-[13px] font-bold text-white">{t("metrics.health.workloadBalance")}</div>
                      <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{t("metrics.health.workloadBalanceHint")}</div>
                    </div>
                    <GaugeRing pct={metrics.kpis.workloadBalanceScore} size={100} color="#d8ff72" />
                  </div>
                </div>
              </article>
            </div>

            {/* MEMBER TABLE + BOARD PORTFOLIO */}
            <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              {/* Member Ranked Table */}
              <article className="rounded-[14px] overflow-hidden" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">{t("metrics.sections.memberDelivery")}</h2>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.sections.memberDeliveryHint")}</p>
                  </div>
                  <Users className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["#", t("metrics.table.member"), t("metrics.table.role"), t("metrics.table.completedCards"), t("metrics.table.assignments"), t("metrics.table.activity"), t("metrics.table.executionRate")].map((h) => (
                          <th key={h} className="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.25)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {focusMembers.length > 0 ? focusMembers.map((m, i) => {
                        const color = memberColor(m.id);
                        const rateColor = (m.executionRate ?? 0) >= 80 ? "#4ade80" : (m.executionRate ?? 0) >= 60 ? "#fbbf24" : "#f87171";
                        return (
                          <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td className="px-3.5 py-3"><RankBadge rank={i + 1} /></td>
                            <td className="px-3.5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-extrabold"
                                  style={{ background: color + "18", border: `1.5px solid ${color}44`, color }}>
                                  {m.avatarUrl
                                    ? <img src={m.avatarUrl} alt={m.displayName} className="h-full w-full object-cover" />
                                    : m.displayName.slice(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-[13px] font-semibold text-white">{m.displayName}</div>
                                  <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{m.primaryEmail}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3.5 py-3">
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                                style={m.role === "admin"
                                  ? { color: "#818cf8", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)" }
                                  : { color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 text-[13px] font-semibold text-white">{numberFormatter.format(m.completedCardsCount)}</td>
                            <td className="px-3.5 py-3 text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>{numberFormatter.format(m.assignmentsCount)}</td>
                            <td className="px-3.5 py-3 text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>{numberFormatter.format(m.activityCount)}</td>
                            <td className="px-3.5 py-3">
                              {m.executionRate === null ? (
                                <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                              ) : (
                                <>
                                  <div className="text-[13px] font-bold" style={{ color: rateColor }}>{m.executionRate.toFixed(1)}%</div>
                                  <div className="mt-1 h-1 w-20 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(m.executionRate, 100)}%`, background: rateColor }} />
                                  </div>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr>
                          <td colSpan={7} className="px-3.5 py-6 text-sm" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.empty.noMembers")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              {/* Board Portfolio */}
              <article className="rounded-[14px] overflow-hidden" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">{t("metrics.sections.boardPortfolio")}</h2>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.sections.boardPortfolioHint")}</p>
                  </div>
                  <SquareKanban className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
                <div className="p-5 flex flex-col gap-3 max-h-[480px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                  {boardPortfolio.length > 0 ? boardPortfolio.map((board) => {
                    const healthColor = board.overdueCardsCount === 0 ? "#4ade80" : board.overdueCardsCount <= 2 ? "#fbbf24" : "#f87171";
                    const pct = board.completionRatePct ?? 0;
                    return (
                      <div key={board.id} className="rounded-xl p-3.5 transition-all" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[13px] font-bold text-white">{board.name}</div>
                            <div className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{board.cardsCount} {t("metrics.table.cards")}</div>
                          </div>
                          <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ color: healthColor, background: healthColor + "18", border: `1px solid ${healthColor}33` }}>
                            {board.overdueCardsCount === 0
                              ? <><CheckCircle2 className="h-3 w-3" /> Healthy</>
                              : <><AlertTriangle className="h-3 w-3" /> {board.overdueCardsCount} overdue</>}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          {[
                            { label: t("metrics.health.open"), val: board.openCardsCount, color: "rgba(255,255,255,0.8)" },
                            { label: t("metrics.health.overdue"), val: board.overdueCardsCount, color: board.overdueCardsCount > 0 ? "#f87171" : "#4ade80" },
                            { label: t("metrics.health.stale"), val: board.staleCardsCount, color: "rgba(255,255,255,0.5)" },
                            { label: t("metrics.table.activity"), val: board.activityCount, color: "rgba(255,255,255,0.5)" },
                          ].map((s) => (
                            <div key={s.label} className="rounded-lg p-2" style={{ background: "rgba(0,0,0,0.25)" }}>
                              <div className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</div>
                              <div className="mt-1 text-[18px] font-extrabold leading-none tracking-[-0.02em]" style={{ color: s.color }}>{numberFormatter.format(s.val)}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#d8ff72" }} />
                          </div>
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "#d8ff72" }}>{board.completionRatePct === null ? "-" : `${board.completionRatePct}%`}</span>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl p-6 text-sm" style={{ border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.42)" }}>{t("metrics.empty.noBoards")}</div>
                  )}
                </div>
              </article>
            </div>

            {/* ACTIVITY FEED + AUTOMATION */}
            <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              {/* Activity Feed */}
              <article className="rounded-[14px] overflow-hidden" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">{t("metrics.sections.recentActivity")}</h2>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{numberFormatter.format(filteredRecentActivity.length)} {t("metrics.events")}</p>
                  </div>
                  <Clock3 className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
                <div className="px-5 py-4 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
                  {filteredRecentActivity.length > 0 ? filteredRecentActivity.map((activity) => {
                    const actor = activity.actorId === "i18n.system"
                      ? t("metrics.system.label")
                      : getMemberDisplayName(memberByUserId.get(activity.actorId) ?? null) || activity.actorId.slice(0, 8);
                    const boardId = getActivityBoardId(activity);
                    const boardName = boardId ? boardNameById.get(boardId) : null;
                    const dotColor = activityDotColor(activity.action);
                    return (
                      <div key={activity.id} className="flex items-start gap-3 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: dotColor }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-white">{actor}</div>
                          <div className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.42)" }}>
                            {formatAction(activity.action)}{boardName ? ` · ${boardName}` : ""}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-[11px]" style={{ color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                          {new Date(activity.createdAt).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="py-6 text-sm" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.empty.noRecentActivity")}</div>
                  )}
                </div>
              </article>

              {/* Automation */}
              <article className="rounded-[14px] overflow-hidden" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <h2 className="text-[14px] font-bold text-white">{t("metrics.sections.automation")}</h2>
                    <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.42)" }}>{t("metrics.summary.automation")}</p>
                  </div>
                  <Zap className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: t("metrics.automation.runs"), value: metrics.automation.monthlyRuns },
                      { label: t("metrics.automation.activeScripts"), value: metrics.automation.activeScriptCount },
                      { label: t("metrics.automation.limit"), value: metrics.automation.limit === null ? "∞" : metrics.automation.limit },
                      { label: t("metrics.automation.remaining"), value: metrics.automation.remaining === null ? "∞" : metrics.automation.remaining },
                    ].map((tile) => (
                      <div key={tile.label} className="rounded-xl p-3.5" style={{ background: "rgba(0,0,0,0.25)" }}>
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.3)" }}>{tile.label}</div>
                        <div className="mt-1 text-[24px] font-black tracking-[-0.03em] text-white">
                          {typeof tile.value === "number" ? numberFormatter.format(tile.value) : tile.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Usage bar */}
                  {metrics.automation.limit !== null && metrics.automation.limit > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>Monthly usage</span>
                        <span className="text-[12px] font-bold" style={{ color: "#d8ff72" }}>
                          {Math.round((metrics.automation.monthlyRuns / metrics.automation.limit) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(Math.round((metrics.automation.monthlyRuns / metrics.automation.limit) * 100), 100)}%`,
                            background: "linear-gradient(90deg, #d8ff72, #a3e635)",
                            boxShadow: "0 0 12px rgba(216,255,114,0.35)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Workload risk */}
                  {metrics.workloadInsights.overloadedMembers.length > 0 && (
                    <div>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {t("metrics.sections.workloadRisk")}
                      </div>
                      <div className="flex flex-col gap-2">
                        {metrics.workloadInsights.overloadedMembers.slice(0, 3).map((m) => (
                          <div key={m.id} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)" }}>
                            <div>
                              <div className="text-[12px] font-semibold text-white">{m.name}</div>
                              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{numberFormatter.format(m.assignmentsCount)} {t("metrics.table.assignments")}</div>
                            </div>
                            <AlertTriangle className="h-4 w-4" style={{ color: "#f87171" }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            </div>

          </div>
        )}

        {/* EMPTY STATE */}
        {!isLoading && !isRoleLoading && !metrics && !error && (
          <div className="mt-5 rounded-2xl p-8 text-sm" style={{ border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.42)" }}>
            {t("metrics.empty.noData")}
          </div>
        )}
      </div>
    </main>
  );
}
