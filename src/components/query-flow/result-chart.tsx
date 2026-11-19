"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useTranslations } from "@/components/providers/i18n-provider";
import { toChartData, type KqlResult } from "@/lib/query/kql";
import type { OutputKind } from "@/lib/query-flow/types";

const COLORS = ["hsl(var(--primary))", "#2563eb", "#0d9488", "#f97316", "#dc2626", "#7c3aed"];

/** Chart (or single value) of a result, the way the graph brick will draw it. */
export function ResultChart({ result, kind }: { result: KqlResult; kind: OutputKind }) {
  const t = useTranslations("query-flow");
  const metrics = result.columns.filter((c) => c.kind === "metric");
  if (metrics.length === 0) return <p className="p-3 text-xs text-muted-foreground">{t("chart.noMetric")}</p>;
  if (kind === "value") {
    const first = result.rows[0]?.cells[result.columns.findIndex((c) => c.kind === "metric")] ?? "";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <p className="text-4xl font-bold tabular-nums text-foreground">{first}</p>
        <p className="text-xs text-muted-foreground">{metrics[0].label}</p>
      </div>
    );
  }
  const data = toChartData(result);
  const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11 };
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      {kind === "pie" ? (
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie data={data} dataKey={metrics[0].label} nameKey="name" outerRadius="80%">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
        </PieChart>
      ) : kind === "line" ? (
        <LineChart data={data}>{grid}<XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip /><Legend />{metrics.map((m, i) => <Line key={m.key} type="monotone" dataKey={m.label} stroke={COLORS[i % COLORS.length]} dot={false} />)}</LineChart>
      ) : kind === "area" ? (
        <AreaChart data={data}>{grid}<XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip /><Legend />{metrics.map((m, i) => <Area key={m.key} type="monotone" dataKey={m.label} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.25} />)}</AreaChart>
      ) : (
        <BarChart data={data}>{grid}<XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip /><Legend />{metrics.map((m, i) => <Bar key={m.key} dataKey={m.label} fill={COLORS[i % COLORS.length]} />)}</BarChart>
      )}
    </ResponsiveContainer>
  );
}
