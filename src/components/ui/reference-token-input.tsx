"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "./portal";
import { ReferencePicker, ReferencePickerSelection } from "@/components/documents/reference-picker";
import { useSession } from "@/components/providers/session-provider";
import { DocumentBrick, getDocument } from "@/lib/api/documents";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { cn } from "@/lib/utils";

type PickerUser = { id: string; name: string; avatarUrl?: string | null };
type PickerCard = { id: string; title: string };

type MentionPart = {
  type: "mention";
  mentionType: "doc" | "board" | "card" | "user";
  id: string;
  name: string;
};

type DeepPart = {
  type: "deep";
  prefix: "$" | "#";
  inner: string;
  label: string;
};

type RichPart = string | MentionPart | DeepPart;

interface ReferenceTokenInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  documents?: any[];
  boards?: any[];
  users?: PickerUser[];
  cards?: PickerCard[];
  activeBricks?: any[];
  onSubmit?: () => void;
  submitOnEnter?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>, currentValue: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tokenEscapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/\"/g, "&quot;");
}

export function ReferenceTokenInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  inputClassName,
  documents = [],
  boards = [],
  users = [],
  cards = [],
  activeBricks = [],
  onSubmit,
  submitOnEnter = true,
  onKeyDown,
}: ReferenceTokenInputProps) {
  const { accessToken } = useSession();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState<{ trigger: number; cursor: number } | null>(null);
  const [documentBricksById, setDocumentBricksById] = useState<Record<string, DocumentBrick[]>>({});

  const resolverContext = useMemo(
    () => ({ documents, boards, users, activeBricks, documentBricksById } as any),
    [documents, boards, users, activeBricks, documentBricksById]
  );

  const getRichParts = useCallback(
    (text: string): RichPart[] => ReferenceResolver.renderRich(text || "", resolverContext) as RichPart[],
    [resolverContext]
  );

  const renderHtmlFromValue = useCallback(
    (text: string) => {
      const parts = getRichParts(text);
      return parts
        .map((part) => {
          if (typeof part === "string") {
            return escapeHtml(part).replace(/\n/g, "<br>");
          }

          if (part.type === "mention") {
            const token = `@[${part.mentionType}:${part.id}:${part.name}]`;
            const isUser = part.mentionType === "user";
            const cls = isUser
              ? "border-primary/25 bg-primary/10 text-primary"
              : "border-accent/25 bg-accent/10 text-accent";
            return `\u200B<span contenteditable=\"false\" data-token=\"${tokenEscapeAttr(token)}\" class=\"inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}\">${escapeHtml(part.name)}</span>\u200B`;
          }

          const token = `${part.prefix}[${part.inner}]`;
          return `\u200B<span contenteditable=\"false\" data-token=\"${tokenEscapeAttr(token)}\" class=\"inline-flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700\">${escapeHtml(part.label)}</span>\u200B`;
        })
        .join("");
    },
    [getRichParts]
  );

  const getMarkdownLengthOfNode = useCallback((node: Node): number => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || "").replace(/\u200b/g, "").length;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return 0;
    }

    const el = node as HTMLElement;
    if (el.dataset.token) {
      return el.dataset.token.length;
    }

    if (el.tagName === "BR") {
      return 1;
    }

    let length = 0;
    for (const child of Array.from(el.childNodes)) {
      length += getMarkdownLengthOfNode(child);
    }
    return length;
  }, []);

  const serializeNode = useCallback(
    (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || "").replace(/\u200b/g, "");
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const el = node as HTMLElement;
      if (el.dataset.token) {
        return el.dataset.token;
      }

      if (el.tagName === "BR") {
        return "\n";
      }

      const out = Array.from(el.childNodes).map((child) => serializeNode(child)).join("");
      if ((el.tagName === "DIV" || el.tagName === "P") && !out.endsWith("\n")) {
        return `${out}\n`;
      }
      return out;
    },
    []
  );

  const readMarkdown = useCallback(() => {
    const root = editorRef.current;
    if (!root) return "";
    const merged = Array.from(root.childNodes)
      .map((node) => serializeNode(node))
      .join("");
    return merged.replace(/\u200b/g, "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n");
  }, [serializeNode]);

  const getVisibleOffset = useCallback(() => {
    const root = editorRef.current;
    if (!root || typeof window === "undefined") return null;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }, []);

  const setVisibleOffset = useCallback((offset: number | null) => {
    const root = editorRef.current;
    if (!root || offset === null || typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let targetNode: Node | null = null;
    let targetOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const len = node.textContent?.length || 0;
      if (remaining <= len) {
        targetNode = node;
        targetOffset = remaining;
        break;
      }
      remaining -= len;
    }

    const range = document.createRange();
    if (targetNode) {
      range.setStart(targetNode, targetOffset);
      range.collapse(true);
    } else {
      range.selectNodeContents(root);
      range.collapse(false);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const getMarkdownCursorOffset = useCallback(() => {
    const root = editorRef.current;
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
        total += node.textContent?.length || 0;
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const el = node as HTMLElement;
      if (el.dataset.token) {
        total += el.dataset.token.length;
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
  }, [getMarkdownLengthOfNode]);

  const applyRenderedValue = useCallback(
    (nextValue: string, preserveVisibleOffset?: number | null) => {
      const root = editorRef.current;
      if (!root) return;

      const nextHtml = renderHtmlFromValue(nextValue);
      if (root.innerHTML !== nextHtml) {
        root.innerHTML = nextHtml;
      }

      if (!nextValue) {
        root.innerHTML = "";
      }

      if (document.activeElement === root && preserveVisibleOffset !== undefined) {
        setVisibleOffset(preserveVisibleOffset);
      }
    },
    [renderHtmlFromValue, setVisibleOffset]
  );

  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;

    const current = readMarkdown();
    if (current === value) return;
    
    // Always apply if the value was cleared externally (e.g., after sending message)
    if (value === "") {
      applyRenderedValue("");
      return;
    }

    if (document.activeElement === root) return;
    applyRenderedValue(value);
  }, [value, applyRenderedValue, readMarkdown]);

  useEffect(() => {
    if (!accessToken) return;

    const docIds = new Set<string>();
    const regex = /\$\[([^:\]]+):([^:\]]+):[^\]]+\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value || "")) !== null) {
      docIds.add(match[1]);
    }

    const missing = Array.from(docIds).filter((docId) => !documentBricksById[docId]);
    if (!missing.length) return;

    let cancelled = false;
    Promise.all(
      missing.map(async (docId) => {
        try {
          const doc = await getDocument(docId, accessToken);
          return { docId, bricks: doc.bricks || [] };
        } catch {
          return { docId, bricks: [] as DocumentBrick[] };
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      setDocumentBricksById((prev) => {
        const next = { ...prev };
        for (const row of rows) next[row.docId] = row.bricks;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [value, accessToken, documentBricksById]);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
    setPickerRange(null);
  }, []);

  const updatePickerState = useCallback(
    (markdown: string, markdownCursor: number | null) => {
      const cursor = markdownCursor ?? markdown.length;
      const trigger = markdown.lastIndexOf("@", Math.max(0, cursor - 1));
      const hasTrigger =
        trigger !== -1 &&
        (trigger === 0 || /\s/.test(markdown[trigger - 1])) &&
        !markdown.slice(trigger, cursor).includes(" ");

      if (hasTrigger) {
        setPickerRange({ trigger, cursor });
        setIsPickerOpen(true);
      } else if (isPickerOpen) {
        closePicker();
      }
    },
    [isPickerOpen, closePicker]
  );

  const handleInput = useCallback(() => {
    const markdown = readMarkdown();
    const markdownCursor = getMarkdownCursorOffset();

    onChange(markdown);
    updatePickerState(markdown, markdownCursor);
  }, [readMarkdown, getMarkdownCursorOffset, onChange, updatePickerState]);

  const findAdjacentToken = useCallback((direction: "backward" | "forward") => {
    const root = editorRef.current;
    if (!root || typeof window === "undefined") return null;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;

    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;

    const isTokenElement = (node: Node | null): node is HTMLElement =>
      !!node && node.nodeType === Node.ELEMENT_NODE && !!(node as HTMLElement).dataset.token;

    const pickFromNode = (node: Node | null, pickLast: boolean): HTMLElement | null => {
      if (!node) return null;
      if (isTokenElement(node)) return node;
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const children = Array.from(node.childNodes);
      if (!children.length) return null;
      const candidate = pickLast ? children[children.length - 1] : children[0];
      return isTokenElement(candidate) ? candidate : null;
    };

    const isIgnorableText = (node: Node | null): boolean =>
      !!node && node.nodeType === Node.TEXT_NODE && ((node.textContent || "").replace(/\u200b/g, "").trim().length === 0);

    const moveSiblingSkippingIgnorable = (node: Node | null, dir: "backward" | "forward"): Node | null => {
      let current = node;
      while (current && isIgnorableText(current)) {
        current = dir === "backward" ? current.previousSibling : current.nextSibling;
      }
      return current;
    };

    if (container.nodeType === Node.TEXT_NODE) {
      if (direction === "backward" && offset > 0) return null;
      const sibling = moveSiblingSkippingIgnorable(
        direction === "backward" ? container.previousSibling : container.nextSibling,
        direction
      );
      return pickFromNode(sibling, direction === "backward");
    }

    const children = Array.from(container.childNodes);
    if (direction === "backward") {
      const idx = offset - 1;
      if (idx >= 0 && idx < children.length) {
        const candidate = moveSiblingSkippingIgnorable(children[idx], "backward");
        return pickFromNode(candidate, true);
      }
    } else {
      const idx = offset;
      if (idx >= 0 && idx < children.length) {
        const candidate = moveSiblingSkippingIgnorable(children[idx], "forward");
        return pickFromNode(candidate, false);
      }
    }

    return null;
  }, []);

  const removeTokenNode = useCallback(
    (node: HTMLElement) => {
      const root = editorRef.current;
      if (!root) return;

      const visible = getVisibleOffset();
      node.remove();
      const markdown = readMarkdown();
      onChange(markdown);
      applyRenderedValue(markdown, visible === null ? null : Math.max(0, visible - 1));
    },
    [getVisibleOffset, readMarkdown, onChange, applyRenderedValue]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      onKeyDown?.(e, readMarkdown());
      if (e.defaultPrevented) return;

      if (submitOnEnter && e.key === "Enter" && !e.shiftKey && onSubmit) {
        e.preventDefault();
        onSubmit();
        return;
      }

      if (e.key === "Backspace") {
        const token = findAdjacentToken("backward");
        if (token) {
          e.preventDefault();
          removeTokenNode(token);
          return;
        }
      }

      if (e.key === "Delete") {
        const token = findAdjacentToken("forward");
        if (token) {
          e.preventDefault();
          removeTokenNode(token);
          return;
        }
      }

      if (e.key === "@") {
        setTimeout(() => {
          const markdown = readMarkdown();
          const cursor = getMarkdownCursorOffset();
          updatePickerState(markdown, cursor);
        }, 0);
      }
    },
    [disabled, onKeyDown, readMarkdown, submitOnEnter, onSubmit, findAdjacentToken, removeTokenNode, getMarkdownCursorOffset, updatePickerState]
  );

  const insertPickedToken = useCallback(
    (item: ReferencePickerSelection) => {
      const current = readMarkdown();
      const cursor = pickerRange?.cursor ?? current.length;
      const trigger = pickerRange?.trigger ?? Math.max(current.lastIndexOf("@", Math.max(0, cursor - 1)), 0);
      const token = item.token;
      const next = `${current.slice(0, trigger)}${token} ${current.slice(cursor)}`;

      onChange(next);
      applyRenderedValue(next);
      closePicker();

      setTimeout(() => {
        const root = editorRef.current;
        if (!root) return;
        root.focus();
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }, 0);
    },
    [readMarkdown, pickerRange, onChange, applyRenderedValue, closePicker]
  );

  const displayPlaceholder = !value;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const markdown = readMarkdown();
          onChange(markdown);
          applyRenderedValue(markdown);
        }}
        className={cn(
          "w-full rounded-full border border-input bg-card px-4 py-2.5 text-sm outline-none transition-all focus:ring-1 focus:ring-accent",
          "min-h-[42px] leading-6",
          disabled && "cursor-not-allowed opacity-60",
          inputClassName
        )}
      />

      {displayPlaceholder && (
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-muted-foreground/70">
          {placeholder || "Escribe aquí..."}
        </div>
      )}

      {isPickerOpen && !disabled && (
        <Portal>
          <ReferencePicker
            boards={boards}
            documents={documents}
            users={users}
            cards={cards}
            activeBricks={activeBricks}
            onClose={closePicker}
            onSelect={insertPickedToken}
          />
        </Portal>
      )}
    </div>
  );
}
