"use client";

import { useState } from "react";
import { AlertTriangle, Settings, Wrench, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import type { NodeIssue } from "@/lib/query-flow/diagnose";
import type { FlowNode } from "@/lib/query-flow/types";
import { cn } from "@/lib/utils";
import { NODE_META } from "./node-meta";

export interface AppliedStepsProps {
  steps: FlowNode[];
  selectedId: string | null;
  issues: Record<string, NodeIssue>;
  titleOf: (node: FlowNode) => string;
  summaryOf: (node: FlowNode) => string;
  onSelect: (id: string) => void;
  /** The gear / double click: opens the settings dialog of the step. */
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, toIndex: number) => void;
  onRename: (id: string, label: string) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  /** Id of a step whose name should be edited right now (F2 / Rename). */
  renamingId: string | null;
  onRenamingDone: () => void;
}

/** Power Query's "Applied steps": icon, name, error / description icon, gear, red X on hover; click previews the data at that step. */
export function AppliedSteps({ steps, selectedId, issues, titleOf, summaryOf, onSelect, onEdit, onDelete, onReorder, onRename, onContextMenu, renamingId, onRenamingDone }: AppliedStepsProps) {
  const t = useTranslations("query-flow");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [seenRenaming, setSeenRenaming] = useState<string | null>(null);

  // start editing when the parent asks for it (F2, context menu): the draft starts as the current name
  if (renamingId !== seenRenaming) {
    setSeenRenaming(renamingId);
    const node = steps.find((s) => s.id === renamingId);
    if (node) setDraft(node.label ?? titleOf(node));
  }

  if (steps.length === 0) return <p className="px-1 text-xs text-muted-foreground">{t("steps.empty")}</p>;

  return (
    <ol
      className="space-y-0.5 outline-none"
      aria-label={t("steps.title")}
      tabIndex={0}
      onKeyDown={(e) => {
        if (!selectedId || renamingId) return;
        const node = steps.find((s) => s.id === selectedId);
        if (!node) return;
        if (e.key === "Delete" && node.type !== "output") { e.preventDefault(); onDelete(selectedId); }
        if (e.key === "F2") { e.preventDefault(); onContextMenu(selectedId, -1, -1); }
        if (e.key === "Enter") { e.preventDefault(); onEdit(selectedId); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const i = steps.findIndex((s) => s.id === selectedId) + (e.key === "ArrowDown" ? 1 : -1);
          if (steps[i]) onSelect(steps[i].id);
        }
      }}
    >
      {steps.map((node, index) => {
        const meta = NODE_META[node.type];
        const Icon = meta.icon;
        const issue = issues[node.id];
        const selected = node.id === selectedId;
        const movable = node.type !== "source" && node.type !== "output";
        const hasParams = node.type !== "union";
        const tooltip = [node.note, issue ? issue.message : "", summaryOf(node)].filter(Boolean).join("\n");
        return (
          <li
            key={node.id}
            draggable={movable && renamingId !== node.id}
            onDragStart={(e) => { setDragId(node.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", node.id); }}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setOverIndex(index); }}
            onDragEnd={() => { setDragId(null); setOverIndex(null); }}
            onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== node.id) onReorder(dragId, index); setDragId(null); setOverIndex(null); }}
            onContextMenu={(e) => { e.preventDefault(); onSelect(node.id); onContextMenu(node.id, e.clientX, e.clientY); }}
            className={cn(
              "group flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs",
              selected ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted",
              overIndex === index && dragId && dragId !== node.id && "ring-2 ring-primary",
              node.disabled && "opacity-60",
            )}
            title={tooltip || undefined}
          >
            <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-white", meta.header)}>
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            {renamingId === node.id ? (
              <input
                autoFocus
                value={draft}
                aria-label={t("steps.rename")}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { onRename(node.id, draft); onRenamingDone(); }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { onRename(node.id, draft); onRenamingDone(); }
                  if (e.key === "Escape") onRenamingDone();
                }}
                className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs text-foreground"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                onDoubleClick={() => onEdit(node.id)}
                className="min-w-0 flex-1 text-left"
                aria-current={selected ? "step" : undefined}
              >
                <span className={cn("block truncate font-medium text-foreground", node.disabled && "line-through")}>{titleOf(node)}</span>
              </button>
            )}
            {issue ? (
              issue.kind === "engine" ? (
                <span title={`${t("steps.needsEngine")}: ${issue.message}`}><Wrench className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label={t("steps.needsEngine")} /></span>
              ) : (
                <span title={issue.message}><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={t("steps.problem")} /></span>
              )
            ) : null}
            {hasParams ? (
              <button type="button" title={t("steps.editSettings")} aria-label={t("steps.editSettings")} onClick={() => onEdit(node.id)} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground">
                <Settings className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {node.type !== "output" ? (
              <button type="button" title={t("steps.delete")} aria-label={t("steps.delete")} onClick={() => onDelete(node.id)} className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-destructive hover:bg-destructive/10 group-hover:inline-flex group-focus-within:inline-flex">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
