"use client";

import React from "react";
import { CheckSquare, Square, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChecklistBrickProps {
  id: string;
  items: { id: string; label: string; checked: boolean }[];
  onUpdate: (newItems: any[]) => void;
  readonly?: boolean;
}

export const UnifiedChecklistBrick: React.FC<ChecklistBrickProps> = ({ id, items = [], onUpdate, readonly }) => {
  const handleItemUpdate = (idx: number, data: any) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], ...data };
    onUpdate(newItems);
  };

  const addItem = (idx?: number) => {
    const newItem = { id: crypto.randomUUID(), label: "", checked: false };
    const newItems = [...items];
    if (idx !== undefined) {
      newItems.splice(idx + 1, 0, newItem);
    } else {
      newItems.push(newItem);
    }
    onUpdate(newItems);
  };

  const removeItem = (idx: number) => {
    onUpdate(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full py-1 space-y-0.5">
      {items.map((item, idx) => (
        <div key={item.id || idx} className="flex items-start gap-2 group/check py-0.5 px-1 hover:bg-muted/5 rounded-md transition-colors">
          <div className="mt-1 opacity-0 group-hover/check:opacity-30 cursor-grab active:cursor-grabbing transition-opacity">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          
          <button
            onClick={() => !readonly && handleItemUpdate(idx, { checked: !item.checked })}
            className={`mt-1.5 transition-all transform active:scale-90 ${item.checked ? 'text-accent' : 'text-muted-foreground/40 hover:text-muted-foreground/70'}`}
          >
            {item.checked ? <CheckSquare className="w-4 h-4 fill-accent/10" strokeWidth={2.5}/> : <Square className="w-4 h-4" strokeWidth={2}/>}
          </button>

          <input
            className={`flex-1 bg-transparent border-none outline-none focus:ring-0 p-1 text-sm leading-relaxed transition-all placeholder:text-muted-foreground/20 ${item.checked ? 'line-through text-muted-foreground opacity-50' : 'text-foreground'}`}
            value={item.label}
            placeholder="Añadir algo para hacer..."
            disabled={readonly}
            onChange={(e) => handleItemUpdate(idx, { label: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem(idx);
              } else if (e.key === 'Backspace' && !item.label && items.length > 1) {
                e.preventDefault();
                removeItem(idx);
              }
            }}
          />

          {!readonly && (
            <button 
              onClick={() => removeItem(idx)}
              className="mt-1 p-1 opacity-0 group-hover/check:opacity-100 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      
      {!readonly && (
        <button 
          onClick={() => addItem()}
          className="ml-6 flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-accent font-medium py-2 px-1 transition-colors"
        >
          <Plus className="w-3 h-3" /> Añadir tarea...
        </button>
      )}
    </div>
  );
};
