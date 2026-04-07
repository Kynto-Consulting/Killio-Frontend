"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Webhook } from "lucide-react";

export const WebhookTriggerNode = memo(({ selected }: NodeProps) => {
  const t = useTranslations("integrations");

  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-cyan-500" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-md bg-cyan-600 px-3 py-2">
        <Webhook className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.webhookTrigger")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        {t("nodes.webhook.description")}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-cyan-500" />
    </div>
  );
});

WebhookTriggerNode.displayName = "WebhookTriggerNode";
