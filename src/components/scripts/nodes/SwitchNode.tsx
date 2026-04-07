"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";

export const SwitchNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    field?: string;
    routes?: Record<string, string>;
  };
  const routeEntries = Object.entries(config.routes ?? {});

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-orange-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-orange-500 px-3 py-2">
        <GitFork className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.switch")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        <p className="mb-1 truncate">{t("canvas.fields.field")}: <span className="font-mono text-foreground">{config.field ?? "—"}</span></p>
        {routeEntries.slice(0, 4).map(([value, handle]) => (
          <p key={handle} className="truncate font-mono text-[10px]">
            <span className="text-muted-foreground">{value}</span> → <span className="text-orange-600">{handle}</span>
          </p>
        ))}
        {routeEntries.length === 0 && <p className="italic">{t("canvas.nodes.noRoutes")}</p>}
      </div>
      {/* Output handles: out_1, out_2, out_3 and default */}
      <Handle type="source" position={Position.Bottom} id="out_1"   style={{ left: "20%" }} className="!bg-orange-400" />
      <Handle type="source" position={Position.Bottom} id="out_2"   style={{ left: "40%" }} className="!bg-orange-400" />
      <Handle type="source" position={Position.Bottom} id="out_3"   style={{ left: "60%" }} className="!bg-orange-400" />
      <Handle type="source" position={Position.Bottom} id="default" style={{ left: "80%" }} className="!bg-slate-400" />
    </div>
  );
});

SwitchNode.displayName = "SwitchNode";
