"use client";

import { useState } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight } from "lucide-react";

export function CardDetailModal({ isOpen, onClose, cardTitle }: { isOpen: boolean; onClose: () => void; cardTitle: string }) {
  const [blocks, setBlocks] = useState([
    { id: "b1", type: "h2", content: "Requirements" },
    { id: "b2", type: "text", content: "We need to ensure the CSV file is fully parsed and the requirements are transferred to GitHub issues or Killio cards." },
    { id: "b3", type: "todo", content: "Create script to parse CSV", checked: true },
    { id: "b4", type: "todo", content: "Map columns to card fields", checked: false },
    { id: "b5", type: "image", content: "https://via.placeholder.com/600x200/1a1a1a/d8ff72?text=Architecture+Diagram" }
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl border border-border bg-background shadow-2xl flex flex-col max-h-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span className="hover:text-foreground cursor-pointer transition-colors">Engineering Team</span>
            <span className="text-border">/</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">To Do</span>
            <span className="text-border">/</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">{cardTitle}</span>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-accent/10 hover:text-foreground transition-colors text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body - Notion Style */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar">
          <div className="max-w-2xl mx-auto space-y-6">
            
            {/* Title Area */}
            <div className="group relative">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground outline-none border-l-2 border-transparent focus:border-accent pl-2 -ml-2 transition-colors" contentEditable suppressContentEditableWarning>
                {cardTitle}
              </h1>
              <div className="flex items-center space-x-2 mt-4 text-sm text-muted-foreground">
                <span className="bg-primary/10 text-foreground/80 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase">UX</span>
                <span className="bg-red-500/20 text-red-500 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase">URGENT</span>
              </div>
            </div>

            {/* Notion Bricks / Blocks */}
            <div className="mt-8 space-y-2">
              {blocks.map((block) => (
                <div key={block.id} className="group relative flex items-start -ml-8 pl-8">
                  {/* Block Drag Handle (Hover) */}
                  <div className="absolute left-0 top-1.5 opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity cursor-grab text-muted-foreground">
                    <button className="hover:bg-accent/10 rounded p-0.5"><Plus className="h-4 w-4" /></button>
                    <button className="hover:bg-accent/10 rounded p-0.5"><GripVertical className="h-4 w-4" /></button>
                  </div>
                  
                  {/* Block Content Render */}
                  <div className="flex-1 min-h-[1.5rem] py-1 outline-none text-foreground/90 leading-relaxed group-focus-within:bg-accent/5 rounded px-2 -mx-2 transition-colors">
                    {block.type === "h2" && <h2 className="text-2xl font-semibold mt-4 mb-2">{block.content}</h2>}
                    {block.type === "text" && <p className="whitespace-pre-wrap">{block.content}</p>}
                    {block.type === "todo" && (
                      <div className="flex items-start space-x-2 my-1">
                        <button className={`mt-1 h-4 w-4 rounded-sm border ${block.checked ? 'bg-accent border-accent text-background flex items-center justify-center' : 'border-muted-foreground/50'}`}>
                          {block.checked && <CheckSquare className="h-3 w-3" />}
                        </button>
                        <span className={block.checked ? "line-through text-muted-foreground" : ""}>{block.content}</span>
                      </div>
                    )}
                    {block.type === "image" && (
                      <div className="my-4 relative rounded-lg overflow-hidden border border-border group/img">
                        <img src={block.content} alt="Block image" className="w-full h-auto object-cover" />
                        <div className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 flex gap-2 transition-opacity">
                          <button className="bg-background/80 backdrop-blur text-xs px-2 py-1 rounded border border-border">Replace</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Empty placeholder for new block */}
              <div className="group relative flex items-center -ml-8 pl-8 mt-2 opacity-50 text-muted-foreground hover:opacity-100 transition-opacity">
                <div className="absolute left-2 top-1.5 opacity-0 group-hover:opacity-100"><Plus className="h-4 w-4" /></div>
                <div className="flex-1 py-1 px-2 -mx-2 text-sm italic cursor-text">
                  Type '/' for commands or start typing...
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Action Sidebar / Footer for Mobile */}
        <div className="border-t border-border bg-card/30 p-4 flex items-center justify-between sm:justify-start sm:space-x-4 overflow-x-auto shrink-0 hide-scrollbar">
          <button className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/10 px-3 py-1.5 rounded-md transition-colors">
            <AlignLeft className="h-4 w-4" /> <span>Description</span>
          </button>
          <button className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/10 px-3 py-1.5 rounded-md transition-colors">
            <CheckSquare className="h-4 w-4" /> <span>Checklist</span>
          </button>
          <button className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/10 px-3 py-1.5 rounded-md transition-colors">
            <ImageIcon className="h-4 w-4" /> <span>Attachment</span>
          </button>
          <button className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/10 px-3 py-1.5 rounded-md transition-colors sm:ml-auto">
            <MessageSquare className="h-4 w-4" /> <span>Comment</span>
          </button>
        </div>
        
      </div>
    </div>
  );
}
