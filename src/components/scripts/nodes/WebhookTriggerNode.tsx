"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Webhook, Pencil, Layers, FileText, SlidersHorizontal, MessageCircle } from "lucide-react";

export const WebhookTriggerNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");

  const webhookType = (data?.config as Record<string, any>)?._webhookType as string | undefined;

  let Icon = Webhook;
  let bgClass = "bg-cyan-600";
  let borderClass = selected ? "border-cyan-500" : "border-border";
  let title = t("canvas.nodes.webhookTrigger");
  let handleClass = "!bg-cyan-500";

  switch (webhookType) {
    case "killio.card.updated":
      Icon = Pencil;
      bgClass = "bg-indigo-600";
      borderClass = selected ? "border-indigo-500" : "border-border";
      title = t("canvas.nodes.cardUpdatedTrigger");
      handleClass = "!bg-indigo-500";
      break;
    case "killio.list.updated":
      Icon = Layers;
      bgClass = "bg-teal-700";
      borderClass = selected ? "border-teal-500" : "border-border";
      title = t("canvas.nodes.listUpdatedTrigger");
      handleClass = "!bg-teal-500";
      break;
    case "killio.document.updated":
      Icon = FileText;
      bgClass = "bg-emerald-700";
      borderClass = selected ? "border-emerald-500" : "border-border";
      title = t("canvas.nodes.documentUpdatedTrigger");
      handleClass = "!bg-emerald-500";
      break;
    case "killio.board.updated":
      Icon = SlidersHorizontal;
      bgClass = "bg-slate-700";
      borderClass = selected ? "border-slate-500" : "border-border";
      title = t("canvas.nodes.boardUpdatedTrigger");
      handleClass = "!bg-slate-500";
      break;
    case "whatsapp":
      Icon = MessageCircle;
      bgClass = "bg-emerald-700";
      borderClass = selected ? "border-emerald-500" : "border-border";
      title = t("canvas.nodes.whatsappWebhookTrigger");
      handleClass = "!bg-emerald-500";
      break;
  }

  return (
    <div
      className={`min-w-[180px] rounded-lg border-2 bg-card shadow-sm ${borderClass}`}
    >
      <div className={`flex items-center gap-2 rounded-t-md px-3 py-2 ${bgClass}`}>
        <Icon className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{title}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        {t("nodes.webhook.description")}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className={handleClass} />
    </div>
  );
});

WebhookTriggerNode.displayName = "WebhookTriggerNode";
