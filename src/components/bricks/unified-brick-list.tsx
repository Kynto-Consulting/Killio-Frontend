"use client";

import React, { useState, useEffect } from "react";
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
import { Portal } from "../ui/portal";
import { cn } from "@/lib/utils";
import { slashCommands, type SlashCommand } from "./slash-commands";

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
  const [plusMenuState, setPlusMenuState] = useState<{ brickId: string, top: number, left: number } | null>(null);
  const enabledKinds = addableKinds && addableKinds.length > 0
    ? addableKinds
    : ['text', 'table', 'graph', 'checklist', 'accordion'];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuState) {
        setPlusMenuState(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [plusMenuState]);

  const handleApplyPlusCommand = (command: SlashCommand, afterBrickId: string) => {
    // If it's inline, text block. If block, specific kind.
    // For text, we could theoretically insert the text, but the api onAddBrick only takes kind.
    // Let's map it based on command.blockKind or 'text'.
    const kindToInsert = command.blockKind || "text";
    onAddBrick(kindToInsert, afterBrickId);
    setPlusMenuState(null);
  };

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
              <SortableBrick 
                key={brick.id} 
                id={brick.id} 
                readonly={!canEdit} 
                onDelete={() => onDeleteBrick(brick.id)} 
                onAddBelow={(rect) => {
                  if (rect) {
                    let top = rect.bottom + 8;
                    let left = rect.left;
                    
                    const menuHeight = 320;
                    const menuWidth = 320;
                    if (typeof window !== "undefined") {
                      if (top + menuHeight > window.innerHeight) {
                        top = Math.max(12, rect.top - menuHeight - 8);
                      }
                      if (left + menuWidth > window.innerWidth) {
                        left = window.innerWidth - menuWidth - 12;
                      }
                    }
                    
                    setPlusMenuState({ brickId: brick.id, top, left });
                  } else {
                    onAddBrick('text', brick.id);
                  }
                }}
              >
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

      {plusMenuState && canEdit && (
        <Portal>
          <div
            className="fixed z-[150] w-[320px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{ top: plusMenuState.top, left: plusMenuState.left }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing immediately
          >
            <div className="border-b border-border/70 px-3 py-2 bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground w-full block">Añadir bloque</span>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {slashCommands.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={() => handleApplyPlusCommand(command, plusMenuState.brickId)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50 text-muted-foreground"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background shadow-sm text-foreground">
                    {command.icon}
                  </div>
                  <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                    <span className="text-sm font-medium text-foreground">{command.label}</span>
                    <span className="truncate text-xs text-muted-foreground/80">{command.description}</span>
                  </div>
                  {command.shortcut && (
                    <div className="ml-auto text-xs text-muted-foreground/60">{command.shortcut}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
