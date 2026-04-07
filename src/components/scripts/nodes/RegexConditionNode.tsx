"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Filter } from "lucide-react";

export interface RegexConditionConfig {
  field?: string;
  pattern?: string;
  caseInsensitive?: boolean;
}

export const RegexConditionNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as RegexConditionConfig;
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-yellow-400" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-yellow-400 px-3 py-2">
        <Filter className="h-4 w-4 text-yellow-900" />
        <span className="text-xs font-semibold text-yellow-900">{t("canvas.nodes.regexMatch")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        {config.field ? (
          <p className="truncate">
            {t("canvas.fields.field")}: <span className="font-mono text-foreground">{config.field}</span>
          </p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.regex.noField")}</p>
        )}
        {config.pattern && (
          <p className="truncate font-mono text-foreground">{config.pattern}</p>
        )}
      </div>
      {/* Two outputs: match_true / match_false */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="match_true"
        style={{ left: "30%" }}
        className="!bg-green-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="match_false"
        style={{ left: "70%" }}
        className="!bg-red-400"
      />
    </div>
  );
});

RegexConditionNode.displayName = "RegexConditionNode";
