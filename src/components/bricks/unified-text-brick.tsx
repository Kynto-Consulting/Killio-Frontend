"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileText, LayoutDashboard, CreditCard, ExternalLink, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReferencePicker } from "../documents/reference-picker";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { cn } from "@/lib/utils";
import { Portal } from "../ui/portal";
import { RichText } from "../ui/rich-text";

interface TextBrickProps {
  id: string;
  text: string;
  onUpdate: (text: string) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
}

export const UnifiedTextBrick: React.FC<TextBrickProps> = ({
  id,
  text,
  onUpdate,
  readonly,
  documents,
  boards,
  activeBricks,
  users = []
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const resolveReferences = (content: string) => {
    return ReferenceResolver.resolveValue(content, { documents, boards, activeBricks, users });
  };

  /**
   * Converts rendered HTML back to a plain markdown string (with \n)
   * This is used for saving and for the focus state.
   */
  const revertToMarkdown = (html: string): string => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    let markdown = "";

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        markdown += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();

        if (tag === "br") {
          markdown += "\n";
        } else if (tag === "div" || tag === "p" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "li") {
          // Block level elements should start on a new line
          if (markdown.length > 0 && !markdown.endsWith("\n")) {
            markdown += "\n";
          }

          if (tag === "h1") markdown += "# ";
          if (tag === "h2") markdown += "## ";
          if (tag === "h3") markdown += "### ";
          if (tag === "li") {
            const parent = el.parentElement?.tagName.toLowerCase();
            markdown += parent === "ol" ? "1. " : "- ";
          }

          Array.from(el.childNodes).forEach(walk);

          if (!markdown.endsWith("\n")) {
            markdown += "\n";
          }
        } else if (tag === "b" || tag === "strong") {
          markdown += "**";
          Array.from(el.childNodes).forEach(walk);
          markdown += "**";
        } else if (tag === "i" || tag === "em") {
          markdown += "*";
          Array.from(el.childNodes).forEach(walk);
          markdown += "*";
        } else if (tag === "u") {
          markdown += "__";
          Array.from(el.childNodes).forEach(walk);
          markdown += "__";
        } else if (tag === "s" || tag === "strike") {
          markdown += "~~";
          Array.from(el.childNodes).forEach(walk);
          markdown += "~~";
        } else if (el.classList.contains("mention-pill")) {
          const type = el.getAttribute("data-type");
          const uid = el.getAttribute("data-id");
          const label = el.textContent || "";
          markdown += `@[${type}:${uid}:${label}]`;
        } else if (el.classList.contains("user-mention")) {
          const uid = el.getAttribute("data-id");
          const label = el.textContent || "";
          markdown += `@[user:${uid}:${label.replace('@', '')}]`;
        } else {
          Array.from(el.childNodes).forEach(walk);
        }
      }
    };

    Array.from(tempDiv.childNodes).forEach(walk);
    return markdown.trim();
  };

  /**
   * Converts a markdown string (with \n) to rich semantic HTML for display
   */
  const processPseudoMarkdown = (rawText: string): string => {
    const resolvedText = resolveReferences(rawText || "");
    const documentIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
    const boardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;
    const cardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;
    const userIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    const richParts = ReferenceResolver.renderRich(resolvedText, { documents, boards, activeBricks, users });
    const withLinks = richParts.map(part => {
      if (typeof part === 'string') return part;
      if (part.type === 'mention') {
        const { mentionType: type, id: uid, name } = part;
        if (type === 'user') {
          return `<span class="user-mention inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded pl-1.5 pr-2 py-0.5 font-medium cursor-pointer transition-colors hover:bg-primary/20" data-type="${type}" data-id="${uid}">${userIcon} @${name}</span>`;
        }
        let icon = documentIcon;
        if (type === 'board') icon = boardIcon;
        if (type === 'card') icon = cardIcon;
        return `<span class="mention-pill inline-flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors hover:bg-accent/20" data-type="${type}" data-id="${uid}">${icon} ${name}</span>`;
      }
      if (part.type === 'deep') {
        return `<span class="deep-pill inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors hover:bg-amber-500/20" data-prefix="${part.prefix}" data-inner="${part.inner}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calculator"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg> ${part.label}</span>`;
      }
      return part;
    }).join("");

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

  const handleFocus = () => {
    if (contentRef.current) {
      // Switch to editing mode: show markdown markers inside DIVs
      const lines = (text || "").split("\n");
      const editableHtml = lines
        .map(line => line.trim() ? `<div>${line}</div>` : "<div><br></div>")
        .join("");

      contentRef.current.innerHTML = editableHtml;
    }
  };

  const handleBlur = () => {
    if (contentRef.current) {
      // Convert current editable structure back to a clean markdown string
      const markdown = revertToMarkdown(contentRef.current.innerHTML);
      onUpdate(markdown);
      // Immediately show the pretty rendered version
      contentRef.current.innerHTML = processPseudoMarkdown(markdown);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.mention-pill, .user-mention');

    if (pill) {
      // If we are in "rendered" mode (not focused), we navigate
      const isFocused = document.activeElement === contentRef.current;
      if (!isFocused) {
        e.preventDefault();
        e.stopPropagation();

        const type = pill.getAttribute('data-type') || (pill.classList.contains('user-mention') ? 'user' : '');
        const id = pill.getAttribute('data-id');

        if (type === 'doc') router.push(`/d/${id}`);
        else if (type === 'board') router.push(`/b/${id}`);
        // Add other navigation or actions as needed
      }
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === '@') {
      // Small delay to ensure the @ character is in the DOM
      setTimeout(() => setIsPickerOpen(true), 50);
    }
  };

  return (
    <div className="w-full relative group min-h-[3rem]" onMouseDown={handleMouseDown}>
      {readonly ? (
        <RichText 
          content={text} 
          context={{ documents, boards, users }} 
          className={cn(
            "w-full p-2 leading-relaxed text-sm rounded-md prose prose-sm dark:prose-invert max-w-none",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          )}
        />
      ) : (
        <div
          ref={contentRef}
          contentEditable={!readonly}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyUp={handleKeyUp}
          className={cn(
            "w-full outline-none p-2 leading-relaxed text-sm rounded-md transition-all",
            "focus:bg-accent/5 focus:ring-1 focus:ring-accent/20 cursor-text",
            "relative"
          )}
          data-placeholder="Escribe algo... usa @ para vincular"
        />
      )}

      {isPickerOpen && !readonly && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            users={users}
            onClose={() => setIsPickerOpen(false)}
            onSelect={(item) => {
              const currentHtml = contentRef.current?.innerHTML || "";
              let markdown = revertToMarkdown(currentHtml);
              // Remove the '@' that triggered the picker if it's at the end
              if (markdown.endsWith('@')) {
                markdown = markdown.substring(0, markdown.length - 1);
              }
              const newMarkdown = (markdown ? markdown.trimEnd() : "") + ` @[${item.type}:${item.id}:${item.name}]`;
              onUpdate(newMarkdown);
              if (contentRef.current) {
                contentRef.current.innerHTML = processPseudoMarkdown(newMarkdown);
              }
              setIsPickerOpen(false);
            }}
          />
        </Portal>
      )}
    </div>
  );
};
