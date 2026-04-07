"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { UserPlus } from "lucide-react";

export interface AssignCardConfig {
  mentionSourcePath?: string;
  fallbackToCommitAuthor?: boolean;
}

export const AssignCardNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as AssignCardConfig;
  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-teal-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-teal-500 px-3 py-2">
        <UserPlus className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.assignCard")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        {config.mentionSourcePath ? (
          <p className="truncate">
            {t("canvas.fields.mentionSourcePath")}: <span className="font-mono text-foreground">{config.mentionSourcePath}</span>
          </p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.assignCard.detectMentions")}</p>
        )}
        <p className="truncate">
          {t("canvas.fields.fallbackToCommitAuthor")}: <span className="font-mono text-foreground">{String(config.fallbackToCommitAuthor === true)}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-teal-500" />
    </div>
  );
});

AssignCardNode.displayName = "AssignCardNode";
