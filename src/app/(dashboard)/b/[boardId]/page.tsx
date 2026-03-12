"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Filter, Share, Maximize2 } from "lucide-react";
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ListColumn } from "@/components/ui/list-column";
import { BoardChatDrawer } from "@/components/ui/board-chat-drawer";
import { MessageSquare } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useBoardPresence } from "@/hooks/useBoardPresence";
import { useSession } from "@/components/providers/session-provider";
import { useParams } from "next/navigation";
import { getBoard } from "@/lib/api/contracts";
import { useEffect } from "react";


export default function BoardPage() {
  const params = useParams();
  const boardId = params.boardId as string;
  const { accessToken, user } = useSession();
  
  const members = useBoardPresence(boardId, user);

  const [lists, setLists] = useState<any[]>([]);
  const [boardName, setBoardName] = useState("Loading...");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [realtimeLog, setRealtimeLog] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken || !boardId) return;

    getBoard(boardId, accessToken)
      .then((board) => {
        setBoardName(board.name);
        const mappedLists = board.lists.map(list => ({
          id: list.id,
          title: list.name,
          cards: list.cards.map(card => ({
            id: card.id,
            title: card.title,
            priority: card.urgency,
            tags: []
          }))
        }));
        setLists(mappedLists);
      })
      .catch((err) => {
        console.error("Failed to fetch board", err);
        setBoardName("Error loading board");
      });
  }, [accessToken, boardId]);

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    setRealtimeLog((prev) => [`[${event.type}] ${JSON.stringify(event.payload)}`, ...prev].slice(0, 5));
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    
    // Simple drag for lists (ignoring cross-list card dragging for the UI mockup)
    // For a real app, cross-list logic is more complex in dnd-kit. This is a visual baseline.
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background relative">
      {/* Board Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10 w-full shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold tracking-tight">{boardName}</h1>
          <div className="h-4 w-[1px] bg-border/80"></div>
          <button className="flex items-center text-sm px-2.5 py-1 rounded-md bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors">
            <span className="w-2 h-2 rounded-full bg-accent mr-2 animate-pulse"></span>
            Live
          </button>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2 mr-4 hidden sm:flex">
            {members.slice(0, 4).map((m, i) => {
               const initials = m.data?.displayName ? m.data.displayName.substring(0, 2).toUpperCase() : m.clientId.substring(0, 2).toUpperCase();
               const gradients = ["from-blue-500 to-purple-500", "from-orange-400 to-red-500", "from-emerald-400 to-teal-500", "from-pink-500 to-rose-500"];
               return (
                 <div key={m.clientId} title={m.data?.displayName || m.clientId} className={`w-8 h-8 rounded-full border-2 border-background bg-gradient-to-tr ${gradients[i % gradients.length]} flex items-center justify-center text-[10px] font-bold text-white shadow-sm`}>
                   {initials}
                 </div>
               );
            })}
            {members.length > 4 && (
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shadow-sm">
                +{members.length - 4}
              </div>
            )}
            {members.length === 0 && (
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shadow-sm animate-pulse" title="Connecting...">
                ...
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setIsChatOpen(true)}
            className="h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-card border border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground shadow-sm"
          >
            <MessageSquare className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Team Chat</span>
          </button>
          <button className="h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-foreground text-muted-foreground hidden sm:inline-flex">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </button>
          <button className="h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90">
            <Share className="h-4 w-4 mr-2" />
            Share
          </button>
          <button className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-foreground text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Kanban Canvas */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full p-6 inline-flex items-start space-x-4">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
            <SortableContext items={lists.map(l => l.id)} strategy={horizontalListSortingStrategy}>
              {lists.map((list) => (
                <ListColumn key={list.id} list={list} />
              ))}
            </SortableContext>
          </DndContext>
          
          {/* Add List Button */}
          <button className="w-72 shrink-0 h-12 rounded-xl border border-dashed border-border/60 bg-transparent flex items-center justify-center text-muted-foreground hover:bg-accent/5 hover:border-accent hover:text-foreground transition-all">
            <Plus className="h-5 w-5 mr-2" />
            Add another list
          </button>
        </div>
      </main>

      <BoardChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
