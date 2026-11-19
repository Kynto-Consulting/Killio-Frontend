"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, EyeOff, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NodeIssue } from "@/lib/query-flow/diagnose";
import type { NodeType } from "@/lib/query-flow/types";
import { NODE_META } from "./node-meta";

/** What a node shows: computed by the editor from the graph (the component never reads the graph itself). */
export interface StepNodeView {
  type: NodeType;
  title: string;
  summary: string;
  note?: string;
  disabled: boolean;
  issue: NodeIssue | null;
  engineLabel: string;
  errorLabel: string;
  [key: string]: unknown;
}

const STEP_PORT = "!h-3 !w-3 !border-2 !border-background";

export const StepNode = memo(({ data, selected }: NodeProps) => {
  const view = (data ?? {}) as unknown as StepNodeView;
  const meta = NODE_META[view.type] ?? NODE_META.advanced;
  const Icon = meta.icon;
  const issue = view.issue;
  const tooltip = [view.note, issue ? `${issue.kind === "engine" ? view.engineLabel : view.errorLabel}: ${issue.message}` : ""].filter(Boolean).join("\n");
  return (
    <div
      title={tooltip || view.title}
      className={cn(
        "w-[210px] rounded-lg border-2 bg-card text-card-foreground shadow-sm transition-shadow",
        selected ? `${meta.ring} shadow-md` : "border-border",
        issue && !selected && (issue.kind === "engine" ? "border-amber-500" : "border-destructive"),
        view.disabled && "opacity-60",
      )}
    >
      {view.type !== "source" ? (
        <>
          <Handle type="target" position={Position.Left} id="in" className={cn(STEP_PORT, "!bg-slate-400")} style={view.type === "join" ? { top: "30%" } : view.type === "union" ? { top: "30%" } : undefined} />
          {view.type === "join" ? <Handle type="target" position={Position.Left} id="right" className={cn(STEP_PORT, "!bg-indigo-500")} style={{ top: "75%" }} /> : null}
          {view.type === "union" ? <Handle type="target" position={Position.Left} id="in2" className={cn(STEP_PORT, "!bg-indigo-500")} style={{ top: "75%" }} /> : null}
        </>
      ) : null}
      <div className={cn("flex items-center gap-2 rounded-t-md px-2.5 py-1.5 text-white", meta.header)}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{view.title}</span>
        {view.disabled ? <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        {issue ? (
          issue.kind === "engine" ? (
            <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-label={view.engineLabel} />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-200" aria-label={view.errorLabel} />
          )
        ) : null}
      </div>
      <div className="min-h-[34px] space-y-0.5 px-2.5 py-1.5 text-[11px]">
        <p className="truncate font-mono text-foreground">{view.summary || " "}</p>
        {issue ? (
          <p className={cn("line-clamp-2 text-[10px]", issue.kind === "engine" ? "text-amber-700 dark:text-amber-300" : "text-destructive")}>
            {issue.kind === "engine" ? `${view.engineLabel}: ${issue.message}` : issue.message}
          </p>
        ) : null}
      </div>
      {view.type !== "output" ? <Handle type="source" position={Position.Right} id="out" className={cn(STEP_PORT, "!bg-primary")} /> : null}
    </div>
  );
});
StepNode.displayName = "StepNode";

export const nodeTypes = { step: StepNode };
