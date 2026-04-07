"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Scale } from "lucide-react";

export const FieldCompareNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    field?: string;
    operator?: string;
    value?: unknown;
  };

  return (
    <div
      className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-amber-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-amber-500 px-3 py-2">
        <Scale className="h-4 w-4 text-amber-950" />
        <span className="text-xs font-semibold text-amber-950">{t("canvas.nodes.fieldCompare")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.field")}: <span className="font-mono text-foreground">{config.field ?? "todoText"}</span></p>
        <p className="truncate">{t("nodes.common.operator")}: <span className="font-mono text-foreground">{config.operator ?? "eq"}</span></p>
        {config.value !== undefined && <p className="truncate">{t("nodes.common.value")}: <span className="font-mono text-foreground">{String(config.value)}</span></p>}
      </div>
      <Handle type="source" position={Position.Bottom} id="match_true" style={{ left: "30%" }} className="!bg-green-500" />
      <Handle type="source" position={Position.Bottom} id="match_false" style={{ left: "70%" }} className="!bg-red-400" />
    </div>
  );
});

FieldCompareNode.displayName = "FieldCompareNode";
