"use client";

import React from "react";
import { Lightbulb } from "lucide-react";
import { UnifiedTextBrick } from "./unified-text-brick";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";

interface CalloutBrickProps {
  id: string;
  text: string;
  onUpdate: (text: string) => void;
  onAddBrick?: (kind: string) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

export const UnifiedCalloutBrick: React.FC<CalloutBrickProps> = (props) => {
  return (
    <div className="flex gap-3 p-4 my-4 rounded-md border bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 text-blue-900 dark:text-blue-200">
      <div className="mt-0.5" contentEditable={false}>
        <Lightbulb className="w-5 h-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 w-full min-w-0">
        <UnifiedTextBrick {...props} />
      </div>
    </div>
  );
};
