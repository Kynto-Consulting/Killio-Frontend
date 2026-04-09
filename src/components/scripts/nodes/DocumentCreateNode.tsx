"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FilePlus2 } from "lucide-react";

interface DocumentCreateConfig {
  titleTemplate?: string;
  folderId?: string;
}

export const DocumentCreateNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as DocumentCreateConfig;

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-emerald-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-emerald-600 px-3 py-2">
        <FilePlus2 className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.documentCreate")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        {config.titleTemplate ? (
          <p className="truncate text-foreground">{config.titleTemplate}</p>
        ) : (
          <p className="italic text-muted-foreground">{t("nodes.documentCreate.noTitleTemplate")}</p>
        )}
        {config.folderId && (
          <p className="truncate">{t("canvas.fields.folderId")}: {config.folderId}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-emerald-600" />
    </div>
  );
});

DocumentCreateNode.displayName = "DocumentCreateNode";
