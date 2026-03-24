"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, MoreHorizontal } from "lucide-react";
import { KanbanCard } from "./kanban-card";
import { CardDetailModal } from "./card-detail-modal";

interface ListData {
  id: string;
  title: string;
  cards: any[];
}

export function ListColumn({
  list,
  boardName,
  boardId,
  isDropTarget,
  dropHintIndex,
  draggingCardId,
  canEdit = true,
  canComment = true,
  teamDocs = [],
  teamBoards = [],
}: {
  list: ListData;
  boardName?: string;
  boardId: string;
  isDropTarget?: boolean;
  dropHintIndex?: number | null;
  draggingCardId?: string | null;
  canEdit?: boolean;
  canComment?: boolean;
  teamDocs?: any[];
  teamBoards?: any[];
}) {
  const { setNodeRef } = useDroppable({ id: list.id });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isGuest = !canEdit;

  return (
    <>
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 flex flex-col rounded-xl bg-card/60 border backdrop-blur-sm max-h-full transition-all ${
        isDropTarget ? "border-accent/80 ring-2 ring-accent/30 shadow-lg" : "border-border"
      }`}
    >
      <div 
        className="p-3 flex items-center justify-between group border-b border-border/40"
      >
        <h3 className="font-semibold text-sm pl-1">{list.title}</h3>
        <div className="flex items-center space-x-1 relative">
          <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full mr-1">
            {list.cards.length}
          </span>
          {!isGuest && (
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="h-6 w-6 rounded hover:bg-accent/10 flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}

          {isMenuOpen && (
            <div className="absolute right-0 top-8 w-48 bg-background border border-border rounded-md shadow-lg py-1 z-10 text-sm">
              <button 
                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} 
                className="w-full text-left px-3 py-1.5 hover:bg-muted text-muted-foreground hover:text-foreground">Add Card...
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
          {list.cards.map((card, index) => (
            <div key={card.id} className="space-y-2">
              {isDropTarget && dropHintIndex === index && draggingCardId !== card.id ? (
                <div className="h-20 rounded-lg border-2 border-dashed border-accent/80 bg-accent/10 shadow-[0_0_0_4px_rgba(59,130,246,0.12)] flex items-center justify-center">
                  <span className="text-[11px] font-semibold tracking-wide uppercase text-accent/90">Drop here</span>
                </div>
              ) : null}
          <KanbanCard 
            card={card} 
            listId={list.id} 
            listName={list.title} 
            boardName={boardName || ""} 
            boardId={boardId} 
            canEdit={canEdit} 
            canComment={canComment} 
            teamDocs={teamDocs}
            teamBoards={teamBoards}
          />
            </div>
          ))}
        </SortableContext>

        {isDropTarget && dropHintIndex === list.cards.length ? (
          <div className="h-20 rounded-lg border-2 border-dashed border-accent/80 bg-accent/10 shadow-[0_0_0_4px_rgba(59,130,246,0.12)] flex items-center justify-center">
            <span className="text-[11px] font-semibold tracking-wide uppercase text-accent/90">Drop here</span>
          </div>
        ) : null}
        
        {!isGuest && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center text-left p-2 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors group text-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add a card
          </button>
        )}
      </div>
    </div>

    <CardDetailModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      listId={list.id}
      listName={list.title}
      boardName={boardName || ""}
      boardId={boardId}
      teamDocs={teamDocs}
      teamBoards={teamBoards}
    />
    </>
  );
}
