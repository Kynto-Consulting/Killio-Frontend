"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Send } from "lucide-react";

export const WhatsappPersonalSendNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const config = (data?.config ?? {}) as {
    toNumber?: string;
    text?: string;
  };

  const displayText = config.text && config.text.trim().length > 0
    ? (config.text.length > 40 ? `${config.text.slice(0, 40)}…` : config.text)
    : "{aiResponse}";

  return (
    <div
      className={`min-w-[220px] rounded-lg border-2 bg-card shadow-sm ${
        selected ? "border-emerald-500" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-emerald-700 px-3 py-2">
        <Send className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.whatsappPersonalSend")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">
          {t("canvas.fields.toNumber")}: <span className="font-mono text-foreground">{config.toNumber || "{number}"}</span>
        </p>
        <p className="truncate">
          {t("canvas.fields.messageText")}: <span className="font-mono text-foreground">{displayText}</span>
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-emerald-600" />
    </div>
  );
});

WhatsappPersonalSendNode.displayName = "WhatsappPersonalSendNode";
