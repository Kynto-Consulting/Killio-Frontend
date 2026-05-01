"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";

export interface SortableBrickProps {
  id: string;
  children: React.ReactNode;
  readonly?: boolean;
  onDelete?: () => void;
  onAddBelow?: (rect: DOMRect) => void;
  isCompact?: boolean;
  containerToken?: string;
}

export function SortableBrickWeb({ id, children, readonly, onDelete, onAddBelow, isCompact, containerToken }: SortableBrickProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data: { containerToken } });

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
      data-brick-id={id}
      style={style}
      onMouseDown={handleMouseDown}
      className={`group/sortable relative flex items-start gap-1 rounded-lg p-1.5 transition-colors ${
        isDragging ? "bg-accent/10 ring-2 ring-accent/40" : "hover:bg-accent/5"
      }`}
    >
      {!readonly && (
        <div className={`absolute ${isCompact ? "-left-8" : "-left-16"} flex flex-row items-center justify-end px-1 shrink-0 opacity-0 group-hover/sortable:opacity-100 transition-opacity gap-0.5 z-20 top-1.5`}>
          {!isCompact && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddBelow?.(e.currentTarget.getBoundingClientRect());
              }}
              className="p-1 text-muted-foreground/40 hover:text-foreground rounded cursor-pointer transition-colors"
              title={"Click to add below"}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <div
            {...attributes}
            {...listeners}
            className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground hover:bg-muted rounded transition-colors"
            title={"Drag to move"}
          >
            <GripVertical className="w-4 h-4" />
          </div>
          {!readonly && !isCompact && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-muted-foreground/40 hover:text-destructive cursor-pointer rounded transition-colors"
              title="Delete block"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
