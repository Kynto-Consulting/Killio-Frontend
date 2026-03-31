"use client";

import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Type, Table, BarChart2, CheckSquare, ChevronDown, Image as ImageIcon } from "lucide-react";
import { UnifiedBrickRenderer } from "./brick-renderer";
import { SortableBrick } from "./sortable-brick";
import { Button } from "@/components/ui/button";

type AddableKind = 'text' | 'table' | 'graph' | 'checklist' | 'accordion' | 'image';

interface UnifiedBrickListProps {
  bricks: any[];
  canEdit: boolean;
  onUpdateBrick: (id: string, content: any) => void;
  onDeleteBrick: (id: string) => void;
  onReorderBricks: (ids: string[]) => void;
  onAddBrick: (kind: string, afterBrickId?: string) => void;
  documents?: any[];
  boards?: any[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  addableKinds?: AddableKind[];
  onPasteImageInTextBrick?: (payload: { brickId: string; file: File; cursorOffset: number; markdown: string }) => Promise<string | void> | string | void;
  onUploadMediaFiles?: (payload: { brickId: string; files: File[] }) => Promise<void> | void;
}

export const UnifiedBrickList: React.FC<UnifiedBrickListProps> = ({
  bricks,
  canEdit,
  onUpdateBrick,
  onDeleteBrick,
  onReorderBricks,
  onAddBrick,
  documents = [],
  boards = [],
  users = [],
  addableKinds,
  onPasteImageInTextBrick,
  onUploadMediaFiles
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const enabledKinds = addableKinds && addableKinds.length > 0
    ? addableKinds
    : ['text', 'table', 'graph', 'checklist', 'accordion'];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = bricks.findIndex((b) => b.id === active.id);
      const newIndex = bricks.findIndex((b) => b.id === over.id);
      
      const newOrder = [...bricks];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      
      onReorderBricks(newOrder.map(b => b.id));
    }
  };

  const sortedBricks = [...bricks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const renderBrick = (brick: any) => {
    // Normalize mapping for Cards (BoardBrick) vs Documents (DocumentBrick)
    const normalized = {
      ...brick,
      content: {
        text: brick.markdown || brick.content?.text || "",
        rows: brick.rows || brick.content?.rows || [],
        items: brick.tasks || brick.items || brick.content?.items || [],
        title: brick.title || brick.content?.title || "",
        body: brick.body || brick.content?.body || "",
        isExpanded: brick.isExpanded !== undefined ? brick.isExpanded : brick.content?.isExpanded,
        ...(brick.content || {}),
        ...brick // Top-level fields on BoardBrick take precedence
      }
    };

    return (
      <UnifiedBrickRenderer 
        brick={normalized}
        canEdit={canEdit}
        onUpdate={(content) => onUpdateBrick(brick.id, content)}
        onAddBrick={onAddBrick}
        documents={documents}
        boards={boards}
        activeBricks={bricks}
        users={users}
        onPasteImageInTextBrick={onPasteImageInTextBrick}
        onUploadMediaFiles={onUploadMediaFiles}
      />
    );
  };

  return (
    <div className="w-full space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortedBricks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 min-h-[50px]">
            {sortedBricks.map(brick => (
              <SortableBrick key={brick.id} id={brick.id} readonly={!canEdit} onDelete={() => onDeleteBrick(brick.id)} onAddBelow={() => onAddBrick('text', brick.id)}>
                {renderBrick(brick)}
              </SortableBrick>
            ))}
          </div>
        </SortableContext>
        
        <DragOverlay>
          {activeId ? (
             <div className="opacity-80 scale-[1.02] shadow-xl bg-background border border-border rounded-lg p-2">
                {renderBrick(bricks.find(b => b.id === activeId))}
             </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {canEdit && (
        <div className="pt-6 border-t border-border flex flex-wrap gap-2 items-center justify-center">
          {enabledKinds.includes('text') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('text')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <Type className="w-3.5 h-3.5 text-accent" /> Texto
            </Button>
          )}
          {enabledKinds.includes('table') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('table')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <Table className="w-3.5 h-3.5 text-accent" /> Tabla
            </Button>
          )}
          {enabledKinds.includes('graph') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('graph')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <BarChart2 className="w-3.5 h-3.5 text-accent" /> Gráfico
            </Button>
          )}
          {enabledKinds.includes('checklist') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('checklist')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <CheckSquare className="w-3.5 h-3.5 text-accent" /> Lista
            </Button>
          )}
          {enabledKinds.includes('accordion') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('accordion')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <ChevronDown className="w-3.5 h-3.5 text-accent" /> Acordeón
            </Button>
          )}
          {enabledKinds.includes('image') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('image')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <ImageIcon className="w-3.5 h-3.5 text-accent" /> Imagen
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
