export type BackendHealth = {
  status: string;
  service: string;
  timestamp: string;
};

export type ActivityLogEntry = {
  id: string;
  scope: 'team' | 'board' | 'list' | 'card' | 'document';
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
  boardType: 'kanban' | 'mesh';
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  backgroundKind: 'none' | 'preset' | 'image' | 'color' | 'gradient';
  backgroundValue: string | null;
  backgroundImageUrl: string | null;
  backgroundGradient: string | null;
  themeKind: 'preset' | 'custom';
  themePreset: string | null;
  themeCustom: Record<string, unknown>;
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

export type UpdateTeamMemberAliasResult = {
  membershipId: string;
  id: string;
  alias: string | null;
  updated: true;
};

export type TeamMemberSummary = {
  membershipId: string;
  id: string;
  userId?: string;
  role: TeamRole;
  status: string;
  name: string;
  alias: string | null;
  primaryEmail: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  displayName?: string | null;
  workspaceAlias?: string | null;
  baseDisplayName?: string | null;
  email?: string | null;
};

export type TeamMetricsSummary = {
  memberCount: number;
  ownerCount: number;
  adminCount: number;
  boardCount: number;
  cardCount: number;
  completedCardCount: number;
  assignmentCount: number;
  pendingInviteCount: number;
  scriptCount: number;
  activeScriptCount: number;
  monthlyScriptRuns: number;
  activityCount: number;
  activityActorCount: number;
};

export type TeamMetricsRoleBreakdown = {
  role: TeamRole | string;
  count: number;
};

export type TeamMetricsMember = {
  membershipId: string;
  id: string;
  userId?: string;
  role: TeamRole | string;
  status: string;
  name: string;
  alias: string | null;
  primaryEmail: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  assignmentsCount: number;
  createdCardsCount: number;
  completedCardsCount: number;
  activityCount: number;
  lastActiveAt: string | null;
  displayName?: string | null;
};

export type TeamMetricsBoard = {
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
  cardsCount: number;
  openCardsCount: number;
  overdueCardsCount: number;
  staleCardsCount: number;
  createdCardsWindowCount: number;
  completedCardsWindowCount: number;
  completionRatePct: number | null;
  completedCardsCount: number;
  assignmentsCount: number;
  activityCount: number;
  lastActiveAt: string | null;
};

export type TeamMetricsActivitySeriesPoint = {
  date: string;
  activityCount: number;
  assignmentsCount: number;
  completionsCount: number;
  createdCardsCount: number;
};

export type TeamMetricsWindowSummary = {
  activityCount: number;
  assignmentsCount: number;
  completionsCount: number;
  createdCardsCount: number;
};

export type TeamMetricsTrendMetric = 'activity' | 'assignments' | 'completions' | 'createdCards';

export type TeamMetricsTrend = {
  metric: TeamMetricsTrendMetric;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type TeamMetricsKpis = {
  completionRatePct: number | null;
  throughputPerActiveMember: number;
  avgCycleTimeHours: number | null;
  activeMemberCount: number;
  collaborationRatePct: number;
  workloadBalanceScore: number;
  openCards: number;
  overdueOpenCards: number;
  dueSoonCards: number;
  staleOpenCards: number;
};

export type TeamMetricsWorkloadMember = {
  id: string;
  userId?: string;
  name: string;
  avatarUrl: string | null;
  assignmentsCount: number;
  activityCount: number;
  completedCardsCount: number;
  displayName?: string | null;
};

export type TeamMetricsWorkloadInsights = {
  overloadedMembers: TeamMetricsWorkloadMember[];
  underutilizedMembers: TeamMetricsWorkloadMember[];
};

export type TeamMetricsAutomation = {
  scriptCount: number;
  activeScriptCount: number;
  monthlyRuns: number;
  limit: number | null;
  remaining: number | null;
};

export type TeamMetricsResponse = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  windowDays: number;
  generatedAt: string;
  summary: TeamMetricsSummary;
  windowSummary: TeamMetricsWindowSummary;
  previousWindowSummary: TeamMetricsWindowSummary;
  trends: TeamMetricsTrend[];
  kpis: TeamMetricsKpis;
  workloadInsights: TeamMetricsWorkloadInsights;
  roleBreakdown: TeamMetricsRoleBreakdown[];
  members: TeamMetricsMember[];
  boards: TeamMetricsBoard[];
  activitySeries: TeamMetricsActivitySeriesPoint[];
  automation: TeamMetricsAutomation;
  recentActivity: ActivityLogEntry[];
};

type BrickBase = {
  id: string;
  position: number;
  parentBlockId: string | null;
};

export type ChildrenByContainer = Record<string, string[]>;

export type ContainerMeta = {
  childrenByContainer?: ChildrenByContainer;
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
  content?: ContainerMeta & Record<string, unknown>;
};

export type TabsBrick = BrickBase & {
  kind: 'tabs';
  tabs: Array<{ id: string; label: string; content?: string }>;
  content?: ContainerMeta & Record<string, unknown>;
};

export type ColumnsBrick = BrickBase & {
  kind: 'columns';
  columns: Array<{ id: string }>;
  content?: ContainerMeta & Record<string, unknown>;
};

export type PaymentBrick = BrickBase & {
  kind: 'payment';
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  provider: 'stripe' | 'paypal' | 'mercadopago';
  connectionId: string | null;
  externalProductId: string | null;
  checkoutUrl: string | null;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paidAt: string | null;
  payerEmail: string | null;
  webhookEventId: string | null;
  webhookUrl?: string | null;
  scriptId?: string | null;
  credentialsLocked?: boolean;
  credentialsLastUpdatedAt?: string | null;
};

export type BoardBrick =
  | TextBrick
  | MediaBrick
  | AiBrick
  | TableBrick
  | GraphBrick
  | ChecklistBrick
  | AccordionBrick
  | TabsBrick
  | ColumnsBrick
  | PaymentBrick;

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
    content?: ContainerMeta & Record<string, unknown>;
  }
  | {
    kind: 'tabs';
    tabs: Array<{ id: string; label: string; content?: string }>;
    content?: ContainerMeta & Record<string, unknown>;
  }
  | {
    kind: 'columns';
    columns?: Array<{ id: string }>;
    columnsCount?: number;
    content?: ContainerMeta & Record<string, unknown>;
  }
  | {
    kind: 'payment';
    title: string;
    description: string | null;
    amount: number;
    currency: string;
    provider: 'stripe' | 'paypal' | 'mercadopago';
    connectionId: string | null;
    externalProductId?: string | null;
    checkoutUrl?: string | null;
    status?: 'pending' | 'paid' | 'failed' | 'refunded';
    paidAt?: string | null;
    payerEmail?: string | null;
    webhookEventId?: string | null;
    webhookUrl?: string | null;
    scriptId?: string | null;
    credentialsLocked?: boolean;
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
  boardType: 'kanban' | 'mesh';
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  backgroundKind: 'none' | 'preset' | 'image' | 'color' | 'gradient';
  backgroundValue: string | null;
  backgroundImageUrl: string | null;
  backgroundGradient: string | null;
  themeKind: 'preset' | 'custom';
  themePreset: string | null;
  themeCustom: Record<string, unknown>;
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
    name: string;
    alias: string | null;
  };
  session: {
    id: string;
    expiresAt: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  otp_required?: false;
};

export type OtpRequiredResponse = {
  otp_required: true;
  userId: string;
  email: string;
};

type RegisterPayload = {
  name: string;
  email: string;
  password: string;
};

type LoginPayload = {
  identifier?: string;
  email?: string;
  password: string;
  rememberMe?: boolean;
};

export type OtpPurpose = 'login' | 'password_reset' | 'register';

export type RequestOtpPayload = {
  email: string;
  useMagicLink?: boolean;
  purpose?: OtpPurpose;
};

export type VerifyOtpPayload = {
  email?: string;
  code?: string;
  token?: string;
  rememberMe?: boolean;
  purpose?: OtpPurpose;
  autoRegister?: boolean;
};

export type ResetPasswordWithOtpPayload = {
  email?: string;
  code?: string;
  token?: string;
  newPassword: string;
};

export type RegisterWithOtpPayload = RegisterPayload & {
  code?: string;
  token?: string;
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
  boardType?: 'kanban' | 'mesh';
  description?: string;
  coverImageUrl?: string;
  backgroundKind?: 'none' | 'preset' | 'image' | 'color' | 'gradient';
  backgroundValue?: string;
  backgroundImageUrl?: string;
  backgroundGradient?: string;
  themeKind?: 'preset' | 'custom';
  themePreset?: string;
  themeCustom?: Record<string, unknown>;
};

export type UpdateBoardAppearancePayload = {
  coverImageUrl?: string | null;
  backgroundKind?: 'none' | 'preset' | 'image' | 'color' | 'gradient';
  backgroundValue?: string | null;
  backgroundImageUrl?: string | null;
  backgroundGradient?: string | null;
  themeKind?: 'preset' | 'custom';
  themePreset?: string | null;
  themeCustom?: Record<string, unknown>;
};

export type MeshBrickKind =
  | 'board_empty'
  | 'text'
  | 'frame'
  | 'script'
  | 'mirror'
  | 'portal'
  | 'decision'
  | 'draw';

export type MeshBrick = {
  id: string;
  kind: MeshBrickKind;
  parentId: string | null;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation?: number;
  metadata?: Record<string, unknown>;
  content?: Record<string, unknown>;
};

export type MeshConnection = {
  id: string;
  cons: [string, string];
  label: { type: 'doc'; content?: unknown[] };
  style?: Record<string, unknown>;
};

export type MeshState = {
  version: string;
  viewport: { x: number; y: number; zoom: number };
  rootOrder: string[];
  bricksById: Record<string, MeshBrick>;
  connectionsById: Record<string, MeshConnection>;
};

export type MeshSnapshot = {
  meshId: string;
  schemaVersion: string;
  revision: number;
  updatedAt: string;
  state: MeshState;
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
  const isFormData = init?.body instanceof FormData;
  const defaultHeaders: Record<string, string> = isFormData ? {} : { 'Content-Type': 'application/json' };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...defaultHeaders,
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

export async function registerWithOtp(payload: RegisterWithOtpPayload): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register-with-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function login(payload: LoginPayload): Promise<AuthResponse | OtpRequiredResponse> {
  return request<AuthResponse | OtpRequiredResponse>('/auth/login', {
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

export async function requestOtp(payload: RequestOtpPayload): Promise<{ ok: true; expiresInMinutes: number; delivery: 'otp' | 'magic_link' }> {
  return request<{ ok: true; expiresInMinutes: number; delivery: 'otp' | 'magic_link' }>('/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyOtp(payload: VerifyOtpPayload): Promise<AuthResponse | { ok: true; email: string }> {
  return request<AuthResponse | { ok: true; email: string }>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetPasswordWithOtp(payload: ResetPasswordWithOtpPayload): Promise<{ ok: true }> {
  return request<{ ok: true }>('/auth/reset-password-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getOtpLoginPreference(accessToken: string): Promise<{ enabled: boolean }> {
  return request<{ enabled: boolean }>('/auth/security/otp-login', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function setOtpLoginPreference(accessToken: string, enabled: boolean): Promise<{ ok: true; enabled: boolean }> {
  return request<{ ok: true; enabled: boolean }>('/auth/security/otp-login', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
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

export type TeamCatalog = {
  boards: BoardSummary[];
  documents: { id: string; title: string }[];
  cards: { id: string; title: string; boardId: string; boardName: string }[];
};

export async function listTeamCatalog(teamId: string, accessToken: string): Promise<TeamCatalog> {
  return request<TeamCatalog>(`/teams/${teamId}/catalog`, {
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

export async function updateBoardDetails(
  boardId: string,
  payload: { name?: string; description?: string | null },
  accessToken: string,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/boards/${boardId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
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
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
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
      history: body.history,
    }),
  });
}

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

export interface TeamAiUsageAllocation {
  userId: string;
  name: string;
  role: string;
  creditsUsed: number;
  tokensUsed: number;
  sharePct: number;
  isCurrentUser: boolean;
}

export interface TeamAiUsage {
  teamId: string;
  periodStart: string;
  creditsUsed: number;
  tokensUsed: number;
  limit: number;
  remaining: number;
  myCreditsUsed?: number;
  myTokensUsed?: number;
  mySharePct?: number;
  memberAllocations?: TeamAiUsageAllocation[];
  billingOwnerUserId?: string;
  billingOwnerName?: string;
  isBillingOwner?: boolean;
}

export interface TeamRagStatus {
  teamId: string;
  planTier: 'free' | 'pro' | 'max' | 'enterprise';
  periodDate: string;
  sourceCounts: {
    documents: number;
    cards: number;
    boards: number;
  };
  policy: {
    dailyBaseSync: number;
    dailyExtraSync: number;
    extraThresholdPct: number | null;
  };
  usage: {
    baseUsed: number;
    baseRemaining: number;
    extraUsed: number;
    extraRemaining: number;
    lastRunAt: string | null;
  };
  vectorIndex: {
    indexedEntities: number;
    indexedChunks: number;
    coveragePct: number;
    lastRunAt: string | null;
    lastRunStatus: 'indexed' | 'skipped' | 'error' | null;
    lastRunReason: string | null;
    embeddingProvider: string | null;
    embeddingModel: string | null;
  };
  lastRun: {
    runType: 'base' | 'extra' | 'skipped';
    changedEntities: number;
    removedEntities: number;
    totalEntities: number;
    changeRatioPct: number;
    thresholdPct: number | null;
    createdAt: string;
  } | null;
}

export interface TeamRagSyncResult {
  teamId: string;
  planTier: 'free' | 'pro' | 'max' | 'enterprise';
  runType: 'base' | 'extra' | 'skipped';
  reason: string;
  changedEntities: number;
  removedEntities: number;
  totalEntities: number;
  comparedEntities: number;
  changeRatioPct: number;
  thresholdPct: number | null;
  policy: {
    dailyBaseSync: number;
    dailyExtraSync: number;
    extraThresholdPct: number | null;
  };
  usage: {
    baseUsed: number;
    baseRemaining: number;
    extraUsed: number;
    extraRemaining: number;
  };
  vectorIndexRun: {
    status: 'indexed' | 'skipped' | 'error';
    reason: string;
    changedEntities: number;
    removedEntities: number;
    totalEntities: number;
    indexedChunks: number;
    createdAt: string;
  } | null;
}

export interface TeamRagRunHistoryItem {
  id: string;
  runType: 'base' | 'extra' | 'skipped';
  triggerSource: 'manual' | 'api' | 'system';
  triggeredByUserId: string | null;
  changedEntities: number;
  removedEntities: number;
  totalEntities: number;
  changeRatioPct: number;
  thresholdPct: number | null;
  reason: string;
  createdAt: string;
}

/**
 * Streams an AI chat response using SSE.
 * Returns a cancel function.
 */
export function streamAiChat(
  body: {
    scope: 'personal' | 'team' | 'board' | 'list' | 'document';
    scopeId: string;
    message: string;
    contextSummary?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
  accessToken: string,
  onEvent: (event: AiStreamEvent) => void,
): () => void {
  const ctrl = new AbortController();
  const url = `${API_BASE_URL}/ai/scope/${body.scope}/chat/stream`;
  let accumulated = '';
  let terminalEventReceived = false;

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      scopeId: body.scopeId,
      message: body.message,
      contextSummary: body.contextSummary,
      history: body.history,
    }),
    signal: ctrl.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      terminalEventReceived = true;
      onEvent({ type: 'error', message: `AI stream failed (${res.status})` });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line) as AiStreamEvent;
          if (event.type === 'delta') accumulated += event.text;
          if (event.type === 'done' || event.type === 'error') terminalEventReceived = true;
          onEvent(event);
        } catch {
          /* ignore */
        }
      }
    }

    if (!terminalEventReceived) {
      terminalEventReceived = true;
      onEvent({ type: 'done', text: accumulated });
    }
  }).catch((err) => {
    if (err?.name !== 'AbortError') {
      terminalEventReceived = true;
      onEvent({ type: 'error', message: String(err?.message ?? 'Stream error') });
    }
  });

  return () => ctrl.abort();
}

export async function getTeamAiUsage(teamId: string, accessToken: string): Promise<TeamAiUsage> {
  return request<TeamAiUsage>(`/ai/team/${teamId}/usage`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function getTeamRagStatus(teamId: string, accessToken: string): Promise<TeamRagStatus> {
  return request<TeamRagStatus>(`/ai/team/${teamId}/rag/status`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function runTeamRagSync(
  teamId: string,
  accessToken: string,
  triggerSource: 'manual' | 'api' | 'system' = 'manual',
): Promise<TeamRagSyncResult> {
  return request<TeamRagSyncResult>(`/ai/team/${teamId}/rag/sync`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ triggerSource }),
  });
}

export async function listTeamRagRuns(
  teamId: string,
  accessToken: string,
  limit = 20,
): Promise<TeamRagRunHistoryItem[]> {
  return request<TeamRagRunHistoryItem[]>(`/ai/team/${teamId}/rag/runs?limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
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

export async function listTeamMetrics(teamId: string, accessToken: string, windowDays = 30): Promise<TeamMetricsResponse> {
  return request<TeamMetricsResponse>(`/teams/${teamId}/metrics?windowDays=${encodeURIComponent(String(windowDays))}`, {
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

export async function updateTeamMemberAlias(
  teamId: string,
  memberId: string,
  alias: string | null,
  accessToken: string,
): Promise<UpdateTeamMemberAliasResult> {
  return request<UpdateTeamMemberAliasResult>(`/teams/${teamId}/members/${memberId}/alias`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ alias }),
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

export async function getMesh(meshId: string, accessToken: string): Promise<MeshSnapshot> {
  return request<MeshSnapshot>(`/meshes/${meshId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateMeshState(
  meshId: string,
  payload: { state: MeshState; expectedRevision: number },
  accessToken: string,
): Promise<MeshSnapshot> {
  return request<MeshSnapshot>(`/meshes/${meshId}/state`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function normalizeMeshState(meshId: string, accessToken: string): Promise<MeshSnapshot> {
  return request<MeshSnapshot>(`/meshes/${meshId}/normalize`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export function buildMeshAiContext(state: MeshState): string {
  const brickCount = Object.keys(state.bricksById).length;
  const connCount = Object.keys(state.connectionsById).length;
  const textSnippets = Object.values(state.bricksById)
    .filter((b) => b.kind === 'text')
    .map((b) => {
      const content = (b.content && typeof b.content === 'object') ? (b.content as Record<string, unknown>) : {};
      const markdown = typeof content.markdown === 'string' ? content.markdown : '';
      return markdown.replace(/\s+/g, ' ').trim();
    })
    .filter((value) => value.length > 0)
    .slice(0, 5)
    .map((value) => value.slice(0, 80));

  return `Mesh: ${brickCount} bricks, ${connCount} conexiones. Textos: ${textSnippets.length ? textSnippets.join(' | ') : '(vacío)'}`;
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

export async function getDocumentActivity(documentId: string, accessToken: string): Promise<ActivityLogEntry[]> {
  return request<ActivityLogEntry[]>(`/activity/document/${documentId}`, {
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
  email: string | null;
  name: string | null;
  alias: string | null;
  role: string;
  avatarUrl: string | null;
  displayName?: string | null;
  workspaceAlias?: string | null;
  baseDisplayName?: string | null;
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

export async function updateBoardAppearance(
  boardId: string,
  payload: UpdateBoardAppearancePayload,
  accessToken: string,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/boards/${boardId}/appearance`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
// Mesh sharing / members / visibility
// ==========================================

export type MeshMemberSummary = {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
};

export async function updateMeshVisibility(
  meshId: string,
  visibility: 'private' | 'team' | 'public_link',
  accessToken: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/meshes/${meshId}/visibility`, {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
}

export async function getMeshMembers(
  meshId: string,
  accessToken: string
): Promise<MeshMemberSummary[]> {
  return request<MeshMemberSummary[]>(`/meshes/${meshId}/members`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function addMeshMember(
  meshId: string,
  email: string,
  role: string,
  accessToken: string
): Promise<{ id: string }> {
  return request<{ id: string }>(`/meshes/${meshId}/members`, {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
}

export async function removeMeshMember(
  meshId: string,
  memberId: string,
  accessToken: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/meshes/${meshId}/members/${memberId}`, {
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

  const normalizePrivateImagePath = (url: string) => {
    const prefix = '/uploads/image/';
    if (!url.startsWith(prefix)) return url;

    const rawKey = url.slice(prefix.length);
    if (!rawKey) return url;

    try {
      const decodedKey = decodeURIComponent(rawKey);
      return `${prefix}${encodeURIComponent(decodedKey)}`;
    } catch {
      return `${prefix}${encodeURIComponent(rawKey)}`;
    }
  };

  const normalizedUrl = normalizePrivateImagePath(uploaded.url);

  if (normalizedUrl.startsWith('/')) {
    return { ...uploaded, url: `${API_BASE_URL}${normalizedUrl}` };
  }

  return { ...uploaded, url: normalizedUrl };
}

