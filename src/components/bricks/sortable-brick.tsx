"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";

interface SortableBrickProps {
  id: string;
  children: React.ReactNode;
  readonly?: boolean;
  onDelete?: () => void;
  onAddBelow?: () => void;
}

export function SortableBrick({ id, children, readonly, onDelete, onAddBelow }: SortableBrickProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Forward clicks in the sortable wrapper padding area to the inner contenteditable
    const target = e.target as HTMLElement;
    if (!target.closest('[contenteditable]') && !target.closest('[data-drag-handle]') && !target.closest('button') && !target.closest('input') && !target.closest('.no-drag-focus')) {
      const ce = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[contenteditable="true"]');
      if (ce && document.activeElement !== ce) {
        e.preventDefault();
        ce.focus();
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseDown={handleMouseDown}
      className={`group relative flex items-start gap-1 rounded-lg p-1.5 transition-colors ${
        isDragging ? "bg-accent/10 ring-2 ring-accent/40" : "hover:bg-accent/5"
      }`}
    >
      {!readonly && (
        <div className="mt-1.5 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddBelow?.();
            }}
            className="p-1 text-muted-foreground/40 hover:text-foreground rounded cursor-pointer transition-colors"
            title={"Haz clic para añadir debajo\nPulsa Alt y haz clic para añadir un bloque arriba"}
          >
            <Plus className="w-4 h-4" />
          </button>
          <div
            {...attributes}
            {...listeners}
            className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground hover:bg-muted rounded transition-colors"
            title={"Arrastra para mover\nHaz clic o pulsa ctrl/ para abrir el menú."}
          >
            <GripVertical className="w-4 h-4" />
          </div>
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        {children}
      </div>

      {!readonly && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="mt-2 p-1 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded"
          title="Delete block"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
