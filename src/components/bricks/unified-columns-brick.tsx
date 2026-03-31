"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";
import { UnifiedBrickList } from "./unified-brick-list";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";

interface ColumnsBrickProps {
  id: string;
  columns?: { id: string }[];
  onUpdate: (data: { columns: { id: string }[] }) => void;
  readonly?: boolean;
  documents?: DocumentSummary[];
  boards?: BoardSummary[];
  activeBricks?: DocumentBrick[];
  users?: any[];
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: { parentId: string, containerId: string }) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
  onCrossContainerDrop?: (activeId: string, overId: string) => void;
}

export const UnifiedColumnsBrick: React.FC<ColumnsBrickProps> = ({ 
  id, 
  columns = [], 
  onUpdate, 
  readonly,
  documents = [],
  boards = [],
  activeBricks = [],
  users = [],
  onAddBrick,
  onDeleteBrick,
  onUpdateBrick,
  onReorderBricks,
  onCrossContainerDrop
}) => {
  const t = useTranslations("document-detail");
  const safeColumns = columns && columns.length > 0 ? columns : [
    { id: "1" },
    { id: "2" }
  ];

  const addColumn = () => {
    if (safeColumns.length >= 5) return;
    const newId = Math.random().toString(36).substring(7);
    onUpdate({
      columns: [...safeColumns, { id: newId }],
    });
  };

  const removeColumn = (colId: string) => {
    if (safeColumns.length <= 2) return;
    onUpdate({ columns: safeColumns.filter((c) => c.id !== colId) });
  };

  return (
    <div className="flex flex-col group my-2 relative">
      <div className="flex flex-col md:flex-row gap-4 w-full">
        {safeColumns.map((col, index) => {
          const nestedBricks = activeBricks.filter((b: any) => b.content?.parentId === id && b.content?.containerId === col.id).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
          return (
            <div key={col.id} className="flex-1 flex flex-col min-w-0 group/col relative bg-muted/5 border border-transparent hover:border-border/50 rounded-lg transition-colors">
               <div className="p-3 w-full h-full min-h-[100px]">
                 <UnifiedBrickList
                   hasExternalDndContext={true}
                   bricks={nestedBricks} activeBricks={activeBricks}
                   canEdit={!readonly}
                   onUpdateBrick={(bId, content) => onUpdateBrick?.(bId, content)}
                   onDeleteBrick={(bId) => onDeleteBrick?.(bId)}
                   onReorderBricks={(ids) => onReorderBricks?.(ids)}
                   onAddBrick={(k, aId) => onAddBrick?.(k, aId, { parentId: id, containerId: col.id })}
                   onCrossContainerDrop={onCrossContainerDrop}
                   addableKinds={['text', 'table', 'graph', 'checklist', 'accordion', 'tabs', 'columns', 'image']}
                   documents={documents}
                   boards={boards}
                   users={users}
                 />
                 {nestedBricks.length === 0 && (
                   <div className="text-muted-foreground/30 text-xs italic pointer-events-none mt-2">
                     {t("bricks.colPrefix")} {index + 1}...
                   </div>
                 )}
               </div>
               {!readonly && safeColumns.length > 2 && (
                 <button 
                   onClick={() => removeColumn(col.id)}
                   className="absolute -top-1 -right-1 bg-background border border-border rounded-full p-1 opacity-0 group-hover/col:opacity-100 text-destructive shadow-sm z-10"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                 </button>
               )}
            </div>
          );
        })}
      </div>
      {!readonly && safeColumns.length < 5 && (
        <button 
          onClick={addColumn}
          className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border rounded-full p-1.5 shadow-sm hover:bg-muted text-muted-foreground"
          title={t("bricks.addCol")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
        </button>
      )}
    </div>
  );
};
