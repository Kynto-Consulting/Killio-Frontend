"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Folder as FolderIcon, ChevronDown, ChevronRight } from "lucide-react";
import { Folder } from "@/lib/api/folders";
import { FolderIconDisplay, PRESET_ICONS } from "@/components/folders/FolderIconPicker";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/components/providers/i18n-provider";

interface FolderSelectProps {
  value: string | null;
  onChange: (folderId: string | null) => void;
  folders: Folder[];
  disabled?: boolean;
}

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  matchesSearch: boolean;
  hasMatchingDescendant: boolean;
}

export function FolderSelect({ value, onChange, folders, disabled }: FolderSelectProps) {
  const t = useTranslations("documents");
  const [search, setSearch] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!search.trim()) return;
    
    const newExpanded = new Set(expandedNodes);
    
    const findMatches = (nodes: Folder[]) => {
      let anyMatches = false;
      for (const folder of nodes) {
        const children = folders.filter(f => f.parentFolderId === folder.id);
        const childMatches = findMatches(children);
        if (folder.name.toLowerCase().includes(search.toLowerCase()) || childMatches) {
          anyMatches = true;
          if (childMatches) newExpanded.add(folder.id);
        }
      }
      return anyMatches;
    };

    const rootFolders = folders.filter(f => !f.parentFolderId);
    findMatches(rootFolders);
    setExpandedNodes(newExpanded);
  }, [search, folders]);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedNodes(newExpanded);
  };

  const tree = useMemo(() => {
    const buildNode = (folder: Folder): TreeNode => {
      const children = folders
        .filter(f => f.parentFolderId === folder.id)
        .map(buildNode);

      const matchesSearch = search ? folder.name.toLowerCase().includes(search.toLowerCase()) : true;
      const hasMatchingDescendant = children.some(c => c.matchesSearch || c.hasMatchingDescendant);

      return {
        folder,
        children,
        matchesSearch,
        hasMatchingDescendant
      };
    };

    return folders
      .filter(f => !f.parentFolderId)
      .map(buildNode)
      .filter(n => !search || n.matchesSearch || n.hasMatchingDescendant);
  }, [folders, search]);

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedNodes.has(node.folder.id) || !!search;
    const isSelected = value === node.folder.id;
    
    const childrenToRender = node.children.filter(c => !search || c.matchesSearch || c.hasMatchingDescendant);
    const hasVisibleChildren = childrenToRender.length > 0;

    return (
      <div key={node.folder.id} className="w-full flex flex-col relative">
        <div 
          onClick={() => !disabled && onChange(node.folder.id)}
          className={cn(
            "group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors relative z-10",
            isSelected ? "bg-accent/80 text-accent-foreground font-medium" : "hover:bg-muted/60 text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <button 
            type="button"
            onClick={(e) => toggleExpand(node.folder.id, e)}
            className={cn("p-0.5 rounded-sm hover:bg-muted text-muted-foreground", !hasVisibleChildren && "invisible")}
            disabled={disabled}
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          
          <FolderIconDisplay 
            icon={node.folder.icon} 
            color={node.folder.color} 
            className={cn("h-4 w-4 shrink-0", (node.folder.icon && !PRESET_ICONS.find(i => i.id === node.folder.icon)) ? "text-[14px]" : (isSelected ? "text-accent-foreground" : "text-primary/70"))} 
            isTextFallback={true} 
          />
          
          <span className="truncate flex-1 text-sm" style={{ color: node.folder.color || undefined }}>
            {node.folder.name}
          </span>
        </div>

        {isExpanded && hasVisibleChildren && (
          <div className="pl-4 flex flex-col gap-1 mt-1 relative border-l ml-3.5 border-border/30">
            {childrenToRender.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 shadow-sm h-[320px] w-full">
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder={t("searchFolders")}
          className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2">
        <div className="flex flex-col gap-2">
          <div 
            onClick={() => !disabled && onChange(null)}
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors relative mb-1 shrink-0",
              value === null ? "bg-accent/80 text-accent-foreground font-medium border-accent/30" : "bg-card border-border hover:bg-muted/50 text-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <FolderIcon className={cn("h-4 w-4", value === null ? "text-accent-foreground" : "text-primary/70")} />
            <span className="text-sm">{t("noFolder")}</span>
          </div>

          <div className="flex flex-col gap-1 rounded-md border border-border/50 bg-card p-2 min-h-[100px]">
            {tree.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground flex flex-col items-center gap-2">
                <FolderIcon className="h-6 w-6 opacity-20" />
                {search ? t("noFoldersFound") : t("noFoldersAvailable")}
              </div>
            )}
            {tree.map(node => renderNode(node, 0))}
          </div>
        </div>
      </div>
    </div>
  );
}
