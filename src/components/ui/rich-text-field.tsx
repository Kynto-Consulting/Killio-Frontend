"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Portal } from "./portal";
import { InlineFormatToolbar } from "../bricks/inline-format-toolbar";

/**
 * RichTextField — a LIGHT, inline contentEditable rich-text editor for tight
 * spaces (database cells, etc). Edits directly on rendered HTML and serializes
 * to the same markdown token format the rest of the app uses ([color:]/[bg:]/
 * [lu:]/`**`…), so RichText can display the result. Deliberately NOT the full
 * text brick: no block chrome, no padding/border, no per-instance global
 * machinery — just the inline styles a cell needs.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");

// ── markdown → editable HTML (inline only) ──────────────────────────────────
function findBalancedClose(src: string, from: number, open: string, close: string): number {
  let depth = 1;
  let cur = from;
  while (cur < src.length) {
    const no = src.indexOf(open, cur);
    const nc = src.indexOf(close, cur);
    if (nc === -1) return -1;
    if (no !== -1 && no < nc) { depth++; cur = no + open.length; continue; }
    depth--;
    if (depth === 0) return nc;
    cur = nc + close.length;
  }
  return -1;
}

function inlineDecorations(text: string): string {
  // ** __ ~~ * ` and [lu:] — operate on a plain (already escaped) string.
  let out = text;
  // code first (so * inside code isn't touched)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code class="bg-muted/60 rounded px-1 text-xs font-mono">${c}</code>`);
  out = out.replace(/\[lu:([\w-]+)(?::([\d.]+))?\]/g, (m, name: string, sw?: string) => {
    const tok = `[lu:${name}${sw ? `:${sw}` : ""}]`;
    // Atomic, round-trips via data-token. Shown as a tiny name badge (cells
    // don't normally carry icons; full icon mounting lives in RichText/brick).
    return `<span data-token="${escapeAttr(tok)}" contenteditable="false" class="inline-flex items-center rounded bg-muted/60 px-1 text-[0.85em]">${escapeHtml(name)}</span>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<u>$1</u>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

function wrappersToHtml(value: string): string {
  let html = "";
  let cursor = 0;
  while (cursor < value.length) {
    const kinds: Array<{ start: number; kind: "color" | "bg" | "link" }> = [
      value.indexOf("[color:", cursor) !== -1 ? { start: value.indexOf("[color:", cursor), kind: "color" as const } : null,
      value.indexOf("[bg:", cursor) !== -1 ? { start: value.indexOf("[bg:", cursor), kind: "bg" as const } : null,
      value.indexOf("[link:", cursor) !== -1 ? { start: value.indexOf("[link:", cursor), kind: "link" as const } : null,
    ].filter(Boolean) as Array<{ start: number; kind: "color" | "bg" | "link" }>;
    if (kinds.length === 0) { html += inlineDecorations(escapeHtml(value.slice(cursor))); break; }
    const next = kinds.sort((a, b) => a.start - b.start)[0];
    if (next.start > cursor) html += inlineDecorations(escapeHtml(value.slice(cursor, next.start)));
    const openTag = next.kind === "color" ? "[color:" : next.kind === "bg" ? "[bg:" : "[link:";
    const closeTag = next.kind === "color" ? "[/color]" : next.kind === "bg" ? "[/bg]" : "[/link]";
    const openEnd = value.indexOf("]", next.start);
    const closeIdx = openEnd === -1 ? -1 : findBalancedClose(value, openEnd + 1, openTag, closeTag);
    if (openEnd === -1 || closeIdx === -1) { html += inlineDecorations(escapeHtml(value.slice(next.start))); break; }
    const arg = value.slice(next.start + openTag.length, openEnd).trim();
    const inner = wrappersToHtml(value.slice(openEnd + 1, closeIdx));
    if (next.kind === "color") html += `<span data-color="${escapeAttr(arg)}" style="color:${escapeAttr(arg)}">${inner}</span>`;
    else if (next.kind === "bg") html += `<span data-bg="${escapeAttr(arg)}" style="background-color:${escapeAttr(arg)};padding:0 2px;border-radius:3px">${inner}</span>`;
    else html += `<a data-link="${escapeAttr(arg)}" href="${escapeAttr(arg)}" class="text-accent underline">${inner}</a>`;
    cursor = closeIdx + closeTag.length;
  }
  return html;
}

export function markdownToFieldHtml(md: string): string {
  return md.split(/\r?\n/).map((l) => wrappersToHtml(l)).join("<br>");
}

// ── editable HTML → markdown ────────────────────────────────────────────────
export function fieldHtmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  let md = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { md += (node.textContent || "").replace(/​/g, ""); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tok = el.getAttribute("data-token");
    if (tok) { md += tok; return; }
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { md += "\n"; return; }
    if (tag === "strong" || tag === "b") { md += "**"; el.childNodes.forEach(walk); md += "**"; return; }
    if (tag === "em" || tag === "i") { md += "*"; el.childNodes.forEach(walk); md += "*"; return; }
    if (tag === "u") { md += "__"; el.childNodes.forEach(walk); md += "__"; return; }
    if (tag === "s" || tag === "strike") { md += "~~"; el.childNodes.forEach(walk); md += "~~"; return; }
    if (tag === "code") { md += "`" + (el.textContent || "") + "`"; return; }
    if (tag === "span" && el.hasAttribute("data-bg")) { md += `[bg:${el.getAttribute("data-bg")}]`; el.childNodes.forEach(walk); md += "[/bg]"; return; }
    if (tag === "span" && el.hasAttribute("data-color")) { md += `[color:${el.getAttribute("data-color")}]`; el.childNodes.forEach(walk); md += "[/color]"; return; }
    if (tag === "a" && (el.getAttribute("data-link") || el.getAttribute("href"))) { md += `[link:${el.getAttribute("data-link") || el.getAttribute("href")}]`; el.childNodes.forEach(walk); md += "[/link]"; return; }
    if (tag === "div" || tag === "p") { if (md && !md.endsWith("\n")) md += "\n"; el.childNodes.forEach(walk); return; }
    el.childNodes.forEach(walk);
  };
  div.childNodes.forEach(walk);
  return md.replace(/\n+$/g, "");
}

interface RichTextFieldProps {
  value: string;
  onChange: (markdown: string) => void;
  onBlur?: (markdown: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  /** Hidden toolbar features, e.g. ["heading","size","math","block"] for cells. */
  disabledStyles?: string[];
}

export function RichTextField({ value, onChange, onBlur, autoFocus, placeholder, className, disabledStyles = [] }: RichTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSerialized = useRef(value);
  const savedRange = useRef<Range | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number; bottom: number } | null>(null);

  // Seed HTML when value changes externally (not from our own typing).
  useEffect(() => {
    if (!ref.current) return;
    if (value === lastSerialized.current && ref.current.innerHTML) return;
    ref.current.innerHTML = markdownToFieldHtml(value || "");
    if (!ref.current.textContent?.trim()) ref.current.setAttribute("data-empty", "true");
    else ref.current.removeAttribute("data-empty");
    lastSerialized.current = value;
  }, [value]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const r = document.createRange();
      r.selectNodeContents(ref.current);
      r.collapse(false);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  }, [autoFocus]);

  const serialize = useCallback(() => {
    if (!ref.current) return value;
    const md = fieldHtmlToMarkdown(ref.current.innerHTML || "");
    lastSerialized.current = md;
    return md;
  }, [value]);

  const commit = useCallback(() => { onChange(serialize()); }, [onChange, serialize]);

  const updateToolbar = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !ref.current) { setToolbar(null); return; }
    const r = sel.getRangeAt(0);
    if (!ref.current.contains(r.commonAncestorContainer) || !sel.toString().trim()) { setToolbar(null); return; }
    savedRange.current = r.cloneRange();
    let rect = r.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { const rs = r.getClientRects(); rect = rs[0] || ref.current.getBoundingClientRect(); }
    setToolbar({ top: rect.top, left: rect.left + rect.width / 2, bottom: rect.bottom });
  }, []);

  // restore selection saved before clicking a toolbar button
  const restore = () => {
    const sel = window.getSelection();
    if (savedRange.current && sel) { sel.removeAllRanges(); sel.addRange(savedRange.current); }
  };

  const onFormat = (type: string) => {
    ref.current?.focus();
    restore();
    if (type === "bold") document.execCommand("bold");
    else if (type === "italic") document.execCommand("italic");
    else if (type === "underline") document.execCommand("underline");
    else if (type === "strike") document.execCommand("strikeThrough");
    else if (type === "code") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) { const rng = sel.getRangeAt(0); const c = document.createElement("code"); c.appendChild(rng.extractContents()); rng.insertNode(c); }
    } else if (type === "link") {
      const url = window.prompt("URL");
      if (url) document.execCommand("createLink", false, /^(https?:|mailto:|\/)/.test(url) ? url : `https://${url}`);
      ref.current?.querySelectorAll("a[href]:not([data-link])").forEach((a) => a.setAttribute("data-link", a.getAttribute("href") || ""));
    }
    commit();
    setToolbar(null);
  };

  const applyStyle = (attr: "data-color" | "data-bg", value: string, style: Partial<CSSStyleDeclaration>) => {
    ref.current?.focus();
    restore();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const frag = range.extractContents();
    frag.querySelectorAll(`span[${attr}]`).forEach((sp) => { const p = sp.parentNode; if (!p) return; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); p.removeChild(sp); });
    const span = document.createElement("span");
    span.setAttribute(attr, value);
    Object.assign(span.style, style);
    span.appendChild(frag);
    range.insertNode(span);
    sel.removeAllRanges();
    commit();
  };

  const onAction = (action: string) => {
    if (action === "clear") { document.execCommand("removeFormat"); ref.current?.querySelectorAll("span[data-color],span[data-bg]").forEach((sp) => { const p = sp.parentNode; if (!p) return; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); p.removeChild(sp); }); commit(); setToolbar(null); }
    else if (action.startsWith("color:")) applyStyle("data-color", action.slice(6), { color: action.slice(6) });
    else if (action.startsWith("bg:")) { const v = action.slice(3); applyStyle("data-bg", v, { backgroundColor: v, padding: "0 2px", borderRadius: "3px" }); }
  };

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={
          "outline-none whitespace-pre-wrap break-words " +
          "data-[empty=true]:before:content-[attr(data-placeholder)] data-[empty=true]:before:text-muted-foreground/40 " +
          (className || "")
        }
        onInput={() => { onChange(serialize()); const r = ref.current; if (r) { if (!r.textContent?.trim()) r.setAttribute("data-empty", "true"); else r.removeAttribute("data-empty"); } setTimeout(updateToolbar, 0); }}
        onMouseUp={() => setTimeout(updateToolbar, 0)}
        onKeyUp={() => setTimeout(updateToolbar, 0)}
        onBlur={() => { const md = serialize(); onChange(md); onBlur?.(md); setToolbar(null); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { (e.target as HTMLElement).blur(); } }}
      />
      {toolbar && (
        <Portal>
          <InlineFormatToolbar
            position={toolbar}
            isVisible
            aiEnabled={false}
            commentsEnabled={false}
            disabledStyles={["heading", "size", "math", "block", "lucide", "emoji", "date", ...disabledStyles]}
            onFormat={onFormat as any}
            onAction={onAction}
          />
        </Portal>
      )}
    </>
  );
}
