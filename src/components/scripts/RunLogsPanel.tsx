"use client";

import { useEffect, useState } from "react";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { ScriptRunLog, getScriptGraph, getScriptRuns } from "@/lib/api/scripts";
import { CheckCircle, XCircle, Loader2, RefreshCw, Clock, ChevronDown, ChevronRight } from "lucide-react";

interface RunLogsPanelProps {
  scriptId: string;
  teamId: string;
  accessToken: string;
}

const STATUS_ICON: Record<string, React.ElementType> = {
  completed: CheckCircle,
  failed: XCircle,
  running: Loader2,
};

const STATUS_COLOR: Record<string, string> = {
  completed: "text-green-600",
  failed: "text-red-500",
  running: "text-yellow-500",
};

export function RunLogsPanel({ scriptId, teamId, accessToken }: RunLogsPanelProps) {
  const { locale } = useI18n();
  const t = useTranslations("integrations");
  const [logs, setLogs] = useState<ScriptRunLog[]>([]);
  const [nodeMetaById, setNodeMetaById] = useState<Record<string, { label: string; kind: string }>>({});
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fmt = (value: unknown): string => JSON.stringify(value ?? {}, null, 2);

  const load = async () => {
    setLoading(true);
    try {
      const [runs, graph] = await Promise.all([
        getScriptRuns(scriptId, teamId, accessToken),
        getScriptGraph(scriptId, teamId, accessToken).catch(() => null),
      ]);
      setLogs(runs);

      if (graph) {
        const nextMeta: Record<string, { label: string; kind: string }> = {};
        for (const node of graph.nodes) {
          nextMeta[node.id] = {
            label: node.label || node.nodeKind,
            kind: node.nodeKind,
          };
        }
        setNodeMetaById(nextMeta);
      } else {
        setNodeMetaById({});
      }

      setExpandedRunId((prev) => {
        if (!runs.length) return null;
        if (prev && runs.some((run) => run.id === prev)) return prev;
        return runs[0].id;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [scriptId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card/60 px-3 py-3 sm:px-4">
        <span className="text-sm font-semibold text-foreground">{t("runs.title")}</span>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("actions.refresh")}
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Clock className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">{t("runs.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-y-auto">
          {logs.map((log) => {
            const isExpanded = expandedRunId === log.id;
            const Icon = STATUS_ICON[log.status] ?? Clock;
            const color = STATUS_COLOR[log.status] ?? "text-muted-foreground";
            const outputEntries = Object.entries(log.nodeOutputs || {});
            return (
              <li key={log.id} className="px-3 py-2 sm:px-4 sm:py-3">
                <button
                  type="button"
                  onClick={() => setExpandedRunId((prev) => (prev === log.id ? null : log.id))}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${color} ${log.status === "running" ? "animate-spin" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-semibold ${color}`}>
                        {log.status === "completed"
                          ? t("runs.status.completed")
                          : log.status === "failed"
                            ? t("runs.status.failed")
                            : t("runs.status.running")}
                      </span>
                      {log.durationMs != null && (
                        <span className="text-xs text-muted-foreground">{t("runs.duration", { ms: log.durationMs })}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        · {t("runs.items", { count: log.itemsProcessed })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {outputEntries.length} node(s)
                      </span>
                    </div>
                    {log.errorMessage && (
                      <p className="mt-1 truncate text-xs text-red-500">{log.errorMessage}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(log.startedAt).toLocaleString(locale === "es" ? "es-ES" : "en-US")}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-3 rounded-lg border border-border bg-card/40 p-3">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Data recibida (triggerPayload)
                      </p>
                      <pre className="max-h-52 overflow-auto rounded-md border border-border bg-background p-2 text-[11px] text-foreground">
                        {fmt(log.triggerPayload)}
                      </pre>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Flujo y outputs por nodo
                      </p>
                      {outputEntries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No hay outputs por nodo para esta ejecución.</p>
                      ) : (
                        <div className="space-y-2">
                          {outputEntries.map(([nodeId, output]) => {
                            const meta = nodeMetaById[nodeId];
                            const outputCount = Array.isArray(output) ? output.length : null;
                            const title = meta ? `${meta.label} (${meta.kind})` : nodeId;
                            return (
                              <details key={nodeId} className="rounded-md border border-border bg-background p-2">
                                <summary className="cursor-pointer text-xs font-medium text-foreground">
                                  {title}
                                  {outputCount !== null ? ` - ${outputCount} item(s)` : ""}
                                </summary>
                                <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-card/40 p-2 text-[11px] text-foreground">
                                  {fmt(output)}
                                </pre>
                              </details>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
