"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";

export const IteratorNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    arrayPath?: string;
    itemOutputPath?: string;
    includeIndex?: boolean;
    indexOutputPath?: string;
  };

  return (
    <div
      className={`min-w-[210px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-cyan-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-cyan-700 px-3 py-2">
        <Repeat className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.iterator")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">
          {t("canvas.fields.arrayPath")}: <span className="font-mono text-foreground">{config.arrayPath ?? "files"}</span>
        </p>
        <p className="truncate">
          {t("canvas.fields.itemOutputPath")}: <span className="font-mono text-foreground">{config.itemOutputPath ?? "file"}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-cyan-600" />
    </div>
  );
});

IteratorNode.displayName = "IteratorNode";
