'use client';

import { FormEvent, useEffect, useState } from 'react';

import { BoardBrick, BrickMutationInput } from '@/lib/api/contracts';

import styles from './brick-editor-form.module.css';
import {
  BrickFormState,
  brickFormFromBrick,
  brickFormToMutationInput,
  createDefaultBrickForm,
  getBrickErrorMessage,
} from './brick-editor-state';

type BrickEditorFormProps = {
  mode: 'create' | 'edit';
  initialKind?: BrickMutationInput['kind'];
  initialBrick?: BoardBrick;
  submitLabel: string;
  busy?: boolean;
  allowKindSwitch?: boolean;
  onSubmit: (payload: BrickMutationInput) => Promise<void>;
  onCancel?: () => void;
  onDelete?: () => Promise<void>;
};

export function BrickEditorForm({
  mode,
  initialKind = 'text',
  initialBrick,
  submitLabel,
  busy = false,
  allowKindSwitch = true,
  onSubmit,
  onCancel,
  onDelete,
}: BrickEditorFormProps) {
  const [form, setForm] = useState<BrickFormState>(() =>
    initialBrick ? brickFormFromBrick(initialBrick) : createDefaultBrickForm(initialKind),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialBrick ? brickFormFromBrick(initialBrick) : createDefaultBrickForm(initialKind));
    setError(null);
  }, [initialBrick, initialKind]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit(brickFormToMutationInput(form));
    } catch (nextError) {
      setError(getBrickErrorMessage(nextError));
    }
  }

  async function handleDelete() {
    if (!onDelete) {
      return;
    }

    setError(null);

    try {
      await onDelete();
    } catch (nextError) {
      setError(getBrickErrorMessage(nextError));
    }
  }

  function switchKind(kind: BrickMutationInput['kind']) {
    if (!allowKindSwitch || mode === 'edit') {
      return;
    }

    setForm(createDefaultBrickForm(kind));
    setError(null);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {allowKindSwitch ? (
        <div className={styles.toolbar}>
          {(['text', 'media', 'embed', 'ai'] as const).map((kind) => (
            <button
              key={kind}
              className={form.kind === kind ? styles.kindButtonActive : styles.kindButton}
              onClick={() => switchKind(kind)}
              type="button"
            >
              {kind}
            </button>
          ))}
        </div>
      ) : null}

      {form.kind === 'text' ? <TextFields form={form} setForm={setForm} /> : null}
      {form.kind === 'media' ? <MediaFields form={form} setForm={setForm} /> : null}
      {form.kind === 'embed' ? <EmbedFields form={form} setForm={setForm} /> : null}
      {form.kind === 'ai' ? <AiFields form={form} setForm={setForm} /> : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.actions}>
        <button className={styles.submitButton} disabled={busy} type="submit">
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button className={styles.secondaryButton} disabled={busy} onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
        {mode === 'edit' && onDelete ? (
          <button className={styles.dangerButton} disabled={busy} onClick={() => void handleDelete()} type="button">
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}

function TextFields({ form, setForm }: FieldProps) {
  return (
    <>
      <label className={styles.field}>
        <span>Display style</span>
        <select value={form.displayStyle} onChange={(event) => setForm((current) => ({ ...current, displayStyle: event.target.value as BrickFormState['displayStyle'] }))}>
          <option value="paragraph">Paragraph</option>
          <option value="checklist">Checklist</option>
          <option value="quote">Quote</option>
          <option value="code">Code</option>
          <option value="callout">Callout</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Markdown</span>
        <textarea value={form.markdown} onChange={(event) => setForm((current) => ({ ...current, markdown: event.target.value }))} />
      </label>
    </>
  );
}

function MediaFields({ form, setForm }: FieldProps) {
  return (
    <>
      <label className={styles.field}>
        <span>Media type</span>
        <select value={form.mediaType} onChange={(event) => setForm((current) => ({ ...current, mediaType: event.target.value as BrickFormState['mediaType'] }))}>
          <option value="image">Image</option>
          <option value="file">File</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Title</span>
        <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>URL</span>
        <input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>MIME type</span>
        <input value={form.mimeType} onChange={(event) => setForm((current) => ({ ...current, mimeType: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Size bytes</span>
        <input value={form.sizeBytes} onChange={(event) => setForm((current) => ({ ...current, sizeBytes: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Caption</span>
        <textarea value={form.caption} onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Asset ID</span>
        <input value={form.assetId} onChange={(event) => setForm((current) => ({ ...current, assetId: event.target.value }))} />
      </label>
    </>
  );
}

function EmbedFields({ form, setForm }: FieldProps) {
  return (
    <>
      <label className={styles.field}>
        <span>Embed type</span>
        <select value={form.embedType} onChange={(event) => setForm((current) => ({ ...current, embedType: event.target.value as BrickFormState['embedType'] }))}>
          <option value="board">Board</option>
          <option value="card">Card</option>
          <option value="url">URL</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Title</span>
        <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>URL</span>
        <input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Target ID</span>
        <input value={form.targetId} onChange={(event) => setForm((current) => ({ ...current, targetId: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Summary</span>
        <textarea value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
      </label>
    </>
  );
}

function AiFields({ form, setForm }: FieldProps) {
  return (
    <>
      <label className={styles.field}>
        <span>Status</span>
        <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as BrickFormState['status'] }))}>
          <option value="idle">Idle</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="error">Error</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Title</span>
        <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Prompt</span>
        <textarea value={form.prompt} onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Response</span>
        <textarea value={form.response} onChange={(event) => setForm((current) => ({ ...current, response: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Model</span>
        <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
      </label>
      <label className={styles.field}>
        <span>Confidence (0 to 1)</span>
        <input value={form.confidence} onChange={(event) => setForm((current) => ({ ...current, confidence: event.target.value }))} />
      </label>
    </>
  );
}

type FieldProps = {
  form: BrickFormState;
  setForm: React.Dispatch<React.SetStateAction<BrickFormState>>;
};