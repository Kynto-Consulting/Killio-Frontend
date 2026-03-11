'use client';

import { useState } from 'react';

import { BrickEditorForm } from '@/features/bricks/brick-editor-form';
import { BrickStack } from '@/features/bricks/brick-stack';
import { BrickMutationInput, CardView } from '@/lib/api/contracts';

import styles from './card-detail-panel.module.css';

type CardDetailPanelProps = {
  card: CardView;
  onCreateBrick: (cardId: string, payload: BrickMutationInput) => Promise<void>;
  onUpdateBrick: (cardId: string, brickId: string, payload: BrickMutationInput) => Promise<void>;
  onReorderBricks: (cardId: string, brickIds: string[]) => Promise<void>;
  onDeleteBrick: (cardId: string, brickId: string) => Promise<void>;
};
export function CardDetailPanel({ card, onCreateBrick, onUpdateBrick, onReorderBricks, onDeleteBrick }: CardDetailPanelProps) {
  const [isSaving, setIsSaving] = useState(false);

  async function handleReorder(brickIds: string[]) {
    setIsSaving(true);

    try {
      await onReorderBricks(card.id, brickIds);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Card Detail</div>
          <h2 className={styles.title}>{card.title}</h2>
          <div className={styles.muted}>{card.dueAt ? `Due ${new Date(card.dueAt).toLocaleString()}` : 'No due date'}</div>
        </div>
        <div className={styles.muted}>{card.blocks.length} bricks</div>
      </div>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <h3 className={styles.sectionTitle}>Brick stack</h3>
          <BrickStack
            bricks={card.blocks}
            interactive={!isSaving}
            onReorder={handleReorder}
            onUpdate={(brickId, payload) => onUpdateBrick(card.id, brickId, payload)}
            onDelete={(brickId) => onDeleteBrick(card.id, brickId)}
          />
        </div>

        <div className={styles.stack}>
          <h3 className={styles.sectionTitle}>Create brick</h3>
          <BrickEditorForm
            mode="create"
            submitLabel="Create brick"
            busy={isSaving}
            allowKindSwitch
            onSubmit={async (payload) => {
              setIsSaving(true);
              try {
                await onCreateBrick(card.id, payload);
              } finally {
                setIsSaving(false);
              }
            }}
          />
        </div>
      </div>
    </section>
  );
}
