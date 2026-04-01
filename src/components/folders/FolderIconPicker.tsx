import React from "react";
import { 
  Folder, 
  Star, 
  Heart, 
  Briefcase, 
  Book, 
  Image as ImageIcon, 
  Music, 
  Video 
} from "lucide-react";

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

export function resolveFolderIcon(iconId: string | null | undefined) {
  if (!iconId) return Folder;
  const match = PRESET_ICONS.find(i => i.id === iconId);
  if (match) return match.icon;
  // Fallback for emojis if they were already created 
  return Folder; 
}

export function FolderIconDisplay({ 
  icon, 
  color, 
  className,
  isTextFallback = false
}: { 
  icon?: string | null; 
  color?: string | null; 
  className?: string;
  isTextFallback?: boolean;
}) {
  const IconComp = resolveFolderIcon(icon);
  
  // If it's an unmapped custom string (like an old emoji), render it as text
  const isEmojiFallback = icon && !PRESET_ICONS.find(i => i.id === icon) && isTextFallback;

  if (isEmojiFallback) {
    return (
      <span 
        className={className} 
        style={{ color: color || undefined, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        {icon}
      </span>
    );
  }

  return <IconComp className={className} style={{ color: color || undefined }} />;
}