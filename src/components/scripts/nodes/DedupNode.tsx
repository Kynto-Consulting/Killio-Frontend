"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";

export const DedupNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    keyPath?: string;
    keepFirst?: boolean;
  };

  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-teal-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-teal-600 px-3 py-2">
        <Layers className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.dedup")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.keyPath")}: <span className="font-mono text-foreground">{config.keyPath ?? "id"}</span></p>
        <p className="truncate">{t("canvas.fields.keepFirst")}: <span className="font-mono text-foreground">{String(config.keepFirst !== false)}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-teal-500" />
    </div>
  );
});

DedupNode.displayName = "DedupNode";
