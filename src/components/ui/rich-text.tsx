import React, { Fragment, ReactNode } from "react";
import { ReferenceResolver, ResolverContext } from "@/lib/reference-resolver";
import { RefPill } from "./ref-pill";
import { TagBadge } from "./tag-badge";
import { AiSuggestion } from "./ai-suggestion";

interface RichTextProps {
  content: string;
  context: ResolverContext;
  availableTags?: any[];
  className?: string;
  onReferenceClick?: (type: string, id: string) => void;
  onSuggestionApply?: () => void;
}

/**
 * Enhanced unified component to render text with:
 * 1. Platform references (@, #, $)
 * 2. Inline Markdown (Bold, Tag Slugs)
 * 3. AI Suggestions ([SUGGESTION:TYPE]...[/SUGGESTION])
 */
export function RichText({ 
  content, 
  context, 
  availableTags = [], 
  className, 
  onReferenceClick,
  onSuggestionApply 
}: RichTextProps) {
  if (!content) return null;

  // Handle [SUGGESTION:TYPE] tags first (block level)
  if (content.includes("[SUGGESTION:")) {
    const parts = content.split(/(\[SUGGESTION:.*?\][\s\S]*?\[\/SUGGESTION\])/g);
    return (
      <div className={className}>
        {parts.map((part, partIdx) => {
          const match = part.match(/\[SUGGESTION:(.*?)\]\n?([\s\S]*?)\n?\[\/SUGGESTION\]/);
          if (match) {
            const [, type, jsonContent] = match;
            try {
              const data = JSON.parse(jsonContent);
              return (
                <AiSuggestion
                  key={partIdx}
                  type={type as any}
                  id={data.id}
                  payload={data.payload}
                  explanation={data.explanation}
                  onApply={() => onSuggestionApply?.()}
                  onReject={() => {}}
                />
              );
            } catch (e) {
              return <div key={partIdx} className="text-xs text-rose-500 italic px-2 py-1">Error al procesar sugerencia IA (JSON)</div>;
            }
          }
          return (
            <RichText 
              key={partIdx} 
              content={part} 
              context={context} 
              availableTags={availableTags} 
              onReferenceClick={onReferenceClick} 
            />
          );
        })}
      </div>
    );
  }

  const lines = content.split(/\r?\n/);

  return (
    <div className={className}>
      {lines.map((line, lineIdx) => {
        const parts = ReferenceResolver.renderRich(line, context);
        
        return (
          <Fragment key={lineIdx}>
            {parts.map((part, partIdx) => {
              if (typeof part === "string") {
                return <Fragment key={partIdx}>{renderInlineMarkdown(part, availableTags)}</Fragment>;
              }

              if (part.type === "mention") {
                return (
                  <RefPill
                    key={partIdx}
                    type={part.mentionType}
                    id={part.id}
                    name={part.name}
                    onClick={() => onReferenceClick?.(part.mentionType, part.id)}
                  />
                );
              }

              if (part.type === "deep") {
                return (
                  <RefPill
                    key={partIdx}
                    type="deep"
                    id={part.inner?.split(":")[0] || part.id}
                    name={part.label}
                    prefix={part.prefix}
                    onClick={() => onReferenceClick?.("deep", part.inner || part.id)}
                  />
                );
              }

              return null;
            })}
            {lineIdx < lines.length - 1 && <br />}
          </Fragment>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string, availableTags: any[]): ReactNode {
  // First, parse **bold**
  const chunks = text.split(/(\*\*[^*]+\*\*)/g);

  return chunks.map((chunk, index) => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return <strong key={`bold-${index}`}>{chunk.slice(2, -2)}</strong>;
    }

    // Parse tag slugs within non-bold text
    const tagChunks = chunk.split(/(tag\.(?:native|custom)\.[a-zA-Z0-9.\-]+)/g);

    return (
      <Fragment key={`text-${index}`}>
        {tagChunks.map((tc, tcIdx) => {
          if (tc.startsWith("tag.native.") || tc.startsWith("tag.custom.")) {
            const matchedTag = availableTags.find((t: any) => t.name === tc || t.slug === tc);
            const tagObj = matchedTag || { name: tc, slug: tc };
            return (
              <span key={`tag-${tcIdx}`} className="inline-block align-middle mx-1">
                <TagBadge tag={tagObj} />
              </span>
            );
          }
          return <Fragment key={`frag-${tcIdx}`}>{tc}</Fragment>;
        })}
      </Fragment>
    );
  });
}
