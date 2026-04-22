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
import { Type, Table, BarChart2, CheckSquare, ChevronDown, Image as ImageIcon, LayoutGrid } from "lucide-react";
import { UnifiedBrickRenderer } from "./brick-renderer";
import { SortableBrick } from "./sortable-brick";
import { Button } from "@/components/ui/button";
import { Portal } from "../ui/portal";
import { cn } from "@/lib/utils";
import { getSlashCommands, type SlashCommand } from "./slash-commands";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ReferencePicker, type ReferencePickerSelection } from "@/components/documents/reference-picker";

type AddableKind = 'text' | 'table' | 'database' | 'graph' | 'checklist' | 'accordion' | 'tabs' | 'columns' | 'image' | 'video' | 'audio' | 'file' | 'code' | 'bookmark' | 'math';

interface UnifiedBrickListProps {
  bricks: any[];
  activeBricks?: any[];
  canEdit: boolean;
  onUpdateBrick: (id: string, content: any) => void;
  onDeleteBrick: (id: string) => void;
  onReorderBricks: (ids: string[]) => void;
  onAddBrick: (kind: string, afterBrickId?: string, parentProps?: any, initialContent?: any) => void;
  documents?: any[];
  boards?: any[];
  folders?: any[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  addableKinds?: AddableKind[];
  onPasteImageInTextBrick?: (payload: { brickId: string; file: File; cursorOffset: number; markdown: string }) => Promise<string | void> | string | void;
  onUploadMediaFiles?: (payload: { brickId: string; files: File[] }) => Promise<void> | void;
  hasExternalDndContext?: boolean;
  onCrossContainerDrop?: (activeId: string, overId: string) => void;
  dropContainerToken?: string;
  emptyPlaceholder?: string;
  onAiAction?: (action: string, contextText: string) => void;
  isCompact?: boolean;
}

export const UnifiedBrickList: React.FC<UnifiedBrickListProps> = ({
  bricks,
  activeBricks,
  canEdit,
  onUpdateBrick,
  onDeleteBrick,
  onReorderBricks,
  onAddBrick,
  documents = [],
  boards = [],
  folders = [],
  users = [],
  addableKinds,
  onPasteImageInTextBrick,
  onUploadMediaFiles,
  hasExternalDndContext = false,
  onCrossContainerDrop,
  dropContainerToken,
  emptyPlaceholder,
  onAiAction,
  isCompact = false
}) => {
  const tDetail = useTranslations("document-detail");
  const slashCommands = React.useMemo(() => getSlashCommands(tDetail as any), [tDetail]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [plusMenuState, setPlusMenuState] = useState<{ brickId: string, top: number, left: number } | null>(null);
  const [plusMenuHoverIndex, setPlusMenuHoverIndex] = useState<number>(0);
  const [pickerState, setPickerState] = useState<{ isOpen: boolean; filter: string[]; triggerBrickId: string } | null>(null);
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
    if (command.id === "mention-person" || command.id === "mention-page") {
      setPickerState({
        isOpen: true,
        filter: command.id === "mention-person" ? ["user"] : ["document", "board"],
        triggerBrickId: afterBrickId
      });
      setPlusMenuState(null);
      return;
    }

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
      
      // If either isn't found in current scope, it's a cross-container drop
      if (oldIndex === -1 || newIndex === -1) {
        if (onCrossContainerDrop) {
           onCrossContainerDrop(active.id as string, dropContainerToken || (over.id as string));
        }
        return;
      }
      
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
        text: brick.markdown! || brick.content?.text || "",
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
        onDeleteBrick={onDeleteBrick}
        onUpdateBrick={onUpdateBrick}
        onReorderBricks={onReorderBricks}
        documents={documents}
        boards={boards}
        activeBricks={activeBricks || bricks}
        users={users}
        onPasteImageInTextBrick={onPasteImageInTextBrick}
        onUploadMediaFiles={onUploadMediaFiles}
        onAiAction={onAiAction}
        isCompact={isCompact}
      />
    );
  };

  const listContent = (
    <SortableContext items={sortedBricks.map(b => b.id)} strategy={verticalListSortingStrategy}>
      {sortedBricks.length > 0 && (
<div className="space-y-2 min-h-[50px]">
        {sortedBricks.map(brick => (
          <SortableBrick 
            key={brick.id} 
            id={brick.id} 
            readonly={!canEdit} 
            isCompact={isCompact}
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
      </div>)}
    </SortableContext>
  );

  return (
    <div className="w-full space-y-4">
      {hasExternalDndContext ? (
        listContent
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
        >
          {listContent}
          <DragOverlay>
            {activeId ? (
               <div className="opacity-80 scale-[1.02] shadow-xl bg-background border border-border rounded-lg p-2">
                  {renderBrick(bricks.find(b => b.id === activeId))}
               </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {canEdit && bricks.length === 0 && emptyPlaceholder && (
        <div 
          className="flex items-center justify-start text-[15px] text-muted-foreground/50 cursor-text min-h-[40px] hover:bg-muted/10 transition-colors rounded-lg w-full"
          onClick={() => onAddBrick('text')}
        >
          {emptyPlaceholder}
        </div>
      )}

      {canEdit && !emptyPlaceholder && (!hasExternalDndContext || bricks.length === 0) && (
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
          {enabledKinds.includes('database') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('database')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <LayoutGrid className="w-3.5 h-3.5 text-accent" /> Base de Datos
            </Button>
          )}          {enabledKinds.includes('database') && (
            <Button variant="ghost" size="sm" onClick={() => onAddBrick('database')} className="gap-2 text-[11px] font-bold tracking-tight uppercase">
              <LayoutGrid className="w-3.5 h-3.5 text-accent" /> Base de Datos
            </Button>
          )}          {enabledKinds.includes('graph') && (
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
            className="fixed z-[150] flex flex-row overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{ 
              top: plusMenuState.top, 
              left: plusMenuState.left,
              maxWidth: slashCommands[plusMenuHoverIndex]?.preview ? '600px' : '320px',
              minWidth: '320px'
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing immediately
          >
            <div className="flex-1 w-[320px] flex flex-col border-r border-border/50">
              <div className="max-h-72 overflow-y-auto p-1.5 flex-1">
                {slashCommands.map((command, index) => {
                  const CategoryHeader = () => {
                    if (index === 0 || command.category !== slashCommands[index - 1].category) {
                      const catLabels: Record<string, string> = {
                        basic: "Bloques básicos",
                        media: "Contenido multimedia",
                        advanced: "Avanzado",
                        inline: "Integraciones"
                      };
                      const catName = command.category ? (catLabels[command.category] || command.category) : "Otros";
                      return (
                        <div className="px-2 pt-3 pb-1">
                          <span className="text-xs font-semibold text-muted-foreground">{catName}</span>
                        </div>
                      );
                    }
                    return null;
                  };

                  return (
                    <React.Fragment key={command.id}>
                      <CategoryHeader />
                      <button
                        type="button"
                        onMouseEnter={() => setPlusMenuHoverIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={() => handleApplyPlusCommand(command, plusMenuState.brickId)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                          index === plusMenuHoverIndex ? "bg-accent/80 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background shadow-sm text-foreground">
                          {command.icon}
                        </div>
                        <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                          <span className="text-sm font-medium text-foreground">{command.label}</span>
                          <span className="truncate text-xs text-muted-foreground/80 w-full">{command.description}</span>
                        </div>
                        {command.shortcut && (
                          <div className="ml-auto text-xs text-muted-foreground/60">{command.shortcut}</div>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            {slashCommands[plusMenuHoverIndex]?.preview && (
              <div className="hidden sm:flex w-[280px] bg-muted/10 flex-col">
                <div className="p-4 flex-1">
                   {slashCommands[plusMenuHoverIndex].preview}
                </div>
                <div className="p-4 mt-auto border-t border-border/50 bg-muted/5 text-xs text-muted-foreground">
                   {slashCommands[plusMenuHoverIndex].description}
                </div>
              </div>
            )}
          </div>
        </Portal>
      )}

      {pickerState?.isOpen && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            folders={folders}
            users={users}
            activeBricks={activeBricks || []}
            onClose={() => setPickerState(null)}
            allowedTypes={pickerState.filter as any}
            onSelect={(item: ReferencePickerSelection) => {
              const targetBrick = bricks.find(b => b.id === pickerState.triggerBrickId);
              if (targetBrick && targetBrick.kind === "text") {
                const currentText = targetBrick.content?.text || targetBrick.markdown || "";
                const newText = currentText ? `${currentText} ${item.token}` : item.token;
                onUpdateBrick(targetBrick.id, { ...targetBrick.content, text: newText, markdown: newText });
              } else {
                  onAddBrick("text", pickerState.triggerBrickId, undefined, { text: item.token, markdown: item.token });
              }
              setPickerState(null);
            }}
          />
        </Portal>
      )}
    </div>
  );
};
