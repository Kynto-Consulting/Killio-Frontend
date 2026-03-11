"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, CheckSquare, MessageSquare, Paperclip } from "lucide-react";
import { CardDetailModal } from "./card-detail-modal";

interface CardData {
  id: string;
  title: string;
  tags?: string[];
  priority?: "low" | "normal" | "high" | "urgent";
}

export function KanbanCard({ card }: { card: CardData }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const priorityColors = {
    low: "bg-blue-500/20 text-blue-500",
    normal: "bg-muted text-muted-foreground",
    high: "bg-orange-500/20 text-orange-500",
    urgent: "bg-red-500/20 text-red-500 border border-red-500/30",
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onClick={() => setIsModalOpen(true)}
        className={`group relative flex flex-col gap-3 rounded-lg border ${
          isDragging ? "border-accent shadow-lg ring-1 ring-accent" : "border-border shadow-sm hover:border-accent/40"
        } bg-card p-3 cursor-grab active:cursor-grabbing transition-colors`}
        {...attributes}
        {...listeners}
      >
      <div className="flex flex-wrap gap-1.5">
        {card.tags?.map((tag) => (
          <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-primary/10 text-foreground/80">
            {tag}
          </span>
        ))}
        {card.priority && card.priority !== "normal" && (
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase ${priorityColors[card.priority]}`}>
            {card.priority}
          </span>
        )}
      </div>
      
      <p className="text-sm font-medium leading-tight text-foreground/90 group-hover:text-accent transition-colors">
        {card.title}
      </p>
      
      <div className="flex items-center justify-between text-muted-foreground mt-1">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors">
            <AlignLeft className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>0/3</span>
          </div>
          <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>2</span>
          </div>
        </div>
        
        <div className="h-5 w-5 rounded-full bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-[9px] border border-border shadow-sm">
          RO
        </div>
      </div>
      </div>
      
      <CardDetailModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        cardTitle={card.title} 
      />
    </>
  );
}
