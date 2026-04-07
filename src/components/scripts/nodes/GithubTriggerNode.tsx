"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

export interface GithubTriggerConfig {
  repoFullName?: string;
  branch?: string;
  filePathRegex?: string;
}

export const GithubTriggerNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as GithubTriggerConfig;
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-violet-500" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-md bg-slate-800 px-3 py-2">
        <GitBranch className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.githubCommit")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        {config.repoFullName ? (
          <p className="truncate font-mono text-foreground">{config.repoFullName}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.github.noRepo")}</p>
        )}
        {config.branch && <p>{t("nodes.common.branch")}: {config.branch}</p>}
      </div>
      {/* Trigger nodes only have an output handle */}
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-violet-500" />
    </div>
  );
});

GithubTriggerNode.displayName = "GithubTriggerNode";
