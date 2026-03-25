"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { UnifiedTextBrick } from "./unified-text-brick";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { Portal } from "../ui/portal";
import { ReferencePicker } from "../documents/reference-picker";
import { Fragment } from "react";

interface AccordionBrickProps {
  id: string;
  title: string;
  body: string;
  isExpanded: boolean;
  onUpdate: (data: any) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: any[];
}

export const UnifiedAccordionBrick: React.FC<AccordionBrickProps> = ({
  id, title, body, isExpanded, onUpdate, readonly, documents, boards, activeBricks, users = []
}) => {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const toggle = () => {
    const newVal = !localExpanded;
    setLocalExpanded(newVal);
    onUpdate({ isExpanded: newVal });
  };

  return (
    <div className="w-full border-b border-border/40 last:border-0 overflow-hidden transition-all duration-300">
      <div
        className="flex items-center gap-2 py-3 px-1 group/acc cursor-pointer hover:bg-muted/5 rounded-lg transition-colors"
        onClick={toggle}
      >
        <div className={`p-1 rounded-md transition-all ${localExpanded ? 'rotate-0 text-accent bg-accent/10' : '-rotate-90 text-muted-foreground group-hover/acc:text-foreground'}`}>
          <ChevronDown className="w-4 h-4" />
        </div>

        {readonly ? (
          <span className="text-sm font-semibold tracking-tight">{title || 'Toggle Item'}</span>
        ) : (
          <div className="flex-1 relative">
            <input
              className="w-full bg-transparent border-none outline-none focus:ring-0 p-0 text-sm font-semibold placeholder:text-muted-foreground/30 leading-none"
              value={title}
              placeholder="Título del acordeón..."
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const val = e.target.value;
                onUpdate({ title: val });
                if (val.endsWith("@")) setIsPickerOpen(true);
              }}
            />
          </div>
        )}
      </div>

      <div className={`transition-all duration-300 ease-in-out ${localExpanded ? 'max-h-[1000px] opacity-100 mb-4' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="pl-9 pr-2 py-1 border-l-2 border-accent/20 ml-2.5">
          <UnifiedTextBrick
            id={`${id}-body`}
            text={body}
            onUpdate={(val) => onUpdate({ body: val })}
            readonly={readonly}
            documents={documents}
            boards={boards}
            activeBricks={activeBricks}
          />
        </div>
      </div>

      {isPickerOpen && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            users={users as any}
            onClose={() => setIsPickerOpen(false)}
            onSelect={(item) => {
              const newVal = title.substring(0, title.lastIndexOf("@")) + ` @[${item.type}:${item.id}:${item.name}] `;
              onUpdate({ title: newVal });
              setIsPickerOpen(false);
            }}
          />
        </Portal>
      )}
    </div>
  );
};
