"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { SlidersHorizontal } from "lucide-react";

export const SetFieldNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    operations?: Array<{ path?: string; value?: unknown; template?: string; delete?: boolean }>;
  };
  const ops = Array.isArray(config.operations) ? config.operations : [];

  return (
    <div
      className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-purple-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-purple-600 px-3 py-2">
        <SlidersHorizontal className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.setField")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        {ops.length === 0 ? (
          <p className="italic">{t("canvas.nodes.noOperations")}</p>
        ) : (
          <ul className="space-y-0.5">
            {ops.slice(0, 3).map((op, index) => (
              <li key={index} className="truncate font-mono text-foreground">
                {op.delete ? `- ${op.path}` : `${op.path} = ${op.value ?? op.template ?? "…"}`}
              </li>
            ))}
            {ops.length > 3 && <li className="text-muted-foreground">+{ops.length - 3} {t("canvas.nodes.more")}</li>}
          </ul>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-purple-500" />
    </div>
  );
});

SetFieldNode.displayName = "SetFieldNode";
