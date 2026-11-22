"use client";

import { useRef, useState, type ReactNode } from "react";
import { SmilePlus } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { EmojiPickerPopover } from "./EmojiPickerPopover";
import type { EmojiPickerProps } from "./EmojiPicker";

/** A button that toggles the picker popover and calls `onSelect` (closing after each pick unless `keepOpen`). */
export function EmojiPickerButton({
  onSelect, customEmojis, className = "", icon, label, keepOpen = false, disabled,
}: Pick<EmojiPickerProps, "onSelect" | "customEmojis"> & { className?: string; icon?: ReactNode; label?: string; keepOpen?: boolean; disabled?: boolean }) {
  const t = useTranslations("emoji");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const text = label ?? t("picker.label");
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-label={text}
        title={text}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className || "shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"}
      >
        {icon ?? <SmilePlus className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <EmojiPickerPopover
          anchor={ref.current}
          customEmojis={customEmojis}
          onClose={() => setOpen(false)}
          onSelect={(v, s) => { onSelect(v, s); if (!keepOpen) setOpen(false); }}
        />
      )}
    </>
  );
}
