"use client";

import React, { useState, useRef, useLayoutEffect } from "react";
import { 
  Bold, Italic, Strikethrough, Code, Link, 
  Underline, List, MessageSquare, SmilePlus, Calendar, 
  PenSquare, Settings2, Sparkles, Sigma, MoreHorizontal,
  ChevronDown, Type, Highlighter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";

interface InlineFormatToolbarProps {
  position: { top: number; left: number; bottom?: number };
  onFormat: (type: "bold" | "italic" | "strike" | "code" | "link" | "underline" | "math") => void;
  onAction?: (action: string) => void;
  isVisible: boolean;
}

export const InlineFormatToolbar: React.FC<InlineFormatToolbarProps> = ({
  position,
  onFormat,
  onAction,
  isVisible,
}) => {
  const t = useTranslations("document-detail");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPosition] = useState({ top: position.top, left: position.left });
  const [activePanel, setActivePanel] = useState<'color' | 'size' | 'highlight' | null>(null);

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
      className="fixed z-[999] flex flex-col gap-2 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-2 shadow-xl w-[260px] animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: adjustedPos.top,
        left: adjustedPos.left,
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing focus on editor
    >
      {/* Row 1: Formatting Options */}
      <div className="flex items-center justify-between">
        <button 
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Turn into list / Change format"
        >
          <List className="h-4 w-4" />
        </button>
        
        <div className="w-[1px] h-4 bg-border/60 mx-0.5"></div>

        <button 
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded hover:bg-muted hover:text-foreground transition-colors font-serif font-bold",
            activePanel === 'color' ? "bg-muted text-foreground" : "text-muted-foreground"
          )}
          title="Text Color"
          onClick={() => setActivePanel((p) => p === 'color' ? null : 'color')}
        >
          A
        </button>

        <button
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded hover:bg-muted hover:text-foreground transition-colors",
            activePanel === 'size' ? "bg-muted text-foreground" : "text-muted-foreground"
          )}
          title="Text Size"
          onClick={() => setActivePanel((p) => p === 'size' ? null : 'size')}
        >
          <Type className="h-4 w-4" />
        </button>

        <button
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded hover:bg-muted hover:text-foreground transition-colors",
            activePanel === 'highlight' ? "bg-muted text-foreground" : "text-muted-foreground"
          )}
          title="Highlight"
          onClick={() => setActivePanel((p) => p === 'highlight' ? null : 'highlight')}
        >
          <Highlighter className="h-4 w-4" />
        </button>

        <button
          onClick={() => onFormat("bold")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("formatToolbar.bold") as string || "Bold"}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          onClick={() => onFormat("italic")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("formatToolbar.italic") as string || "Italic"}
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          onClick={() => onFormat("underline")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>

        <div className="w-[1px] h-4 bg-border/60 mx-0.5"></div>

        <button
          onClick={() => onFormat("link")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("formatToolbar.link") as string || "Link"}
        >
          <Link className="h-4 w-4" />
        </button>
        <button
          onClick={() => onFormat("strike")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("formatToolbar.strike") as string || "Strikethrough"}
        >
          <Strikethrough className="h-4 w-4" />
        </button>
        <button
          onClick={() => onFormat("code")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("formatToolbar.code") as string || "Code snippet"}
        >
          <Code className="h-4 w-4" />
        </button>
        <button
          onClick={() => onAction?.("math")}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Insert Math"
        >
          <Sigma className="h-4 w-4" />
        </button>
        
        <button
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
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

      {/* Row 2: Basic Actions */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <button 
          onClick={() => onAction?.("comment")}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40 hover:bg-muted text-xs font-medium rounded-md flex-1 text-foreground transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Comentar
        </button>
        <button 
          onClick={() => onAction?.("emoji")}
          className="p-1.5 bg-muted/40 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" 
          title="Añadir emoji"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => onAction?.("date")}
          className="p-1.5 bg-muted/40 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" 
          title="Añadir fecha"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => onAction?.("edit")}
          className="p-1.5 bg-muted/40 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" 
          title="Sugerir edición"
        >
          <PenSquare className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 3: Habilidades AI */}
      <div className="flex flex-col mt-1">
        <div className="flex items-center justify-between px-2 py-1 mb-0.5">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Habilidades</span>
          <Settings2 className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-foreground" />
        </div>
        
        <div className="flex flex-col">
          <button 
            onClick={() => onAction?.("ai-improve")}
            className="flex items-center px-2 py-1.5 text-sm hover:bg-muted rounded-md text-left text-foreground transition-colors"
          >
            Mejorar redacción
          </button>
          <button 
            onClick={() => onAction?.("ai-fix")}
            className="flex items-center px-2 py-1.5 text-sm hover:bg-muted rounded-md text-left text-foreground transition-colors"
          >
            Corregir
          </button>
          <button 
            onClick={() => onAction?.("ai-explain")}
            className="flex items-center px-2 py-1.5 text-sm hover:bg-muted rounded-md text-left text-foreground transition-colors"
          >
            Explicar
          </button>
          
          <div 
            onClick={() => onAction?.("ai-format")}
            className="flex items-center justify-between px-2 py-1.5 text-sm hover:bg-muted hover:text-foreground rounded-md text-left text-muted-foreground transition-colors cursor-pointer">
            <span>Modificar formato</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-50" />
          </div>
        </div>
      </div>

      {/* Footer: Editar con IA */}
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
    </div>
  );
};
