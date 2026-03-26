"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";

interface SortableBrickProps {
  id: string;
  children: React.ReactNode;
  readonly?: boolean;
  onDelete?: () => void;
}

export function SortableBrick({ id, children, readonly, onDelete }: SortableBrickProps) {
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
    if (!target.closest('[contenteditable]') && !target.closest('[data-drag-handle]')) {
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
        <div
          {...attributes}
          {...listeners}
          className="mt-2 p-1 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-accent opacity-0 group-hover:opacity-100 transition-all rounded"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
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
