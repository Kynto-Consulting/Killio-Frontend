'use client';

import { DragEvent, useEffect, useState } from 'react';

import { AiBrick, BoardBrick, BrickMutationInput, MediaBrick, TextBrick } from '@/lib/api/contracts';

import { BrickEditorForm } from './brick-editor-form';
import { describeBrick } from './brick-editor-state';
import styles from './brick-stack.module.css';

type BrickStackProps = {
  bricks: BoardBrick[];
  interactive?: boolean;
  onReorder?: (brickIds: string[]) => Promise<void> | void;
  onUpdate?: (brickId: string, payload: BrickMutationInput) => Promise<void> | void;
  onDelete?: (brickId: string) => Promise<void> | void;
};

export function BrickStack({ bricks, interactive = true, onReorder, onUpdate, onDelete }: BrickStackProps) {
  const [items, setItems] = useState(() => sortBricks(bricks));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [editingBrickId, setEditingBrickId] = useState<string | null>(null);
  const [busyBrickId, setBusyBrickId] = useState<string | null>(null);

  useEffect(() => {
    setItems(sortBricks(bricks));
  }, [bricks]);

  if (items.length === 0) {
    return <div className={styles.empty}>No bricks yet. Add notes, files, or AI summaries to this card.</div>;
  }

  return (
    <div className={styles.stack}>
      {items.map((brick) => (
        <article
          key={brick.id}
          className={[
            styles.brick,
            draggedId === brick.id ? styles.brickDragging : '',
            dropTargetId === brick.id ? styles.brickActive : '',
          ].join(' ')}
          draggable={interactive}
          onDragStart={(event) => handleDragStart(event, brick.id, setDraggedId, interactive)}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTargetId(null);
          }}
          onDragOver={(event) => {
            if (!interactive) {
              return;
            }
            event.preventDefault();
            if (draggedId && draggedId !== brick.id) {
              setDropTargetId(brick.id);
            }
          }}
          onDrop={(event) => {
            if (!interactive) {
              return;
            }
            event.preventDefault();
            const sourceId = event.dataTransfer.getData('text/plain');
            setItems((current) => {
              const next = moveBrick(current, sourceId, brick.id);
              void onReorder?.(next.map((item) => item.id));
              return next;
            });
            setDraggedId(null);
            setDropTargetId(null);
          }}
        >
          <div className={styles.brickHeader}>
            <div className={styles.brickMeta}>
              <span className={styles.brickKind}>{brick.kind}</span>
              <span className={styles.brickTitle}>{describeBrick(brick)}</span>
            </div>
            {interactive ? (
              <div className={styles.headerActions}>
                {onUpdate ? (
                  <button
                    type="button"
                    className={styles.editButton}
                    aria-label={`Edit ${brick.kind} brick`}
                    onClick={() => setEditingBrickId((current) => (current === brick.id ? null : brick.id))}
                  >
                    Edit
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label={`Delete ${brick.kind} brick`}
                    onClick={() => {
                      setBusyBrickId(brick.id);
                      Promise.resolve(onDelete(brick.id)).finally(() => {
                        setBusyBrickId(null);
                        setEditingBrickId((current) => (current === brick.id ? null : current));
                      });
                    }}
                  >
                    Delete
                  </button>
                ) : null}
                <button type="button" className={styles.dragHandle} aria-label={`Drag ${brick.kind} brick`}>
                  Drag
                </button>
              </div>
            ) : null}
          </div>
          <div className={styles.brickBody}>
            {editingBrickId === brick.id && onUpdate ? (
              <div className={styles.inlineEditor}>
                <BrickEditorForm
                  mode="edit"
                  initialBrick={brick}
                  submitLabel="Save inline"
                  busy={busyBrickId === brick.id}
                  allowKindSwitch={false}
                  onSubmit={async (payload) => {
                    setBusyBrickId(brick.id);
                    try {
                      await onUpdate(brick.id, payload);
                      setEditingBrickId(null);
                    } finally {
                      setBusyBrickId(null);
                    }
                  }}
                  onCancel={() => setEditingBrickId(null)}
                  onDelete={
                    onDelete
                      ? async () => {
                          setBusyBrickId(brick.id);
                          try {
                            await onDelete(brick.id);
                            setEditingBrickId(null);
                          } finally {
                            setBusyBrickId(null);
                          }
                        }
                      : undefined
                  }
                />
              </div>
            ) : (
              renderBrick(brick)
            )}
          </div>
        </article>
      ))}

      <div
        className={dropTargetId === '__end__' ? styles.dropZoneActive : styles.dropZone}
        onDragOver={(event) => {
          if (!interactive) {
            return;
          }
          event.preventDefault();
          if (draggedId) {
            setDropTargetId('__end__');
          }
        }}
        onDrop={(event) => {
          if (!interactive) {
            return;
          }
          event.preventDefault();
          const sourceId = event.dataTransfer.getData('text/plain');
          setItems((current) => {
            const next = moveBrickToEnd(current, sourceId);
            void onReorder?.(next.map((item) => item.id));
            return next;
          });
          setDraggedId(null);
          setDropTargetId(null);
        }}
      />
    </div>
  );
}

function renderBrick(brick: BoardBrick) {
  switch (brick.kind) {
    case 'text':
      return <TextBrickView brick={brick} />;
    case 'media':
      return <MediaBrickView brick={brick} />;
    case 'ai':
      return <AiBrickView brick={brick} />;
    default:
      return null;
  }
}

function TextBrickView({ brick }: { brick: TextBrick }) {
  if (brick.displayStyle === 'checklist' && brick.tasks.length > 0) {
    return (
      <div className={styles.checklist}>
        {brick.tasks.map((task) => (
          <div key={task.id} className={styles.checkItem}>
            <span>{task.checked ? '[x]' : '[ ]'}</span>
            <span className={task.checked ? styles.checkDone : ''}>{task.label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (brick.displayStyle === 'code') {
    return <pre className={styles.code}>{stripCodeFences(brick.markdown)}</pre>;
  }

  const lines = brick.markdown.split(/\r?\n/).filter((line) => line.trim().length > 0);

  return (
    <div className={styles.textBlock}>
      {lines.map((line, index) => renderMarkdownLine(line, index, brick.displayStyle))}
    </div>
  );
}

function MediaBrickView({ brick }: { brick: MediaBrick }) {
  return (
    <div className={styles.mediaFrame}>
      {brick.mediaType === 'image' && brick.url ? (
        <img src={brick.url} alt={brick.title ?? 'Brick image'} className={styles.imagePreview} />
      ) : (
        <div className={styles.fileCard}>
          <strong>{brick.title ?? 'Attached file'}</strong>
          <span className={styles.metaLine}>{brick.mimeType ?? 'Unknown format'}</span>
          <span className={styles.metaLine}>{formatBytes(brick.sizeBytes)}</span>
          {brick.url ? (
            <a href={brick.url} target="_blank" rel="noreferrer" className={styles.embedLink}>
              Open asset
            </a>
          ) : null}
        </div>
      )}
      {brick.caption ? <div className={styles.metaLine}>{brick.caption}</div> : null}
    </div>
  );
}

function AiBrickView({ brick }: { brick: AiBrick }) {
  return (
    <div className={styles.aiCard}>
      <div className={styles.statusRow}>
        <strong>{brick.title}</strong>
        <span className={styles.statusBadge}>{brick.status}</span>
      </div>
      {brick.prompt ? (
        <div className={styles.aiPrompt}>
          <span className={styles.label}>Prompt</span>
          <div>{brick.prompt}</div>
        </div>
      ) : null}
      <div className={styles.aiResponse}>
        <span className={styles.label}>Response</span>
        <div className={styles.aiResponseBox}>{brick.response || 'No AI response available yet.'}</div>
      </div>
      <div className={styles.metaLine}>
        {brick.model ? `Model: ${brick.model}` : 'Model pending'}
        {typeof brick.confidence === 'number' ? ` · Confidence ${Math.round(brick.confidence * 100)}%` : ''}
      </div>
    </div>
  );
}

function renderMarkdownLine(line: string, index: number, fallbackStyle: TextBrick['displayStyle']) {
  const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const text = headingMatch[2];
    if (level === 1) {
      return <h2 key={index} className={styles.heading}>{text}</h2>;
    }
    if (level === 2) {
      return <h3 key={index} className={styles.heading}>{text}</h3>;
    }
    return <h4 key={index} className={styles.heading}>{text}</h4>;
  }

  if (line.startsWith('> ')) {
    return <blockquote key={index} className={styles.quote}>{line.slice(2)}</blockquote>;
  }

  if (line.startsWith('! ')) {
    return <div key={index} className={styles.callout}>{line.slice(2)}</div>;
  }

  if (fallbackStyle === 'quote') {
    return <blockquote key={index} className={styles.quote}>{line}</blockquote>;
  }

  if (fallbackStyle === 'callout') {
    return <div key={index} className={styles.callout}>{line}</div>;
  }

  return <p key={index} className={styles.paragraph}>{line}</p>;
}

function sortBricks(bricks: BoardBrick[]) {
  return [...bricks].sort((left, right) => left.position - right.position);
}

function moveBrick(bricks: BoardBrick[], sourceId: string, targetId: string) {
  if (!sourceId || sourceId === targetId) {
    return bricks;
  }

  const sourceIndex = bricks.findIndex((brick) => brick.id === sourceId);
  const targetIndex = bricks.findIndex((brick) => brick.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return bricks;
  }

  const next = [...bricks];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next.map((brick, index) => ({ ...brick, position: index }));
}

function moveBrickToEnd(bricks: BoardBrick[], sourceId: string) {
  if (!sourceId) {
    return bricks;
  }

  const sourceIndex = bricks.findIndex((brick) => brick.id === sourceId);

  if (sourceIndex === -1) {
    return bricks;
  }

  const next = [...bricks];
  const [moved] = next.splice(sourceIndex, 1);
  next.push(moved);
  return next.map((brick, index) => ({ ...brick, position: index }));
}

function handleDragStart(
  event: DragEvent<HTMLElement>,
  brickId: string,
  setDraggedId: (id: string) => void,
  interactive: boolean,
) {
  if (!interactive) {
    event.preventDefault();
    return;
  }

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', brickId);
  setDraggedId(brickId);
}

function stripCodeFences(markdown: string) {
  return markdown.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '').trim();
}

function formatBytes(value: number | null) {
  if (value === null || value <= 0) {
    return 'Size unavailable';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}