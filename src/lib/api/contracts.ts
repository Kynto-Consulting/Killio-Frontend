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

export type TeamRole = 'owner' | 'admin' | 'member' | 'guest';

export type BoardSummary = {
  id: string;
  teamId: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  updatedAt: string;
};

export type InviteSummary = {
  id: string;
  email: string;
  role: TeamRole;
  status: string;
  deliveryStatus: string;
  createdAt: string;
};

export type AcceptInviteResult = {
  inviteId: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
  accepted: true;
};

export type RevokeInviteResult = {
  inviteId: string;
  revoked: true;
};

export type UpdateTeamMemberRoleResult = {
  membershipId: string;
  role: TeamRole;
  updated: true;
};

export type RemoveTeamMemberResult = {
  membershipId: string;
  removed: true;
};

export type TeamMemberSummary = {
  id: string;
  userId: string;
  role: TeamRole;
  status: string;
  displayName: string;
  primaryEmail: string;
  avatarUrl: string | null;
  joinedAt: string | null;
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

export type TableBrick = BrickBase & {
  kind: 'table';
  rows: string[][];
};

export type GraphBrick = BrickBase & {
  kind: 'graph';
  type: 'line' | 'bar' | 'pie';
  data?: any[];
  title?: string;
};

export type ChecklistBrick = BrickBase & {
  kind: 'checklist';
  items: Array<{ id: string; label: string; checked: boolean }>;
};

export type AccordionBrick = BrickBase & {
  kind: 'accordion';
  title: string;
  body: string;
  isExpanded: boolean;
};

export type BoardBrick = TextBrick | MediaBrick | EmbedBrick | AiBrick | TableBrick | GraphBrick | ChecklistBrick | AccordionBrick;

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
  } | {
    kind: 'table';
    rows: string[][];
  }
  | {
    kind: 'graph';
    type: 'line' | 'bar' | 'pie';
    data?: any[];
    title?: string;
  }
  | {
    kind: 'checklist';
    items: Array<{ id: string; label: string; checked: boolean }>;
  }
  | {
    kind: 'accordion';
    title: string;
    body: string;
    isExpanded: boolean;
  };

export type TagView = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  tag_kind: 'priority' | 'ux' | 'bug' | 'feature' | 'custom';
};

export type CardView = {
  id: string;
  title: string;
  summary?: string | null;
  status?: 'draft' | 'active' | 'done' | 'archived';
  startAt?: string | null;
  dueAt: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  listId?: string;
  listName?: string;
  boardId?: string;
  boardName?: string;
  position?: number;
  urgency: 'normal' | 'urgent';
  blocks: BoardBrick[];
  tags?: TagView[];
  assignees?: any[];
  createdAt: string;
  updatedAt: string;
  commentsCount?: number;
};

export type ActiveCardTimer = {
  cardId: string;
  title: string;
  boardId: string;
  boardName: string;
  listId: string;
  listName: string;
  startAt: string;
  dueAt: string;
};

export type ListView = {
  id: string;
  name: string;
  cards: CardView[];
};

export type BoardView = {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  visibility: 'private' | 'team' | 'public_link';
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
  role: Exclude<TeamRole, 'owner'>;
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

export async function createTag(
  data: {
    scopeType: 'global' | 'team' | 'board' | 'list';
    scopeId: string;
    name: string;
    slug?: string;
    color?: string;
    tagKind?: 'priority' | 'ux' | 'bug' | 'feature' | 'custom';
  },
  accessToken: string
): Promise<TagView> {
  const res = await fetch(`${API_BASE_URL}/tags`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  return res.json();
}

export async function getTagsByScope(
  scopeType: 'global' | 'team' | 'board' | 'list',
  scopeId: string,
  accessToken: string
): Promise<TagView[]> {
  const res = await fetch(`${API_BASE_URL}/tags/scope/${scopeType}/${scopeId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  return res.json();
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

export async function deleteBoard(boardId: string, accessToken: string): Promise<void> {
  return request<void>(`/boards/${boardId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function createList(
  boardId: string,
  payload: { name: string; position?: number },
  accessToken?: string
): Promise<ListView> {
  const url = `${API_BASE_URL}/boards/${boardId}/lists`;
  const options: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
  if (accessToken) {
    (options.headers as any)['Authorization'] = `Bearer ${accessToken}`;
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error('Failed to create list');
  return res.json();
}

export async function updateList(
  boardId: string,
  listId: string,
  payload: { name: string },
  accessToken?: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/boards/${boardId}/lists/${listId}`, {
    method: 'PATCH',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(payload),
  });
}


export async function createCard(body: { listId: string; title: string; dueAt?: string; tags?: string[]; assignees?: string[] }, accessToken?: string): Promise<CardView> {
  return request<CardView>(`/cards`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(body),
  });
}

export async function improveCardWithAi(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list';
    scopeId: string;
    currentTitle: string;
    currentDescription?: string;
    currentBricks?: any[];
    userPrompt?: string;
  },
  accessToken?: string,
): Promise<{ title: string; bricks: any[]; explanation?: string }> {
  return request<{ title: string; bricks: any[]; explanation?: string }>(`/ai/scope/${body.scope}/improve-card`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify({
      scopeId: body.scopeId,
      currentTitle: body.currentTitle,
      currentDescription: body.currentDescription,
      currentBricks: body.currentBricks,
      userPrompt: body.userPrompt,
    }),
  });
}

export async function chatWithAiScope(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list' | 'document';
    scopeId: string;
    message: string;
    contextSummary?: string;
  },
  accessToken?: string,
): Promise<{ text: string; citations?: string[] }> {
  return request<{ text: string; citations?: string[] }>(`/ai/scope/${body.scope}/chat`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify({
      scopeId: body.scopeId,
      message: body.message,
      contextSummary: body.contextSummary,
    }),
  });
}

export async function generateCardsWithAi(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list';
    scopeId: string;
    rawContent: string;
    existingEntitiesSummary?: string;
  },
  accessToken?: string,
): Promise<any[]> {
  return request<any[]>(`/ai/scope/${body.scope}/generate-cards`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(body),
  });
}

export async function generateDocumentsWithAi(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list';
    scopeId: string;
    rawContent: string;
    existingEntitiesSummary?: string;
  },
  accessToken?: string,
): Promise<any[]> {
  return request<any[]>(`/ai/scope/${body.scope}/generate-documents`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(body),
  });
}

export async function generateReportDocumentWithAi(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list' | 'document';
    scopeId: string;
    contextSummary: string;
    dateRangeLabel?: string;
    userPrompt?: string;
    referencedDocuments?: Array<{ id: string; title?: string }>;
  },
  accessToken?: string,
): Promise<{
  title: string;
  bricks: Array<{ kind: 'text' | 'checklist'; content: any }>;
}> {
  return request<{ title: string; bricks: Array<{ kind: 'text' | 'checklist'; content: any }> }>(`/ai/scope/${body.scope}/generate-report-document`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(body),
  });
}

export async function generateBoardsWithAi(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list';
    scopeId: string;
    rawContent: string;
    existingEntitiesSummary?: string;
  },
  accessToken?: string,
): Promise<any[]> {
  return request<any[]>(`/ai/scope/${body.scope}/generate-boards`, {
    method: 'POST',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(body),
  });
}

export async function updateCard(cardId: string, updates: Record<string, any>, accessToken?: string): Promise<CardView> {
  return request<CardView>(`/cards/${cardId}`, {
    method: 'PATCH',
    headers: accessToken ? authHeaders(accessToken) : undefined,
    body: JSON.stringify(updates),
  });
}

export async function getCard(cardId: string, accessToken: string): Promise<CardView> {
  return request<CardView>(`/cards/${cardId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function getActiveCardTimer(accessToken: string): Promise<ActiveCardTimer | null> {
  return request<ActiveCardTimer | null>(`/cards/active-timer/current`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function getActiveCardTimers(accessToken: string): Promise<ActiveCardTimer[]> {
  return request<ActiveCardTimer[]>(`/cards/active-timer/list`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function deleteCard(cardId: string, accessToken?: string): Promise<{ cardId: string; deleted: true }> {
  return request<{ cardId: string; deleted: true }>(`/cards/${cardId}`, {
    method: 'DELETE',
    headers: accessToken ? authHeaders(accessToken) : undefined,
  });
}

export async function listTeamInvites(teamId: string, accessToken: string): Promise<InviteSummary[]> {
  return request<InviteSummary[]>(`/teams/${teamId}/invites`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function listTeamMembers(teamId: string, accessToken: string): Promise<TeamMemberSummary[]> {
  return request<TeamMemberSummary[]>(`/teams/${teamId}/members`, {
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

export async function acceptTeamInvite(token: string, accessToken: string): Promise<AcceptInviteResult> {
  return request<AcceptInviteResult>(`/teams/invites/accept`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ token }),
  });
}

export async function revokeTeamInvite(teamId: string, inviteId: string, accessToken: string): Promise<RevokeInviteResult> {
  return request<RevokeInviteResult>(`/teams/${teamId}/invites/${inviteId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function updateTeamMemberRole(
  teamId: string,
  memberId: string,
  role: Exclude<TeamRole, 'owner'>,
  accessToken: string,
): Promise<UpdateTeamMemberRoleResult> {
  return request<UpdateTeamMemberRoleResult>(`/teams/${teamId}/members/${memberId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ role }),
  });
}

export async function removeTeamMember(teamId: string, memberId: string, accessToken: string): Promise<RemoveTeamMemberResult> {
  return request<RemoveTeamMemberResult>(`/teams/${teamId}/members/${memberId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
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

export async function getCardContext(cardId: string, accessToken: string): Promise<{ boardId: string; listId: string; title: string }> {
  return request<{ boardId: string; listId: string; title: string }>(`/cards/${cardId}/context`, {
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

export async function getCardActivity(cardId: string, accessToken: string): Promise<any[]> {
  return request<any[]>(`/activity/card/${cardId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function addCardComment(cardId: string, text: string, accessToken: string): Promise<void> {
  return request<void>(`/cards/${cardId}/comments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ text }),
  });
}

export async function addBoardComment(boardId: string, text: string, accessToken: string): Promise<void> {
  return request<void>(`/boards/${boardId}/comments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ text }),
  });
}

export async function addCardTag(cardId: string, tagId: string, accessToken: string): Promise<{ cardId: string; tagId: string }> {
  return request<{ cardId: string; tagId: string }>(`/cards/${cardId}/tags/${tagId}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export async function removeCardTag(cardId: string, tagId: string, accessToken: string): Promise<{ cardId: string; tagId: string }> {
  return request<{ cardId: string; tagId: string }>(`/cards/${cardId}/tags/${tagId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function addCardAssignee(cardId: string, assigneeId: string, accessToken: string): Promise<{ cardId: string; assigneeId: string }> {
  return request<{ cardId: string; assigneeId: string }>(`/cards/${cardId}/assignees/${assigneeId}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export async function removeCardAssignee(cardId: string, assigneeId: string, accessToken: string): Promise<{ cardId: string; assigneeId: string }> {
  return request<{ cardId: string; assigneeId: string }>(`/cards/${cardId}/assignees/${assigneeId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

// ------ BOARD SHARING & VISIBILITY ------

export interface BoardMemberSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  avatarUrl: string | null;
}

export async function updateBoardVisibility(
  boardId: string,
  visibility: 'private' | 'team' | 'public_link',
  accessToken: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/boards/${boardId}/visibility`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
}

export async function getBoardMembers(
  boardId: string,
  accessToken: string
): Promise<BoardMemberSummary[]> {
  return request<BoardMemberSummary[]>(`/boards/${boardId}/members`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function addBoardMember(
  boardId: string,
  email: string,
  role: string,
  accessToken: string
): Promise<{ id: string }> {
  return request<{ id: string }>(`/boards/${boardId}/members`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
}

export async function removeBoardMember(
  boardId: string,
  memberId: string,
  accessToken: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/boards/${boardId}/members/${memberId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

// ==========================================
// Bricks & Uploads
// ==========================================

export async function createBrick(
  cardId: string,
  input: BrickMutationInput,
  accessToken: string
): Promise<{ cardId: string; brick: BoardBrick }> {
  return request<{ cardId: string; brick: BoardBrick }>(`/cards/${cardId}/bricks`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateBrick(
  cardId: string,
  brickId: string,
  input: Partial<BrickMutationInput>,
  accessToken: string
): Promise<{ cardId: string; brick: BoardBrick }> {
  return request<{ cardId: string; brick: BoardBrick }>(`/cards/${cardId}/bricks/${brickId}`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteBrick(
  cardId: string,
  brickId: string,
  accessToken: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/cards/${cardId}/bricks/${brickId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function reorderBricks(
  cardId: string,
  brickIds: string[],
  clientId: string,
  accessToken: string
): Promise<{ cardId: string; operationId: string; bricks: BoardBrick[] }> {
  return request(`/cards/${cardId}/bricks/reorder`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ brickIds, clientId }),
  });
}

export async function uploadFile(
  file: File,
  accessToken: string
): Promise<{ key: string; url: string; isPrivate: boolean }> {
  const formData = new FormData();
  formData.append('file', file);

  const uploaded = await request<{ key: string; url: string; isPrivate: boolean }>(`/uploads`, {
    method: 'POST',
    headers: authHeaders(accessToken), // don't set Content-Type to allow browser to insert boundary
    body: formData,
  });

  if (uploaded.url.startsWith('/')) {
    return { ...uploaded, url: `${API_BASE_URL}${uploaded.url}` };
  }

  return uploaded;
}

