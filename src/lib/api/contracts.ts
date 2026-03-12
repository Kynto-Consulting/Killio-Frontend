export type BackendHealth = {
  status: string;
  service: string;
  timestamp: string;
};

export type ActivityLogEntry = {
  id: string;
  scope: 'team' | 'board' | 'list' | 'card';
  scopeId: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TeamView = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon?: string | null;
  isPersonal?: boolean;
};

export type BoardSummary = {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
};

export type InviteSummary = {
  id: string;
  email: string;
  role: string;
  status: string;
  deliveryStatus: string;
  createdAt: string;
};

type BrickBase = {
  id: string;
  position: number;
  parentBlockId: string | null;
};

export type TextBrick = BrickBase & {
  kind: 'text';
  displayStyle: 'paragraph' | 'checklist' | 'quote' | 'code' | 'callout';
  markdown: string;
  tasks: Array<{
    id: string;
    label: string;
    checked: boolean;
  }>;
};

export type MediaBrick = BrickBase & {
  kind: 'media';
  mediaType: 'image' | 'file';
  title: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  caption: string | null;
  assetId: string | null;
};

export type EmbedBrick = BrickBase & {
  kind: 'embed';
  embedType: 'board' | 'card' | 'url';
  title: string;
  href: string | null;
  targetId: string | null;
  summary: string | null;
};

export type AiBrick = BrickBase & {
  kind: 'ai';
  status: 'idle' | 'running' | 'done' | 'error';
  title: string;
  prompt: string;
  response: string;
  model: string | null;
  confidence: number | null;
};

export type BoardBrick = TextBrick | MediaBrick | EmbedBrick | AiBrick;

export type BrickMutationInput =
  | {
      kind: 'text';
      displayStyle: TextBrick['displayStyle'];
      markdown: string;
    }
  | {
      kind: 'media';
      mediaType: MediaBrick['mediaType'];
      title: string | null;
      url: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      caption: string | null;
      assetId: string | null;
    }
  | {
      kind: 'embed';
      embedType: EmbedBrick['embedType'];
      title: string;
      href: string | null;
      targetId: string | null;
      summary: string | null;
    }
  | {
      kind: 'ai';
      status: AiBrick['status'];
      title: string;
      prompt: string;
      response: string;
      model: string | null;
      confidence: number | null;
    };

export type CardView = {
  id: string;
  title: string;
  dueAt: string | null;
  urgency: 'normal' | 'urgent';
  blocks: BoardBrick[];
};

export type ListView = {
  id: string;
  name: string;
  cards: CardView[];
};

export type BoardView = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  lists: ListView[];
};

export type CardBrickMutationResult = {
  cardId: string;
  brick: BoardBrick;
};

export type ReorderCardBricksResult = {
  cardId: string;
  operationId: string;
  aggregateVersion: number;
  bricks: BoardBrick[];
};

export type DeleteCardBrickResult = {
  cardId: string;
  brickId: string;
};

export type AuthResponse = {
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string;
  };
  session: {
    id: string;
    expiresAt: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  displayName: string;
};

type LoginPayload = {
  identifier: string;
  password: string;
};

type CreateTeamPayload = {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
};

type CreateBoardPayload = {
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
};

type InvitePayload = {
  email: string;
  role: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await response.json()) as { message?: string | string[] };

    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }

    if (body.message) {
      return body.message;
    }
  }

  const text = await response.text();
  return text || `Request failed with status ${response.status}`;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function getBackendHealth(): Promise<BackendHealth> {
  return request<BackendHealth>('/health', { method: 'GET' });
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function refresh(refreshToken: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await request<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function listTeams(accessToken: string): Promise<TeamView[]> {
  return request<TeamView[]>('/teams', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createTeam(payload: CreateTeamPayload, accessToken: string): Promise<TeamView> {
  return request<TeamView>('/teams', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function listTeamBoards(teamId: string, accessToken: string): Promise<BoardSummary[]> {
  return request<BoardSummary[]>(`/teams/${teamId}/boards`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createBoard(payload: CreateBoardPayload, teamId: string, accessToken: string): Promise<BoardSummary> {
  return request<BoardSummary>(`/teams/${teamId}/boards`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function listTeamInvites(teamId: string, accessToken: string): Promise<InviteSummary[]> {
  return request<InviteSummary[]>(`/teams/${teamId}/invites`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createInvite(payload: InvitePayload, teamId: string, accessToken: string): Promise<InviteSummary> {
  return request<InviteSummary>(`/teams/${teamId}/invites`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function listTeamActivity(teamId: string, accessToken: string): Promise<ActivityLogEntry[]> {
  return request<ActivityLogEntry[]>(`/teams/${teamId}/activity`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function getBoard(boardId: string, accessToken: string): Promise<BoardView> {
  return request<BoardView>(`/boards/${boardId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createCardBrick(cardId: string, payload: BrickMutationInput, accessToken: string): Promise<CardBrickMutationResult> {
  return request<CardBrickMutationResult>(`/cards/${cardId}/bricks`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCardBrick(
  cardId: string,
  brickId: string,
  payload: BrickMutationInput,
  accessToken: string,
): Promise<CardBrickMutationResult> {
  return request<CardBrickMutationResult>(`/cards/${cardId}/bricks/${brickId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function reorderCardBricks(
  cardId: string,
  payload: { clientId: string; brickIds: string[] },
  accessToken: string,
): Promise<ReorderCardBricksResult> {
  return request<ReorderCardBricksResult>(`/cards/${cardId}/bricks/reorder`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteCardBrick(cardId: string, brickId: string, accessToken: string): Promise<DeleteCardBrickResult> {
  return request<DeleteCardBrickResult>(`/cards/${cardId}/bricks/${brickId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

