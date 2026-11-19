"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { pickMountMode } from "@/lib/query-flow/layout-state";

export const WORKSPACE_SLOT_ID = "app-workspace-slot";

const findSlot = (): HTMLElement | null => (typeof document === "undefined" ? null : document.getElementById(WORKSPACE_SLOT_ID));

/**
 * Draws its children in the app's workspace slot (the content area, below the top bar and right of the sidebar) as
 * `absolute inset-0`; when the page has no slot (public pages, mobile layout, tests) it falls back to a fixed full-screen layer.
 * The target is resolved once and kept: it is only looked up again when the element it points to left the document (the layout
 * re-created it), so a missing slot for one render never unmounts the editor.
 */
export function WorkspaceMount({ children, label }: { children: ReactNode; label: string }) {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useLayoutEffect(() => {
    setSlot(findSlot());
    const timer = window.setInterval(() => {
      setSlot((current) => {
        if (current && current.isConnected) return current;
        const next = findSlot();
        return next === current ? current : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (slot === undefined) return null;
  const mode = pickMountMode(!!slot);
  const content = (
    <div role="region" aria-label={label} data-query-flow-editor className={mode === "slot" ? "absolute inset-0 flex flex-col bg-background text-foreground" : "fixed inset-0 z-[1200] flex flex-col bg-background text-foreground"}>
      {children}
    </div>
  );
  return createPortal(content, slot ?? document.body);
}
