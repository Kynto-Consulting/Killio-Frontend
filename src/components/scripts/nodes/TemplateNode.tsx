"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

export const TemplateNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    targetPath?: string;
    template?: string;
  };

  return (
    <div
      className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-indigo-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-indigo-500 px-3 py-2">
        <FileText className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.template")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("nodes.common.target")}: <span className="font-mono text-foreground">{config.targetPath ?? "summary.generated"}</span></p>
        {config.template ? (
          <p className="truncate text-foreground">{config.template}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.template.noTemplate")}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-indigo-500" />
    </div>
  );
});

TemplateNode.displayName = "TemplateNode";
