"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import React from "react";
import { CheckSquare, Square, Plus, Trash2, GripVertical } from "lucide-react";
import { UnifiedTextBrick } from "./unified-text-brick";
import { WorkspaceMemberLike } from "@/lib/workspace-members";

interface ChecklistBrickProps {
  id: string;
  items: { id: string; label: string; checked: boolean }[];
  onUpdate: (newItems: any[]) => void;
  readonly?: boolean;
  documents?: any[];
  boards?: any[];
  users?: WorkspaceMemberLike[];
}

export const UnifiedChecklistBrick: React.FC<ChecklistBrickProps> = ({ id: _id, items = [], onUpdate, readonly, documents = [], boards = [], users = [] }) => {
  const t = useTranslations("document-detail");
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
          {t("checklist.addFirstItem")}
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

          {/* Rich item text — same editor as text bricks (markdown, styles,
              lucide, format toolbar, experimental mode). The capture handler
              preserves checklist UX: Enter = new item, Backspace-on-empty =
              delete, while Shift+Enter still inserts a newline. */}
          <div
            className={`flex-1 relative min-w-0 ${item.checked ? 'line-through text-muted-foreground opacity-50' : ''}`}
            onKeyDownCapture={(e) => {
              if (readonly) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); e.stopPropagation(); addItem(idx);
              } else if (e.key === 'Backspace' && !(item.label || '').trim() && items.length > 1) {
                e.preventDefault(); e.stopPropagation(); removeItem(idx);
              }
            }}
          >
            <UnifiedTextBrick
              id={`${_id}-item-${item.id || idx}`}
              text={item.label || ''}
              onUpdate={(val) => handleItemUpdate(idx, { label: val })}
              readonly={readonly}
              documents={documents as any}
              boards={boards as any}
              activeBricks={[]}
              users={users}
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


      {!readonly && (
        <button
          onClick={() => addItem(items.length - 1)}
          className="ml-8 mt-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("checklist.addItem")}
        </button>
      )}
    </div>
  );
};
