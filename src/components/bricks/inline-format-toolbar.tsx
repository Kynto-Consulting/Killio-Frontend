"use client";

import React, { useState, useRef, useLayoutEffect } from "react";
import {
  Bold, Italic, Strikethrough, Code, Link,
  Underline, MessageSquare, SmilePlus, Calendar,
  Sparkles, Sigma,
  Type, Highlighter, Eraser,
  Pilcrow, Quote, SquareCode, Shapes
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";

interface InlineFormatToolbarProps {
  position: { top: number; left: number; bottom?: number };
  onFormat: (type: "bold" | "italic" | "strike" | "code" | "link" | "underline" | "math") => void;
  onAction?: (action: string) => void;
  isVisible: boolean;
  /** When false the AI-powered actions (improve/fix/explain/suggest-edit/Edit
   *  with AI) are hidden — e.g. local workspaces where the copilot is off. */
  aiEnabled?: boolean;
  /** When false the Comment action is hidden (no brick-comment host). */
  commentsEnabled?: boolean;
  /** Style features to hide from the toolbar. e.g. database cells pass
   *  ["heading","size"] so the size button + heading block options vanish. */
  disabledStyles?: string[];
}

export const InlineFormatToolbar: React.FC<InlineFormatToolbarProps> = ({
  position,
  onFormat,
  onAction,
  isVisible,
  aiEnabled = true,
  commentsEnabled = true,
  disabledStyles = [],
}) => {
  // Granular on/off for every toolbar feature. Pass any of these keys in
  // disabledStyles to hide that control anywhere:
  //   bold italic underline strike code link math
  //   color highlight size block heading quote callout codeblock
  //   lucide emoji date clear
  const dis = (key: string) => disabledStyles.includes(key);
  const noSize = dis("size");
  const noHeading = dis("heading");
  const BTN = "flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors";
  const panelBtn = (active: boolean, extra = "") => cn("flex h-7 w-7 items-center justify-center rounded hover:bg-muted hover:text-foreground transition-colors", extra, active ? "bg-muted text-foreground" : "text-muted-foreground");
  const Divider = () => <div className="w-[1px] h-4 bg-border/60 mx-0.5" />;
  const t = useTranslations("document-detail");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPosition] = useState({ top: position.top, left: position.left });
  const [activePanel, setActivePanel] = useState<'color' | 'size' | 'highlight' | 'block' | null>(null);

  const CALLOUT_PRESETS = [
    { label: "Note",      type: "note",      color: "#38bdf8" },
    { label: "Tip",       type: "tip",       color: "#34d399" },
    { label: "Important", type: "important", color: "#a78bfa" },
    { label: "Warning",   type: "warning",   color: "#fbbf24" },
    { label: "Danger",    type: "danger",    color: "#fb7185" },
  ];

  const COLOR_PRESETS = [
    { label: "Default", value: "inherit" },
    { label: "White",   value: "#ffffff" },
    { label: "Gray",    value: "#94a3b8" },
    { label: "Red",     value: "#f87171" },
    { label: "Orange",  value: "#fb923c" },
    { label: "Yellow",  value: "#facc15" },
    { label: "Green",   value: "#4ade80" },
    { label: "Cyan",    value: "#22d3ee" },
    { label: "Blue",    value: "#60a5fa" },
    { label: "Purple",  value: "#c084fc" },
    { label: "Pink",    value: "#f472b6" },
  ];

  const SIZE_PRESETS = [
    { label: "XS",  value: "0.65rem" },
    { label: "SM",  value: "0.75rem" },
    { label: "MD",  value: "1rem" },
    { label: "LG",  value: "1.25rem" },
    { label: "XL",  value: "1.5rem" },
    { label: "2XL", value: "2rem" },
    { label: "3XL", value: "2.5rem" },
  ];

  const HIGHLIGHT_PRESETS = [
    { label: "None",   value: "transparent" },
    { label: "Yellow", value: "#fef08a" },
    { label: "Green",  value: "#86efac" },
    { label: "Cyan",   value: "#67e8f9" },
    { label: "Blue",   value: "#93c5fd" },
    { label: "Pink",   value: "#f9a8d4" },
    { label: "Orange", value: "#fdba74" },
    { label: "Purple", value: "#c4b5fd" },
  ];

  useLayoutEffect(() => {
    if (isVisible && toolbarRef.current) {
      const rect = toolbarRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const margin = 12;
      const gap = 10;
      
      let newLeft = position.left - rect.width / 2;
      let newTop = position.top - rect.height - gap;
      const anchorBottom = position.bottom ?? position.top;

      // Prefer above selection; if no room, render below.
      if (newTop < margin) {
        newTop = anchorBottom + gap;
      }

      // Clamp to viewport for comfort.
      newLeft = Math.max(margin, Math.min(screenWidth - rect.width - margin, newLeft));
      newTop = Math.max(margin, Math.min(screenHeight - rect.height - margin, newTop));
      
      setAdjustedPosition({ top: newTop, left: newLeft });
    } else {
      setAdjustedPosition({ top: position.top, left: position.left });
    }
  }, [position, isVisible]);

  if (!isVisible) return null;

  return (
    <div
      ref={toolbarRef}
      data-editor-floating-ui="true"
      data-inline-format-toolbar="true"
      className="fixed z-[999] flex flex-col gap-2 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-2 shadow-xl w-[300px] animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: adjustedPos.top,
        left: adjustedPos.left,
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing focus on editor
    >
      {/* Row 1: Formatting — basics first (Notion-style), then dropdowns. */}
      <div className="flex items-center flex-wrap gap-0.5">
        {!dis("bold") && <button onClick={() => onFormat("bold")} className={BTN} title={t("formatToolbar.bold") as string || "Bold"}><Bold className="h-4 w-4" /></button>}
        {!dis("italic") && <button onClick={() => onFormat("italic")} className={BTN} title={t("formatToolbar.italic") as string || "Italic"}><Italic className="h-4 w-4" /></button>}
        {!dis("underline") && <button onClick={() => onFormat("underline")} className={BTN} title="Underline"><Underline className="h-4 w-4" /></button>}
        {!dis("strike") && <button onClick={() => onFormat("strike")} className={BTN} title={t("formatToolbar.strike") as string || "Strikethrough"}><Strikethrough className="h-4 w-4" /></button>}
        {!dis("code") && <button onClick={() => onFormat("code")} className={BTN} title={t("formatToolbar.code") as string || "Code"}><Code className="h-4 w-4" /></button>}
        {!dis("link") && <button onClick={() => onFormat("link")} className={BTN} title={t("formatToolbar.link") as string || "Link"}><Link className="h-4 w-4" /></button>}

        <Divider />

        {!dis("color") && <button className={panelBtn(activePanel === 'color', "font-serif font-bold")} title="Text color" onClick={() => setActivePanel((p) => p === 'color' ? null : 'color')}>A</button>}
        {!dis("highlight") && <button className={panelBtn(activePanel === 'highlight')} title="Highlight" onClick={() => setActivePanel((p) => p === 'highlight' ? null : 'highlight')}><Highlighter className="h-4 w-4" /></button>}
        {!noSize && <button className={panelBtn(activePanel === 'size')} title="Text size" onClick={() => setActivePanel((p) => p === 'size' ? null : 'size')}><Type className="h-4 w-4" /></button>}
        {!dis("block") && <button className={panelBtn(activePanel === 'block')} title="Turn into (heading, quote, code, callout)" onClick={() => setActivePanel((p) => p === 'block' ? null : 'block')}><Pilcrow className="h-4 w-4" /></button>}

        {(!dis("math") || !dis("clear")) && <Divider />}

        {!dis("math") && <button onClick={() => onAction?.("math")} className={BTN} title="Insert math"><Sigma className="h-4 w-4" /></button>}
        {!dis("clear") && <button
          onClick={() => onAction?.("clear")}
          className={BTN}
          title="Clear formatting"
        >
          <Eraser className="h-4 w-4" />
        </button>}
      </div>

      {/* Color picker panel */}
      {activePanel === 'color' && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 px-1 py-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              className="h-5 w-5 rounded-full border border-border/60 hover:scale-110 transition-transform shrink-0"
              style={{ background: c.value === "inherit" ? "linear-gradient(135deg,#fff 50%,#000 50%)" : c.value }}
              onClick={() => { onAction?.(`color:${c.value}`); setActivePanel(null); }}
            />
          ))}
          <input
            type="color"
            className="h-5 w-5 cursor-pointer rounded border border-border/60 bg-transparent p-0"
            title="Custom color"
            onChange={(e) => onAction?.(`color:${e.target.value}`)}
            onBlur={() => setActivePanel(null)}
          />
        </div>
      )}

      {/* Size picker panel */}
      {activePanel === 'size' && (
        <div className="flex flex-wrap items-center gap-1 border-t border-border/40 px-1 py-2">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s.value}
              title={s.value}
              className="flex h-6 items-center justify-center rounded px-2 bg-muted/40 hover:bg-muted text-foreground transition-colors"
              style={{ fontSize: s.value }}
              onClick={() => { onAction?.(`size:${s.value}`); setActivePanel(null); }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Highlight picker panel */}
      {activePanel === 'highlight' && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 px-1 py-2">
          {HIGHLIGHT_PRESETS.map((h) => (
            <button
              key={h.value}
              title={h.label}
              className="h-5 w-5 rounded border border-border/60 hover:scale-110 transition-transform shrink-0"
              style={{ background: h.value === "transparent" ? "transparent" : h.value }}
              onClick={() => { onAction?.(`bg:${h.value}`); setActivePanel(null); }}
            />
          ))}
          <input
            type="color"
            className="h-5 w-5 cursor-pointer rounded border border-border/60 bg-transparent p-0"
            title="Custom highlight"
            onChange={(e) => onAction?.(`bg:${e.target.value}`)}
            onBlur={() => setActivePanel(null)}
          />
        </div>
      )}

      {/* Block type panel — set/clear headings, quote, code, callouts */}
      {activePanel === 'block' && (
        <div className="flex flex-col gap-1.5 border-t border-border/40 px-1 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <button title="Text / clear" className="flex h-7 items-center gap-1 rounded px-2 bg-muted/40 hover:bg-muted text-foreground transition-colors" onClick={() => { onAction?.("block:paragraph"); setActivePanel(null); }}>
              <Pilcrow className="h-3.5 w-3.5" /> <span className="text-xs">Text</span>
            </button>
            {!noHeading && ([1, 2, 3, 4, 5] as const).map((h) => (
              <button key={h} title={`Heading ${h}`} className="flex h-7 w-8 items-center justify-center rounded bg-muted/40 hover:bg-muted text-foreground font-bold transition-colors text-xs" onClick={() => { onAction?.(`block:h${h}`); setActivePanel(null); }}>
                H{h}
              </button>
            ))}
            <button title="Quote" className="flex h-7 w-8 items-center justify-center rounded bg-muted/40 hover:bg-muted text-foreground transition-colors" onClick={() => { onAction?.("block:quote"); setActivePanel(null); }}>
              <Quote className="h-3.5 w-3.5" />
            </button>
            <button title="Code block" className="flex h-7 w-8 items-center justify-center rounded bg-muted/40 hover:bg-muted text-foreground transition-colors" onClick={() => { onAction?.("block:code"); setActivePanel(null); }}>
              <SquareCode className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 px-0.5">Callout</span>
            {CALLOUT_PRESETS.map((c) => (
              <button key={c.type} title={c.label} className="flex h-6 items-center gap-1 rounded px-1.5 border border-border/50 hover:bg-muted text-foreground transition-colors text-[11px]" onClick={() => { onAction?.(`block:callout:${c.type}`); setActivePanel(null); }}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} /> {c.label}
              </button>
            ))}
            <input
              type="color"
              className="h-5 w-5 cursor-pointer rounded border border-border/60 bg-transparent p-0"
              title="Custom callout color"
              onChange={(e) => { onAction?.(`block:callout:${e.target.value}`); }}
              onBlur={() => setActivePanel(null)}
            />
          </div>
        </div>
      )}

      {/* Row 2: Basic Actions */}
      <div className="flex items-center gap-1.5 mt-0.5">
        {commentsEnabled && (
          <button
            onClick={() => onAction?.("comment")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40 hover:bg-muted text-xs font-medium rounded-md flex-1 text-foreground transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" /> {t("formatToolbar.comment") as string || "Comentar"}
          </button>
        )}
        {!dis("emoji") && <button
          onClick={() => onAction?.("emoji")}
          className="p-1.5 bg-muted/40 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Añadir emoji"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>}
        {!dis("lucide") && <button
          onClick={() => onAction?.("icon")}
          className="p-1.5 bg-muted/40 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Insertar icono (Lucide)"
        >
          <Shapes className="w-3.5 h-3.5" />
        </button>}
        {!dis("date") && <button
          onClick={() => onAction?.("date")}
          className="p-1.5 bg-muted/40 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Añadir fecha"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>}
      </div>

      {/* AI quick actions — compact chips (not 4 stacked rows). */}
      {aiEnabled && (
      <div className="flex flex-wrap items-center gap-1 mt-1 pt-1 border-t border-border/40">
        {([
          { a: "ai-improve", l: "Mejorar" },
          { a: "ai-fix", l: "Corregir" },
          { a: "ai-explain", l: "Explicar" },
          { a: "ai-format", l: "Formato" },
        ] as const).map((it) => (
          <button key={it.a} onClick={() => onAction?.(it.a)}
            className="px-2 py-1 text-xs rounded-md bg-muted/40 hover:bg-muted text-foreground transition-colors">
            {it.l}
          </button>
        ))}
      </div>
      )}

      {/* Footer: Editar con IA */}
      {aiEnabled && (
      <div className="mt-1 pt-1 border-t border-border/60">
        <button
          onClick={() => onAction?.("ai-edit-prompt")}
          className="flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-primary/10 hover:text-primary rounded-md text-left w-full transition-colors group mt-0.5"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary group-hover:animate-pulse" />
            <span>Editar con IA</span>
          </div>
          <kbd className="text-[10px] text-muted-foreground font-mono px-1 py-0.5 bg-background shadow-sm rounded border border-border/50 font-semibold group-hover:border-primary/30 group-hover:text-primary">
            Alt+⇧+E
          </kbd>
        </button>
      </div>
      )}
    </div>
  );
};
