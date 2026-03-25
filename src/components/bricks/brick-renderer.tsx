"use client";

import React from "react";
import { UnifiedTableBrick } from "./unified-table-brick";
import { UnifiedTextBrick } from "./unified-text-brick";
import { UnifiedGraphBrick } from "./unified-graph-brick";
import { UnifiedChecklistBrick } from "./unified-checklist-brick";
import { UnifiedAccordionBrick } from "./unified-accordion-brick";
import { DocumentBrick, DocumentSummary } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";

interface BrickRendererProps {
  brick: DocumentBrick;
  canEdit: boolean;
  onUpdate: (content: any) => void;
  documents?: DocumentSummary[];
  boards?: BoardSummary[];
  activeBricks?: DocumentBrick[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

export function UnifiedBrickRenderer({
  brick,
  canEdit,
  onUpdate,
  documents = [],
  boards = [],
  activeBricks = [],
  users = []
}: BrickRendererProps) {
  const { kind, content } = brick;

  switch (kind) {
    case 'text':
      return (
        <UnifiedTextBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
          onUpdate={(text: any) => onUpdate({ ...content, text, markdown: text })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
        />
      );

    case 'table':
      return (
        <UnifiedTableBrick
          id={brick.id}
          data={content.rows || [['Header 1', 'Header 2'], ['', '']]}
          onUpdate={(rows) => onUpdate({ ...content, rows })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          users={users}
        />
      );

    case 'graph':
      return (
        <UnifiedGraphBrick
          id={brick.id}
          config={content as any}
          onUpdate={(newConfig) => onUpdate({ ...content, ...newConfig })}
          readonly={!canEdit}
        />
      );

    case 'checklist':
      return (
        <UnifiedChecklistBrick
          id={brick.id}
          items={content.items || []}
          onUpdate={(items) => onUpdate({ ...content, items })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          users={users}
        />
      );

    case 'accordion':
      return (
        <UnifiedAccordionBrick
          id={brick.id}
          title={content.title || ""}
          body={content.body || ""}
          isExpanded={!!content.isExpanded}
          onUpdate={(data) => onUpdate({ ...content, ...data })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
        />
      );

    // Add other cases as they are implemented...

    default:
      return (
        <div className="p-4 border border-border/50 rounded bg-muted/20 text-muted-foreground italic text-sm">
          Unsupported block type: {kind}
        </div>
      );
  }
}
