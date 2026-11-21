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
    <div
      className={[
        "space-y-1 break-words [overflow-wrap:anywhere] text-foreground",
        // The brick renderer fades h2/h3 and body to 80-90% for editing screens; on a product page everything reads at full
        // contrast and a bit tighter so it matches the rest of the page.
        "[&_h1]:!text-foreground [&_h2]:!text-foreground [&_h3]:!text-foreground [&_p]:!text-foreground [&_li]:!text-foreground",
        "[&_h1]:!mt-4 [&_h1]:!mb-2 [&_h1]:!text-2xl [&_h2]:!mt-4 [&_h2]:!mb-2 [&_h2]:!text-xl [&_h3]:!mt-3 [&_h3]:!mb-1.5 [&_h3]:!text-lg",
      ].join(" ")}
    >
      {bricks.map((brick) => {
        const common = { id: brick.id, text: brick.text, onUpdate: NOOP, readonly: true, documents: [], boards: [], activeBricks: [] };
        return brick.kind === "callout" ? <UnifiedCalloutBrick key={brick.id} {...common} /> : <UnifiedTextBrick key={brick.id} {...common} />;
      })}
    </div>
  );
}
