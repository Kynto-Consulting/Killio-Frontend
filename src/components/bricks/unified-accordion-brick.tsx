"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { UnifiedTextBrick } from "./unified-text-brick";
import { UnifiedBrickList } from "./unified-brick-list";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { ReferenceTokenInput } from "../ui/reference-token-input";
import { resolveNestedBricks } from "@/lib/bricks/nesting";

interface AccordionBrickProps {
  id: string;
  title: string;
  body?: string;
  isExpanded: boolean;
  childrenByContainer?: Record<string, string[]>;
  onUpdate: (data: any) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: any[];
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: { parentId: string, containerId: string }, initialContent?: any) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
  onCrossContainerDrop?: (activeId: string, overId: string) => void;
}

export const UnifiedAccordionBrick: React.FC<AccordionBrickProps> = ({
  id, title, body, isExpanded, childrenByContainer, onUpdate, readonly, documents, boards, activeBricks, users = [], onAddBrick, onDeleteBrick, onUpdateBrick, onReorderBricks, onCrossContainerDrop
}) => {
  const t = useTranslations("document-detail");
  const [localExpanded, setLocalExpanded] = useState(isExpanded);

  useEffect(() => {
    setLocalExpanded(isExpanded);
  }, [isExpanded]);

  const resolvedNestedBricks = resolveNestedBricks({ childrenByContainer: childrenByContainer || {} }, "body", activeBricks as any[]) as any[];

  const toggle = () => {
    const newVal = !localExpanded;
    setLocalExpanded(newVal);
    onUpdate({ isExpanded: newVal });
  };

  return (
    <div className="w-full border-b border-border/40 last:border-0 transition-all duration-300">
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
          {(resolvedNestedBricks.length > 0 || !body || !readonly) ? (
            <UnifiedBrickList
              hasExternalDndContext={true}
              dropContainerToken={`${id}:body`}
              bricks={resolvedNestedBricks} activeBricks={activeBricks}
              canEdit={!readonly}
              emptyPlaceholder={t("bricks.accordion.empty")}
              onUpdateBrick={(bId, content) => onUpdateBrick?.(bId, content)}
              onDeleteBrick={(bId) => onDeleteBrick?.(bId)}
              onReorderBricks={(ids) => onReorderBricks?.(ids)}
              onAddBrick={(k, aId, parentProps, initialContent) => onAddBrick?.(k, aId, parentProps || { parentId: id, containerId: "body" }, initialContent)}
              onCrossContainerDrop={onCrossContainerDrop}
              addableKinds={['text', 'table', 'graph', 'checklist', 'accordion', 'tabs', 'columns', 'image']}
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
