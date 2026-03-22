 'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CardDetailModal } from '@/components/ui/card-detail-modal';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { BrickStack } from '@/features/bricks/brick-stack';
import { BoardView, BrickMutationInput, updateCard } from '@/lib/api/contracts';
import { useSession } from '@/components/providers/session-provider';

type BoardShellProps = {
  board: BoardView;
  onCreateBrick: (cardId: string, payload: BrickMutationInput) => Promise<void>;
  onUpdateBrick: (cardId: string, brickId: string, payload: BrickMutationInput) => Promise<void>;
  onReorderBricks: (cardId: string, brickIds: string[]) => Promise<void>;
  onDeleteBrick: (cardId: string, brickId: string) => Promise<void>;
};

import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from './sortable-item';

export function BoardShell({ board, onCreateBrick, onUpdateBrick, onReorderBricks, onDeleteBrick }: BoardShellProps) {
  const actions = ['Create card', 'Move card', 'Ask AI', 'Open board chat'];
  const cards = useMemo(() => board.lists.flatMap((list) => list.cards), [board]);
  const { accessToken } = useSession();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const lastOverIdRef = useRef<string | null>(null);
  
  // Optional local state for optimistic DND
  const [lists, setLists] = useState(board.lists);

  useEffect(() => {
    setLists(board.lists);
  }, [board.lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    if (overId !== activeId) {
      lastOverIdRef.current = overId;
    }

    if (activeId === overId) return;

    const activeContainerId = lists.find(l => l.cards.some((c: any) => c.id === activeId))?.id;
    const overContainerId = lists.some(l => l.id === overId) 
      ? overId 
      : lists.find(l => l.cards.some((c: any) => c.id === overId))?.id;

    if (!activeContainerId || !overContainerId || activeContainerId === overContainerId) {
      return;
    }

    setLists((prev) => {
      const activeContainerIndex = prev.findIndex((l) => l.id === activeContainerId);
      const overContainerIndex = prev.findIndex((l) => l.id === overContainerId);

      const activeList = prev[activeContainerIndex];
      const overList = prev[overContainerIndex];

      const activeCardIndex = activeList.cards.findIndex((c: any) => c.id === activeId);
      let overCardIndex = overList.cards.findIndex((c: any) => c.id === overId);
      
      const newActiveCards = [...activeList.cards];
      const [movedCard] = newActiveCards.splice(activeCardIndex, 1);

      const newOverCards = [...overList.cards];
      
      const isOverAList = overId === overContainerId;
      if (isOverAList) {
        newOverCards.push(movedCard);
      } else {
        const overIndex = overCardIndex >= 0 ? overCardIndex : newOverCards.length;
        newOverCards.splice(overIndex, 0, movedCard);
      }

      const newLists = [...prev];
      newLists[activeContainerIndex] = { ...activeList, cards: newActiveCards };
      newLists[overContainerIndex] = { ...overList, cards: newOverCards };
      return newLists;
    });
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    const activeId = active.id.toString();
    const eventOverId = over?.id?.toString() ?? null;
    const fallbackOverId = lastOverIdRef.current;
    const resolvedOverId = eventOverId && eventOverId !== activeId
      ? eventOverId
      : fallbackOverId && fallbackOverId !== activeId
        ? fallbackOverId
        : eventOverId;

    if (!resolvedOverId) return;
    
    // Select card on click/drag end visualization
    setSelectedCardId(active.id); 

    const overId = resolvedOverId;

    if (activeId === overId) return;

    const activeContainerId = lists.find(l => l.cards.some((c: any) => c.id === activeId))?.id;
    const overContainerId = lists.some(l => l.id === overId) 
      ? overId 
      : lists.find(l => l.cards.some((c: any) => c.id === overId))?.id;

    if (!activeContainerId || !overContainerId) {
      lastOverIdRef.current = null;
      return;
    }

    if (activeContainerId === overContainerId) {
       const containerIndex = lists.findIndex(l => l.id === activeContainerId);
       const activeIndex = lists[containerIndex].cards.findIndex((c: any) => c.id === activeId);
       const overIndex = lists[containerIndex].cards.findIndex((c: any) => c.id === overId);

       let finalIndex = overIndex === -1 ? 0 : overIndex;

       if (activeIndex !== overIndex) {
         setLists(prev => {
            const newLists = [...prev];
            newLists[containerIndex] = {
               ...newLists[containerIndex],
               cards: arrayMove(newLists[containerIndex].cards, activeIndex, overIndex)
            };
            return newLists;
         });
       }

       if (accessToken) {
         updateCard(activeId, { list_id: activeContainerId, position: finalIndex }, accessToken).catch(err => {
           console.error("Failed to update card position", err);
         });
       }
    } else {
       if (accessToken) {
         updateCard(activeId, { list_id: overContainerId }, accessToken).catch(console.error);
       }
    }

    lastOverIdRef.current = null;
  };


  useEffect(() => {
    if (selectedCardId && !cards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(null);
    }
  }, [cards, selectedCardId]);

  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;

  return (
    <section>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ color: 'var(--muted)', fontSize: '12px', letterSpacing: '0.22em' }}>
            KILLIO
          </div>
          <h1 style={{ margin: '10px 0 0', fontSize: '40px' }}>{board.name}</h1>
          {board.description ? (
            <p style={{ color: 'var(--muted)', maxWidth: '52ch', margin: '12px 0 0' }}>{board.description}</p>
          ) : null}
        </div>
        <CommandPalette actions={actions} />
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '18px',
          }}
        >
          {lists.map((list) => (
            <div
              key={list.id}
              style={{
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                borderRadius: '20px',
                padding: '18px',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '18px',
                }}
              >
                <strong>{list.name}</strong>
                <span style={{ color: 'var(--muted)' }}>{list.cards.length}</span>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {list.cards.map((card) => (
                    <SortableItem key={card.id} id={card.id}>
                      <article
                        style={{
                          background: 'var(--panel-strong)',
                          borderRadius: '16px',
                          padding: '14px',
                          border:
                            selectedCardId === card.id
                              ? '1px solid rgba(0, 112, 243, 0.55)'
                              : card.urgency === 'urgent'
                                ? '1px solid rgba(255, 123, 114, 0.5)'
                                : '1px solid transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedCardId(card.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                          <strong>{card.title}</strong>
                          <span
                            style={{
                              color: card.urgency === 'urgent' ? 'var(--danger)' : 'var(--muted)',
                              fontSize: '12px',
                              textTransform: 'uppercase',
                            }}
                          >
                            {card.urgency}
                          </span>
                        </div>

                        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
                          {card.dueAt ? `Due ${new Date(card.dueAt).toLocaleString()}` : 'No due date'}
                        </p>

                        <div style={{ marginTop: '14px' }}>
                          <BrickStack bricks={card.blocks} interactive={false} />
                        </div>
                      </article>
                    </SortableItem>
                  ))}
                </SortableContext>
              </div>
            </div>
          ))}
        </section>
      </DndContext>

      {selectedCard ? (
        <CardDetailModal
          isOpen={true}
          onClose={() => setSelectedCardId(null)}
          card={selectedCard}
          boardId={board.id}
          boardName={board.name}
        />
      ) : null}
    </section>
  );
}
