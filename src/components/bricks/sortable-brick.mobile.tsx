"use client";

import React, { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus, MoreHorizontal } from "lucide-react";
import { SortableBrickProps } from "./sortable-brick.web";

export function SortableBrickMobile({ id, children, readonly, onDelete, onAddBelow, isCompact }: SortableBrickProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [isActionSheetOpen, setActionSheetOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col gap-1 rounded-lg p-2 my-1 transition-colors ${
        isDragging ? "bg-accent/10 ring-2 ring-accent/40" : "bg-neutral-900 shadow-sm"
      }`}
    >
      <div className="flex-1 min-w-0 pb-1">
        {children}
      </div>

      {/* Mobile-friendly action bar mounted at the bottom of the brick instead of a floating left handle */}
      {!readonly && !isCompact && (
        <div className="flex border-t border-white/5 pt-1.5 mt-1 text-muted-foreground justify-between items-center px-1">
           <div
            {...attributes}
            {...listeners}
            className="p-2 touch-none cursor-grab active:cursor-grabbing hover:text-foreground hover:bg-white/10 rounded-md transition-colors"
          >
            <GripVertical className="w-5 h-5 text-neutral-400" />
          </div>

          <div className="flex gap-2">
            <button
               type="button"
               onClick={(e) => {
                 e.stopPropagation();
                 onAddBelow?.(e.currentTarget.getBoundingClientRect());
               }}
               className="p-2 text-neutral-400 hover:text-foreground bg-white/5 rounded-md cursor-pointer"
             >
               <Plus className="w-5 h-5" />
             </button>
             
             {onDelete && (
                <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-2 text-neutral-400 hover:text-red-500 bg-white/5 rounded-md cursor-pointer"
              >
                <Trash2 className="w-5 h-5" />
              </button>
             )}
          </div>
        </div>
      )}
    </div>
  );
}
