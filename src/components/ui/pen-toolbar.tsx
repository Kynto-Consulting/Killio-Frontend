"use client";

import React, { useEffect } from "react";
import { Check, Circle, Minus, Palette } from "lucide-react";

export interface PenToolbarProps {
  color: string;
  strokeWidth: number;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
}

export function PenToolbar({
  color,
  strokeWidth,
  onColorChange,
  onStrokeWidthChange,
}: PenToolbarProps) {
  const [activePanel, setActivePanel] = React.useState<"color" | "size" | null>(null);

  const COLOR_PRESETS = [
    "#ffffff",
    "#22d3ee",
    "#60a5fa",
    "#4ade80",
    "#facc15",
    "#fb923c",
    "#f87171",
    "#f472b6",
    "#c084fc",
    "#94a3b8",
  ];

  const WIDTH_PRESETS = [1, 2, 3, 5, 8, 12];

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePanel(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="absolute bottom-20 left-1/2 z-40 -translate-x-1/2">
      <div className="relative flex flex-col items-center gap-2">
        {activePanel === "color" && (
          <div className="mb-1 w-[260px] rounded-2xl border border-cyan-300/20 bg-slate-950/92 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">Color del Pen</div>
            <div className="grid grid-cols-5 gap-2">
              {COLOR_PRESETS.map((preset) => {
                const active = preset.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    title={preset}
                    onClick={() => onColorChange(preset)}
                    className={`relative h-9 w-9 rounded-full border transition-transform hover:scale-105 ${active ? "border-white/80" : "border-white/20"}`}
                    style={{ backgroundColor: preset }}
                  >
                    {active && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-black" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-2 py-1.5">
              <span className="text-[10px] text-slate-300">Custom</span>
              <input
                type="color"
                value={color}
                onChange={(e) => onColorChange(e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-white/20 bg-transparent p-0"
                title="Seleccionar color personalizado"
              />
            </div>
          </div>
        )}

        {activePanel === "size" && (
          <div className="mb-1 w-[280px] rounded-2xl border border-cyan-300/20 bg-slate-950/92 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">Ancho del trazo</div>
            <div className="grid grid-cols-6 gap-1.5">
              {WIDTH_PRESETS.map((preset) => {
                const active = Math.abs(strokeWidth - preset) < 0.01;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onStrokeWidthChange(preset)}
                    className={`flex h-9 items-center justify-center rounded-lg border transition-colors ${active ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-slate-900/75 text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"}`}
                    title={`${preset}px`}
                  >
                    <Minus style={{ width: 18, height: 18, strokeWidth: preset <= 2 ? 2 : preset <= 5 ? 3 : 4 }} />
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2">
              <input
                type="range"
                min="0.5"
                max="14"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => onStrokeWidthChange(parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-cyan-400"
                title="Ajustar ancho del trazo"
              />
              <div className="mt-1 text-right text-[10px] text-slate-300">{strokeWidth.toFixed(1)}px</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 rounded-2xl border border-cyan-300/20 bg-slate-950/88 px-2 py-1 shadow-[0_14px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActivePanel((prev) => (prev === "color" ? null : "color"))}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${activePanel === "color" ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-slate-900/80 text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"}`}
            title="Colores"
          >
            <Palette className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActivePanel((prev) => (prev === "size" ? null : "size"))}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${activePanel === "size" ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-slate-900/80 text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"}`}
            title="Ancho"
          >
            <Circle className="h-4 w-4" style={{ strokeWidth: Math.min(3, Math.max(1, strokeWidth / 3)) }} />
          </button>

          <div className="mx-1 h-6 w-px bg-white/10" />

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/75 px-2.5 py-1">
            <svg width={56} height={18}>
              <line
                x1="4"
                y1="9"
                x2="52"
                y2="9"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[10px] text-slate-300">{strokeWidth.toFixed(1)}px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
