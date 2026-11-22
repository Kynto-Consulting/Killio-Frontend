"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { PackageCheck } from "lucide-react";

/** Condition: does the team that runs the script hold the marketplace pack? Backend: killio.logic.team_has_pack. */
export const TeamHasPackNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as { pack?: string };

  return (
    <div className={`min-w-[190px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-fuchsia-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-fuchsia-500 px-3 py-2">
        <PackageCheck className="h-4 w-4 text-foreground dark:text-white" />
        <span className="text-xs font-semibold text-foreground dark:text-white">{t("canvas.nodes.teamHasPack")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.pack")}: <span className="font-mono text-foreground">{config.pack || "—"}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="match_true" style={{ left: "30%" }} className="!bg-green-500" />
      <Handle type="source" position={Position.Bottom} id="match_false" style={{ left: "70%" }} className="!bg-red-400" />
    </div>
  );
});

TeamHasPackNode.displayName = "TeamHasPackNode";
