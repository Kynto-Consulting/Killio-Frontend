"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Code2 } from "lucide-react";

export const JsCodeNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    code?: string;
    timeoutMs?: number;
  };

  const previewLines = (config.code ?? "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, 2);

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-zinc-600" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-zinc-800 px-3 py-2">
        <Code2 className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.jsCode")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        {previewLines.length === 0 ? (
          <p className="italic">{t("canvas.nodes.noCode")}</p>
        ) : (
          <div className="space-y-0.5 font-mono text-[10px] text-foreground">
            {previewLines.map((line, index) => (
              <p key={index} className="truncate">{line}</p>
            ))}
            {(config.code ?? "").split("\n").filter((l) => l.trim()).length > 2 && (
              <p className="text-muted-foreground">…</p>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-zinc-600" />
    </div>
  );
});

JsCodeNode.displayName = "JsCodeNode";
