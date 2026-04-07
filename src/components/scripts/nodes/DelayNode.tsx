"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Clock3 } from "lucide-react";

export const DelayNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    delayMs?: number;
  };

  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-cyan-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-cyan-500 px-3 py-2">
        <Clock3 className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.delay")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        {t("nodes.delay.wait")}: <span className="font-mono text-foreground">{config.delayMs ?? 1000}ms</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-cyan-500" />
    </div>
  );
});

DelayNode.displayName = "DelayNode";
