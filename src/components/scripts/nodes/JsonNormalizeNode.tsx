"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ArrowRightLeft } from "lucide-react";

export const JsonNormalizeNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    sourcePath?: string;
    outputPath?: string;
    mergeIntoRoot?: boolean;
  };

  return (
    <div
      className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-cyan-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-cyan-600 px-3 py-2">
        <ArrowRightLeft className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.jsonNormalize")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">
          {t("canvas.fields.sourcePath")}: <span className="font-mono text-foreground">{config.sourcePath ?? "item.data"}</span>
        </p>
        <p className="truncate">
          {t("canvas.fields.outputPath")}: <span className="font-mono text-foreground">{config.outputPath ?? "normalized"}</span>
        </p>
        <p>
          {t("canvas.fields.mergeIntoRoot")}: <span className="font-mono text-foreground">{config.mergeIntoRoot ? "true" : "false"}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-cyan-600" />
    </div>
  );
});

JsonNormalizeNode.displayName = "JsonNormalizeNode";
