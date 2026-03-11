"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, MoreHorizontal } from "lucide-react";
import { KanbanCard } from "./kanban-card";

interface ListData {
  id: string;
  title: string;
  cards: any[];
}

export function ListColumn({ list }: { list: ListData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
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
        <span className="flex items-center space-x-1">
          <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full mr-1">
            {list.cards.length}
          </span>
          <button className="h-6 w-6 rounded hover:bg-accent/10 flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {list.cards.map((card) => (
           <KanbanCard key={card.id} card={card} />
        ))}
        
        <button className="w-full flex items-center text-left p-2 rounded-lg hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors group text-sm font-medium">
          <Plus className="h-4 w-4 mr-2" />
          Add a card
        </button>
      </div>
    </div>
  );
}
