"use client";

import { Pin, PinOff } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { usePins } from "@/hooks/use-pins";
import type { PinType } from "@/lib/api/pins";

/**
 * Pins / unpins one board, mesh, document or folder to the user's "Fijados". Renders nothing without a session or a
 * workspace (local files). `stopClick` keeps a click from following the card link it sits on.
 */
export function PinButton({ teamId, kind, id, className = "", stopClick = true, alwaysVisible = false }: { teamId: string | null | undefined; kind: PinType; id: string; className?: string; stopClick?: boolean; alwaysVisible?: boolean }) {
  const t = useTranslations("workspace");
  const { isPinned, toggle, enabled } = usePins(teamId);
  if (!enabled) return null;
  const pinned = isPinned(kind, id);
  const label = pinned ? t("pins.unpin") : t("pins.pin");
  const Icon = pinned ? PinOff : Pin;
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (stopClick) {
          e.preventDefault();
          e.stopPropagation();
        }
        void toggle(kind, id);
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent/10 hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${pinned ? "text-primary opacity-100" : alwaysVisible ? "" : "opacity-0 group-hover:opacity-100"} ${className}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
