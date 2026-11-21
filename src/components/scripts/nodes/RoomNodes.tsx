"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquareText, Send, SmilePlus } from "lucide-react";

const clip = (value: unknown, max = 40) => {
  const s = String(value ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** Room message trigger of a bot script: one output (`output`), as the backend defines it. */
export const RoomMessageTriggerNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const c = (data?.config ?? {}) as { commandPrefix?: string; requireMention?: boolean; roomId?: string };
  return (
    <div className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-sky-500" : "border-border"}`}>
      <div className="flex items-center gap-2 rounded-t-md bg-sky-700 px-3 py-2">
        <MessageSquareText className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.roomMessageTrigger")}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.roomCommandPrefix")}: <span className="font-mono text-foreground">{clip(c.commandPrefix) || "*"}</span></p>
        {c.requireMention && <p className="truncate">{t("canvas.fields.roomRequireMention")}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-sky-500" />
    </div>
  );
});
RoomMessageTriggerNode.displayName = "RoomMessageTriggerNode";

export const RoomSendMessageNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const c = (data?.config ?? {}) as { text?: string };
  return (
    <div className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-sky-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-sky-600 px-3 py-2">
        <Send className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.roomSendMessage")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        <p className="truncate">{t("canvas.fields.roomText")}: <span className="font-mono text-foreground">{clip(c.text) || "…"}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-sky-500" />
    </div>
  );
});
RoomSendMessageNode.displayName = "RoomSendMessageNode";

export const RoomReactNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations("integrations");
  const c = (data?.config ?? {}) as { emoji?: string };
  return (
    <div className={`min-w-[200px] rounded-lg border-2 bg-card shadow-sm ${selected ? "border-sky-500" : "border-border"}`}>
      <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />
      <div className="flex items-center gap-2 rounded-t-md bg-sky-600 px-3 py-2">
        <SmilePlus className="h-4 w-4 text-white" />
        <span className="text-xs font-semibold text-white">{t("canvas.nodes.roomReact")}</span>
      </div>
      <div className="p-3 text-xs text-muted-foreground">
        <p>{t("canvas.fields.roomEmoji")}: <span className="text-sm text-foreground">{clip(c.emoji, 8) || "…"}</span></p>
      </div>
      <Handle type="source" position={Position.Bottom} id="output" className="!bg-sky-500" />
    </div>
  );
});
RoomReactNode.displayName = "RoomReactNode";
