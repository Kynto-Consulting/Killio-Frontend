"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";

export const CoalesceNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    sourcePaths?: string[];
    outputPath?: string;
  };

  return (
    <div className={`min-w-[220px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-cyan-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-cyan-700 px-3 py-2">
        <Layers className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.coalesce")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.sourcePaths")}: <span className="font-mono text-foreground">{Array.isArray(config.sourcePaths) ? config.sourcePaths.join(", ") : "-"}</span></p>
        <p className="truncate">{t("canvas.fields.outputPath")}: <span className="font-mono text-foreground">{config.outputPath ?? "coalescedValue"}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-cyan-600" />
    </div>
  );
});

CoalesceNode.displayName = "CoalesceNode";
