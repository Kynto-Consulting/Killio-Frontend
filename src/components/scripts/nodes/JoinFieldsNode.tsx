"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { ArrowRightLeft } from "lucide-react";

export const JoinFieldsNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    fields?: string[];
    separator?: string;
    outputPath?: string;
    skipEmpty?: boolean;
  };

  const fieldsCount = Array.isArray(config.fields) ? config.fields.length : 0;

  return (
    <div
      className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-blue-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-blue-600 px-3 py-2">
        <ArrowRightLeft className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.joinFields")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p>
          {t("canvas.fields.fields")}: <span className="font-mono text-foreground">{fieldsCount}</span>
        </p>
        <p>
          {t("canvas.fields.separator")}: <span className="font-mono text-foreground">{config.separator ?? ":"}</span>
        </p>
        <p className="truncate">
          {t("canvas.fields.outputPath")}: <span className="font-mono text-foreground">{config.outputPath ?? "joinedString"}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-blue-600" />
    </div>
  );
});

JoinFieldsNode.displayName = "JoinFieldsNode";
