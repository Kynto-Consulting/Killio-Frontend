"use client";

import React, { useMemo } from "react";

import { UnifiedCalloutBrick } from "@/components/bricks/unified-callout-brick";
import { UnifiedTextBrick } from "@/components/bricks/unified-text-brick";
import { splitDocumentationBricks } from "@/lib/marketplace/doc-bricks";

const NOOP = () => undefined;

/**
 * Read-only render of pack descriptions/documentation with the SAME components Killio documents use for `text` and
 * `callout` bricks (Markdown + [color:]/[size:]/[bg:]/[t:]/@[..] tokens + LaTeX). Authors write in the format they
 * already know. See lib/marketplace/doc-bricks.ts for how the text is split and how this would evolve into a real
 * "description as a document of bricks".
 */
export function PackDocument({ text, idPrefix }: { text: string | null | undefined; idPrefix: string }) {
  const bricks = useMemo(() => splitDocumentationBricks(text, idPrefix), [text, idPrefix]);
  if (bricks.length === 0) return null;
  return (
    <div className="space-y-1 break-words [overflow-wrap:anywhere]">
      {bricks.map((brick) => {
        const common = { id: brick.id, text: brick.text, onUpdate: NOOP, readonly: true, documents: [], boards: [], activeBricks: [] };
        return brick.kind === "callout" ? <UnifiedCalloutBrick key={brick.id} {...common} /> : <UnifiedTextBrick key={brick.id} {...common} />;
      })}
    </div>
  );
}
