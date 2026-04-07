"use client";

import { useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ScriptSummary } from "@/lib/api/scripts";
import { Plus, Play, Pause, Trash2, ChevronRight, Loader2 } from "lucide-react";

interface ScriptListProps {
  scripts: ScriptSummary[];
  selectedId: string | null;
  onSelect: (script: ScriptSummary) => void;
  onToggle: (script: ScriptSummary) => Promise<void>;
  onDelete: (script: ScriptSummary) => Promise<void>;
  onCreate: () => void;
  onOpenPresets?: () => void;
  loading?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500",
  failed: "bg-red-500",
  running: "bg-yellow-400",
};

export function ScriptList({
  scripts,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onCreate,
  onOpenPresets,
  loading,
}: ScriptListProps) {
  const t = useTranslations("integrations");
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const relativeTime = (dateStr: string | null): string => {
    if (!dateStr) return t("scripts.never");
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 2) return t("scripts.relative.justNow");
    if (minutes < 60) return t("scripts.relative.minutes", { value: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("scripts.relative.hours", { value: hours });
    return t("scripts.relative.days", { value: Math.floor(hours / 24) });
  };

  const handleToggle = async (e: React.MouseEvent, script: ScriptSummary) => {
    e.stopPropagation();
    setToggling(script.id);
    try { await onToggle(script); } finally { setToggling(null); }
  };

  const handleDelete = async (e: React.MouseEvent, script: ScriptSummary) => {
    e.stopPropagation();
    if (!window.confirm(t("scripts.deleteConfirm"))) return;
    setDeleting(script.id);
    try { await onDelete(script); } finally { setDeleting(null); }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:px-4">
        <span className="mr-auto min-w-0 text-sm font-semibold text-foreground">{t("tabs.scripts")}</span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {onOpenPresets && (
            <button
              onClick={onOpenPresets}
              className="whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
            >
              {t("presets.openButton")}
            </button>
          )}
          <button
            onClick={onCreate}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("scripts.create")}
          </button>
        </div>
      </div>

      {scripts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">{t("scripts.empty")}</p>
          <p className="text-xs text-muted-foreground">{t("scripts.emptyDescription")}</p>
          <button
            onClick={onCreate}
            className="mt-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            {t("scripts.create")}
          </button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {scripts.map((script) => {
            const isSelected = script.id === selectedId;
            const dot = script.lastRunStatus ? STATUS_COLORS[script.lastRunStatus] : "bg-muted-foreground/40";
            return (
              <li
                key={script.id}
                onClick={() => onSelect(script)}
                className={`group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/10 ${
                  isSelected ? "bg-accent/15" : ""
                }`}
              >
                {/* Status dot */}
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{script.name}</span>
                    {script.isActive ? (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        {t("scripts.active")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("scripts.inactive")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("scripts.lastRun")}: {relativeTime(script.lastRunAt)}
                  </p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    onClick={(e) => handleToggle(e, script)}
                    title={script.isActive ? t("actions.pause") : t("actions.activate")}
                    className="rounded p-1 text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  >
                    {toggling === script.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : script.isActive ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, script)}
                    title={t("scripts.delete")}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    {deleting === script.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <ChevronRight
                  className={`h-4 w-4 flex-shrink-0 self-center transition-colors ${
                    isSelected ? "text-accent" : "text-muted-foreground/50"
                  }`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
