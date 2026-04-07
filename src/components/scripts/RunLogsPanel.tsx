"use client";

import { useEffect, useState } from "react";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { ScriptRunLog, getScriptRuns } from "@/lib/api/scripts";
import { CheckCircle, XCircle, Loader2, RefreshCw, Clock } from "lucide-react";

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
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getScriptRuns(scriptId, teamId, accessToken);
      setLogs(data);
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
            const Icon = STATUS_ICON[log.status] ?? Clock;
            const color = STATUS_COLOR[log.status] ?? "text-muted-foreground";
            return (
              <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${color} ${log.status === "running" ? "animate-spin" : ""}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                  </div>
                  {log.errorMessage && (
                    <p className="mt-1 truncate text-xs text-red-500">{log.errorMessage}</p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(log.startedAt).toLocaleString(locale === "es" ? "es-ES" : "en-US")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
