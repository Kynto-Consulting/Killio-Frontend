 'use client';

import { useEffect, useMemo, useState } from 'react';

import { CardDetailPanel } from '@/features/cards/card-detail-panel';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { BrickStack } from '@/features/bricks/brick-stack';
import { BoardView, BrickMutationInput } from '@/lib/api/contracts';

type BoardShellProps = {
  board: BoardView;
  onCreateBrick: (cardId: string, payload: BrickMutationInput) => Promise<void>;
  onUpdateBrick: (cardId: string, brickId: string, payload: BrickMutationInput) => Promise<void>;
  onReorderBricks: (cardId: string, brickIds: string[]) => Promise<void>;
  onDeleteBrick: (cardId: string, brickId: string) => Promise<void>;
};

export function BoardShell({ board, onCreateBrick, onUpdateBrick, onReorderBricks, onDeleteBrick }: BoardShellProps) {
  const actions = ['Create card', 'Move card', 'Ask AI', 'Open board chat'];
  const cards = useMemo(() => board.lists.flatMap((list) => list.cards), [board]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(cards[0]?.id ?? null);

  useEffect(() => {
    if (!selectedCardId || !cards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(cards[0]?.id ?? null);
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

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '18px',
        }}
      >
        {board.lists.map((list) => (
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
              {list.cards.map((card) => (
                <article
                  key={card.id}
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
              ))}
            </div>
          </div>
        ))}
      </section>

      {selectedCard ? (
        <CardDetailPanel
          card={selectedCard}
          onCreateBrick={onCreateBrick}
          onUpdateBrick={onUpdateBrick}
          onReorderBricks={onReorderBricks}
          onDeleteBrick={onDeleteBrick}
        />
      ) : null}
    </section>
  );
}
