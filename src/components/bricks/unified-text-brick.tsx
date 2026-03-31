"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileText, LayoutDashboard, CreditCard, ExternalLink, User as UserIcon, Type, Heading1, Heading2, Heading3, Heading4, List, ListOrdered, CheckSquare, ChevronDown, Image as ImageIcon, Table, BarChart2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReferencePicker, ReferencePickerSelection } from "@/components/documents/reference-picker";
import { DocumentSummary, DocumentBrick } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { cn } from "@/lib/utils";
import { Portal } from "../ui/portal";
import { RichText } from "../ui/rich-text";
import { type SlashCommand, getSlashCommands } from "./slash-commands";
import { InlineFormatToolbar } from "./inline-format-toolbar";
import { useTranslations } from "@/components/providers/i18n-provider";
import { DatePickerPopover, EmojiPickerPopover, MathPickerPopover } from "./inline-pickers";

interface TextBrickProps {
  id: string;
  text: string;
  onUpdate: (text: string) => void;
  onAddBrick?: (kind: string) => void;
  readonly?: boolean;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: DocumentBrick[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  onPasteImage?: (payload: { file: File; cursorOffset: number; markdown: string }) => Promise<string | void> | string | void;
}

const DEFAULT_PASTED_IMAGE_NAME = "pasted-image.png";



const logPasteDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[TextBrickPaste]", ...args);
  }
};

export const UnifiedTextBrick: React.FC<TextBrickProps> = ({
  id,
  text,
  onUpdate,
  onAddBrick,
  readonly,
  documents,
  boards,
  activeBricks,
  users = [],
  onPasteImage
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<any[] | undefined>(undefined);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isMathPickerOpen, setIsMathPickerOpen] = useState(false);
  const [pickerCursorOffset, setPickerCursorOffset] = useState<number | null>(null);
  const [isSlashOpen, setIsSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [isFormatToolbarOpen, setIsFormatToolbarOpen] = useState(false);
  const [formatToolbarPosition, setFormatToolbarPosition] = useState({ top: 0, left: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const pasteInFlightRef = useRef(false);
  const router = useRouter();
  const tDetail = useTranslations("document-detail");
  const slashCommands = React.useMemo(() => getSlashCommands(tDetail as any), [tDetail]);

  

  const tokenEscapeAttr = (value: string): string => {
    return value.replace(/&/g, "&amp;").replace(/\"/g, "&quot;");
  };

  const escapeHtml = (value: string): string => {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const escapeHtmlAttr = (value: string): string => {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  const normalizeImageUrl = (rawUrl: string): string => {
    const url = rawUrl.trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (/^data:image\//i.test(url)) return url;
    if (url.startsWith("/")) return url;
    return "";
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

        const tokenAttr = el.getAttribute("data-token");
        if (tokenAttr) {
          markdown += tokenAttr;
          return;
        }

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
        } else if (tag === "pre") {
          const lang = (el as HTMLElement).getAttribute("data-code-block") || "";
          const codeEl = el.querySelector("code");
          const code = codeEl ? (codeEl.textContent || "") : (el.textContent || "");
          if (markdown.length > 0 && !markdown.endsWith("\n")) markdown += "\n";
          markdown += "```" + lang + "\n" + code + "\n```";
          return;
        } else if (tag === "code") {
          markdown += "`" + (el.textContent || "") + "`";
          return;
        } else if (el.classList.contains("mention-pill")) {
          const type = el.getAttribute("data-type");
          const uid = el.getAttribute("data-id");
          const label = el.textContent || "";
          markdown += `@[${type}:${uid}:${label}]`;
        } else if (el.classList.contains("user-mention")) {
          const uid = el.getAttribute("data-id");
          const label = el.textContent || "";
          markdown += `@[user:${uid}:${label.replace('@', '')}]`;
        } else if (el.classList.contains("deep-pill")) {
          const prefix = el.getAttribute("data-prefix") || "#";
          const inner = el.getAttribute("data-inner") || "";
          markdown += `${prefix}[${inner}]`;
        } else {
          Array.from(el.childNodes).forEach(walk);
        }
      }
    };

    Array.from(tempDiv.childNodes).forEach(walk);
    return markdown
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n$/, "");
  };

  const getMarkdownLengthOfNode = (node: Node): number => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || "").replace(/\u200b/g, "").length;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return 0;
    }

    const el = node as HTMLElement;
    const token = el.getAttribute("data-token");
    if (token) return token.length;
    if (el.tagName === "BR") return 1;

    let length = 0;
    for (const child of Array.from(el.childNodes)) {
      length += getMarkdownLengthOfNode(child);
    }
    return length;
  };

  const getMarkdownCursorOffset = (root: HTMLElement | null): number | null => {
    if (!root || typeof window === "undefined") return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const anchorNode = range.startContainer;
    const anchorOffset = range.startOffset;

    let total = 0;
    let found = false;

    const walk = (node: Node) => {
      if (found) return;

      if (node === anchorNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          total += anchorOffset;
        } else {
          const children = Array.from(node.childNodes);
          for (let i = 0; i < Math.min(anchorOffset, children.length); i += 1) {
            total += getMarkdownLengthOfNode(children[i]);
          }
        }
        found = true;
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        total += (node.textContent || "").replace(/\u200b/g, "").length;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const el = node as HTMLElement;
      const token = el.getAttribute("data-token");
      if (token) {
        total += token.length;
        return;
      }

      if (el.tagName === "BR") {
        total += 1;
        return;
      }

      for (const child of Array.from(el.childNodes)) {
        walk(child);
        if (found) return;
      }
    };

    walk(root);
    return total;
  };

  const renderReferencePart = (part: any): string => {
    const documentIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
    const boardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;
    const cardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;
    const userIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    if (part.type === 'mention') {
      const { mentionType: type, id: uid, name } = part;
      if (type === 'user') {
        const token = `@[user:${uid}:${name}]`;
        return `<span contenteditable="false" data-token="${tokenEscapeAttr(token)}" class="user-mention inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded pl-1.5 pr-2 py-0.5 font-medium cursor-pointer transition-colors hover:bg-primary/20" data-type="${type}" data-id="${uid}">${userIcon} @${name}</span>`;
      }
      let icon = documentIcon;
      if (type === 'board') icon = boardIcon;
      if (type === 'card') icon = cardIcon;
      const token = `@[${type}:${uid}:${name}]`;
      return `<span contenteditable="false" data-token="${tokenEscapeAttr(token)}" class="mention-pill inline-flex items-center gap-1.5 bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors hover:bg-accent/20" data-type="${type}" data-id="${uid}">${icon} ${name}</span>`;
    }

    if (part.type === 'deep') {
      const token = `${part.prefix}[${part.inner}]`;
      return `<span contenteditable="false" data-token="${tokenEscapeAttr(token)}" class="deep-pill inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded px-1.5 py-0.5 font-medium cursor-pointer transition-colors hover:bg-amber-500/20" data-prefix="${part.prefix}" data-inner="${part.inner}"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calculator"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg> ${part.label}</span>`;
    }

    return typeof part === 'string' ? escapeHtml(part) : String(part || '');
  };

  const processMarkdownWithPills = (rawText: string): string => {
    // In edit mode: keep code blocks as raw markdown text so they are editable.
    // Only pills/references are rendered as interactive spans.
    const richParts = ReferenceResolver.renderRich(rawText || "", { documents, boards, activeBricks, users });
    return richParts
      .map((part) => (typeof part === 'string' ? escapeHtml(part).replace(/\n/g, '<br>') : renderReferencePart(part)))
      .join('');
  };

  /**
   * Converts a markdown string (with \n) to rich semantic HTML for display
   */
  const processPseudoMarkdown = (rawText: string): string => {
    // Pre-extract fenced code blocks so they bypass reference + markdown processing
    const codeBlocks: Array<{ lang: string; code: string }> = [];
    const sanitized = (rawText || "").replace(/```([\w]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || "", code: code.replace(/\n$/, "") });
      return `\x00CB${idx}\x00`;
    });

    const richParts = ReferenceResolver.renderRich(sanitized, { documents, boards, activeBricks, users });
    const withLinks = richParts.map((part) => (typeof part === 'string' ? part : renderReferencePart(part))).join("");

    const lines = withLinks.split('\n');
    let html = "";
    let listBuffer: string[] = [];
    let listType: "ul" | "ol" | null = null;

    const formatInline = (t: string) => t
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, rawUrl: string) => {
        const src = normalizeImageUrl(rawUrl);
        if (!src) return `![${escapeHtml(alt)}](${escapeHtml(rawUrl)})`;
        return `<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}" class="my-2 max-h-[460px] w-full rounded-md border border-border/60 object-contain bg-muted/20" loading="lazy" />`;
      })
      .replace(/`([^`]+)`/g, '<code class="bg-muted/60 rounded px-1 py-0.5 text-xs font-mono border border-border/60">$1</code>')
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

      // Code block placeholder
      const cbMatch = trimmed.match(/^\x00CB(\d+)\x00$/);
      if (cbMatch) {
        flushList();
        const { lang, code } = codeBlocks[parseInt(cbMatch[1])];
        const escaped = escapeHtml(code);
        const langLabel = lang ? `<div class="text-xs text-muted-foreground/60 font-mono uppercase tracking-wider mb-2">${lang}</div>` : "";
        html += `<pre contenteditable="false" class="my-2 rounded-lg bg-muted/60 border border-border/60 p-3 overflow-x-auto" data-code-block="${lang}">${langLabel}<code class="text-xs font-mono text-foreground/80 whitespace-pre">${escaped}</code></pre>`;
        return;
      }

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

  const filteredSlashCommands = slashCommands.filter((command) => {
    if (!slashQuery.trim()) return true;
    const query = slashQuery.toLowerCase();
    return command.label.toLowerCase().includes(query) || command.search.includes(query);
  });

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashQuery, isSlashOpen]);

  const closeSlashMenu = () => {
    setIsSlashOpen(false);
    setSlashQuery("");
    setSlashRange(null);
    setSlashActiveIndex(0);
  };

  const getSlashContext = (markdown: string, cursorOffset: number): { from: number; to: number; query: string } | null => {
    const beforeCursor = markdown.slice(0, cursorOffset);
    const match = beforeCursor.match(/(^|\s)\/([^\s\/]*)$/);
    if (!match) return null;
    const query = match[2] || "";
    const from = cursorOffset - query.length - 1;
    if (from < 0) return null;
    return { from, to: cursorOffset, query };
  };

  const updateSlashMenuFromCursor = (markdown: string, cursorOffset: number) => {
    const context = getSlashContext(markdown, cursorOffset);
    if (!context) {
      if (isSlashOpen) closeSlashMenu();
      return;
    }

    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      let top = Math.max(12, rect.bottom + 8);
      let left = Math.max(12, rect.left);

      // Smart position a la Notion (avoid bottom and right clipping)
      const menuHeight = 320; // max height of our menu
      const menuWidth = 320; // width of our menu
      
      if (typeof window !== "undefined") {
        if (top + menuHeight > window.innerHeight) {
          top = Math.max(12, rect.top - menuHeight - 8);
        }
        if (left + menuWidth > window.innerWidth) {
          left = window.innerWidth - menuWidth - 12;
        }
      }

      setSlashMenuPosition({ top, left });
    }

    setSlashRange({ from: context.from, to: context.to });
    setSlashQuery(context.query);
    setIsSlashOpen(true);
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (!contentRef.current) return;

    const markdown = revertToMarkdown(contentRef.current.innerHTML || "");
    const cursorOffset = getMarkdownCursorOffset(contentRef.current) ?? markdown.length;
    const context = getSlashContext(markdown, cursorOffset) || (slashRange ? { ...slashRange, query: slashQuery } : null);

    if (!context) {
      closeSlashMenu();
      return;
    }

    const before = markdown.slice(0, context.from);
    const after = markdown.slice(context.to);

    if (command.kind === "inline") {
      let insertText = command.insertText || "";
      const nextMarkdown = `${before}${insertText}${after}`;
      onUpdate(nextMarkdown);
      contentRef.current.innerHTML = processMarkdownWithPills(nextMarkdown);
      
      const newCursorOffset = context.from + insertText.length;
      
      // Special actions for specific inline commands
      if (command.id === "mention-person") {
        setPickerCursorOffset(newCursorOffset);
        setPickerFilter(["user"]);
        setIsPickerOpen(true);
      } else if (command.id === "mention-page") {
        setPickerCursorOffset(newCursorOffset);
        setPickerFilter(["doc", "board"]);
        setIsPickerOpen(true);
      }
    } else if (command.blockKind && onAddBrick) {
      const nextMarkdown = `${before}${after}`;
      onUpdate(nextMarkdown);
      contentRef.current.innerHTML = processMarkdownWithPills(nextMarkdown);
      onAddBrick(command.blockKind);
    }

    closeSlashMenu();
    requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
  };

  // Sync content from prop if it changes and we are NOT focused
  useEffect(() => {
    if (contentRef.current) {
      const rendered = processPseudoMarkdown(text);
      const isFocused = document.activeElement === contentRef.current;
      
      // Always sync if content changed, regardless of focus
      // This ensures pasted images update correctly
      if (contentRef.current.innerHTML !== rendered) {
        logPasteDebug("useEffect syncing content", {
          isFocused,
          oldLength: contentRef.current.innerHTML.length,
          newLength: rendered.length,
        });
        contentRef.current.innerHTML = rendered;
      }
      
      const tc = contentRef.current.textContent || "";
      if (tc.length === 0) {
        contentRef.current.setAttribute("data-empty", "true");
      } else {
        contentRef.current.removeAttribute("data-empty");
      }
    }
  }, [text, documents, boards, activeBricks]);

  const handleFocus = () => {
    if (contentRef.current) {
      // In markdown mode keep references as pills and leave markdown syntax as plain text.
      contentRef.current.innerHTML = processMarkdownWithPills(text || "");
      const tc = contentRef.current.textContent || "";
      if (tc.length === 0) contentRef.current.setAttribute("data-empty", "true");
      else contentRef.current.removeAttribute("data-empty");
    }
  };

  const handleBlur = () => {
    if (contentRef.current) {
      // Preserve references as tokens while serializing markdown.
      const rawMarkdown = revertToMarkdown(contentRef.current.innerHTML || "");
      onUpdate(rawMarkdown);
      contentRef.current.innerHTML = processPseudoMarkdown(rawMarkdown);
      const tc = contentRef.current.textContent || "";
      if (tc.length === 0) contentRef.current.setAttribute("data-empty", "true");
      else contentRef.current.removeAttribute("data-empty");
    }
    setIsPickerOpen(false);
    setPickerCursorOffset(null);
    closeSlashMenu();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.mention-pill, .user-mention, .deep-pill');

    // Non-pill click: let the browser handle it naturally so it places the cursor
    // exactly where the user clicked. No preventDefault needed.
    if (!pill) return;

    const isFocused = document.activeElement === contentRef.current;
    const isModifierClick = e.metaKey || e.ctrlKey;

    // In editable mode, first click should activate this brick instead of navigating away.
    if (!readonly && !isFocused && !isModifierClick) {
      requestAnimationFrame(() => contentRef.current?.focus());
      return;
    }

    if (!isFocused || readonly || isModifierClick) {
      e.preventDefault();
      e.stopPropagation();

      if (pill.classList.contains('deep-pill')) {
        const inner = pill.getAttribute('data-inner') || '';
        const docId = inner.split(':')[0];
        if (docId) {
          router.push(`/d/${docId}`);
        }
        return;
      }

      const type = pill.getAttribute('data-type') || (pill.classList.contains('user-mention') ? 'user' : '');
      const id = pill.getAttribute('data-id');

      if (type === 'doc') router.push(`/d/${id}`);
      else if (type === 'board') router.push(`/b/${id}`);
      // Add other navigation or actions as needed
    }
  };

  const handleMouseUp = () => {
    setTimeout(checkSelectionForToolbar, 10);
  };

  const handleFormat = (type: "bold" | "italic" | "strike" | "code" | "link" | "underline" | "math") => {
    if (!contentRef.current) return;
    
    switch (type) {
      case "bold": document.execCommand("bold", false, undefined); break;
      case "italic": document.execCommand("italic", false, undefined); break;
      case "underline": document.execCommand("underline", false, undefined); break;
      case "strike": document.execCommand("strikeThrough", false, undefined); break;
      case "link":
        const url = prompt("Enter link URL:");
        if (url) document.execCommand("createLink", false, url);
        break;
      case "code":
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const codeNode = document.createElement("code");
          codeNode.appendChild(range.extractContents());
          range.insertNode(codeNode);
          selection.removeAllRanges();
        }
        break;
    }
    const md = revertToMarkdown(contentRef.current.innerHTML || "");
    onUpdate(md);
  };

  const checkSelectionForToolbar = () => {
    if (readonly) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !contentRef.current?.contains(selection.anchorNode)) {
      setIsFormatToolbarOpen(false);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setIsFormatToolbarOpen(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setFormatToolbarPosition({
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX + (rect.width / 2),
    });
    setIsFormatToolbarOpen(true);
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (!contentRef.current) return;
    
    // Check selection after a short delay to allow selection APIs to catch up
    setTimeout(checkSelectionForToolbar, 10);

    const markdown = revertToMarkdown(contentRef.current.innerHTML || "");
    const offset = getMarkdownCursorOffset(contentRef.current) ?? markdown.length;

    if (e.key === '@') {
      setPickerCursorOffset(offset);
      // Small delay to ensure the @ character is in the DOM
      setTimeout(() => setIsPickerOpen(true), 50);
      closeSlashMenu();
      return;
    }

    updateSlashMenuFromCursor(markdown, offset);
  };

  const findAdjacentToken = (direction: "backward" | "forward") => {
    const root = contentRef.current;
    if (!root || typeof window === "undefined") return null;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    const isTokenElement = (node: Node | null): node is HTMLElement => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as HTMLElement;
      return !!el.getAttribute("data-token") || el.classList.contains("mention-pill") || el.classList.contains("user-mention") || el.classList.contains("deep-pill");
    };

    const pickFromNode = (node: Node | null, pickLast: boolean): HTMLElement | null => {
      if (!node) return null;
      if (isTokenElement(node)) return node;
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const children = Array.from(node.childNodes);
      if (!children.length) return null;
      const candidate = pickLast ? children[children.length - 1] : children[0];
      return isTokenElement(candidate) ? candidate : null;
    };

    if (container.nodeType === Node.TEXT_NODE) {
      if (direction === "backward" && offset > 0) return null;
      const sibling = direction === "backward" ? container.previousSibling : container.nextSibling;
      return pickFromNode(sibling, direction === "backward");
    }

    const children = Array.from(container.childNodes);
    if (direction === "backward") {
      const idx = offset - 1;
      if (idx >= 0 && idx < children.length) {
        return pickFromNode(children[idx], true);
      }
    } else {
      const idx = offset;
      if (idx >= 0 && idx < children.length) {
        return pickFromNode(children[idx], false);
      }
    }

    return null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (readonly) return;

    if (isSlashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredSlashCommands.length > 0) {
          setSlashActiveIndex((current) => (current + 1) % filteredSlashCommands.length);
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredSlashCommands.length > 0) {
          setSlashActiveIndex((current) => (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        }
        return;
      }

      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const command = filteredSlashCommands[slashActiveIndex];
        if (command) applySlashCommand(command);
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (isSlashOpen || isPickerOpen) {
        closeSlashMenu();
        setIsPickerOpen(false);
        setPickerCursorOffset(null);
        return;
      }
      closeSlashMenu();
      setIsPickerOpen(false);
      setPickerCursorOffset(null);
      contentRef.current?.blur();
      return;
    }

    if (e.key === "Backspace") {
      const token = findAdjacentToken("backward");
      if (token) {
        e.preventDefault();
        token.remove();
        const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
        onUpdate(markdown);
      }
    }

    if (e.key === "Delete") {
      const token = findAdjacentToken("forward");
      if (token) {
        e.preventDefault();
        token.remove();
        const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
        onUpdate(markdown);
      }
    }
  };

  const extensionFromMime = (mimeType: string): string => {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/svg+xml") return "svg";
    return "png";
  };

  const isLikelyImageFile = (file: File): boolean => {
    if (file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "");
  };

  const makeClipboardImageFile = (blob: Blob, preferredName?: string): File => {
    const mimeType = blob.type || "image/png";
    const ext = extensionFromMime(mimeType);
    const safeName = preferredName && preferredName.trim().length > 0
      ? preferredName
      : `pasted-image-${Date.now()}.${ext}`;
    return new File([blob], safeName, { type: mimeType });
  };

  const extractImageFileFromClipboard = async (clipboardData: DataTransfer): Promise<File | null> => {
    const itemImage = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (itemImage) {
      const file = itemImage.getAsFile();
      if (file) {
        logPasteDebug("resolved file from clipboard item image/*", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      }
    }

    let itemFile: File | null = null;
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind !== "file") continue;
      const candidate = item.getAsFile();
      if (candidate && isLikelyImageFile(candidate)) {
        itemFile = candidate;
        logPasteDebug("resolved file from clipboard item kind=file", {
          name: candidate.name,
          type: candidate.type,
          size: candidate.size,
        });
        break;
      }
    }
    if (itemFile) return itemFile;

    const fileImage = Array.from(clipboardData.files).find((file) => isLikelyImageFile(file));
    if (fileImage) {
      logPasteDebug("resolved file from clipboard files[]", {
        name: fileImage.name,
        type: fileImage.type,
        size: fileImage.size,
      });
      return fileImage;
    }

    const html = clipboardData.getData("text/html");
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const img = doc.querySelector("img");
      const src = img?.getAttribute("src") || "";
      if (src) {
        try {
          if (src.startsWith("data:image/")) {
            const response = await fetch(src);
            if (!response.ok) return null;
            const blob = await response.blob();
            const file = makeClipboardImageFile(blob, DEFAULT_PASTED_IMAGE_NAME);
            logPasteDebug("resolved file from text/html img data URL", {
              name: file.name,
              type: file.type,
              size: file.size,
            });
            return file;
          }

          if (/^https?:\/\//i.test(src)) {
            const response = await fetch(src);
            if (!response.ok) return null;
            const blob = await response.blob();
            if (!blob.type.startsWith("image/")) return null;
            const file = makeClipboardImageFile(blob);
            logPasteDebug("resolved file from text/html img remote URL", {
              name: file.name,
              type: file.type,
              size: file.size,
            });
            return file;
          }
        } catch (err) {
          console.error("Failed to convert HTML image from clipboard", err);
          return null;
        }
      }
    }

    const plainText = clipboardData.getData("text/plain").trim();
    if (plainText.startsWith("data:image/")) {
      try {
        const response = await fetch(plainText);
        if (!response.ok) return null;
        const blob = await response.blob();
        const file = makeClipboardImageFile(blob, DEFAULT_PASTED_IMAGE_NAME);
        logPasteDebug("resolved file from text/plain data URL", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      } catch (err) {
        console.error("Failed to convert plain-text data URL image from clipboard", err);
      }
    }

    const uriList = clipboardData.getData("text/uri-list").trim();
    if (/^https?:\/\//i.test(uriList)) {
      try {
        const response = await fetch(uriList);
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return null;
        const file = makeClipboardImageFile(blob);
        logPasteDebug("resolved file from text/uri-list", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      } catch (err) {
        console.error("Failed to convert URI-list image from clipboard", err);
      }
    }

    return null;
  };

  const extractImageFileFromClipboardApi = async (): Promise<File | null> => {
    if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.read !== "function") {
      return null;
    }

    try {
      logPasteDebug("trying navigator.clipboard.read fallback");
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const file = makeClipboardImageFile(blob);
        logPasteDebug("resolved file from navigator.clipboard.read", {
          name: file.name,
          type: file.type,
          size: file.size,
        });
        return file;
      }
    } catch (err) {
      console.error("Clipboard API read failed", err);
    }

    return null;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (readonly || !onPasteImage) return;
    if (pasteInFlightRef.current) {
      e.preventDefault();
      logPasteDebug("paste skipped because another paste is in flight");
      return;
    }
    const clipboardTypes = Array.from(e.clipboardData.types || []);
    const hasLikelyImageFile = Array.from(e.clipboardData.files).some((file) => isLikelyImageFile(file));
    const hasImageCandidate =
      Array.from(e.clipboardData.items).some((item) => item.type.startsWith("image/")) ||
      Array.from(e.clipboardData.items).some((item) => item.kind === "file") ||
      hasLikelyImageFile ||
      clipboardTypes.some((type) => type.toLowerCase().startsWith("image/")) ||
      clipboardTypes.includes("Files") ||
      e.clipboardData.getData("text/html").toLowerCase().includes("<img") ||
      e.clipboardData.getData("text/plain").trim().startsWith("data:image/") ||
      /^https?:\/\//i.test(e.clipboardData.getData("text/uri-list").trim());

    logPasteDebug("paste event received", {
      types: clipboardTypes,
      itemCount: e.clipboardData.items.length,
      fileCount: e.clipboardData.files.length,
      hasImageCandidate,
    });

    if (!hasImageCandidate) return;

    e.preventDefault();
    pasteInFlightRef.current = true;

    const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
    const cursorOffset = getMarkdownCursorOffset(contentRef.current) ?? markdown.length;
    logPasteDebug("processing paste", { cursorOffset, markdownLength: markdown.length });

    void extractImageFileFromClipboard(e.clipboardData)
      .then(async (file) => {
        logPasteDebug("extractImageFileFromClipboard resolved", {
          hasFile: !!file,
        });
        const resolvedFile = file || await extractImageFileFromClipboardApi();
        if (!resolvedFile) {
          logPasteDebug("no image file resolved from paste payload");
          return;
        }
        logPasteDebug("calling onPasteImage", {
          name: resolvedFile.name,
          type: resolvedFile.type,
          size: resolvedFile.size,
          source: file ? "paste-event" : "clipboard-api-fallback",
        });
        // Call onPasteImage - the parent component handles all state updates
        // We don't process the return value because the parent may create multiple bricks
        // or reorganize the structure. Just let the modal handle it and our props will update naturally.
        await Promise.resolve(onPasteImage({ file: resolvedFile, cursorOffset, markdown }));
        logPasteDebug("onPasteImage completed");
      })
      .catch((err) => {
        console.error("[TextBrickPaste] Error in paste handler:", err);
        logPasteDebug("paste handler error", {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        pasteInFlightRef.current = false;
      });
  };

  return (
    <div className="w-full relative group cursor-text" onMouseDown={handleMouseDown}>
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
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onMouseUp={handleMouseUp}
          onPaste={handlePaste}
          onInput={() => {
             const text = contentRef.current?.textContent || "";
             if (text.length === 0) {
               contentRef.current?.setAttribute("data-empty", "true");
             } else {
               contentRef.current?.removeAttribute("data-empty");
             }
          }}
          className={cn(
            "text-brick-editor w-full min-h-[1.5rem] outline-none p-1.5 leading-relaxed text-sm rounded-md transition-all",
            "focus:bg-accent/5 focus:ring-1 focus:ring-accent/20 cursor-text relative",
            "data-[empty=true]:before:content-[attr(data-placeholder)] data-[empty=true]:before:text-muted-foreground/50 data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:top-1.5 data-[empty=true]:before:left-1.5"
          )}
          data-placeholder="Pulsa «Espacio» para activar la IA o escribe «/» para mostrar los comandos"
        />
      )}

      {isPickerOpen && !readonly && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            users={users}
            activeBricks={activeBricks as any[]}
 onClose={() => { setIsPickerOpen(false); setPickerFilter(undefined); }} allowedTypes={pickerFilter as any}
            onSelect={(item: ReferencePickerSelection) => {
              const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
              const insertToken = item.token;
              const cursor = pickerCursorOffset ?? markdown.length;
              const safeCursor = Math.max(0, Math.min(cursor, markdown.length));
              const replaceFrom = safeCursor > 0 && markdown[safeCursor - 1] === "@" ? safeCursor - 1 : safeCursor;
              const newMarkdown = `${markdown.slice(0, replaceFrom)}${insertToken} ${markdown.slice(safeCursor)}`;
              onUpdate(newMarkdown);
              if (contentRef.current) {
                contentRef.current.innerHTML = processMarkdownWithPills(newMarkdown);
              }
              setIsPickerOpen(false);
              setPickerCursorOffset(null);
            }}
          />
        </Portal>
      )}

      {isSlashOpen && !readonly ? (
        <Portal>
          <div
            className="fixed z-[150] flex flex-row overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={{ 
              top: slashMenuPosition.top, 
              left: slashMenuPosition.left,
              maxWidth: filteredSlashCommands.length > 0 && filteredSlashCommands[slashActiveIndex]?.preview ? '600px' : '320px',
              minWidth: '320px'
            }}
          >
            <div className="flex-1 w-[320px] flex flex-col border-r border-border/50">
              <div className="border-b border-border/70 px-3 py-2">
                <div className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground">
                  /{slashQuery || "..."}
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto p-1.5 flex-1">
                {filteredSlashCommands.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Sin resultados</div>
                ) : (
                  filteredSlashCommands.map((command, index) => (
                    <button
                      key={command.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onMouseEnter={() => setSlashActiveIndex(index)}
                      onClick={() => applySlashCommand(command)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                        index === slashActiveIndex ? "bg-accent/80 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background shadow-sm text-foreground">
                        {command.icon}
                      </div>
                      <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                        <span className="text-sm font-medium text-foreground">{command.label}</span>
                        <span className="truncate text-xs text-muted-foreground/80 w-full">{command.description}</span>
                      </div>
                      {command.shortcut && (
                        <div className="ml-auto text-xs text-muted-foreground/60">{command.shortcut}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            
            {filteredSlashCommands.length > 0 && filteredSlashCommands[slashActiveIndex]?.preview && (
              <div className="hidden sm:flex w-[280px] bg-muted/10 flex-col">
                <div className="p-4 flex-1">
                   {filteredSlashCommands[slashActiveIndex].preview}
                </div>
                <div className="p-4 mt-auto border-t border-border/50 bg-muted/5 text-xs text-muted-foreground">
                   {filteredSlashCommands[slashActiveIndex].description}
                </div>
              </div>
            )}
          </div>
        </Portal>
      ) : null}

      <Portal>
        <InlineFormatToolbar
          position={formatToolbarPosition}
          isVisible={isFormatToolbarOpen}
          onFormat={handleFormat}
          onAction={(action) => {
            setIsFormatToolbarOpen(false);
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const r = sel.getRangeAt(0);
              const rect = r.getBoundingClientRect();
              setSlashMenuPosition({ top: Math.max(12, rect.bottom + window.scrollY + 8), left: Math.max(12, rect.left + window.scrollX) });
              if (contentRef.current) {
                const offset = getMarkdownCursorOffset(contentRef.current);
                if (offset !== null) setPickerCursorOffset(offset);
              }
            }
            if (action === "emoji") {
              setIsEmojiPickerOpen(true);
            } else if (action === "math") {
              setIsMathPickerOpen(true);
            } else if (action === "date") {
              setIsDatePickerOpen(true);
            } else {
              console.log("Action clicked:", action);
            }
          }}
        />
      </Portal>

        {isDatePickerOpen && !readonly && (
          <Portal>
            <DatePickerPopover 
              top={slashMenuPosition.top} 
              left={slashMenuPosition.left} 
              onClose={() => setIsDatePickerOpen(false)}
              onSelect={(ts) => {
                const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
                const cursor = pickerCursorOffset ?? markdown.length;
                const safeCursor = Math.max(0, Math.min(cursor, markdown.length));
                const newMarkdown = `${markdown.slice(0, safeCursor)}${ts} ${markdown.slice(safeCursor)}`;
                onUpdate(newMarkdown);
                if (contentRef.current) contentRef.current.innerHTML = processMarkdownWithPills(newMarkdown);
                setIsDatePickerOpen(false);
                setPickerCursorOffset(null);
              }}
            />
          </Portal>
        )}

        {isEmojiPickerOpen && !readonly && (
          <Portal>
            <EmojiPickerPopover 
              top={slashMenuPosition.top} 
              left={slashMenuPosition.left} 
              onSelect={(emoji) => {
                const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
                const cursor = pickerCursorOffset ?? markdown.length;
                const safeCursor = Math.max(0, Math.min(cursor, markdown.length));
                const newMarkdown = `${markdown.slice(0, safeCursor)}${emoji} ${markdown.slice(safeCursor)}`;
                onUpdate(newMarkdown);
                if (contentRef.current) contentRef.current.innerHTML = processMarkdownWithPills(newMarkdown);
                setIsEmojiPickerOpen(false);
                setPickerCursorOffset(null);
              }}
            />
          </Portal>
        )}

        {isMathPickerOpen && !readonly && (
          <Portal>
            <MathPickerPopover 
              top={slashMenuPosition.top} 
              left={slashMenuPosition.left} 
              onClose={() => setIsMathPickerOpen(false)}
              onSelect={(formula) => {
                const markdown = revertToMarkdown(contentRef.current?.innerHTML || "");
                const cursor = pickerCursorOffset ?? markdown.length;
                const safeCursor = Math.max(0, Math.min(cursor, markdown.length));
                const newMarkdown = `${markdown.slice(0, safeCursor)}${formula} ${markdown.slice(safeCursor)}`;
                onUpdate(newMarkdown);
                if (contentRef.current) contentRef.current.innerHTML = processMarkdownWithPills(newMarkdown);
                setIsMathPickerOpen(false);
                setPickerCursorOffset(null);
              }}
            />
          </Portal>
        )}
      </div>
    );
  };
