"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";
import { UnifiedBrickList } from "./unified-brick-list";
import { resolveNestedBricks } from "@/lib/bricks/nesting";
import { WorkspaceMemberLike } from "@/lib/workspace-members";

interface TabsBrickProps {
  id: string;
  tabs: { id: string; label: string; content?: string }[];
  childrenByContainer?: Record<string, string[]>;
  onUpdate: (data: { tabs: { id: string; label: string; content?: string }[] }) => void;
  readonly?: boolean;
  activeBricks?: any[];
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: { parentId: string, containerId: string }, initialContent?: any) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
  onCrossContainerDrop?: (
    activeId: string,
    overId: string,
    options?: { intent?: "move" | "merge-text"; sourceContainerToken?: string; targetContainerToken?: string },
  ) => void;
  documents?: any[];
  boards?: any[];
  users?: WorkspaceMemberLike[];
}

export const UnifiedTabsBrick: React.FC<TabsBrickProps> = ({ 
  id, tabs = [], childrenByContainer, onUpdate, readonly, activeBricks = [], onAddBrick, onDeleteBrick, onUpdateBrick, onReorderBricks, onCrossContainerDrop, documents, boards, users 
}) => {
  const t = useTranslations("document-detail");
  const safeTabs = tabs.length > 0 ? tabs : [{ id: "1", label: t("bricks.tabs.defaultTab1"), content: "" }];
  const [activeTab, setActiveTab] = useState(safeTabs[0].id);
  /** A tab is renamed on purpose (Ctrl/Cmd + click, double click, F2 or the pencil): a plain click only switches tabs. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const startRename = (tab: { id: string; label: string }) => {
    if (readonly) return;
    setActiveTab(tab.id);
    setDraft(tab.label);
    setEditingId(tab.id);
  };
  const commitRename = () => {
    if (editingId) {
      const label = draft.trim();
      const current = safeTabs.find((x) => x.id === editingId);
      if (label && current && label !== current.label) updateTab(editingId, { label });
    }
    setEditingId(null);
  };

  const nestedBricks = resolveNestedBricks({ childrenByContainer: childrenByContainer || {} }, activeTab, activeBricks as any[]) as any[];

  const activeContent = safeTabs.find((t) => t.id === activeTab)?.content || "";

  const updateTab = (tabId: string, overrides: Partial<{ label: string; content: string }>) => {
    onUpdate({
      tabs: safeTabs.map((t) => (t.id === tabId ? { ...t, ...overrides } : t)),
    });
  };

  const addTab = () => {
    const newId = Math.random().toString(36).substring(7);
    onUpdate({
      tabs: [...safeTabs, { id: newId, label: `${t("bricks.tabs.defaultTabn")} ${safeTabs.length + 1}`, content: "" }],
    });
    setActiveTab(newId);
  };

  const removeTab = (tabId: string) => {
    if (safeTabs.length <= 1) return;
    const newTabs = safeTabs.filter((t) => t.id !== tabId);
    onUpdate({ tabs: newTabs });
    if (activeTab === tabId) {
      setActiveTab(newTabs[0].id);
    }
  };

  return (
    <div className="flex flex-col border border-border/50 rounded-lg group">
      <div role="tablist" className="flex bg-muted/20 border-b border-border/50 relative px-1 pt-1 overflow-x-auto overflow-y-hidden rounded-t-lg">
        {safeTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "group/tab flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-foreground bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10"
            )}
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={0}
            title={readonly ? undefined : t("bricks.tabs.renameHint")}
            onClick={(e) => {
              if (editingId === tab.id) return;
              if (!readonly && (e.ctrlKey || e.metaKey)) startRename(tab);
              else setActiveTab(tab.id);
            }}
            onDoubleClick={() => startRename(tab)}
            onKeyDown={(e) => {
              if (editingId === tab.id) return;
              if (e.key === "F2") { e.preventDefault(); startRename(tab); }
              else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveTab(tab.id); }
            }}
          >
            {editingId === tab.id ? (
              <input
                ref={inputRef}
                autoFocus
                value={draft}
                maxLength={60}
                aria-label={t("bricks.tabs.rename")}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") setEditingId(null);
                }}
                className="bg-transparent outline-none border-none min-w-[50px] ring-1 ring-primary/60 rounded px-1"
              />
            ) : (
              <span>{tab.label}</span>
            )}
            {!readonly && editingId !== tab.id && (
              <button
                type="button"
                aria-label={t("bricks.tabs.rename")}
                title={t("bricks.tabs.rename")}
                className={cn("ml-2 hover:text-foreground transition-opacity", activeTab === tab.id ? "opacity-40 hover:opacity-100" : "opacity-0 group-hover/tab:opacity-60 hover:!opacity-100")}
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(tab);
                }}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {!readonly && safeTabs.length > 1 && editingId !== tab.id && (
              <button
                type="button"
                aria-label={t("bricks.tabs.delete")}
                title={t("bricks.tabs.delete")}
                className="ml-1.5 opacity-0 group-hover/tab:opacity-100 hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(tab.id);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {!readonly && (
          <button onClick={addTab} className="px-3 py-2 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="p-4 bg-background min-h-[50px]">
        {(nestedBricks.length > 0 || !readonly) ? (
          <UnifiedBrickList
            hasExternalDndContext={true}
            dropContainerToken={`${id}:${activeTab}`}
            bricks={nestedBricks} activeBricks={activeBricks}
            canEdit={!readonly}
            emptyPlaceholder={t("bricks.tabs.empty")}
            onUpdateBrick={(bId, content) => onUpdateBrick?.(bId, content)}
            onDeleteBrick={(bId) => onDeleteBrick?.(bId)}
            onReorderBricks={(ids) => onReorderBricks?.(ids)}
              onAddBrick={(k, aId, parentProps, initialContent) => onAddBrick?.(k, aId, parentProps || { parentId: id, containerId: activeTab }, initialContent)}
              onCrossContainerDrop={onCrossContainerDrop}
            documents={documents}
            boards={boards}
            users={users}
          />
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{activeContent}</div>
        )}
      </div>
    </div>
  );
};
