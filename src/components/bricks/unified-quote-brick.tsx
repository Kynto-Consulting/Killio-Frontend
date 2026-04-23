"use client";

import React from "react";
import { UnifiedTextBrick } from "./unified-text-brick";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { WorkspaceMemberLike } from "@/lib/workspace-members";

interface QuoteBrickProps {
  id: string;
  text: string;
  onUpdate: (text: string) => void;
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: any, initialContent?: any) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: WorkspaceMemberLike[];
}

export const UnifiedQuoteBrick: React.FC<QuoteBrickProps> = (props) => {
  return (
    <blockquote className="border-l-4 border-l-primary pl-4 py-1 my-2 italic text-muted-foreground bg-muted/20 rounded-r-md">
      <UnifiedTextBrick {...props} />
    </blockquote>
  );
};
