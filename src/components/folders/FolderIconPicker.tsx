import React from "react";
import * as Lucide from "lucide-react";
import {
  Folder,
  Star,
  Heart,
  Briefcase,
  Book,
  Image as ImageIcon,
  Music,
  Video,
} from "lucide-react";

/** kebab/space → PascalCase ("book-open" → "BookOpen"). */
function toPascal(name: string): string {
  return name.replace(/[-_\s]+/g, " ").split(" ").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

/** Resolve an icon id to ANY lucide-react component (preset id, kebab or Pascal). */
export function lucideByName(name: string): React.ComponentType<{ className?: string; style?: React.CSSProperties }> | null {
  const direct = (Lucide as Record<string, unknown>)[name];
  if (typeof direct === "function" || (direct && typeof direct === "object")) return direct as React.ComponentType<{ className?: string }>;
  const pascal = toPascal(name);
  const comp = (Lucide as Record<string, unknown>)[pascal];
  return (typeof comp === "function" || (comp && typeof comp === "object")) ? (comp as React.ComponentType<{ className?: string }>) : null;
}

export const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#eab308", "#a855f7", // Blue, Red, Green, Yellow, Purple
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"  // Pink, Cyan, Lime, Orange, Indigo
];

export const PRESET_ICONS = [
  { id: "folder", icon: Folder },
  { id: "star", icon: Star },
  { id: "heart", icon: Heart },
  { id: "briefcase", icon: Briefcase },
  { id: "book", icon: Book },
  { id: "image", icon: ImageIcon },
  { id: "music", icon: Music },
  { id: "video", icon: Video }
];

/** Returns a lucide component for an icon id, or null if it's an emoji/unknown. */
export function resolveFolderIconOrNull(iconId: string | null | undefined): React.ComponentType<{ className?: string; style?: React.CSSProperties }> | null {
  if (!iconId) return Folder;
  const match = PRESET_ICONS.find((i) => i.id === iconId);
  if (match) return match.icon;
  return lucideByName(iconId); // any lucide icon by name; null → emoji fallback
}

/** Back-compat: always returns a component (Folder fallback). */
export function resolveFolderIcon(iconId: string | null | undefined) {
  return resolveFolderIconOrNull(iconId) || Folder;
}

export function FolderIconDisplay({
  icon,
  color,
  className,
  isTextFallback = false,
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
  isTextFallback?: boolean;
}) {
  const IconComp = resolveFolderIconOrNull(icon);

  // Unmapped custom string (e.g. a raw emoji) → render as text/glyph.
  if (icon && !IconComp && isTextFallback) {
    return (
      <span className={className} style={{ color: color || undefined, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </span>
    );
  }

  const Comp = IconComp || Folder;
  return <Comp className={className} style={{ color: color || undefined }} />;
}