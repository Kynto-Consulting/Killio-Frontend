"use client";

import React from "react";
import { CheckSquare, Square, Plus, Trash2, GripVertical } from "lucide-react";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { ReferenceTokenInput } from "../ui/reference-token-input";

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
    const docIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
    const boardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

    const richParts = ReferenceResolver.renderRich(content, { documents, boards, users } as any);
    return richParts.map((part, i) => {
      if (typeof part === 'string') return part;

      const isUser = part.mentionType === 'user';
      if (part.type === 'mention') {
        return (
          <span key={i} className={`inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium border ${isUser ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-accent/10 border-accent/20 text-accent'
            }`}>
            {part.mentionType === 'doc' && <span dangerouslySetInnerHTML={{ __html: docIcon }} />}
            {part.mentionType === 'board' && <span dangerouslySetInnerHTML={{ __html: boardIcon }} />}
            {isUser && "@"}
            {part.name}
          </span>
        );
      }

      if (part.type === 'deep') {
        return (
          <span key={i} className="inline-flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium border bg-amber-500/10 border-amber-500/20 text-amber-600">
            {part.label}
          </span>
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
