"use client";

import { useState } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FolderNode } from "@/lib/mock-folders";

interface FolderTreeProps {
  folders: FolderNode[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
}

export function FolderTree({ folders, activeFolderId, onSelectFolder }: FolderTreeProps) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div 
        onClick={() => onSelectFolder(null)}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
          activeFolderId === null ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted text-muted-foreground"
        )}
      >
        <Folder className="h-4 w-4" />
        <span>Todos los documentos</span>
      </div>
      <div className="pl-4 border-l ml-3.5 mt-2 flex flex-col gap-1 border-border/50">
        {folders.map(f => (
          <FolderTreeNode 
            key={f.id} 
            node={f} 
            activeFolderId={activeFolderId} 
            onSelectFolder={onSelectFolder} 
          />
        ))}
      </div>
    </div>
  );
}

function FolderTreeNode({ 
  node, 
  activeFolderId, 
  onSelectFolder,
  depth = 0
}: { 
  node: FolderNode; 
  activeFolderId: string | null; 
  onSelectFolder: (id: string | null) => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isActive = activeFolderId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col">
      <div 
        onClick={() => onSelectFolder(node.id)}
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
          isActive ? "bg-accent/80 text-accent-foreground font-medium" : "hover:bg-muted/60 text-muted-foreground"
        )}
      >
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={cn("p-0.5 rounded-sm hover:bg-muted", !hasChildren && "invisible")}
        >
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {isOpen ? (
          <FolderOpen className={cn("h-4 w-4", isActive ? "text-accent-foreground" : "text-primary/70")} />
        ) : (
          <Folder className={cn("h-4 w-4", isActive ? "text-accent-foreground" : "text-primary/70")} />
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.documentCount !== undefined && (
          <span className="text-xs opacity-50 group-hover:opacity-100 transition-opacity">
            {node.documentCount}
          </span>
        )}
      </div>

      {isOpen && hasChildren && (
        <div className="pl-4 flex flex-col gap-1 mt-1 border-l ml-3.5 border-border/30">
          {node.children!.map(child => (
            <FolderTreeNode 
              key={child.id} 
              node={child} 
              activeFolderId={activeFolderId} 
              onSelectFolder={onSelectFolder}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
