"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";

export interface UpdateCardConfig {
  titleTemplate?: string;
}

export const UpdateCardNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as UpdateCardConfig;
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-indigo-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-indigo-500 px-3 py-2">
        <Pencil className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.updateCard")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        {config.titleTemplate ? (
          <p className="truncate text-foreground">{config.titleTemplate}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.updateCard.noTemplate")}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-indigo-500" />
    </div>
  );
});

UpdateCardNode.displayName = "UpdateCardNode";
