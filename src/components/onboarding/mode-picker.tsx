"use client";

import { Check, Layers, LayoutGrid } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import type { UiMode } from "@/lib/ui-mode/ui-mode";

interface ModePickerProps {
  value: UiMode;
  onChange: (mode: UiMode) => void;
  disabled?: boolean;
  /** Marks one option with the "Suggested for you" tag. */
  suggested?: UiMode | null;
  name?: string;
  /** One card per row (narrow containers such as the wizard column). */
  stacked?: boolean;
}

/** Two cards, radio semantics: Reduced / Full. Keyboard: arrow keys move between them (native radio inputs). */
export function ModePicker({ value, onChange, disabled, suggested, name = "ui-mode", stacked = false }: ModePickerProps) {
  const t = useTranslations("onboarding");
  const items: { mode: UiMode; icon: typeof Layers }[] = [
    { mode: "reduced", icon: LayoutGrid },
    { mode: "full", icon: Layers },
  ];
  return (
    <div role="radiogroup" aria-label={t("mode.label")} className={`grid gap-2 ${stacked ? "" : "sm:grid-cols-2"}`}>
      {items.map(({ mode, icon: Icon }) => {
        const active = value === mode;
        return (
          <label
            key={mode}
            className={`relative flex cursor-pointer gap-3 rounded-xl border p-3 text-left transition-colors focus-within:ring-2 focus-within:ring-ring ${active ? "border-primary bg-muted ring-1 ring-primary" : "border-border hover:bg-muted/60"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
          >
            <input type="radio" name={name} value={mode} checked={active} disabled={disabled} onChange={() => onChange(mode)} className="sr-only" />
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                {t(`mode.${mode}`)}
                {suggested === mode ? <span className="rounded-full bg-[hsl(var(--accent-ink))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--accent-ink-fg))]">{t("wizard.start.suggested")}</span> : null}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(`mode.${mode}Desc`)}</span>
            </span>
            {active ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : null}
          </label>
        );
      })}
    </div>
  );
}
