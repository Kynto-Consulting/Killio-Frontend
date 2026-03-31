"use client";

import React, { useState } from "react";
import { 
  Bold, Italic, Strikethrough, Code, Link, 
  Underline, List, MessageSquare, SmilePlus, Calendar, 
  PenSquare, Settings2, Sparkles, Sigma, MoreHorizontal,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";

interface InlineFormatToolbarProps {
  position: { top: number; left: number };
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

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-[999] flex flex-col gap-2 rounded-xl border border-border bg-popover/95 backdrop-blur-md p-2 shadow-2xl w-[260px] animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: position.top,
        left: position.left,
        transform: "translate(-50%, -100%)",
        marginTop: "-12px",
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
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground font-serif hover:text-foreground transition-colors font-bold"
          title="Text Color / Highlight"
        >
          A
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
          
          <div className="flex items-center justify-between px-2 py-1.5 text-sm hover:bg-muted rounded-md text-left text-muted-foreground transition-colors cursor-pointer">
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
