"use client";

import { KqlInput } from "@/components/ui/kql-input";
import { buildKqlSchema } from "@/lib/query/kql-complete";
import { useTranslations } from "@/components/providers/i18n-provider";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { BarChart2, LineChart as LineChartIcon, PieChart as PieChartIcon, AreaChart as AreaChartIcon, Settings2, Play, Loader2, Workflow } from "lucide-react";
import { QueryFlowDialog } from "@/components/query-flow";
import { sheetEngine } from "@/lib/sheetEngine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/session-provider";
import { useKqlScopeTeamId } from "@/lib/kql-pill/scope";
import { runKqlQuery } from "@/lib/api/groups";
import { KQL_SYNTAX_GUIDE, parseKqlScript, toChartData, type KqlOutput, type KqlTable } from "@/lib/query/kql";
import { tablesFromBricks } from "@/lib/query/tables";
import { clearKqlServerCache, runLocalOrServer, type KqlRunVia } from "@/lib/query/run-local-or-server";

type GraphType = "line" | "bar" | "pie" | "area";

type TableSourceConfig = {
  brickId: string;
  xAxisColumn: number;
  dataColumns: number[];
};

type KqlSourceConfig = {
  kind: "kql";
  script: string;
  /** Which `show` output of the script feeds the chart (default 0). */
  output?: number;
  /** Optional UI state of the visual editor (nodes, edges, positions) plus the `script` it compiled to. The script is what runs; anything else ignores `flow`. */
  flow?: { script?: string } & Record<string, unknown>;
};

type GraphConfig = {
  type: GraphType;
  title?: string;
  data?: Array<Record<string, any>>;
  tableSource?: TableSourceConfig;
  source?: KqlSourceConfig;
};

interface GraphBrickProps {
  id: string;
  config: GraphConfig | undefined;
  onUpdate: (newConfig: GraphConfig) => void;
  readonly?: boolean;
  activeBricks?: Array<any>;
}

const COLORS = ["hsl(var(--primary))", "#2563eb", "#0d9488", "#f97316", "#dc2626", "#7c3aed"];

const DEFAULT_MANUAL_DATA = [
  { name: "A", value: 10 },
  { name: "B", value: 20 },
  { name: "C", value: 15 },
];

const NO_BRICKS: Array<any> = [];
const KQL_DEBOUNCE_MS = 400;
const PREVIEW_ROWS = 8;

/** Examples listed at the end of KQL_SYNTAX_GUIDE, without their trailing "-- comment". */
const KQL_EXAMPLES: string[] = (() => {
  const idx = KQL_SYNTAX_GUIDE.indexOf("\nExamples:\n");
  if (idx < 0) return [];
  return KQL_SYNTAX_GUIDE.slice(idx + "\nExamples:\n".length)
    .split("\n")
    .map((line) => line.trim().replace(/\s+--.*$/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);
})();

type KqlErrorInfo = { message: string; position?: number };

function kqlErrorInfo(error: unknown): KqlErrorInfo {
  const err = error as { message?: string; position?: unknown; details?: { position?: unknown } } | null;
  const raw = typeof err?.position === "number" ? err.position : err?.details?.position;
  return {
    message: String(err?.message || error || "Error"),
    position: typeof raw === "number" ? raw : undefined,
  };
}

/** 1-based line / column plus the source line, for a caret under the error. */
function locate(script: string, position: number) {
  const pos = Math.max(0, Math.min(position, script.length));
  const before = script.slice(0, pos);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = script.indexOf("\n", pos);
  return { line, col: pos - lineStart + 1, text: script.slice(lineStart, lineEnd < 0 ? undefined : lineEnd) };
}

type KqlRunState = {
  forScript: string;
  status: "idle" | "loading" | "ok" | "error";
  outputs: KqlOutput[];
  via: KqlRunVia | null;
  error: KqlErrorInfo | null;
};

const IDLE_RUN: KqlRunState = { forScript: "", status: "idle", outputs: [], via: null, error: null };

/** Runs `script` (debounced, cached by runLocalOrServer) while `enabled`; never throws. */
function useKqlRun(script: string, enabled: boolean, tables: KqlTable[], teamId: string | null, accessToken: string | null, nonce: number): KqlRunState {
  const [state, setState] = useState<KqlRunState>(IDLE_RUN);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  useEffect(() => {
    if (!enabled) {
      setState(IDLE_RUN);
      return;
    }
    let cancelled = false;
    setState((prev) => (prev.forScript === script && (prev.status === "ok" || prev.status === "loading") ? prev : { ...prev, forScript: script, status: "loading", error: null }));
    const timer = setTimeout(async () => {
      try {
        const out = await runLocalOrServer(
          { script, tables, teamId },
          {
            runServer: async (s) => {
              const token = tokenRef.current;
              if (!token || !teamId) throw new Error("Sign in and select a team to run this query.");
              const res = await runKqlQuery(teamId, s, token);
              return res.outputs as unknown as KqlOutput[];
            },
          },
        );
        if (!cancelled) setState({ forScript: script, status: "ok", outputs: out.outputs, via: out.via, error: null });
      } catch (error) {
        if (!cancelled) setState({ forScript: script, status: "error", outputs: [], via: null, error: kqlErrorInfo(error) });
      }
    }, nonce > 0 ? 0 : KQL_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `nonce` forces a fresh run (the Run button).
  }, [script, enabled, tables, teamId, nonce]);

  return state;
}

export const UnifiedGraphBrick: React.FC<GraphBrickProps> = ({ id, config, onUpdate, readonly, activeBricks = NO_BRICKS }) => {
  const t = useTranslations("document-detail");
  const safeConfig: GraphConfig = {
    type: config?.type || "line",
    title: config?.title || t("graph.defaultTitle"),
    data: Array.isArray(config?.data) && config?.data.length > 0 ? config?.data : DEFAULT_MANUAL_DATA,
    tableSource: config?.tableSource,
    source: config?.source?.kind === "kql" ? config.source : undefined,
  };

  const [isConfiguring, setIsConfiguring] = useState<boolean>(!readonly && !safeConfig.tableSource && !config);
  const [manualJson, setManualJson] = useState<string>(JSON.stringify(safeConfig.data, null, 2));
  const [jsonError, setJsonError] = useState<string>("");
  const tk = useTranslations("kql");
  const tkf = useTranslations("query-flow");
  const { accessToken, activeTeamId: sessionTeamId } = useSession();
  // The document's own team wins over the team active in the sidebar.
  const activeTeamId = useKqlScopeTeamId() ?? sessionTeamId;
  const [kqlPending, setKqlPending] = useState(false);
  const [kqlDraft, setKqlDraft] = useState<string>(config?.source?.script ?? "");
  const [kqlOutput, setKqlOutput] = useState<number>(config?.source?.output ?? 0);
  const [runNonce, setRunNonce] = useState(0);
  const [visualOpen, setVisualOpen] = useState(false);
  const isKql = !!safeConfig.source || kqlPending;
  const editingKql = !readonly && isConfiguring && isKql;
  const kqlScript = editingKql ? kqlDraft : safeConfig.source?.script ?? "";
  const kqlOutputIndex = editingKql ? kqlOutput : safeConfig.source?.output ?? 0;
  const kqlTables = useMemo(() => tablesFromBricks(activeBricks as any[]), [activeBricks]);
  const kqlSchema = useMemo(() => buildKqlSchema({ mode: "script", tables: kqlTables }), [kqlTables]);
  const kqlSyntax = useMemo<KqlErrorInfo | null>(() => {
    if (!kqlScript.trim()) return null;
    try {
      parseKqlScript(kqlScript);
      return null;
    } catch (error) {
      return kqlErrorInfo(error);
    }
  }, [kqlScript]);
  const kqlRun = useKqlRun(kqlScript, isKql && !!kqlScript.trim() && !(editingKql && kqlSyntax), kqlTables, activeTeamId, accessToken, runNonce);
  const kqlSelected = kqlRun.outputs[Math.min(Math.max(kqlOutputIndex, 0), Math.max(kqlRun.outputs.length - 1, 0))];

  const resolveTableRows = (brick: any): string[][] => {
    const directRows = Array.isArray(brick?.rows) ? brick.rows : null;
    if (directRows && directRows.length > 0) return directRows as string[][];

    const contentRows = Array.isArray(brick?.content?.rows) ? brick.content.rows : null;
    if (contentRows && contentRows.length > 0) return contentRows as string[][];

    return [];
  };

  const resolveTableTitle = (brick: any): string => {
    const raw = brick?.title || brick?.content?.title;
    const normalized = String(raw || "").trim();
    if (normalized) return normalized;
    return `Tabla ${String(brick?.id || "").slice(0, 8)}`;
  };

  const availableTables = useMemo(() => {
    return activeBricks
      .filter((brick) => brick?.kind === "table")
      .map((brick) => ({
        id: String(brick.id),
        title: resolveTableTitle(brick),
        rows: resolveTableRows(brick),
      }))
      .filter((table) => table.rows.length > 0);
  }, [activeBricks]);

  const selectedTable = useMemo(() => {
    const selectedId = safeConfig.tableSource?.brickId;
    if (!selectedId) return null;
    return availableTables.find((table) => table.id === selectedId) || null;
  }, [availableTables, safeConfig.tableSource?.brickId]);

  const tableHeaders = selectedTable?.rows?.[0] || [];

  const chartData = useMemo(() => {
    if (isKql) {
      return kqlSelected && kqlRun.status === "ok" ? toChartData(kqlSelected.result) : [];
    }
    if (selectedTable && safeConfig.tableSource) {
      const rows = selectedTable.rows;
      if (!rows || rows.length < 2 || rows[0].length === 0) return [];

      const sheetId = `graph:${id}:${selectedTable.id}`;
      sheetEngine.updateSheet(sheetId, rows);
      const computed = sheetEngine.getComputedData(sheetId, rows.length, rows[0].length);
      const headers = computed[0] || [];
      const dataRows = computed.slice(1);

      const xIndex = safeConfig.tableSource.xAxisColumn ?? 0;
      const selectedColumns = safeConfig.tableSource.dataColumns?.length ? safeConfig.tableSource.dataColumns : [1];

      return dataRows.map((row, rowIndex) => {
        const item: Record<string, any> = {
          name: row[xIndex] || `Fila ${rowIndex + 1}`,
        };

        selectedColumns.forEach((columnIndex) => {
          const key = headers[columnIndex] || `Col ${columnIndex + 1}`;
          const raw = String(row[columnIndex] ?? "").replace(/[$,%\s]/g, "");
          const parsed = Number.parseFloat(raw);
          item[key] = Number.isFinite(parsed) ? parsed : 0;
        });

        return item;
      });
    }

    return Array.isArray(safeConfig.data) ? safeConfig.data : [];
  }, [id, isKql, kqlSelected, kqlRun.status, selectedTable, safeConfig.data, safeConfig.tableSource]);

  const dataKeys = useMemo(() => {
    if (chartData.length === 0) return ["value"];
    const keys = Object.keys(chartData[0]).filter((k) => k !== "name");
    return keys.length > 0 ? keys : ["value"];
  }, [chartData]);

  const updateConfig = (patch: Partial<GraphConfig>) => {
    onUpdate({ ...safeConfig, ...patch });
  };

  const applyManualJson = () => {
    try {
      const parsed = JSON.parse(manualJson);
      if (!Array.isArray(parsed)) {
        setJsonError("El JSON debe ser un array de objetos.");
        return;
      }
      setJsonError("");
      updateConfig({ data: parsed, tableSource: undefined, source: undefined });
      setIsConfiguring(false);
    } catch {
      setJsonError(t("graph.invalidJson"));
    }
  };

  const saveTableSource = () => {
    if (!availableTables.length) return;

    const tableId = safeConfig.tableSource?.brickId || availableTables[0].id;
    const selected = availableTables.find((table) => table.id === tableId) || availableTables[0];
    const headers = selected.rows[0] || [];

    const xAxisColumn = Math.min(safeConfig.tableSource?.xAxisColumn ?? 0, Math.max(0, headers.length - 1));
    const fallbackSeries = headers.map((_, idx) => idx).filter((idx) => idx !== xAxisColumn).slice(0, 2);
    const dataColumns = safeConfig.tableSource?.dataColumns?.filter((idx) => idx !== xAxisColumn) || fallbackSeries;

    updateConfig({
      source: undefined,
      tableSource: {
        brickId: selected.id,
        xAxisColumn,
        dataColumns: dataColumns.length ? dataColumns : fallbackSeries,
      },
    });
    setIsConfiguring(false);
  };

  const applyKql = () => {
    if (!kqlDraft.trim() || kqlSyntax) return;
    setKqlPending(false);
    // the saved diagram only stays when the script is still the one it compiled to
    const flow = safeConfig.source?.flow && safeConfig.source.flow.script === kqlDraft.trim() ? safeConfig.source.flow : undefined;
    updateConfig({ source: { kind: "kql", script: kqlDraft.trim(), output: kqlOutput, ...(flow ? { flow } : {}) }, tableSource: undefined });
    setIsConfiguring(false);
  };

  const applyVisual = ({ script, flow }: { script: string; flow: object }, options?: { keepOpen?: boolean }) => {
    if (!options?.keepOpen) setVisualOpen(false);
    setKqlDraft(script);
    setKqlPending(false);
    updateConfig({ source: { kind: "kql", script, output: kqlOutput, flow: { ...(flow as Record<string, unknown>), script } }, tableSource: undefined });
    setIsConfiguring(false);
  };

  const pickKqlOutput = (index: number) => {
    setKqlOutput(index);
    if (safeConfig.source && !editingKql) updateConfig({ source: { ...safeConfig.source, output: index } });
  };

  const pickExample = (example: string) => {
    setKqlDraft(example);
    setKqlOutput(0);
  };

  /** Loading / error / empty states of a KQL source, or null when the chart can be drawn. */
  const renderKqlState = (): React.ReactNode => {
    const note = (text: string, tone: "muted" | "error" = "muted") => (
      <div className={cn("h-full w-full flex items-center justify-center px-4 text-center text-xs", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
        {text}
      </div>
    );
    if (!kqlScript.trim()) return note(tk("graph.emptyScript"));
    if (editingKql && kqlSyntax) return note(tk("graph.syntaxError") + ": " + kqlSyntax.message, "error");
    if (kqlRun.status === "error" && kqlRun.error) return note(tk("graph.failed", { message: kqlRun.error.message }), "error");
    if (kqlRun.status !== "ok" || kqlRun.forScript !== kqlScript) {
      return <div role="status" aria-label={tk("graph.loadingChart")} className="h-full w-full animate-pulse rounded-md bg-muted" />;
    }
    if (!kqlSelected || kqlSelected.result.rows.length === 0) return note(tk("graph.empty"));
    if (!kqlSelected.result.columns.some((c) => c.kind === "metric")) return note(tk("graph.noMetric"));
    return null;
  };

  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
          No hay datos para renderizar.
        </div>
      );
    }

    switch (safeConfig.type) {
      case "bar":
        return (
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.15} />
            <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
            {dataKeys.map((key, idx) => (
              <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
      case "area":
        return (
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.15} />
            <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
            {dataKeys.map((key, idx) => (
              <Area key={key} type="monotone" dataKey={key} stroke={COLORS[idx % COLORS.length]} fill={COLORS[idx % COLORS.length]} fillOpacity={0.2} />
            ))}
          </AreaChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie data={chartData} dataKey={dataKeys[0]} nameKey="name" cx="50%" cy="50%" outerRadius={95} label>
              {chartData.map((_, idx) => (
                <Cell key={`slice-${idx}`} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
          </PieChart>
        );
      case "line":
      default:
        return (
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.15} />
            <XAxis dataKey="name" fontSize={11} axisLine={false} tickLine={false} />
            <YAxis fontSize={11} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
            {dataKeys.map((key, idx) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[idx % COLORS.length]} strokeWidth={2.25} dot={{ r: 3, fill: "hsl(var(--card))", strokeWidth: 2 }} />
            ))}
          </LineChart>
        );
    }
  };

  return (
    <div className="w-full rounded-xl border border-border bg-card/60 p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-accent/10 p-1.5 text-accent">
            <BarChart2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{safeConfig.title || t("graph.defaultTitle")}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {isKql ? tk("graph.sourceLabelKql") : safeConfig.tableSource ? "Fuente: tabla" : "Fuente: manual"}
            </p>
          </div>
        </div>
        {!readonly && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setIsConfiguring((prev) => !prev)}>
            <Settings2 className="h-3.5 w-3.5" /> Configurar
          </Button>
        )}
      </div>

      {!readonly && isConfiguring && (
        <div className="rounded-lg border border-border/70 bg-background/70 p-3 space-y-3">
          <label className="block text-xs font-semibold text-muted-foreground">{t("graph.titleLabel")}</label>
          <input
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
            value={safeConfig.title || ""}
            onChange={(e) => updateConfig({ title: e.target.value })}
            placeholder={t("graph.titlePlaceholder")}
          />

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">{t("graph.chartType")}</label>
            <div className="flex flex-wrap gap-2">
              <Button variant={safeConfig.type === "line" ? "default" : "ghost"} size="sm" className="h-8 px-2" onClick={() => updateConfig({ type: "line" })}>
                <LineChartIcon className="h-3.5 w-3.5" />
              </Button>
              <Button variant={safeConfig.type === "bar" ? "default" : "ghost"} size="sm" className="h-8 px-2" onClick={() => updateConfig({ type: "bar" })}>
                <BarChart2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant={safeConfig.type === "area" ? "default" : "ghost"} size="sm" className="h-8 px-2" onClick={() => updateConfig({ type: "area" })}>
                <AreaChartIcon className="h-3.5 w-3.5" />
              </Button>
              <Button variant={safeConfig.type === "pie" ? "default" : "ghost"} size="sm" className="h-8 px-2" onClick={() => updateConfig({ type: "pie" })}>
                <PieChartIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant={!safeConfig.tableSource && !isKql ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => { setKqlPending(false); updateConfig({ tableSource: undefined, source: undefined }); }}>
              Datos manuales
            </Button>
            <Button
              variant={safeConfig.tableSource && !isKql ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                if (!availableTables.length) return;
                const target = safeConfig.tableSource?.brickId || availableTables[0].id;
                setKqlPending(false);
                updateConfig({
                  source: undefined,
                  tableSource: {
                    brickId: target,
                    xAxisColumn: 0,
                    dataColumns: [1],
                  },
                });
              }}
              disabled={!availableTables.length}
            >
              Datos desde tabla
            </Button>
            <Button
              variant={isKql ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setKqlDraft(safeConfig.source?.script ?? kqlDraft);
                setKqlPending(true);
              }}
            >
              {tk("graph.sourceKql")}
            </Button>
          </div>

          {isKql ? (
            <div className="rounded-md border border-border p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`kql-${id}`} className="block text-xs font-semibold text-muted-foreground">{tk("graph.scriptLabel")}</label>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => setVisualOpen(true)}>
                  <Workflow className="h-3.5 w-3.5" />
                  {tkf("graph.visualEditor")}
                </Button>
              </div>
              <KqlInput
                multiline
                rows={4}
                ariaLabel={tk("graph.scriptLabel")}
                value={kqlDraft}
                onChange={setKqlDraft}
                schema={kqlSchema}
                error={kqlSyntax ? { message: kqlSyntax.message, position: kqlSyntax.position ?? 0 } : null}
                placeholder={tk("graph.scriptPlaceholder")}
                className="text-xs"
              />
              {kqlSyntax ? (
                <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive space-y-1">
                  <p className="font-semibold">{tk("graph.syntaxError")}: {kqlSyntax.message}</p>
                  {kqlSyntax.position !== undefined && (() => {
                    const at = locate(kqlDraft, kqlSyntax.position);
                    return (
                      <>
                        <p className="text-[10px] opacity-80">{tk("graph.errorAt", { line: at.line, col: at.col })}</p>
                        <pre className="overflow-x-auto font-mono text-[11px] leading-snug">{at.text + "\n" + " ".repeat(Math.max(0, at.col - 1)) + "^"}</pre>
                      </>
                    );
                  })()}
                </div>
              ) : (
                kqlDraft.trim() && <p className="text-[11px] text-emerald-700 dark:text-emerald-300">{tk("graph.valid")}</p>
              )}

              {KQL_EXAMPLES.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">{tk("graph.examples")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {KQL_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        title={example}
                        onClick={() => pickExample(example)}
                        className="max-w-full truncate rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-accent/10"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={!kqlDraft.trim() || !!kqlSyntax || kqlRun.status === "loading"}
                  onClick={() => {
                    clearKqlServerCache();
                    setRunNonce((n) => n + 1);
                  }}
                >
                  {kqlRun.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {kqlRun.status === "loading" ? tk("graph.running") : tk("graph.run")}
                </Button>
                {kqlRun.outputs.length > 1 && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {tk("graph.output")}
                    <select
                      className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-accent"
                      value={Math.min(kqlOutput, kqlRun.outputs.length - 1)}
                      onChange={(e) => pickKqlOutput(Number(e.target.value))}
                    >
                      {kqlRun.outputs.map((output, idx) => (
                        <option key={idx} value={idx}>{output.title || tk("graph.outputN", { n: idx + 1 })}</option>
                      ))}
                    </select>
                  </label>
                )}
                {kqlRun.via && kqlRun.status === "ok" && (
                  <span className="text-[10px] text-muted-foreground">{kqlRun.via === "local" ? tk("graph.viaLocal") : tk("graph.viaServer")}</span>
                )}
                <div className="ml-auto">
                  <Button size="sm" className="h-8 text-xs" disabled={!kqlDraft.trim() || !!kqlSyntax} onClick={applyKql}>{tk("graph.apply")}</Button>
                </div>
              </div>

              {kqlRun.status === "error" && kqlRun.error && !kqlSyntax && (
                <p role="alert" className="text-xs text-destructive">{tk("graph.failed", { message: kqlRun.error.message })}</p>
              )}
              {kqlRun.status === "ok" && kqlSelected && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {tk("graph.preview")} · {tk("graph.rowsCount", { count: kqlSelected.result.rows.length })}
                  </p>
                  {kqlSelected.result.rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{tk("graph.empty")}</p>
                  ) : (
                    <div className="max-h-40 overflow-auto rounded-md border border-border">
                      <table className="w-full text-left text-[11px] text-foreground">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            {kqlSelected.result.columns.map((col) => (
                              <th key={col.key} className="px-2 py-1 font-semibold">{col.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {kqlSelected.result.rows.slice(0, PREVIEW_ROWS).map((row, ri) => (
                            <tr key={ri} className="border-t border-border">
                              {row.cells.map((cell, ci) => (
                                <td key={ci} className="px-2 py-1">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {kqlSelected.result.rows.length > PREVIEW_ROWS && (
                    <p className="text-[10px] text-muted-foreground">{tk("graph.previewTruncated", { count: PREVIEW_ROWS })}</p>
                  )}
                </div>
              )}
            </div>
          ) : safeConfig.tableSource ? (
            <div className="rounded-md border border-border p-2 space-y-2">
              {availableTables.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay bricks de tabla en este contexto.</p>
              ) : (
                <>
                  <label className="block text-xs font-semibold text-muted-foreground">Tabla fuente</label>
                  <select
                    className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                    value={safeConfig.tableSource.brickId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const table = availableTables.find((item) => item.id === selectedId);
                      const cols = table?.rows?.[0]?.length || 1;
                      updateConfig({
                        tableSource: {
                          brickId: selectedId,
                          xAxisColumn: 0,
                          dataColumns: cols > 1 ? [1] : [0],
                        },
                      });
                    }}
                  >
                    {availableTables.map((table) => (
                      <option key={table.id} value={table.id}>{table.title}</option>
                    ))}
                  </select>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground">Eje X</label>
                      <select
                        className="mt-1 w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                        value={safeConfig.tableSource.xAxisColumn}
                        onChange={(e) => {
                          const xAxisColumn = Number(e.target.value);
                          const filtered = (safeConfig.tableSource?.dataColumns || []).filter((idx) => idx !== xAxisColumn);
                          updateConfig({
                            tableSource: {
                              ...safeConfig.tableSource!,
                              xAxisColumn,
                              dataColumns: filtered.length ? filtered : [0].filter((idx) => idx !== xAxisColumn),
                            },
                          });
                        }}
                      >
                        {tableHeaders.map((header, idx) => (
                          <option key={`x-${idx}`} value={idx}>{header || `Col ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground">Series</label>
                      <div className="mt-1 max-h-24 overflow-y-auto rounded-md border border-input bg-card p-1.5 space-y-1">
                        {tableHeaders.map((header, idx) => {
                          const disabled = idx === safeConfig.tableSource?.xAxisColumn;
                          const checked = safeConfig.tableSource?.dataColumns?.includes(idx);
                          return (
                            <label key={`series-${idx}`} className={cn("flex items-center gap-2 text-xs", disabled && "opacity-50") }>
                              <input
                                type="checkbox"
                                checked={!!checked}
                                disabled={disabled}
                                onChange={() => {
                                  const base = safeConfig.tableSource?.dataColumns || [];
                                  const next = checked ? base.filter((i) => i !== idx) : [...base, idx];
                                  updateConfig({
                                    tableSource: {
                                      ...safeConfig.tableSource!,
                                      dataColumns: next.length ? next : base,
                                    },
                                  });
                                }}
                              />
                              <span>{header || `Col ${idx + 1}`}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" className="h-8 text-xs" onClick={saveTableSource}>{t("graph.applyTableConfig")}</Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border p-2 space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground">JSON de datos</label>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-input bg-card px-2 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-accent"
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
              />
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              <div className="flex justify-end">
                <Button size="sm" className="h-8 text-xs" onClick={applyManualJson}>Aplicar datos manuales</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="h-72 w-full rounded-lg border border-border/50 bg-background/50 p-2">
        {(isKql ? renderKqlState() : null) ?? (
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        )}
      </div>
      {/* always mounted: the editor lives in the session store, so this component re-rendering or re-mounting never closes it */}
      <QueryFlowDialog
        ownerId={`graph-brick:${id}`}
        open={visualOpen && !readonly}
        initialScript={kqlDraft}
        initialFlow={safeConfig.source?.flow && safeConfig.source.flow.script === kqlDraft.trim() ? safeConfig.source.flow : undefined}
        tables={kqlTables}
        onApply={applyVisual}
        onClose={() => setVisualOpen(false)}
      />
    </div>
  );
};
