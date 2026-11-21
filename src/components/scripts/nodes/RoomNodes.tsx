"use client";

import { memo } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Handle, Position, NodeProps, type NodeTypes } from "@xyflow/react";
import {
  CalendarClock, Mail, MessageSquareReply, MessageSquareText, MessagesSquare, MousePointerClick, Pencil, PencilLine, Pin, Reply, Send, SmilePlus, Eraser,
  SquareSlash, Trash2, TriangleAlert, UserPlus, type LucideIcon,
} from "lucide-react";
import { ROOM_NODE_SPECS, isRoomNodeKind, validateRoomNode, type RoomNodeKind, type RoomNodeSpec } from "@/lib/bots/room-nodes";

/** Lucide icon of every room node (the catalog only carries the name, so it stays free of React). */
export const ROOM_NODE_ICONS: Record<string, LucideIcon> = {
  MessageSquareText, SquareSlash, MousePointerClick, SmilePlus, PencilLine, Trash2, UserPlus, CalendarClock,
  Send, Reply, Pencil, Pin, MessagesSquare, Eraser, Mail, MessageSquareReply,
};

const clip = (value: unknown, max = 34) => {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** At most two short "label: value" lines of what the node is configured with, so the canvas is readable at a glance. */
function summaryLines(spec: RoomNodeSpec, config: Record<string, unknown>, label: (key: string) => string): string[] {
  const out: string[] = [];
  for (const f of spec.fields) {
    if (out.length >= 2) break;
    const v = config[f.key];
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (f.key === "roomId" || f.key === "messageId" || f.key === "userId" || f.key === "blocksFrom" || f.key === "componentsFrom") continue;
    if (Array.isArray(v)) out.push(`${label(f.key)}: ${v.length}`);
    else if (v === true) out.push(label(f.key));
    else out.push(`${label(f.key)}: ${clip(v)}`);
  }
  return out;
}

function RoomNodeCard({ kind, data, selected }: { kind: RoomNodeKind; data: NodeProps["data"]; selected: boolean }) {
  const t = useTranslations("integrations");
  const spec = ROOM_NODE_SPECS[kind];
  const Icon = ROOM_NODE_ICONS[spec.icon] ?? MessageSquareText;
  const config = ((data?.config ?? {}) as Record<string, unknown>);
  const issues = validateRoomNode(kind, config);
  const lines = summaryLines(spec, config, (k) => t(`canvas.room.fields.${k}.label`));
  const title = t(`canvas.nodes.${spec.labelKey}`);
  const trigger = spec.role === "trigger";
  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-lg border-2 bg-card shadow-sm ${selected ? spec.ring : issues.length ? "border-amber-500/70" : "border-border"}`}
      aria-label={`${title}${issues.length ? ` - ${t("canvas.room.nodeNeedsAttention")}` : ""}`}
    >
      {spec.hasInput && <Handle type="target" position={Position.Top} id="input" className="!bg-slate-400" />}
      <div className={`flex items-center gap-2 rounded-t-md px-3 py-2 ${spec.color}`}>
        <Icon className="h-4 w-4 shrink-0 text-white" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{title}</span>
        {issues.length > 0 && (
          <span title={t("canvas.room.nodeNeedsAttention")} className="shrink-0 rounded bg-amber-400 p-0.5 text-amber-950">
            <TriangleAlert className="h-3 w-3" aria-hidden />
            <span className="sr-only">{t("canvas.room.nodeNeedsAttention")}</span>
          </span>
        )}
      </div>
      <div className="space-y-1 p-3 text-xs text-muted-foreground">
        <p className="line-clamp-2 text-[11px] leading-snug">{t(`canvas.room.nodes.${spec.labelKey}`)}</p>
        {lines.map((l) => <p key={l} className="truncate font-mono text-[11px] text-foreground">{l}</p>)}
        {trigger && kind === "killio.trigger.room_message" && !config.commandPrefix && <p className="truncate text-[11px]">{t("canvas.room.anyMessage")}</p>}
      </div>
      {spec.outputs ? (
        spec.outputs.map((o, i) => (
          <Handle key={o} type="source" position={Position.Bottom} id={o} style={{ left: `${((i + 1) * 100) / (spec.outputs!.length + 1)}%` }} className={o.endsWith("false") ? "!bg-rose-500" : "!bg-emerald-500"} title={o} />
        ))
      ) : (
        <Handle type="source" position={Position.Bottom} id="output" className="!bg-sky-500" />
      )}
    </div>
  );
}

function make(kind: RoomNodeKind) {
  const Node = memo(({ data, selected }: NodeProps) => <RoomNodeCard kind={kind} data={data} selected={Boolean(selected)} />);
  Node.displayName = `RoomNode(${kind})`;
  return Node;
}

/** `nodeTypes` entries of every room trigger and action: one component per kind, keyed by the backend node kind. */
export const ROOM_NODE_TYPES: NodeTypes = Object.fromEntries((Object.keys(ROOM_NODE_SPECS) as RoomNodeKind[]).map((k) => [k, make(k)])) as NodeTypes;

export { isRoomNodeKind };

/* Kept for imports from the first version of the room nodes. */
export const RoomMessageTriggerNode = ROOM_NODE_TYPES["killio.trigger.room_message"];
export const RoomSendMessageNode = ROOM_NODE_TYPES["killio.room.send_message"];
export const RoomReactNode = ROOM_NODE_TYPES["killio.room.react"];
