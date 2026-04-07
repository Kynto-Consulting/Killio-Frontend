"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Layers } from "lucide-react";

export const FirstSeenNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    keyPath?: string;
    fallbackToExternalKey?: boolean;
  };

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-emerald-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-emerald-600 px-3 py-2">
        <Layers className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.firstSeen")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">
          {t("canvas.fields.keyPath")}: <span className="font-mono text-foreground">{config.keyPath ?? "todoHash"}</span>
        </p>
        <p className="truncate">
          {t("canvas.fields.fallbackToExternalKey")}: <span className="font-mono text-foreground">{String(config.fallbackToExternalKey !== false)}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-emerald-500" />
    </div>
  );
});

FirstSeenNode.displayName = "FirstSeenNode";
