"use client";

import { cn } from "@/lib/utils";
import { FolderNode } from "@/lib/mock-folders";
import { FolderIconDisplay, PRESET_ICONS } from "./FolderIconPicker";
import { useTranslations } from "@/components/providers/i18n-provider";

interface FolderCardProps {
  folder: FolderNode;
  isActive?: boolean;
  onClick: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
}

export function FolderCard({ folder, isActive, onClick, onDrop, onDragOver }: FolderCardProps) {
  const t = useTranslations("documents");
  const isEmojiFallback = folder.icon && !PRESET_ICONS.find(i => i.id === folder.icon);

  // Divide el nombre en dos líneas si es muy largo y antepone un punto a la segunda línea
  let firstLine = folder.name;
  let secondLine = "";
  if (folder.name.length > 18) {
    firstLine = folder.name.slice(0, 18);
    secondLine = "." + folder.name.slice(18);
  }

  return (
    <div 
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={cn(
        "flex min-w-[200px] flex-1 md:flex-none items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-all",
        isActive ? "border-primary/50 shadow-sm" : "border-border shadow-sm hover:border-primary/30"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md", 
        isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )} style={folder.color ? { backgroundColor: `${folder.color}20`, color: folder.color } : {}}>
        <FolderIconDisplay 
          icon={folder.icon} 
          className={isEmojiFallback ? "text-xl" : "h-5 w-5 fill-current opacity-80"} 
          isTextFallback={true} 
        />
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-sm font-medium break-words leading-tight" style={{ color: folder.color || undefined }}>
          {firstLine}
          {secondLine && <><br />{secondLine}</>}
        </span>
        {folder.documentCount !== undefined && (
          <span className="text-xs text-muted-foreground truncate">
            {t("documentCount", { count: folder.documentCount! })}
          </span>
        )}
      </div>
    </div>
  );
}
