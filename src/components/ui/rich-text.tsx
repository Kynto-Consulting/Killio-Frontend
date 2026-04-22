import React, { Fragment, ReactNode } from "react";
import { ReferenceResolver, ResolverContext } from "@/lib/reference-resolver";
import { RefPill } from "./ref-pill";
import { TagBadge } from "./tag-badge";
import { AiSuggestion } from "./ai-suggestion";
// @ts-ignore
import "katex/dist/katex.min.css";
import { BlockMath, InlineMath } from "react-katex";

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

  const stripWrappedBold = (value: string): string => {
    const trimmed = value.trim();
    if (/^\*\*[\s\S]+\*\*$/.test(trimmed)) {
      return trimmed.slice(2, -2).trim();
    }
    return value;
  };

  // Handle block math
  if (content.includes("$$")) {
    const parts = content.split(/(\$\$[\s\S]*?\$\$)/g);
    if (parts.length > 1) {
      return (
        <div className={className}>
          {parts.map((part, partIdx) => {
            if (part.startsWith("$$") && part.endsWith("$$")) {
              const formula = part.slice(2, -2).trim();
              return <div key={partIdx} className="my-2 p-2 bg-muted/10 rounded-md overflow-x-auto"><BlockMath math={formula} /></div>;
            }
            if (!part) return null;
            return (
              <RichText 
                key={partIdx} 
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
  }

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
                  const resolvedText = typeof part.resolvedValue === 'string'
                    ? stripWrappedBold(part.resolvedValue)
                    : JSON.stringify(part.resolvedValue, null, 2);
                  const hasResolvedContent = String(resolvedText || "").trim().length > 0;
                  return (
                    <div key={partIdx} className="my-2 p-3 rounded-md border border-amber-500/20 bg-amber-500/5 text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                      {hasResolvedContent ? renderInlineMarkdown(String(resolvedText), availableTags) : part.label}
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
  const renderLeafMarkdown = (value: string, keyPrefix: string): ReactNode[] => {
    const segments = value.split(/(`[^`]+`|\$[^$]+\$)/g);

    const renderDecorations = (input: string, decorationPrefix: string): ReactNode[] => {
      const chunks = input.split(/(\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~)/g);
      return chunks.map((chunk, index) => {
        if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
          return <strong key={`${decorationPrefix}-bold-${index}`}>{chunk.slice(2, -2)}</strong>;
        }
        if (chunk.startsWith("__") && chunk.endsWith("__") && chunk.length > 4) {
          return <u key={`${decorationPrefix}-underline-${index}`}>{chunk.slice(2, -2)}</u>;
        }
        if (chunk.startsWith("~~") && chunk.endsWith("~~") && chunk.length > 4) {
          return <s key={`${decorationPrefix}-strike-${index}`}>{chunk.slice(2, -2)}</s>;
        }

        const tagChunks = chunk.split(/(tag\.(?:native|custom)\.[a-zA-Z0-9.\-]+)/g);
        return (
          <Fragment key={`${decorationPrefix}-text-${index}`}>
            {tagChunks.map((tc, tcIdx) => {
              if (tc.startsWith("tag.native.") || tc.startsWith("tag.custom.")) {
                const matchedTag = availableTags.find((t: any) => t.name === tc || t.slug === tc);
                const tagObj = matchedTag || { name: tc, slug: tc };
                return (
                  <span key={`${decorationPrefix}-tag-${tcIdx}`} className="inline-block align-middle mx-1">
                    <TagBadge tag={tagObj} />
                  </span>
                );
              }
              return <Fragment key={`${decorationPrefix}-frag-${tcIdx}`}>{tc}</Fragment>;
            })}
          </Fragment>
        );
      });
    };

    return segments
      .map((seg, index) => {
        if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
          return (
            <code key={`${keyPrefix}-code-${index}`} className="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono border border-border/60">
              {seg.slice(1, -1)}
            </code>
          );
        }
        if (seg.startsWith("$") && seg.endsWith("$") && seg.length > 2) {
          try {
            return (
              <span key={`${keyPrefix}-math-${index}`} className="inline-block mx-1">
                <InlineMath math={seg.slice(1, -1)} />
              </span>
            );
          } catch (err) {
            return (
              <span key={`${keyPrefix}-math-error-${index}`} className="text-red-500 font-mono text-xs">{seg}</span>
            );
          }
        }
        return renderDecorations(seg, `${keyPrefix}-seg-${index}`);
      })
      .flat();
  };

  const renderWithWrappers = (value: string, keyPrefix: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let partIndex = 0;

    while (cursor < value.length) {
      const colorStart = value.indexOf('[color:', cursor);
      const linkStart = value.indexOf('[link:', cursor);
      let nextStart = -1;
      let nextKind: 'color' | 'link' | null = null;

      if (colorStart !== -1 && (linkStart === -1 || colorStart < linkStart)) {
        nextStart = colorStart;
        nextKind = 'color';
      } else if (linkStart !== -1) {
        nextStart = linkStart;
        nextKind = 'link';
      }

      if (nextStart === -1) {
        nodes.push(...renderLeafMarkdown(value.slice(cursor), `${keyPrefix}-plain-${partIndex++}`));
        break;
      }

      if (nextStart > cursor) {
        nodes.push(...renderLeafMarkdown(value.slice(cursor, nextStart), `${keyPrefix}-plain-${partIndex++}`));
      }

      if (nextKind === 'color') {
        const openEnd = value.indexOf(']', nextStart);
        const closeTag = '[/color]';
        const closeIndex = value.indexOf(closeTag, openEnd + 1);
        if (openEnd === -1 || closeIndex === -1) {
          nodes.push(...renderLeafMarkdown(value.slice(nextStart), `${keyPrefix}-broken-color-${partIndex++}`));
          break;
        }

        const color = value.slice(nextStart + 7, openEnd).trim();
        const inner = value.slice(openEnd + 1, closeIndex);
        nodes.push(
          <span key={`${keyPrefix}-color-${partIndex++}`} data-color={color} style={{ color }}>
            {renderWithWrappers(inner, `${keyPrefix}-color-inner`) }
          </span>,
        );
        cursor = closeIndex + closeTag.length;
        continue;
      }

      if (nextKind === 'link') {
        const openEnd = value.indexOf(']', nextStart);
        const closeTag = '[/link]';
        const closeIndex = value.indexOf(closeTag, openEnd + 1);
        if (openEnd === -1 || closeIndex === -1) {
          nodes.push(...renderLeafMarkdown(value.slice(nextStart), `${keyPrefix}-broken-link-${partIndex++}`));
          break;
        }

        const href = value.slice(nextStart + 6, openEnd).trim();
        const inner = value.slice(openEnd + 1, closeIndex);
        nodes.push(
          <a key={`${keyPrefix}-link-${partIndex++}`} href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
            {renderWithWrappers(inner, `${keyPrefix}-link-inner`) }
          </a>,
        );
        cursor = closeIndex + closeTag.length;
        continue;
      }
    }

    return nodes;
  };

  return <Fragment>{renderWithWrappers(text, 'rich-text')}</Fragment>;
}
