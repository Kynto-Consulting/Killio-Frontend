"use client";

import { useRef } from "react";
import { Send, Bot } from "lucide-react";
import { ReferenceTokenInput } from "@/components/ui/reference-token-input";
import type { DocumentSummary } from "@/lib/api/documents";

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface RoomInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onTyping?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  roomName?: string;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: any[];
  onAiTrigger?: (content: string) => void;
  t: TFn;
}

const AI_PREFIXES = ["@ai ", "@AI "];

export function RoomInput({
  value,
  onChange,
  onSend,
  onTyping,
  disabled = false,
  readOnly = false,
  roomName = "",
  documents,
  boards,
  users,
  onAiTrigger,
  t,
}: RoomInputProps) {
  const isAiQuery = AI_PREFIXES.some((p) => value.startsWith(p));

  const handleChange = (v: string) => {
    onChange(v);
    onTyping?.();
  };

  const handleSubmit = () => {
    if (!value.trim()) return;
    const aiPrefix = AI_PREFIXES.find((p) => value.startsWith(p));
    if (aiPrefix && onAiTrigger) {
      onAiTrigger(value.slice(aiPrefix.length).trim());
      onChange("");
      return;
    }
    onSend();
  };

  if (readOnly) {
    return (
      <div className="px-4 py-3 border-t border-border/50 bg-background/30">
        <div className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2 text-xs text-muted-foreground italic text-center">
          {t("chat.readOnly")}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-border/50 bg-background/30 shrink-0">
      {isAiQuery && (
        <div className="flex items-center gap-1.5 text-[10px] text-violet-400 font-medium mb-1.5 px-1">
          <Bot className="w-3 h-3" />
          <span>AI Copilot mode — press Enter to open Copilot panel</span>
        </div>
      )}
      <div className="relative flex items-center">
        <ReferenceTokenInput
          value={value}
          onChange={handleChange}
          placeholder={t("chat.inputPlaceholder").replace("{roomName}", roomName)}
          documents={documents}
          boards={boards}
          users={users}
          onSubmit={handleSubmit}
          submitOnEnter
          disabled={disabled}
          className="w-full"
          inputClassName="pr-10 shadow-sm"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className={`absolute right-1.5 p-1.5 rounded-full transition-colors shadow-sm disabled:opacity-40 ${
            isAiQuery
              ? "bg-violet-600 text-white hover:bg-violet-700"
              : "bg-accent text-accent-foreground hover:bg-accent/90"
          }`}
        >
          {isAiQuery ? <Bot className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
