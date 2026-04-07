"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Braces } from "lucide-react";

export const RegexExtractGroupsNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    sourcePath?: string;
    pattern?: string;
    flags?: string;
    matchOutputPath?: string;
  };

  return (
    <div className={`min-w-[240px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-emerald-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-emerald-700 px-3 py-2">
        <Braces className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.regexExtractGroups")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.sourcePath")}: <span className="font-mono text-foreground">{config.sourcePath ?? "lineText"}</span></p>
        <p className="truncate">{t("canvas.fields.pattern")}: <span className="font-mono text-foreground">{config.pattern ?? "(not set)"}</span></p>
        <p className="truncate">{t("canvas.fields.flags")}: <span className="font-mono text-foreground">{config.flags ?? ""}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-emerald-600" />
    </div>
  );
});

RegexExtractGroupsNode.displayName = "RegexExtractGroupsNode";
