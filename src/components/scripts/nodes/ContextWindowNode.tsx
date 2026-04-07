"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

export const ContextWindowNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    lineNumberPath?: string;
    beforeLines?: number;
    afterLines?: number;
  };

  return (
    <div className={`min-w-[220px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-teal-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-teal-700 px-3 py-2">
        <FileText className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.contextWindow")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.lineNumberPath")}: <span className="font-mono text-foreground">{config.lineNumberPath ?? "lineNumber"}</span></p>
        <p className="truncate">{t("canvas.fields.beforeLines")}: <span className="font-mono text-foreground">{String(config.beforeLines ?? 2)}</span></p>
        <p className="truncate">{t("canvas.fields.afterLines")}: <span className="font-mono text-foreground">{String(config.afterLines ?? 2)}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-teal-600" />
    </div>
  );
});

ContextWindowNode.displayName = "ContextWindowNode";
