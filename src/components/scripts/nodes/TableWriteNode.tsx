"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { HardDriveUpload } from "lucide-react";

export const TableWriteNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    tableId?: string;
    keyPath?: string;
    valuesPath?: string;
  };

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-rose-600" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-rose-600 px-3 py-2">
        <HardDriveUpload className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.tableWrite")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">tableId: <span className="font-mono text-foreground">{config.tableId ?? "-"}</span></p>
        <p className="truncate">keyPath: <span className="font-mono text-foreground">{config.keyPath ?? "externalKey"}</span></p>
        <p className="truncate">valuesPath: <span className="font-mono text-foreground">{config.valuesPath ?? "(item.data)"}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-rose-600" />
    </div>
  );
});

TableWriteNode.displayName = "TableWriteNode";
