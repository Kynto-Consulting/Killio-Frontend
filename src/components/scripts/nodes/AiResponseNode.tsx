"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";

export const AiResponseNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    prompt?: string;
    sourcePath?: string;
    outputPath?: string;
  };

  const displayPrompt = config.prompt && config.prompt.trim().length > 0
    ? (config.prompt.length > 40 ? `${config.prompt.slice(0, 40)}…` : config.prompt)
    : "—";

  return (
    <div
      className={`min-w-[220px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-violet-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-violet-600 px-3 py-2">
        <Sparkles className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.aiResponse")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">
          {t("canvas.fields.aiPrompt")}: <span className="font-mono text-foreground">{displayPrompt}</span>
        </p>
        <p className="truncate">
          {t("canvas.fields.outputPath")}: <span className="font-mono text-foreground">{config.outputPath || "aiResponse"}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-violet-500" />
    </div>
  );
});

AiResponseNode.displayName = "AiResponseNode";
