"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Scissors } from "lucide-react";

export const TextSplitLinesNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    sourcePath?: string;
    lineOutputPath?: string;
    lineNumberOutputPath?: string;
    fanout?: boolean;
  };

  return (
    <div className={`min-w-[220px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-emerald-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-emerald-700 px-3 py-2">
        <Scissors className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.textSplitLines")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.sourcePath")}: <span className="font-mono text-foreground">{config.sourcePath ?? "fileContent"}</span></p>
        <p className="truncate">{t("canvas.fields.lineOutputPath")}: <span className="font-mono text-foreground">{config.lineOutputPath ?? "lineText"}</span></p>
        <p className="truncate">{t("canvas.fields.fanout")}: <span className="font-mono text-foreground">{String(config.fanout !== false)}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-emerald-600" />
    </div>
  );
});

TextSplitLinesNode.displayName = "TextSplitLinesNode";
