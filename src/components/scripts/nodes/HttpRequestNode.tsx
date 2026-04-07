"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";

export const HttpRequestNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    url?: string;
    method?: string;
    outputPath?: string;
  };

  const displayUrl = config.url
    ? config.url.length > 30
      ? `${config.url.slice(0, 30)}…`
      : config.url
    : "—";

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-blue-600" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-blue-700 px-3 py-2">
        <Globe className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.httpRequest")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate"><span className="font-semibold text-foreground">{config.method ?? "GET"}</span></p>
        <p className="truncate font-mono text-[10px] text-foreground">{displayUrl}</p>
        {config.outputPath && (
          <p className="truncate">{t("canvas.fields.outputPath")}: <span className="font-mono text-foreground">{config.outputPath}</span></p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-blue-600" />
    </div>
  );
});

HttpRequestNode.displayName = "HttpRequestNode";
