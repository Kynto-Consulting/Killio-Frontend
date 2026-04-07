"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PlusSquare } from "lucide-react";

export interface CreateCardConfig {
  boardId?: string;
  listId?: string;
  titleTemplate?: string;
}

export const CreateCardNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as CreateCardConfig;
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-blue-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-blue-500 px-3 py-2">
        <PlusSquare className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.createCard")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        {config.titleTemplate ? (
          <p className="truncate text-foreground">{config.titleTemplate}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.createCard.noTitleTemplate")}</p>
        )}
        {config.listId && <p className="truncate">{t("canvas.fields.listId")}: {config.listId}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-blue-500" />
    </div>
  );
});

CreateCardNode.displayName = "CreateCardNode";
