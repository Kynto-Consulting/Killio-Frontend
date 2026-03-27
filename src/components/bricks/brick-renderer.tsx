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
  onPasteImageInTextBrick?: (payload: { brickId: string; file: File; cursorOffset: number; markdown: string }) => Promise<void> | void;
}

export function UnifiedBrickRenderer({
  brick,
  canEdit,
  onUpdate,
  documents = [],
  boards = [],
  activeBricks = [],
  users = [],
  onPasteImageInTextBrick
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
          onPasteImage={(payload) => onPasteImageInTextBrick?.({ ...payload, brickId: brick.id })}
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
          activeBricks={activeBricks}
        />
      );

    case 'graph':
      return (
        <UnifiedGraphBrick
          id={brick.id}
          config={content as any}
          onUpdate={(newConfig) => onUpdate({ ...content, ...newConfig })}
          readonly={!canEdit}
          activeBricks={activeBricks as any[]}
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

    case 'media':
    case 'image':
    case 'file': {
      const mediaType = kind === 'media' ? (content.mediaType || 'image') : kind;
      const url = content.url || '';
      const title = content.title || (mediaType === 'image' ? 'Imagen' : 'Archivo');
      const caption = content.caption;
      return (
        <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 p-3">
          {canEdit ? (
            <div className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-3">
              <input
                value={title}
                onChange={(event) => onUpdate({ ...content, title: event.target.value })}
                placeholder="Título"
                className="h-8 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                value={url}
                onChange={(event) => onUpdate({ ...content, url: event.target.value })}
                placeholder="https://..."
                className="h-8 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <textarea
                value={caption || ''}
                onChange={(event) => onUpdate({ ...content, caption: event.target.value })}
                placeholder="Caption"
                rows={2}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-y"
              />
            </div>
          ) : null}
          {mediaType === 'image' && url ? (
            <img src={url} alt={title} className="max-h-[520px] w-full rounded-md border border-border/50 object-contain" />
          ) : (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent hover:underline">
                  Abrir archivo
                </a>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Sin URL de archivo.</p>
              )}
            </div>
          )}
          {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
        </div>
      );
    }

    // Add other cases as they are implemented...

    default:
      return (
        <div className="p-4 border border-border/50 rounded bg-muted/20 text-muted-foreground italic text-sm">
          Unsupported block type: {kind}
        </div>
      );
  }
}
