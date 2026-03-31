"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";
import { UnifiedBrickList } from "./unified-brick-list";

interface TabsBrickProps {
  id: string;
  tabs: { id: string; label: string; content?: string }[];
  onUpdate: (data: { tabs: { id: string; label: string; content?: string }[] }) => void;
  readonly?: boolean;
  activeBricks?: any[];
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: { parentId: string, containerId: string }) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
  documents?: any[];
  boards?: any[];
  users?: any[];
}

export const UnifiedTabsBrick: React.FC<TabsBrickProps> = ({ 
  id, tabs = [], onUpdate, readonly, activeBricks = [], onAddBrick, onDeleteBrick, onUpdateBrick, onReorderBricks, documents, boards, users 
}) => {
  const t = useTranslations("document-detail");
  const safeTabs = tabs.length > 0 ? tabs : [{ id: "1", label: t("bricks.tabs.defaultTab1"), content: "" }];
  const [activeTab, setActiveTab] = useState(safeTabs[0].id);

  const nestedBricks = activeBricks.filter((b: any) => b.content?.parentId === id && b.content?.containerId === activeTab).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

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
      <div className="flex bg-muted/20 border-b border-border/50 relative px-1 pt-1 overflow-x-auto overflow-y-hidden rounded-t-lg">
        {safeTabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              "group/tab flex items-center px-4 py-2 border-b-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap",
              activeTab === tab.id
                ? "border-primary text-foreground bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10"
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {!readonly ? (
              <input
                value={tab.label}
                onChange={(e) => updateTab(tab.id, { label: e.target.value })}
                className="bg-transparent outline-none border-none min-w-[50px] focus:ring-1 ring-border/50 rounded px-1"
                onClick={(e) => { e.stopPropagation(); }}
              />
            ) : (
               <span>{tab.label}</span>
            )}
            {!readonly && safeTabs.length > 1 && (
              <button
                type="button"
                className="ml-2 opacity-0 group-hover/tab:opacity-100 hover:text-destructive transition-opacity"
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
      <div className="p-4 bg-background min-h-[100px]">
        {(nestedBricks.length > 0 || !readonly) ? (
          <UnifiedBrickList
            hasExternalDndContext={true}
            bricks={nestedBricks} activeBricks={activeBricks}
            canEdit={!readonly}
            onUpdateBrick={(bId, content) => onUpdateBrick?.(bId, content)}
            onDeleteBrick={(bId) => onDeleteBrick?.(bId)}
            onReorderBricks={(ids) => onReorderBricks?.(ids)}
            onAddBrick={(k, aId) => onAddBrick?.(k, aId, { parentId: id, containerId: activeTab })}
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
