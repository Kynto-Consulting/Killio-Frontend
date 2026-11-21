"use client";

import { useRef } from "react";
import { Check, Minus, X } from "lucide-react";
import type { TriState } from "@/lib/rooms/tristate";

interface TriStateToggleProps {
  value: TriState;
  onChange: (next: TriState) => void;
  /** What this switch controls, e.g. "Write messages: Moderator". Read by screen readers. */
  label: string;
  labels: { allow: string; inherit: string; deny: string };
  disabled?: boolean;
}

const ORDER: TriState[] = ["allow", "inherit", "deny"];

const STYLE: Record<TriState, { on: string; icon: React.ReactNode }> = {
  allow: { on: "bg-emerald-500 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-400/60", icon: <Check className="h-3.5 w-3.5" aria-hidden /> },
  inherit: { on: "bg-muted text-foreground border-[var(--memphis-line)]", icon: <Minus className="h-3.5 w-3.5" aria-hidden /> },
  deny: { on: "bg-rose-500 text-white border-rose-700 dark:bg-rose-600 dark:border-rose-400/60", icon: <X className="h-3.5 w-3.5" aria-hidden /> },
};

/**
 * Three-way switch: yes / inherit / no. A radio group (one tab stop, arrows move between the options), so it works with
 * keyboard and screen readers; the state is also written in words, never colour alone.
 */
export function TriStateToggle({ value, onChange, label, labels, disabled }: TriStateToggleProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + ORDER.length) % ORDER.length;
    onChange(ORDER[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-lg border-[1.5px] border-[var(--memphis-line)]">
      {ORDER.map((state, i) => {
        const selected = value === state;
        return (
          <button
            key={state}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={labels[state]}
            title={labels[state]}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(state)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i, 1); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i, -1); }
            }}
            className={`flex h-7 w-8 items-center justify-center border-r border-[var(--memphis-line)] transition-colors last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--accent-ink))] disabled:opacity-50 motion-reduce:transition-none ${
              selected ? STYLE[state].on : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {STYLE[state].icon}
          </button>
        );
      })}
    </div>
  );
}
