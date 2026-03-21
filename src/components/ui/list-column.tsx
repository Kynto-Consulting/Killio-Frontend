"use client";

import { useState } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, MoreHorizontal } from "lucide-react";
import { KanbanCard } from "./kanban-card";
import { CardDetailModal } from "./card-detail-modal";

interface ListData {
  id: string;
  title: string;
  cards: any[];
}

export function ListColumn({ list, boardName, boardId }: { list: ListData, boardName?: string, boardId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      className={`w-72 shrink-0 flex flex-col rounded-xl bg-card/60 border ${isDragging ? "border-accent" : "border-border"} backdrop-blur-sm max-h-full`}
    >
      <div 
        className="p-3 flex items-center justify-between group cursor-grab active:cursor-grabbing border-b border-border/40"
        {...attributes}
        {...listeners}
      >
        <h3 className="font-semibold text-sm pl-1">{list.title}</h3>
        <div className="flex items-center space-x-1 relative">
          <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full mr-1">
            {list.cards.length}
          </span>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="h-6 w-6 rounded hover:bg-accent/10 flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-8 w-48 bg-background border border-border rounded-md shadow-lg py-1 z-10 text-sm">
              <button 
                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} 
                className="w-full text-left px-3 py-1.5 hover:bg-muted text-muted-foreground hover:text-foreground">
                Add Card...
              </button>
              <div className="my-1 border-t border-border" />
              <button 
                onClick={(e) => { e.stopPropagation(); alert("Archive list coming soon!"); }} 
                className="w-full text-left px-3 py-1.5 hover:bg-muted text-red-500 hover:bg-red-500/10">
                Archive This List
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {list.cards.map((card) => (
            <KanbanCard key={card.id} card={card} listName={list.title} boardName={boardName || ""} boardId={boardId} />
          ))}
        </SortableContext>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full flex items-center text-left p-2 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors group text-sm font-medium"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add a card
        </button>
      </div>
    </div>

    <CardDetailModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      listId={list.id}
      listName={list.title}
      boardName={boardName || ""}
      boardId={boardId}
    />
    </>
  );
}
