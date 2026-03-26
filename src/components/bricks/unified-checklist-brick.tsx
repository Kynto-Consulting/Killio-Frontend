"use client";

import React from "react";
import { CheckSquare, Square, Plus, Trash2, GripVertical } from "lucide-react";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { ReferenceTokenInput } from "../ui/reference-token-input";
import { RefPill } from "../ui/ref-pill";

interface ChecklistBrickProps {
  id: string;
  items: { id: string; label: string; checked: boolean }[];
  onUpdate: (newItems: any[]) => void;
  readonly?: boolean;
  documents?: any[];
  boards?: any[];
  users?: any[];
}

export const UnifiedChecklistBrick: React.FC<ChecklistBrickProps> = ({ id: _id, items = [], onUpdate, readonly, documents = [], boards = [], users = [] }) => {

  const renderLabelWithMentions = (content: string) => {
    const richParts = ReferenceResolver.renderRich(content, { documents, boards, users } as any);
    return richParts.map((part, i) => {
      if (typeof part === 'string') return part;

      if (part.type === 'mention') {
        const mentionType = part.mentionType as 'doc' | 'board' | 'card' | 'user';
        return (
          <RefPill key={i} type={mentionType} id={part.id} name={part.name} />
        );
      }

      if (part.type === 'deep') {
        return (
          <RefPill key={i} type="deep" id={part.inner?.split(':')[0] || ''} name={part.label} />
        );
      }
      return null;
    });
  };
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
      {items.length === 0 && !readonly && (
        <button
          onClick={() => addItem()}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/20"
        >
          <Plus className="h-4 w-4" />
          Añadir primer ítem
        </button>
      )}

      {items.map((item, idx) => (
        <div key={item.id || idx} className="flex items-start gap-2 group/check py-0.5 px-1 hover:bg-muted/5 rounded-md transition-colors">
          <div className="mt-1 opacity-0 group-hover/check:opacity-30 cursor-grab active:cursor-grabbing transition-opacity">
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          <button
            onClick={() => !readonly && handleItemUpdate(idx, { checked: !item.checked })}
            className={`mt-1.5 transition-all transform active:scale-90 ${item.checked ? 'text-accent' : 'text-muted-foreground/40 hover:text-muted-foreground/70'}`}
          >
            {item.checked ? <CheckSquare className="w-4 h-4 fill-accent/10" strokeWidth={2.5} /> : <Square className="w-4 h-4" strokeWidth={2} />}
          </button>

          <div className="flex-1 relative">
            {readonly ? (
              <div className={`w-full p-1 text-sm leading-relaxed ${item.checked ? 'line-through text-muted-foreground opacity-60' : 'text-foreground'}`}>
                {renderLabelWithMentions(item.label || "")}
              </div>
            ) : (
              <ReferenceTokenInput
                value={item.label}
                onChange={(val) => {
                  handleItemUpdate(idx, { label: val });
                }}
                onSubmit={() => addItem(idx)}
                onKeyDown={(e, currentValue) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(idx);
                  } else if (e.key === 'Backspace' && !currentValue.trim() && items.length > 1) {
                    e.preventDefault();
                    removeItem(idx);
                  }
                }}
                documents={documents}
                boards={boards}
                users={users}
                disabled={readonly}
                submitOnEnter={false}
                className="w-full"
                inputClassName={`border-none bg-transparent px-1 py-1 shadow-none min-h-[30px] ${item.checked ? 'line-through text-muted-foreground opacity-50' : 'text-foreground'}`}
                placeholder="Añadir algo para hacer..."
              />
            )}
          </div>

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
          onClick={() => addItem(items.length - 1)}
          className="ml-8 mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir ítem
        </button>
      )}
    </div>
  );
};
