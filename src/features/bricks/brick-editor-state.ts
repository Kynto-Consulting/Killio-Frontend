import { ApiError, BoardBrick, BrickMutationInput } from '@/lib/api/contracts';

export type BrickFormState = {
  kind: BrickMutationInput['kind'];
  displayStyle: 'paragraph' | 'checklist' | 'quote' | 'code' | 'callout';
  markdown: string;
  mediaType: 'image' | 'file';
  title: string;
  url: string;
  mimeType: string;
  sizeBytes: string;
  caption: string;
  assetId: string;
  embedType: 'board' | 'card' | 'url';
  targetId: string;
  summary: string;
  status: 'idle' | 'running' | 'done' | 'error';
  prompt: string;
  response: string;
  model: string;
  confidence: string;
};

export function createDefaultBrickForm(kind: BrickMutationInput['kind']): BrickFormState {
  return {
    kind,
    displayStyle: 'paragraph',
    markdown: kind === 'text' ? '# Note\nWrite here.' : '',
    mediaType: 'image',
    title: '',
    url: '',
    mimeType: '',
    sizeBytes: '',
    caption: '',
    assetId: '',
    embedType: 'url',
    targetId: '',
    summary: '',
    status: 'idle',
    prompt: '',
    response: '',
    model: '',
    confidence: '',
  };
}

export function brickFormFromBrick(brick: BoardBrick): BrickFormState {
  switch (brick.kind) {
    case 'text':
      return {
        ...createDefaultBrickForm('text'),
        kind: 'text',
        displayStyle: brick.displayStyle,
        markdown: brick.markdown,
      };
    case 'media':
      return {
        ...createDefaultBrickForm('media'),
        kind: 'media',
        mediaType: brick.mediaType,
        title: brick.title ?? '',
        url: brick.url ?? '',
        mimeType: brick.mimeType ?? '',
        sizeBytes: brick.sizeBytes !== null ? String(brick.sizeBytes) : '',
        caption: brick.caption ?? '',
        assetId: brick.assetId ?? '',
      };
    case 'embed':
      return {
        ...createDefaultBrickForm('embed'),
        kind: 'embed',
        embedType: brick.embedType,
        title: brick.title,
        url: brick.href ?? '',
        targetId: brick.targetId ?? '',
        summary: brick.summary ?? '',
      };
    case 'ai':
      return {
        ...createDefaultBrickForm('ai'),
        kind: 'ai',
        status: brick.status,
        title: brick.title,
        prompt: brick.prompt,
        response: brick.response,
        model: brick.model ?? '',
        confidence: brick.confidence !== null ? String(brick.confidence) : '',
      };
    default:
      return createDefaultBrickForm('text');
  }
}

export function brickFormToMutationInput(form: BrickFormState): BrickMutationInput {
  switch (form.kind) {
    case 'text':
      return {
        kind: 'text',
        displayStyle: form.displayStyle,
        markdown: form.markdown,
      };
    case 'media':
      return {
        kind: 'media',
        mediaType: form.mediaType,
        title: nullIfBlank(form.title),
        url: nullIfBlank(form.url),
        mimeType: nullIfBlank(form.mimeType),
        sizeBytes: parseOptionalNumber(form.sizeBytes),
        caption: nullIfBlank(form.caption),
        assetId: nullIfBlank(form.assetId),
      };
    case 'embed':
      return {
        kind: 'embed',
        embedType: form.embedType,
        title: form.title.trim() || 'Linked context',
        href: nullIfBlank(form.url),
        targetId: nullIfBlank(form.targetId),
        summary: nullIfBlank(form.summary),
      };
    case 'ai':
      return {
        kind: 'ai',
        status: form.status,
        title: form.title.trim() || 'AI Consultant',
        prompt: form.prompt,
        response: form.response,
        model: nullIfBlank(form.model),
        confidence: parseOptionalNumber(form.confidence),
      };
    default:
      return {
        kind: 'text',
        displayStyle: 'paragraph',
        markdown: form.markdown,
      };
  }
}

export function describeBrick(brick: BoardBrick) {
  switch (brick.kind) {
    case 'text':
      return brick.markdown.split(/\r?\n/)[0] || 'Text brick';
    case 'media':
      return brick.title ?? 'Media brick';
    case 'embed':
      return brick.title;
    case 'ai':
      return brick.title;
    default:
      return 'Brick';
  }
}

export function getBrickErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected brick editor error.';
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}