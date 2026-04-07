"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ArrowRight } from "lucide-react";

export interface MoveCardConfig {
  targetListId?: string;
  archiveOnMove?: boolean;
}

export const MoveCardNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as MoveCardConfig;
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-orange-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-orange-500 px-3 py-2">
        <ArrowRight className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">
          {config.archiveOnMove ? t("canvas.nodes.archiveCard") : t("canvas.nodes.moveCard")}
        </span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        {config.targetListId ? (
          <p className="truncate text-foreground">{t("canvas.fields.targetListId")}: {config.targetListId}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.moveCard.noTargetList")}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-orange-500" />
    </div>
  );
});

MoveCardNode.displayName = "MoveCardNode";
