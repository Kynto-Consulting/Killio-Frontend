"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileText, LayoutDashboard, CreditCard, ExternalLink } from "lucide-react";
import { ReferencePicker } from "../documents/reference-picker";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { cn } from "@/lib/utils";

interface TextBrickProps {
  id: string;
  text: string;
  onUpdate: (text: string) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
}

export const UnifiedTextBrick: React.FC<TextBrickProps> = ({ 
  id, 
  text, 
  onUpdate, 
  readonly,
  documents,
  boards,
  activeBricks
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const resolveReferences = (content: string) => {
    return ReferenceResolver.processText(content, { documents, boards, activeBricks });
  };

  const revertToMarkdown = (html: string): string => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    const processInlineNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        
        const content = Array.from(el.childNodes).map(processInlineNode).join("");
        
        switch (tag) {
          case "b": case "strong": return `**${content}**`;
          case "i": case "em": return `*${content}*`;
          case "u": return `__${content}__`;
          case "s": case "strike": return `~~${content}~~`;
          case "span": 
            if (el.classList.contains('mention-pill')) {
               const type = el.getAttribute('data-type');
               const uid = el.getAttribute('data-id');
               return `@[${type}:${uid}:${content}]`;
            }
            return content;
          case "br": return "\n";
          default: return content;
        }
      }
      return "";
    };

    const processBlockNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent?.trim();
        return txt ? txt + "\n" : "";
      }
      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === "ul" || tag === "ol") {
        return Array.from(el.children).map((li, i) => {
          const prefix = tag === "ul" ? "- " : `${i + 1}. `;
          const inner = Array.from(li.childNodes).map(processInlineNode).join("");
          return `${prefix}${inner}\n`;
        }).join("") + "\n";
      }

      const headings: Record<string, string> = { h1: "# ", h2: "## ", h3: "### " };
      if (headings[tag]) {
        return `${headings[tag]}${Array.from(el.childNodes).map(processInlineNode).join("")}\n\n`;
      }

      if (tag === "div" || tag === "p") {
        const inner = Array.from(el.childNodes).map(processInlineNode).join("");
        return inner.trim() ? `${inner}\n` : "\n";
      }

      if (tag === "br") return "\n";

      return processInlineNode(node) + "\n";
    };

    return Array.from(tempDiv.childNodes).map(processBlockNode).join("").trim();
  };

  const processPseudoMarkdown = (rawText: string): string => {
    // 1. Resolve spreadsheet references first
    const resolvedText = resolveReferences(rawText || "");

    // 2. Handle structural links @[type:id:name]
    const linkRegex = /@\[(doc|board|card):([^:]+):([^\]]+)\]/g;
    const withLinks = resolvedText.replace(linkRegex, (match, type, uid, name) => {
       return `<span class="mention-pill inline-flex items-center gap-1 bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors hover:bg-accent/20" data-type="${type}" data-id="${uid}">${name}</span>`;
    });

    const lines = withLinks.split('\n');
    let html = "";
    let listBuffer: string[] = [];
    let listType: "ul" | "ol" | null = null;

    const formatInline = (t: string) => t
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/__(.*?)__/g, "<u>$1</u>")
      .replace(/\*(.*?)\*/g, "<i>$1</i>")
      .replace(/~~(.*?)~~/g, "<s>$1</s>");

    const flushList = () => {
      if (listBuffer.length > 0 && listType) {
        html += `<${listType} class="list-inside pl-4 mb-2 ${listType === 'ul' ? 'list-disc' : 'list-decimal'}">`;
        html += listBuffer.map(item => `<li class="my-0.5 font-normal text-sm leading-relaxed">${formatInline(item)}</li>`).join("");
        html += `</${listType}>`;
        listBuffer = []; listType = null;
      }
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) { flushList(); html += "<div><br></div>"; return; }

      const h1 = trimmed.match(/^#\s+(.*)/);
      const h2 = trimmed.match(/^##\s+(.*)/);
      const h3 = trimmed.match(/^###\s+(.*)/);
      const ul = trimmed.match(/^[-*]\s+(.*)/);
      const ol = trimmed.match(/^(\d+)\.\s+(.*)/);

      if (h1) { flushList(); html += `<h1 class="text-3xl font-extrabold mb-4 mt-6 border-b border-border/50 pb-2 text-foreground tracking-tight">${formatInline(h1[1])}</h1>`; }
      else if (h2) { flushList(); html += `<h2 class="text-2xl font-bold mb-3 mt-5 text-foreground/90 tracking-tight">${formatInline(h2[1])}</h2>`; }
      else if (h3) { flushList(); html += `<h3 class="text-xl font-semibold mb-2 mt-4 text-foreground/80">${formatInline(h3[1])}</h3>`; }
      else if (ul) { if (listType && listType !== 'ul') flushList(); listType = 'ul'; listBuffer.push(ul[1]); }
      else if (ol) { if (listType && listType !== 'ol') flushList(); listType = 'ol'; listBuffer.push(ol[2]); }
      else { flushList(); html += `<div class="mb-1 leading-relaxed">${formatInline(trimmed)}</div>`; }
    });

    flushList();
    return html;
  };

  // Sync content from prop if it changes and we are NOT focused
  useEffect(() => {
    if (contentRef.current && document.activeElement !== contentRef.current) {
      const rendered = processPseudoMarkdown(text);
      if (contentRef.current.innerHTML !== rendered) {
        contentRef.current.innerHTML = rendered;
      }
    }
  }, [text, documents, boards, activeBricks]);

  const handleBlur = () => {
    if (contentRef.current) {
      const markdown = revertToMarkdown(contentRef.current.innerHTML);
      console.log("Saving Markdown:", markdown);
      onUpdate(markdown);
      // Rerender with proper classes/pill formatting
      contentRef.current.innerHTML = processPseudoMarkdown(markdown);
    }
  };

  const handleFocus = () => {
    if (contentRef.current) {
      const currentHtml = contentRef.current.innerHTML;
      const markdown = revertToMarkdown(currentHtml);
      // Only swap to raw markdown if it's different to avoid cursor jumps
      if (currentHtml !== markdown) {
        contentRef.current.innerHTML = markdown.replace(/\n/g, "<br>");
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === '@') {
      setIsPickerOpen(true);
    }
  };

  return (
    <div className="w-full relative group min-h-[3rem]">
      <div
        ref={contentRef}
        contentEditable={!readonly}
        suppressContentEditableWarning
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyUp={handleKeyUp}
        className={cn(
          "w-full outline-none p-2 leading-relaxed text-sm rounded-md transition-all",
          !readonly && "focus:bg-accent/5 focus:ring-1 focus:ring-accent/20 cursor-text",
          readonly && "prose prose-sm dark:prose-invert max-w-none",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30",
          "relative"
        )}
        data-placeholder="Escribe algo... usa @ para vincular"
      />

      {isPickerOpen && !readonly && (
        <div className="absolute z-[100] left-0 bottom-full mb-2">
          <ReferencePicker 
            boards={boards}
            documents={documents}
            onClose={() => setIsPickerOpen(false)}
            onSelect={(item) => {
              const currentHtml = contentRef.current?.innerHTML || "";
              const markdown = revertToMarkdown(currentHtml);
              const newMarkdown = markdown + ` @[${item.type}:${item.id}:${item.name}] `;
              onUpdate(newMarkdown);
              if (contentRef.current) {
                contentRef.current.innerHTML = processPseudoMarkdown(newMarkdown);
              }
              setIsPickerOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};
