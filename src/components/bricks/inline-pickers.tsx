"use client";

import React, { useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { Button } from "@/components/ui/button";

// Basic input components so we don't have to import the heavy ones if they aren't standard
export function DatePickerPopover({ onSelect, onClose, top, left }: { onSelect: (ts: string) => void, onClose: () => void, top: number, left: number }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const handleApply = () => {
    if (!date) return;
    const dt = new Date(`${date}T${time || "00:00"}`);
    const unix = Math.floor(dt.getTime() / 1000);
    onSelect(`<t:${unix}:F>`);
  };

  return (
    <div className="fixed z-[150] p-4 flex flex-col gap-3 rounded-xl border border-border bg-card shadow-2xl w-[260px]" style={{ top, left }}>
      <div className="text-sm font-medium">Seleccionar Fecha/Hora</div>
      <input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={date} onChange={e => setDate(e.target.value)} />
      <input type="time" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" value={time} onChange={e => setTime(e.target.value)} />
      <div className="flex gap-2 justify-end mt-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleApply}>Insertar</Button>
      </div>
    </div>
  );
}

export function EmojiPickerPopover({ onSelect, top, left }: { onSelect: (emoji: string) => void, top: number, left: number }) {
  return (
    <div className="fixed z-[150] shadow-2xl rounded-xl" style={{ top, left }}>
      <EmojiPicker onEmojiClick={(e) => onSelect(e.emoji)} theme={'auto' as any} />
    </div>
  );
}

export function MathPickerPopover({ onSelect, onClose, top, left }: { onSelect: (formula: string) => void, onClose: () => void, top: number, left: number }) {
  const [formula, setFormula] = useState("");

  const insert = () => {
    // Determine whether to use block `$$` or inline `$` based on what we see fit, we use block for display mathematically
    // The prompt says "inline math agrega el $$ formula $$", so we just dump $$ formula $$ 
    onSelect(`$$ ${formula} $$`);
  };

  return (
    <div className="fixed z-[150] p-4 flex flex-col gap-3 rounded-xl border border-border bg-card shadow-2xl w-[320px]" style={{ top, left }}>
      <div className="text-sm font-medium">Editor de Fórmula</div>
      <textarea 
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={formula} 
        onChange={e => setFormula(e.target.value)}
        placeholder="\int_0^\infty e^{-x} dx"
        autoFocus
      />
      <div className="flex gap-2 justify-end mt-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={insert}>Insertar</Button>
      </div>
    </div>
  );
}