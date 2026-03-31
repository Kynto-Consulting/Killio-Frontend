"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { UnifiedTextBrick } from "./unified-text-brick";
import { UnifiedBrickList } from "./unified-brick-list";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { ReferenceTokenInput } from "../ui/reference-token-input";

interface AccordionBrickProps {
  id: string;
  title: string;
  body?: string;
  isExpanded: boolean;
  onUpdate: (data: any) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: any[];
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: { parentId: string, containerId: string }) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
}

export const UnifiedAccordionBrick: React.FC<AccordionBrickProps> = ({
  id, title, body, isExpanded, onUpdate, readonly, documents, boards, activeBricks, users = [], onAddBrick, onDeleteBrick, onUpdateBrick, onReorderBricks
}) => {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);

  useEffect(() => {
    setLocalExpanded(isExpanded);
  }, [isExpanded]);

  const nestedBricks = activeBricks.filter((b: any) => b.content?.parentId === id && b.content?.containerId === "body").sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

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
          <div className="flex-1 relative" onClick={(e) => e.stopPropagation()}>
            <ReferenceTokenInput
              value={title}
              onChange={(val) => onUpdate({ title: val })}
              placeholder="Título del acordeón..."
              documents={documents}
              boards={boards}
              users={users as any}
              submitOnEnter={false}
              className="w-full"
              inputClassName="border-none bg-transparent p-0 shadow-none min-h-[28px] text-sm font-semibold placeholder:text-muted-foreground/30 leading-none"
            />
          </div>
        )}
      </div>

      <div className={`transition-all duration-300 ease-in-out ${localExpanded ? 'opacity-100 mb-4' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="pl-9 pr-2 py-1 border-l-2 border-accent/20 ml-2.5 min-h-[50px]">
          {(nestedBricks.length > 0 || !body || !readonly) ? (
            <UnifiedBrickList
              hasExternalDndContext={true}
              bricks={nestedBricks}
              canEdit={!readonly}
              onUpdateBrick={(bId, content) => onUpdateBrick?.(bId, content)}
              onDeleteBrick={(bId) => onDeleteBrick?.(bId)}
              onReorderBricks={(ids) => onReorderBricks?.(ids)}
              onAddBrick={(k, aId) => onAddBrick?.(k, aId, { parentId: id, containerId: "body" })}
              documents={documents}
              boards={boards}
              users={users}
            />
          ) : (
            <UnifiedTextBrick
              id={`${id}-body`}
              text={body}
              onUpdate={(val) => onUpdate({ body: val })}
              readonly={readonly}
              documents={documents}
              boards={boards}
              activeBricks={activeBricks}
              users={users as any}
            />
          )}
        </div>
      </div>
    </div>
  );
};
