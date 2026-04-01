"use client";

import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { FolderNode } from "@/lib/mock-folders";

interface FolderCardProps {
  folder: FolderNode;
  isActive?: boolean;
  onClick: () => void;
}

export function FolderCard({ folder, isActive, onClick }: FolderCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex min-w-[200px] flex-1 md:flex-none items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-all",
        isActive ? "border-primary/50 shadow-sm" : "border-border shadow-sm hover:border-primary/30"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md", 
        isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )} style={folder.color ? { backgroundColor: `${folder.color}20`, color: folder.color } : {}}>
        {folder.icon ? (
            <span className="text-xl">{folder.icon}</span>
        ) : (
            <Folder className="h-5 w-5 fill-current opacity-80" />
        )}
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-sm font-medium truncate" style={{ color: folder.color || undefined }}>{folder.name}</span>
        <span className="text-xs text-muted-foreground truncate">
          {folder.documentCount !== undefined ? `${folder.documentCount} documentos` : "Vacio"}
        </span>
      </div>
    </div>
  );
}
