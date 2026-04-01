"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, FileText, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";
import { FolderIconDisplay, PRESET_ICONS } from "./FolderIconPicker";

export type FolderNode = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  children?: FolderNode[];
  documentCount?: number;
};

interface FolderTreeProps {
  folders: FolderNode[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateClick?: (parentId: string | null, type: "folder" | "document") => void;
  onDropOnFolder?: (folderId: string | null, e: React.DragEvent) => void;
}

export function FolderTree({ folders, activeFolderId, onSelectFolder, onCreateClick, onDropOnFolder }: FolderTreeProps) {
  const t = useTranslations("documents");
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div 
        onClick={() => onSelectFolder(null)}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDropOnFolder?.(null, e); }}
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors relative z-10",
          activeFolderId === null ? "bg-accent/80 text-accent-foreground font-medium" : "hover:bg-muted/60 text-muted-foreground",
          isDragOver && "ring-2 ring-accent bg-accent/20"
        )}
      >
        <FolderIconDisplay icon="folder" className={cn("h-4 w-4", activeFolderId === null ? "text-accent-foreground" : "text-primary/70")} />
        <span>{t("allDocuments")}</span>
        
        {onCreateClick && (
          <div className="relative ml-auto flex items-center">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className={cn("p-1 rounded-md transition-opacity", showMenu ? "opacity-100 bg-muted text-foreground" : "opacity-0 group-hover:opacity-100 hover:bg-muted/80 text-muted-foreground hover:text-foreground")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-36 rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none z-50 animate-in fade-in zoom-in-95 p-1">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); onCreateClick(null, "folder"); }} className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                    <FolderPlus className="mr-2 h-4 w-4" />
                    {t("folder")}
                  </button>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); onCreateClick(null, "document"); }} className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                    <FileText className="mr-2 h-4 w-4" />
                    {t("document")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="pl-4 ml-3.5 mt-2 flex flex-col gap-1 relative border-l border-border/50">
        {folders.map((f, i) => (
          <FolderTreeNode 
            key={f.id} 
            node={f} 
            activeFolderId={activeFolderId} 
            onSelectFolder={onSelectFolder} 
            onCreateClick={onCreateClick}
            onDropOnFolder={onDropOnFolder}
            isLast={i === folders.length - 1}
            depth={0}
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
  onCreateClick,
  onDropOnFolder,
  isLast,
  depth = 0
}: { 
  node: FolderNode; 
  activeFolderId: string | null; 
  onSelectFolder: (id: string | null) => void;
  onCreateClick?: (id: string, type: "folder" | "document") => void;
  onDropOnFolder?: (id: string | null, e: React.DragEvent) => void;
  isLast?: boolean;
  depth?: number;
}) {
  const t = useTranslations("documents");
  const [isOpen, setIsOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const isActive = activeFolderId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col relative">
      {depth > -1 && (
        <div className={cn(
          "absolute pointer-events-none bg-border/50 w-4 h-[1px] top-[14px]", 
          depth === 0 ? "left-[calc(-1rem-2px)]" : "left-[-17px]" 
        )} />
      )}
      {depth > -1 && !isLast && (
        <div className={cn(
          "absolute pointer-events-none bg-border/50 w-[1px] top-[14px] bottom-[-4px]",
          depth === 0 ? "left-[calc(-1rem-2px)]" : "left-[-17px]"
        )} />
      )}

      <div 
        onClick={() => onSelectFolder(node.id)}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDropOnFolder?.(node.id, e); }}
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors relative z-10",
          isActive ? "bg-accent/80 text-accent-foreground font-medium" : "hover:bg-muted/60 text-muted-foreground",
          isDragOver && "ring-2 ring-accent bg-accent/20"
        )}
      >
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={cn("p-0.5 rounded-sm hover:bg-muted text-muted-foreground", !hasChildren && "invisible")}
        >
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <FolderIconDisplay 
          icon={node.icon} 
          color={node.color} 
          className={cn("h-4 w-4", (node.icon && !PRESET_ICONS.find(i => i.id === node.icon)) ? "text-[14px]" : (isActive ? "text-accent-foreground" : "text-primary/70"))} 
          isTextFallback={true} 
        />
        <span className="truncate flex-1" style={{ color: node.color || undefined }}>{node.name}</span>
        
        {onCreateClick && (
          <div className="relative ml-auto flex items-center">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className={cn("p-1 rounded-md transition-opacity", showMenu ? "opacity-100 bg-muted text-foreground" : "opacity-0 group-hover:opacity-100 hover:bg-muted/80 text-muted-foreground hover:text-foreground")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); }} />
                <div className="absolute right-0 top-full mt-1 w-36 rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none z-50 animate-in fade-in zoom-in-95 p-1">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); onCreateClick(node.id, "folder"); }} className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                    <FolderPlus className="mr-2 h-4 w-4" />
                    {t("folder")}
                  </button>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); onCreateClick(node.id, "document"); }} className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                    <FileText className="mr-2 h-4 w-4" />
                    {t("document")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {node.documentCount !== undefined && !showMenu && (
          <span className="text-xs opacity-50 group-hover:opacity-0 transition-opacity ml-1">
            {node.documentCount}
          </span>
        )}
      </div>

      {isOpen && hasChildren && (
        <div className="pl-4 flex flex-col gap-1 mt-1 relative border-l ml-3.5 border-border/30">
          {node.children!.map((child, i) => (
            <FolderTreeNode 
              key={child.id} 
              node={child} 
              activeFolderId={activeFolderId} 
              onSelectFolder={onSelectFolder}
              onCreateClick={onCreateClick}
              onDropOnFolder={onDropOnFolder}
              isLast={i === node.children!.length - 1}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}