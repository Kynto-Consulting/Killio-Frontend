"use client";

import { useRef, useState } from "react";
import { Plus, MoreHorizontal, Filter, Share, Maximize2, Trash2 } from "lucide-react";
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { ListColumn } from "@/components/ui/list-column";
import { BoardChatDrawer } from "@/components/ui/board-chat-drawer";
import { ShareModal } from "@/components/ui/share-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { MessageSquare } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useBoardPresence } from "@/hooks/useBoardPresence";
import { useSession } from "@/components/providers/session-provider";
import { useParams, useRouter } from "next/navigation";
import { getBoard, createList, deleteBoard, updateCard } from "@/lib/api/contracts";
import { useEffect } from "react";


export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.boardId as string;
  const { accessToken, user } = useSession();
  
  const members = useBoardPresence(boardId, user, accessToken);

  const [lists, setLists] = useState<any[]>([]);
  const [boardName, setBoardName] = useState("Loading...");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [realtimeLog, setRealtimeLog] = useState<string[]>([]);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [dragVisual, setDragVisual] = useState<{
    activeId: string | null;
    activeTitle: string | null;
    targetListId: string | null;
    targetIndex: number | null;
  }>({
    activeId: null,
    activeTitle: null,
    targetListId: null,
    targetIndex: null,
  });
  const lastOverIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<{ activeId: string; sourceListId: string | null; targetListId: string | null; targetIndex: number | null } | null>(null);

  const handleDeleteBoard = async () => {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      await deleteBoard(boardId, accessToken);
      router.push("/");
    } catch (e) {
      console.error(e);
      alert("Failed to delete board");
      setIsDeleting(false);
    }
  };

  const handleAddList = async () => {
    if (!newListName.trim() || !accessToken) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticList = {
      id: tempId,
      title: newListName.trim(),
      cards: []
    };

    setLists(prev => [...prev, optimisticList]);
    setIsAddingList(false);
    setNewListName("");

    try {
      const createdList = await createList(boardId, { name: optimisticList.title }, accessToken);
      setLists(prev => prev.map(l => l.id === tempId ? {
        id: createdList.id,
        title: createdList.name,
        cards: []
      } : l));
    } catch (error) {
      console.error("Failed to create list", error);
      // Optional: Remove optimistic list if failed
      setLists(prev => prev.filter(l => l.id !== tempId));
    }
  };

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [boardVisibility, setBoardVisibility] = useState<"private" | "team" | "public_link">("team");
  
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  const loadBoard = () => {
    if (!accessToken || !boardId) return;

    getBoard(boardId, accessToken)
      .then((board) => {
        setBoardName(board.name);
        setBoardVisibility(board.visibility || "team");
        const mappedLists = board.lists.map(list => ({
          id: list.id,
          title: list.name,
          cards: list.cards
        }));
        setLists(mappedLists);
      })
      .catch((err) => {
        console.error("Failed to fetch board", err);
        setBoardName("Error loading board");
      });
  };

  useEffect(() => {
    loadBoard();
    
    const unlisten = () => {};
    const handleRefresh = () => loadBoard();
    window.addEventListener('board:refresh', handleRefresh);

    return () => {
      window.removeEventListener('board:refresh', handleRefresh);
    };
  }, [accessToken, boardId]);

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    setRealtimeLog((prev) => [`[${event.type}] ${JSON.stringify(event.payload)}`, ...prev].slice(0, 5));
    loadBoard();
  }, accessToken);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const activeId = event.active.id.toString();
    const sourceListId = lists.find((l) => l.cards.some((c: any) => c.id === activeId))?.id ?? null;
    const activeCard = lists.flatMap((l) => l.cards).find((c: any) => c.id === activeId);

    dragStateRef.current = {
      activeId,
      sourceListId,
      targetListId: sourceListId,
      targetIndex: null,
    };

    setDragVisual({
      activeId,
      activeTitle: activeCard?.title ?? 'Card',
      targetListId: sourceListId,
      targetIndex: null,
    });
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    if (overId !== activeId) {
      lastOverIdRef.current = overId;
    }

    if (activeId === overId) return;

    const isActiveAList = lists.some(l => l.id === activeId);
    if (isActiveAList) return;

    const activeContainerId =
      dragStateRef.current?.activeId === activeId
        ? dragStateRef.current.sourceListId
        : lists.find(l => l.cards.some((c: any) => c.id === activeId))?.id;
    const overContainerId = lists.some(l => l.id === overId) 
      ? overId 
      : lists.find(l => l.cards.some((c: any) => c.id === overId))?.id;

    if (!activeContainerId || !overContainerId) {
      return;
    }

    const overContainer = lists.find((l) => l.id === overContainerId);
    if (!overContainer) return;

    const insertIndex = overId === overContainerId
      ? overContainer.cards.length
      : (() => {
          const idx = overContainer.cards.findIndex((c: any) => c.id === overId);
          return idx >= 0 ? idx : overContainer.cards.length;
        })();

    dragStateRef.current = {
      activeId,
      sourceListId: activeContainerId,
      targetListId: overContainerId,
      targetIndex: insertIndex,
    };

    setDragVisual((prev) => ({
      ...prev,
      targetListId: overContainerId,
      targetIndex: insertIndex,
    }));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeId = active.id.toString();

    const eventOverId = over?.id?.toString() ?? null;
    const fallbackOverId = lastOverIdRef.current;
    const resolvedOverId = eventOverId && eventOverId !== activeId
      ? eventOverId
      : fallbackOverId && fallbackOverId !== activeId
        ? fallbackOverId
        : eventOverId;

    if (!resolvedOverId) {
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const overId = resolvedOverId;

    const isActiveAList = lists.some(l => l.id === activeId);
    if (isActiveAList) {
      const activeListIndex = lists.findIndex((l) => l.id === activeId);
      const overListIndex = lists.findIndex((l) => l.id === overId);
      
      if (activeListIndex !== -1 && overListIndex !== -1) {
         setLists(arrayMove(lists, activeListIndex, overListIndex));
      }
      lastOverIdRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const activeContainerId = lists.find(l => l.cards.some((c: any) => c.id === activeId))?.id;
    const overContainerId = lists.some(l => l.id === overId) 
      ? overId 
      : lists.find(l => l.cards.some((c: any) => c.id === overId))?.id;

    const dragMeta = dragStateRef.current?.activeId === activeId ? dragStateRef.current : null;
    const sourceListId = dragMeta?.sourceListId ?? activeContainerId ?? null;
    const targetListId = dragMeta?.targetListId ?? overContainerId ?? null;
    const targetIndexFromMeta = dragMeta?.targetIndex ?? null;

    if (!sourceListId || !targetListId) {
      lastOverIdRef.current = null;
      dragStateRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const sourceListIndex = lists.findIndex((l) => l.id === sourceListId);
    const targetListIndex = lists.findIndex((l) => l.id === targetListId);
    if (sourceListIndex === -1 || targetListIndex === -1) {
      lastOverIdRef.current = null;
      dragStateRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const sourceCards = lists[sourceListIndex].cards;
    const sourceCardIndex = sourceCards.findIndex((c: any) => c.id === activeId);
    if (sourceCardIndex === -1) {
      lastOverIdRef.current = null;
      dragStateRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const baseTargetIndex =
      targetIndexFromMeta ??
      (overId === targetListId
        ? lists[targetListIndex].cards.length
        : (() => {
            const idx = lists[targetListIndex].cards.findIndex((c: any) => c.id === overId);
            return idx >= 0 ? idx : lists[targetListIndex].cards.length;
          })());

    const finalIndex = sourceListId === targetListId
      ? Math.max(0, Math.min(baseTargetIndex, sourceCards.length - 1))
      : Math.max(0, Math.min(baseTargetIndex, lists[targetListIndex].cards.length));

    setLists((prev) => {
      const next = [...prev];
      const srcIndex = next.findIndex((l) => l.id === sourceListId);
      const dstIndex = next.findIndex((l) => l.id === targetListId);
      if (srcIndex === -1 || dstIndex === -1) return prev;

      const srcCards = [...next[srcIndex].cards];
      const movingIndex = srcCards.findIndex((c: any) => c.id === activeId);
      if (movingIndex === -1) return prev;

      if (srcIndex === dstIndex) {
        if (movingIndex === finalIndex) return prev;
        next[srcIndex] = {
          ...next[srcIndex],
          cards: arrayMove(srcCards, movingIndex, finalIndex),
        };
        return next;
      }

      const [movedCard] = srcCards.splice(movingIndex, 1);
      const dstCards = [...next[dstIndex].cards];
      const boundedTargetIndex = Math.max(0, Math.min(finalIndex, dstCards.length));
      dstCards.splice(boundedTargetIndex, 0, movedCard);

      next[srcIndex] = { ...next[srcIndex], cards: srcCards };
      next[dstIndex] = { ...next[dstIndex], cards: dstCards };
      return next;
    });

    if (accessToken) {
      try {
        await updateCard(activeId, { list_id: targetListId, position: finalIndex }, accessToken);
      } catch (err) {
        console.error("Failed to persist card move", err);
      } finally {
        loadBoard();
      }
    }

    lastOverIdRef.current = null;
    dragStateRef.current = null;
    setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
  }

  const allAvailableTags = Array.from(new Set(
    lists.flatMap(l => l.cards.flatMap((c: any) => (c.tags || []).map((t: any) => t.name)))
  )).filter(Boolean);

  const filteredLists = lists.map(list => ({
    ...list,
    cards: list.cards.filter((card: any) => {
      if (selectedTags.length === 0) return true;
      const cardTagNames = (card.tags || []).map((t: any) => t.name);
      return selectedTags.some(selectedTag => cardTagNames.includes(selectedTag));
    })
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background relative">
      {/* Board Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10 w-full shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold tracking-tight">{boardName}</h1>
          <div className="h-4 w-[1px] bg-border/80"></div>
          <button className="flex items-center text-sm px-2.5 py-1 rounded-md bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
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
          
          <div className="relative">
            <button 
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent/10 hover:text-foreground hidden sm:inline-flex ${selectedTags.length > 0 ? "text-accent bg-accent/10 border border-accent/20" : "text-muted-foreground"}`}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter {selectedTags.length > 0 && `(${selectedTags.length})`}
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-md shadow-xl z-20 overflow-hidden">
                <div className="p-3 border-b border-border">
                  <h4 className="text-sm font-semibold text-foreground">Filter by Tags</h4>
                </div>
                <div className="p-2 max-h-60 overflow-y-auto">
                  {allAvailableTags.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">No tags in this board</div>
                  ) : (
                    allAvailableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <label key={tag} className="flex items-center space-x-2 p-2 hover:bg-accent/5 rounded cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="rounded border-border text-accent focus:ring-accent"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedTags(prev => 
                                isSelected ? prev.filter(t => t !== tag) : [...prev, tag]
                              );
                            }}
                          />
                          <span className="text-sm text-foreground/90">{tag}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                {selectedTags.length > 0 && (
                  <div className="p-2 border-t border-border bg-muted/30">
                    <button 
                      onClick={() => setSelectedTags([])}
                      className="w-full text-xs text-center text-muted-foreground hover:text-foreground py-1"
                    >
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsShareModalOpen(true)}
            className="h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Share className="h-4 w-4 mr-2" />
            Share
          </button>
          <button 
            title="Delete Board"
            disabled={isDeleting}
            onClick={() => setIsDeleteModalOpen(true)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-red-500/10 hover:text-red-500 text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Kanban Canvas */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full p-6 inline-flex items-start space-x-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              lastOverIdRef.current = null;
              dragStateRef.current = null;
            }}
          >
            <SortableContext items={filteredLists.map(l => l.id)} strategy={horizontalListSortingStrategy}>
              {filteredLists.map((list) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  boardId={boardId}
                  boardName={boardName}
                  isDropTarget={dragVisual.targetListId === list.id}
                  dropHintIndex={dragVisual.targetListId === list.id ? dragVisual.targetIndex : null}
                  draggingCardId={dragVisual.activeId}
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {dragVisual.activeId ? (
                <div className="w-72 rounded-lg border border-accent/60 bg-card/95 shadow-2xl ring-2 ring-accent/30 px-3 py-2 backdrop-blur-sm">
                  <div className="text-[10px] uppercase tracking-wider text-accent/90 font-semibold mb-1">Moving card</div>
                  <div className="text-sm font-medium text-foreground truncate">{dragVisual.activeTitle ?? 'Card'}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add List Button / Form */}
          {isAddingList ? (
            <div className="w-72 shrink-0 p-3 rounded-xl border border-border/60 bg-card shadow-sm flex flex-col space-y-3">
              <input
                type="text"
                placeholder="Enter list title..."
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddList();
                  if (e.key === 'Escape') {
                    setIsAddingList(false);
                    setNewListName("");
                  }
                }}
              />
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleAddList}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-medium rounded-md transition-colors"
                >
                  Add list
                </button>
                <button 
                  onClick={() => {
                    setIsAddingList(false);
                    setNewListName("");
                  }}
                  className="px-3 py-1.5 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium rounded-md transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsAddingList(true)}
              className="w-72 shrink-0 h-12 rounded-xl border border-dashed border-border/60 bg-transparent flex items-center justify-center text-muted-foreground hover:bg-accent/5 hover:border-accent hover:text-foreground transition-all"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add another list
            </button>
          )}
        </div>
      </main>

      <BoardChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} boardId={boardId} />

      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => setIsShareModalOpen(false)} 
        boardId={boardId} 
        boardName={boardName} 
        initialVisibility={boardVisibility} 
        accessToken={accessToken!} 
      />

      <ConfirmDeleteModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteBoard}
        title="Delete Board"
        description="Are you sure you want to delete this board? This action cannot be undone."
      />
    </div>
  );
}
