"use client";

import { useRef, useEffect, useState } from "react";
import type { VideoFilter } from "@/hooks/use-room-call";
import { X } from "lucide-react";

type TFn = (key: string) => string;

// ── CSS filter strings for each effect ────────────────────────────────────────
export function getFilterStyle(filter: VideoFilter): string {
  switch (filter) {
    case "blur":      return "blur(8px)";
    case "grayscale": return "grayscale(1)";
    case "warm":      return "sepia(0.3) saturate(1.4) hue-rotate(-10deg)";
    case "cool":      return "saturate(0.9) hue-rotate(20deg) brightness(1.05)";
    case "sepia":     return "sepia(0.8) saturate(1.1)";
    case "vivid":     return "saturate(1.8) contrast(1.1)";
    case "neon":      return "saturate(2) hue-rotate(90deg) brightness(1.1) contrast(1.2)";
    default:          return "none";
  }
}

// ── Effect categories ─────────────────────────────────────────────────────────

interface EffectOption {
  id: VideoFilter;
  labelKey: string;
  icon: string;         // emoji shorthand for quick rendering
  cssPreview: string;   // preview gradient or icon colour hint
}

const EFFECT_GROUPS: { labelKey: string; options: EffectOption[] }[] = [
  {
    labelKey: "call.effects.groupNone",
    options: [
      { id: "none",      labelKey: "call.effects.none",      icon: "✕",  cssPreview: "none" },
    ],
  },
  {
    labelKey: "call.effects.groupBackground",
    options: [
      { id: "blur",      labelKey: "call.effects.blur",      icon: "🌫️", cssPreview: "blur(4px)" },
    ],
  },
  {
    labelKey: "call.effects.groupColor",
    options: [
      { id: "grayscale", labelKey: "call.effects.grayscale", icon: "⬛", cssPreview: "grayscale(1)" },
      { id: "warm",      labelKey: "call.effects.warm",      icon: "🌅", cssPreview: "sepia(0.5)" },
      { id: "cool",      labelKey: "call.effects.cool",      icon: "🧊", cssPreview: "hue-rotate(20deg) saturate(0.9)" },
      { id: "sepia",     labelKey: "call.effects.sepia",     icon: "🟤", cssPreview: "sepia(0.9)" },
      { id: "vivid",     labelKey: "call.effects.vivid",     icon: "🎨", cssPreview: "saturate(2)" },
      { id: "neon",      labelKey: "call.effects.neon",      icon: "🟢", cssPreview: "saturate(2) hue-rotate(90deg)" },
    ],
  },
];

// ── Preview tile ──────────────────────────────────────────────────────────────

function EffectTile({
  option,
  isActive,
  onSelect,
  t,
}: {
  option: EffectOption;
  isActive: boolean;
  onSelect: () => void;
  t: TFn;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all",
        isActive
          ? "border-accent bg-accent/15 text-accent shadow-[0_0_8px_rgba(var(--accent),0.4)]"
          : "border-border/50 bg-muted/30 text-muted-foreground hover:border-accent/40 hover:bg-accent/5",
      ].join(" ")}
    >
      {/* Preview circle */}
      <div
        className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 overflow-hidden flex items-center justify-center text-2xl shadow-inner"
        style={{ filter: option.cssPreview }}
      >
        {option.id === "none" ? (
          <span className="text-white text-base font-bold opacity-80">A</span>
        ) : null}
      </div>
      <span className="text-[10px] font-medium leading-tight text-center">
        {t(option.labelKey)}
      </span>
    </button>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface RoomCallEffectsPanelProps {
  activeFilter: VideoFilter;
  onSetFilter: (filter: VideoFilter) => void;
  onClose: () => void;
  t: TFn;
}

export function RoomCallEffectsPanel({
  activeFilter,
  onSetFilter,
  onClose,
  t,
}: RoomCallEffectsPanelProps) {
  return (
    <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[340px] bg-zinc-900/95 border border-zinc-700 rounded-2xl shadow-2xl backdrop-blur-sm overflow-hidden z-20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/60">
        <span className="text-sm font-semibold text-zinc-100">{t("call.effects.title")}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Groups */}
      <div className="p-3 space-y-4 max-h-72 overflow-y-auto">
        {EFFECT_GROUPS.map((group) => (
          <div key={group.labelKey}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2 px-1">
              {t(group.labelKey)}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {group.options.map((opt) => (
                <EffectTile
                  key={opt.id}
                  option={opt}
                  isActive={activeFilter === opt.id}
                  onSelect={() => { onSetFilter(opt.id); }}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
