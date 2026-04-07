"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Hash } from "lucide-react";

export const HashComposeNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    sourcePaths?: string[];
    algorithm?: string;
    outputPath?: string;
    setExternalKey?: boolean;
  };

  return (
    <div className={`min-w-[220px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-purple-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-purple-700 px-3 py-2">
        <Hash className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.hashCompose")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.sourcePaths")}: <span className="font-mono text-foreground">{(config.sourcePaths ?? []).join(", ") || "(none)"}</span></p>
        <p className="truncate">{t("canvas.fields.algorithm")}: <span className="font-mono text-foreground">{config.algorithm ?? "sha256"}</span></p>
        <p className="truncate">{t("canvas.fields.setExternalKey")}: <span className="font-mono text-foreground">{String(config.setExternalKey === true)}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-purple-600" />
    </div>
  );
});

HashComposeNode.displayName = "HashComposeNode";
