"use client";

import React from "react";
import { Bold, Italic, Strikethrough, Code, Link } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";

interface InlineFormatToolbarProps {
  position: { top: number; left: number };
  onFormat: (type: "bold" | "italic" | "strike" | "code" | "link") => void;
  isVisible: boolean;
}

export const InlineFormatToolbar: React.FC<InlineFormatToolbarProps> = ({
  position,
  onFormat,
  isVisible,
}) => {
  const t = useTranslations("document-detail");

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-[999] flex items-center gap-1 rounded-md border border-neutral-200 bg-white p-1 shadow-md dark:border-neutral-800 dark:bg-neutral-900"
      style={{
        top: position.top,
        left: position.left,
        transform: "translate(-50%, -100%)",
        marginTop: "-8px",
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing focus on editor
    >
      <button
        onClick={() => onFormat("bold")}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        title={t("formatToolbar.bold") as string}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        onClick={() => onFormat("italic")}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        title={t("formatToolbar.italic") as string}
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        onClick={() => onFormat("strike")}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        title={t("formatToolbar.strike") as string}
      >
        <Strikethrough className="h-4 w-4" />
      </button>
      <button
        onClick={() => onFormat("code")}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        title={t("formatToolbar.code") as string}
      >
        <Code className="h-4 w-4" />
      </button>
      <button
        onClick={() => onFormat("link")}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        title={t("formatToolbar.link") as string}
      >
        <Link className="h-4 w-4" />
      </button>
    </div>
  );
};
