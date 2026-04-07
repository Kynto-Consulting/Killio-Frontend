"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ArrowRightLeft } from "lucide-react";

export const JsonMapNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    mode?: string;
    mappings?: Array<{ targetPath?: string; sourcePath?: string }>;
  };
  const count = Array.isArray(config.mappings) ? config.mappings.length : 0;

  return (
    <div
      className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-sky-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-sky-500 px-3 py-2">
        <ArrowRightLeft className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.jsonMap")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p>{t("nodes.jsonMap.mode")}: <span className="font-mono text-foreground">{config.mode ?? "merge"}</span></p>
        <p>{t("nodes.jsonMap.mappings")}: <span className="font-mono text-foreground">{count}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-sky-500" />
    </div>
  );
});

JsonMapNode.displayName = "JsonMapNode";
