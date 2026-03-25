"use client";

import React from "react";
import { CheckSquare, Square, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Portal } from "../ui/portal";
import { ReferencePicker } from "../documents/reference-picker";
import { ReferenceResolver } from "@/lib/reference-resolver";

interface ChecklistBrickProps {
  id: string;
  items: { id: string; label: string; checked: boolean }[];
  onUpdate: (newItems: any[]) => void;
  readonly?: boolean;
  documents?: any[];
  boards?: any[];
  users?: any[];
}

export const UnifiedChecklistBrick: React.FC<ChecklistBrickProps> = ({ id, items = [], onUpdate, readonly, documents = [], boards = [], users = [] }) => {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [pickerTarget, setPickerTarget] = React.useState<number | null>(null);

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
            <input
              className={`w-full bg-transparent border-none outline-none focus:ring-0 p-1 text-sm leading-relaxed transition-all placeholder:text-muted-foreground/20 ${item.checked ? 'line-through text-muted-foreground opacity-50' : 'text-foreground'}`}
              value={item.label}
              placeholder="Añadir algo para hacer..."
              disabled={readonly}
              onChange={(e) => {
                const val = e.target.value;
                handleItemUpdate(idx, { label: val });
                if (val.endsWith("@")) {
                  setPickerTarget(idx);
                  setIsPickerOpen(true);
                }
              }}
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


      {isPickerOpen && pickerTarget !== null && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            users={users}
            onClose={() => {
              setIsPickerOpen(false);
              setPickerTarget(null);
            }}
            onSelect={(selected) => {
              const currentLabel = items[pickerTarget].label;
              const newVal = currentLabel.substring(0, currentLabel.lastIndexOf("@")) + ` @[${selected.type}:${selected.id}:${selected.name}] `;
              handleItemUpdate(pickerTarget, { label: newVal });
              setIsPickerOpen(false);
              setPickerTarget(null);
            }}
          />
        </Portal>
      )}
    </div>
  );
};
