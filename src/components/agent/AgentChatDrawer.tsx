"use client";

import { useEffect, useRef, useState } from "react";
import { AgentChatPanel } from "./AgentChatPanel";
import { AgentEntityScope } from "@/lib/api/agent";

export interface AgentChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  entityType?: AgentEntityScope;
  entityId?: string;
}

/**
 * Resizable side drawer that hosts the AgentChatPanel.
 * Designed to coexist with the existing BoardChatDrawer;
 * this one connects exclusively to the agentic /agent endpoint.
 */
export function AgentChatDrawer({ isOpen, onClose, teamId, entityType, entityId }: AgentChatDrawerProps) {
  const [width, setWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const vw = window.innerWidth;
      const next = Math.min(Math.max(320, vw - e.clientX), Math.floor(vw * 0.6));
      setWidth(next);
    };
    const onUp = () => setIsResizing(false);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-40 flex shadow-2xl"
      style={{ width }}
    >
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-violet-400/50 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />

      <AgentChatPanel
        teamId={teamId}
        entityType={entityType}
        entityId={entityId}
        onClose={onClose}
        className="flex-1 border-l border-neutral-200 dark:border-neutral-700"
      />
    </div>
  );
}
