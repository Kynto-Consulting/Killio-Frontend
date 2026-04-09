"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

interface AddBrickConfig {
  brickType?: string;
  contentTemplate?: string;
  displayStyle?: string;
}

export const AddBrickNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as AddBrickConfig;

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-fuchsia-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-fuchsia-500 px-3 py-2">
        <FileText className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.addBrick")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate text-foreground">
          {t("canvas.fields.brickType")}: {config.brickType || "text"}
        </p>
        <p className="truncate">
          {t("canvas.fields.displayStyle")}: {config.displayStyle || "paragraph"}
        </p>
        {config.contentTemplate ? (
          <p className="truncate text-foreground">{config.contentTemplate}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.addBrick.noContentTemplate")}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-fuchsia-500" />
    </div>
  );
});

AddBrickNode.displayName = "AddBrickNode";
