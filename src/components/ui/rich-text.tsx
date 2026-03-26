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

  // Multi-line fenced code blocks need pre-splitting before line-by-line processing
  if (/```[\w]*\n[\s\S]*?```/.test(content)) {
    const parts = content.split(/(```[\w]*\n[\s\S]*?```)/g);
    return (
      <div className={className}>
        {parts.map((part, i) => {
          const cm = part.match(/^```([\w]*)\n([\s\S]*?)```$/);
          if (cm) {
            const [, lang, code] = cm;
            return (
              <pre key={i} className="my-2 rounded-lg bg-muted/60 border border-border/60 p-3 overflow-x-auto">
                {lang && <div className="text-xs text-muted-foreground/60 font-mono uppercase tracking-wider mb-2">{lang}</div>}
                <code className="text-xs font-mono text-foreground/80 whitespace-pre">{code.replace(/\n$/, "")}</code>
              </pre>
            );
          }
          if (!part) return null;
          return (
            <RichText
              key={i}
              content={part}
              context={context}
              availableTags={availableTags}
              onReferenceClick={onReferenceClick}
              onSuggestionApply={onSuggestionApply}
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
                const mentionClick = onReferenceClick
                  ? () => onReferenceClick(part.mentionType, part.id)
                  : undefined;
                return (
                  <RefPill
                    key={partIdx}
                    type={part.mentionType}
                    id={part.id}
                    name={part.name}
                    onClick={mentionClick}
                  />
                );
              }

              if (part.type === "deep") {
                if (part.isInline === false) {
                  return (
                    <div key={partIdx} className="my-2 p-3 rounded-md border border-amber-500/20 bg-amber-500/5 text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                      <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-amber-600/80 uppercase tracking-wider">
                        <span>{part.label}</span>
                      </div>
                      {typeof part.resolvedValue === 'string' ? renderInlineMarkdown(part.resolvedValue, availableTags) : JSON.stringify(part.resolvedValue, null, 2)}
                    </div>
                  );
                }
                const deepClick = onReferenceClick
                  ? () => onReferenceClick("deep", part.inner || part.id)
                  : undefined;
                return (
                  <RefPill
                    key={partIdx}
                    type="deep"
                    id={part.inner?.split(":")[0] || part.id}
                    name={part.label}
                    onClick={deepClick}
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
  // Split on inline code first (`...`)
  const segments = text.split(/(`[^`]+`)/g);

  const renderBoldTags = (t: string, keyPrefix: string) => {
    const chunks = t.split(/(\*\*[^*]+\*\*)/g);
    return chunks.map((chunk, index) => {
      if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
        return <strong key={`${keyPrefix}-bold-${index}`}>{chunk.slice(2, -2)}</strong>;
      }
      const tagChunks = chunk.split(/(tag\.(?:native|custom)\.[a-zA-Z0-9.\-]+)/g);
      return (
        <Fragment key={`${keyPrefix}-text-${index}`}>
          {tagChunks.map((tc, tcIdx) => {
            if (tc.startsWith("tag.native.") || tc.startsWith("tag.custom.")) {
              const matchedTag = availableTags.find((t: any) => t.name === tc || t.slug === tc);
              const tagObj = matchedTag || { name: tc, slug: tc };
              return (
                <span key={`${keyPrefix}-tag-${tcIdx}`} className="inline-block align-middle mx-1">
                  <TagBadge tag={tagObj} />
                </span>
              );
            }
            return <Fragment key={`${keyPrefix}-frag-${tcIdx}`}>{tc}</Fragment>;
          })}
        </Fragment>
      );
    });
  };

  return (
    <Fragment>
      {segments.map((seg, i) => {
        if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
          return (
            <code key={i} className="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono border border-border/60">
              {seg.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={i}>{renderBoldTags(seg, `seg-${i}`)}</Fragment>;
      })}
    </Fragment>
  );
}
