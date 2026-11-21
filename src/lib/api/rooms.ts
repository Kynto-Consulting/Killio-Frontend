import { normalizeComposerCommands } from '@/lib/bots/model';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type RoomType = 'channel' | 'thread' | 'dm';
export type RoomRole = 'admin' | 'member' | 'readonly';
export type LinkedEntityType = 'board' | 'document' | 'mesh';
export type ChannelType = 'text' | 'announcement';

/**
 * Answer of `GET /rooms/:id/permissions/me`. Today the backend sends the five legacy booleans; the extra fields are what
 * the permission engine adds (src/lib/rooms/room-controls.ts normalises both shapes).
 */
export interface RoomPermissions {
  canPost: boolean;
  canCall: boolean;
  canInvite: boolean;
  canManage: boolean;
  canRecord: boolean;
  canView?: boolean;
  canReact?: boolean;
  canManageMessages?: boolean;
  canPin?: boolean;
  canMentionEveryone?: boolean;
  canMuteMembers?: boolean;
  isMuted?: boolean;
  mutedUntil?: string | null;
  muteReason?: string | null;
  /** Alternative shape: the resolved permission keys (`room.post`, ...). */
  permissions?: string[];
}

export interface Room {
  id: string;
  teamId: string;
  name: string;
  type: RoomType;
  groupId?: string;
  linkedEntityType?: LinkedEntityType;
  linkedEntityId?: string;
  description?: string;
  emoji?: string;
  defaultRole: RoomRole;
  showReadReceipts?: boolean;
  /** `text` (default) or `announcement` (only some roles publish). */
  channelType?: ChannelType;
  /** Category (a room group). The backend still sends it as `groupId`. */
  categoryId?: string;
  /** Order of the channel inside its category (the server sorts by it). */
  sortOrder?: number;
  /** Document / board chat switched off by its owner: the room is hidden. */
  chatEnabled?: boolean;
  /** Optional counters when the backend provides them; otherwise the client counts live messages. */
  unreadCount?: number;
  mentionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomMemberRole {
  id: string;
  name: string;
  color?: string | null;
  position?: number;
}

export interface RoomMember {
  userId: string;
  role: RoomRole;
  displayName: string;
  email: string;
  avatarUrl?: string;
  joinedAt: string;
  /** Team roles of the person (permission engine). The panel groups by the highest one. */
  roles?: RoomMemberRole[];
  /** Team role ids of the person, when the server sends them (GET /rooms/:id/members). */
  roleIds?: string[];
  /** Subset of roleIds that comes from groups (shown as inherited). */
  inheritedRoleIds?: string[];
  /** Resolved by the page from inheritedRoleIds. */
  inheritedRoles?: RoomMemberRole[];
  isBot?: boolean;
  /** Active timeout in this room. */
  mutedUntil?: string | null;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/** Kinds stored in `room_messages.kind` (migration 0049 CHECK constraint). */
export type RoomMessageType =
  | 'text'
  | 'ai'
  | 'ai_response'
  | 'system'
  | 'call_started'
  | 'call_ended'
  | 'call_summary';

export interface RoomMessageUser {
  displayName: string;
  email: string;
  avatarUrl?: string;
  /** Synthetic bot user (agent F): the message shows a BOT badge and the bot avatar and name. */
  isBot?: boolean;
  /** Colour of the author's highest role, when the backend sends it. */
  roleColor?: string | null;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  type: RoomMessageType;
  metadata?: any;
  reactions?: Record<string, string[]>;
  callRef?: string;
  editedAt?: string;
  /** Simple thread: the message this one answers in a thread (also mirrored in `metadata.threadRootId`). */
  threadRootId?: string;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  /** Replies in this message thread, counted by the server (the loaded page may hold fewer). */
  replyCount?: number;
  /** Tombstone of a deleted message: the list never shows it. */
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
  user?: RoomMessageUser;
  status?: MessageStatus;
}

export interface RoomCallParticipant {
  userId: string;
  displayName: string;
  joinedAt: string;
  leftAt?: string;
}

export interface RoomCall {
  id: string;
  roomId: string;
  startedAt: string;
  endedAt?: string;
  initiatorUserId: string;
  participants: RoomCallParticipant[];
  transcriptStatus: 'none' | 'partial' | 'complete';
}

export interface CallTranscriptSegment {
  userId: string;
  displayName: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface CallTranscript {
  callId: string;
  roomId: string;
  segments: CallTranscriptSegment[];
  reconstructedAt: string;
}

export interface RoomGroup {
  id: string;
  teamId: string;
  name: string;
  emoji?: string;
  sortOrder: number;
  createdAt: string;
}

export interface CreateRoomGroupInput {
  name: string;
  emoji?: string;
}

export interface RoomOverrideDto {
  subjectType: 'everyone' | 'role' | 'group' | 'member';
  subjectId: string | null;
  allow: string[];
  deny: string[];
}

export interface CreateRoomInput {
  name: string;
  type: RoomType;
  groupId?: string;
  /** Same as `groupId`; sent too because the permission-engine API names it `categoryId`. */
  categoryId?: string;
  channelType?: ChannelType;
  linkedEntityType?: LinkedEntityType;
  linkedEntityId?: string;
  description?: string;
  emoji?: string;
  /** Tri-state permission overrides applied when the channel is created. */
  overrides?: RoomOverrideDto[];
}

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

/**
 * Error of the rooms API that keeps the HTTP status, so the UI can tell "this server does not have it yet" (404/405)
 * from "you are not allowed" (403).
 */
export class RoomsApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RoomsApiError';
    this.status = status;
  }
  static async from(res: Response, fallback: string): Promise<RoomsApiError> {
    let message = fallback;
    try {
      const body = await res.clone().json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      // not JSON: keep the fallback
    }
    return new RoomsApiError(message, res.status);
  }
  get isForbidden() { return this.status === 403; }
  get isUnavailable() { return this.status === 404 || this.status === 405 || this.status === 501; }
}

export async function listTeamRooms(teamId: string, accessToken: string): Promise<Room[]> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/rooms`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch rooms');
  return res.json();
}

export async function getRoom(roomId: string, accessToken: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, { headers: authHeader(accessToken) });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to fetch room');
  return res.json();
}

export async function createRoom(teamId: string, input: CreateRoomInput, accessToken: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/rooms`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to create room');
  return res.json();
}

export interface UpdateRoomInput {
  name?: string;
  description?: string | null;
  channelType?: ChannelType;
  categoryId?: string | null;
}

/** Rename / change topic, type or category of a channel. */
export async function updateRoom(roomId: string, patch: UpdateRoomInput, accessToken: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to update room');
  return res.json();
}

export async function deleteRoom(roomId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, { method: 'DELETE', headers: authHeader(accessToken) });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to delete room');
}

export async function findOrCreateDm(teamId: string, targetUserId: string, accessToken: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/rooms/dm?userId=${encodeURIComponent(targetUserId)}`, {
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to open DM');
  return res.json();
}

export async function findRoomByEntity(
  teamId: string,
  entityType: LinkedEntityType,
  entityId: string,
  accessToken: string
): Promise<Room | null> {
  try {
    const rooms = await listTeamRooms(teamId, accessToken);
    return rooms.find(r => r.linkedEntityType === entityType && r.linkedEntityId === entityId) ?? null;
  } catch {
    return null;
  }
}

/** The thread root of a message however the backend delivered it. */
export function threadRootOf(m: Pick<RoomMessage, 'threadRootId' | 'metadata'> & { thread_root_id?: string }): string | undefined {
  return m.threadRootId ?? m.thread_root_id ?? (typeof m.metadata?.threadRootId === 'string' ? m.metadata.threadRootId : undefined);
}

function normalizeMessage(m: RoomMessage): RoomMessage {
  const root = threadRootOf(m as RoomMessage & { thread_root_id?: string });
  return root && !m.threadRootId ? { ...m, threadRootId: root } : m;
}

export async function listRoomMessages(
  roomId: string,
  accessToken: string,
  limit = 50,
  before?: string,
  /** Only the replies of this thread root. */
  threadRootId?: string
): Promise<RoomMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  if (threadRootId) params.set('threadRootId', threadRootId);
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages?${params}`, { headers: authHeader(accessToken) });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to fetch messages');
  return ((await res.json()) as RoomMessage[]).filter((m) => !m.deleted).map(normalizeMessage);
}

export async function sendRoomMessage(
  roomId: string,
  content: string,
  accessToken: string,
  metadata?: any,
  threadRootId?: string
): Promise<RoomMessage> {
  // The thread root travels as a field AND inside metadata: the stored `thread_root_id` column is not exposed by every
  // backend build yet, while metadata always round-trips.
  const meta = threadRootId ? { ...(metadata ?? {}), threadRootId } : metadata;
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ content, metadata: meta, ...(threadRootId ? { threadRootId } : {}) }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to send message');
  return normalizeMessage(await res.json());
}

export async function sendAiRoomMessage(roomId: string, content: string, accessToken: string, metadata?: any): Promise<RoomMessage> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/ai-messages`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ content, metadata }),
  });
  if (!res.ok) throw new Error('Failed to send AI message');
  return res.json();
}

export async function updateMessageMetadata(
  roomId: string,
  messageId: string,
  metadata: any,
  accessToken: string
): Promise<RoomMessage> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}/metadata`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify({ metadata }),
  });
  if (!res.ok) throw new Error('Failed to update message metadata');
  return res.json();
}

/** Edit the text of your own message. */
export async function editRoomMessage(roomId: string, messageId: string, content: string, accessToken: string): Promise<RoomMessage> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to edit message');
  return normalizeMessage(await res.json());
}

/** Delete your own message, or any message when you can manage messages. */
export async function deleteRoomMessage(roomId: string, messageId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to delete message');
}

export async function pinRoomMessage(roomId: string, messageId: string, pinned: boolean, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}/pin`, {
    method: pinned ? 'PUT' : 'DELETE',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to pin message');
}

export async function listPinnedMessages(roomId: string, accessToken: string): Promise<RoomMessage[]> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/pins`, { headers: authHeader(accessToken) });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to fetch pinned messages');
  const data = await res.json();
  return (Array.isArray(data) ? data : data?.messages ?? []).map(normalizeMessage);
}

export async function addReaction(
  roomId: string,
  messageId: string,
  emoji: string,
  accessToken: string,
  action: 'add' | 'remove' = 'add'
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ emoji, action }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to add reaction');
}

export async function listRoomMembers(roomId: string, accessToken: string): Promise<RoomMember[]> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/members`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch members');
  const raw = await res.json();
  const list: RoomMember[] = Array.isArray(raw) ? raw : Array.isArray(raw?.members) ? raw.members : [];
  const seen = new Set<string>();
  return list.filter((m) => m && m.userId && !seen.has(m.userId) && seen.add(m.userId));
}

export async function updateMemberRole(
  roomId: string,
  userId: string,
  role: RoomRole,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/members/${userId}`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to update member role');
}

export async function inviteMember(
  roomId: string,
  userId: string,
  role: RoomRole,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/members`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ userId, role }),
  });
  if (!res.ok) throw new Error('Failed to invite member');
}

export async function removeMember(roomId: string, userId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to remove member');
}

export async function getMyRoomPermissions(roomId: string, accessToken: string): Promise<RoomPermissions> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/permissions/me`, { headers: authHeader(accessToken) });
  if (!res.ok) {
    // The server could not say: offer nothing risky (read-only) instead of pretending the user may write.
    throw await RoomsApiError.from(res, 'Failed to fetch room permissions');
  }
  return res.json();
}

/** Channel overrides: `GET /rooms/:id/permissions` (design section 6). The shape is normalised by tristate.ts. */
export async function getRoomOverrides(roomId: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/permissions`, { headers: authHeader(accessToken) });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to fetch channel permissions');
  return res.json();
}

export async function setRoomOverrides(roomId: string, overrides: RoomOverrideDto[], accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/permissions`, {
    method: 'PUT',
    headers: authHeader(accessToken),
    body: JSON.stringify({ overrides }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to save channel permissions');
}

/** A category has its own overrides, inherited by every channel in it: `GET/PUT /teams/:teamId/room-groups/:groupId/permissions`. */
export async function getCategoryOverrides(teamId: string, groupId: string, accessToken: string): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups/${groupId}/permissions`, { headers: authHeader(accessToken) });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to fetch category permissions');
  return res.json();
}

export async function setCategoryOverrides(teamId: string, groupId: string, overrides: RoomOverrideDto[], accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups/${groupId}/permissions`, {
    method: 'PUT',
    headers: authHeader(accessToken),
    body: JSON.stringify({ overrides }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to save category permissions');
}

/** What `GET /rooms/:id/permissions` says besides the rules themselves. */
export interface RoomOverridesInfo {
  /** false for DMs and for chats of a document / board: they take their access from elsewhere. */
  supportsOverrides: boolean;
  /** Rules the channel inherits from its category (read-only here). */
  inheritedCount: number;
}

export function readOverridesInfo(raw: unknown): RoomOverridesInfo {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { supportsOverrides?: unknown; inheritedFromCategory?: unknown };
  return {
    supportsOverrides: r.supportsOverrides !== false,
    inheritedCount: Array.isArray(r.inheritedFromCategory) ? r.inheritedFromCategory.length : 0,
  };
}

export async function updateRoomSettings(
  roomId: string,
  settings: { showReadReceipts?: boolean },
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/settings`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update room settings');
}


// ─── Moderation: timeouts are per team (they apply in every room of the team) ───────────────────

export interface TeamMute {
  userId: string;
  displayName?: string;
  mutedUntil: string | null;
  reason?: string;
}

/** `POST /teams/:teamId/members/:userId/mute`: a reason and a duration (null minutes = until someone lifts it). */
export async function muteTeamMember(
  teamId: string,
  userId: string,
  input: { reason: string; durationMinutes: number | null },
  accessToken: string
): Promise<TeamMute> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members/${userId}/mute`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({
      reason: input.reason || null,
      ...(input.durationMinutes === null ? {} : { durationMinutes: input.durationMinutes }),
    }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to mute member');
  return res.json();
}

export async function unmuteTeamMember(teamId: string, userId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/members/${userId}/mute`, {
    method: 'DELETE',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to lift the mute');
}

/** Members muted right now (`GET /teams/:teamId/mutes`). Not allowed or an old server: nobody is shown as muted. */
export async function listActiveMutes(teamId: string, accessToken: string): Promise<TeamMute[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/teams/${teamId}/mutes`, { headers: authHeader(accessToken) });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).filter((m) => m && typeof m.userId === 'string');
  } catch {
    return [];
  }
}

// ─── Chat switch of a document / board / mesh ────────────────────────────────────────────────────

export type ChatSwitchEntity = 'document' | 'board' | 'mesh';

export interface EntityChatConfig {
  chatEnabled: boolean;
  /** The user may flip the switch (needs manage rights on the entity). */
  canManage: boolean;
}

/** `GET /teams/:teamId/entity-chats/:entityType/:entityId/config`. Null when this server does not have the switch. */
export async function getEntityChatConfig(teamId: string, entityType: ChatSwitchEntity, entityId: string, accessToken: string): Promise<EntityChatConfig | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/teams/${teamId}/entity-chats/${entityType}/${entityId}/config`, { headers: authHeader(accessToken) });
    if (!res.ok) return null;
    const data = await res.json();
    return { chatEnabled: data?.chatEnabled !== false, canManage: Boolean(data?.canManage) };
  } catch {
    return null;
  }
}

/** `PATCH .../config` with `{ chatEnabled }`. Off archives the chat (nothing is deleted), on restores it. */
export async function setEntityChatEnabled(teamId: string, entityType: ChatSwitchEntity, entityId: string, chatEnabled: boolean, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/entity-chats/${entityType}/${entityId}/config`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify({ chatEnabled }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to change the chat switch');
}

export async function getActiveCall(roomId: string, accessToken: string): Promise<RoomCall | null> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/active-call`, { headers: authHeader(accessToken) });
  if (!res.ok) return null;
  return res.json();
}

export async function listRoomCalls(roomId: string, accessToken: string): Promise<RoomCall[]> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/calls`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch calls');
  return res.json();
}

export async function createCallRecord(roomId: string, accessToken: string): Promise<RoomCall> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/calls`, {
    method: 'POST',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to create call record');
  return res.json();
}

export async function endCallRecord(roomId: string, callId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/calls/${callId}`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify({ endedAt: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error('Failed to end call record');
}

export async function submitCallTranscript(
  roomId: string,
  callId: string,
  segments: CallTranscriptSegment[],
  accessToken: string
): Promise<void> {
  if (segments.length === 0) return;
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/calls/${callId}/transcript`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ segments }),
  });
  if (!res.ok) throw new Error('Failed to submit transcript');
}

export async function getCallTranscript(roomId: string, callId: string, accessToken: string): Promise<CallTranscript> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/calls/${callId}/transcript`, {
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to fetch transcript');
  return res.json();
}


export async function listTeamRoomGroups(teamId: string, accessToken: string): Promise<RoomGroup[]> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups`, { headers: authHeader(accessToken) });
  if (!res.ok) return [];
  return res.json();
}

export async function createRoomGroup(teamId: string, input: CreateRoomGroupInput, accessToken: string): Promise<RoomGroup> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to create room group');
  return res.json();
}

export async function updateRoomGroup(
  teamId: string,
  groupId: string,
  patch: { name?: string; emoji?: string | null },
  accessToken: string
): Promise<RoomGroup> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups/${groupId}`, {
    method: 'PATCH',
    headers: authHeader(accessToken),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to update room group');
  return res.json();
}

/** Persist the order of the categories (ids, first to last). */
export async function reorderRoomGroups(teamId: string, orderedIds: string[], accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups/order`, {
    method: 'PUT',
    headers: authHeader(accessToken),
    body: JSON.stringify({ ids: orderedIds }),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to reorder room groups');
}

export async function deleteRoomGroup(teamId: string, groupId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups/${groupId}`, {
    method: 'DELETE',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw await RoomsApiError.from(res, 'Failed to delete room group');
}

export type RoomNotificationPref = 'all' | 'mentions' | 'none';

export async function getRoomNotificationPref(roomId: string, token: string): Promise<RoomNotificationPref> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/notification-pref`, { headers: authHeader(token) });
  if (!res.ok) throw new Error('Failed to fetch notification preference');
  const data = (await res.json()) as { pref: RoomNotificationPref };
  return data.pref;
}

export async function setRoomNotificationPref(roomId: string, pref: RoomNotificationPref, token: string): Promise<RoomNotificationPref> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/notification-pref`, {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ pref }),
  });
  if (!res.ok) throw new Error('Failed to set notification preference');
  const data = (await res.json()) as { pref: RoomNotificationPref };
  return data.pref;
}

/**
 * Convert a call transcript into a Document.
 * Returns the new document's id and title.
 */
export async function transcriptToDocument(
  roomId: string,
  callId: string,
  teamId: string,
  accessToken: string
): Promise<{ documentId: string; title: string }> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/calls/${callId}/to-document`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ teamId }),
  });
  if (!res.ok) throw new Error('Failed to convert transcript to document');
  return res.json();
}

export async function markMessagesAsRead(
  roomId: string,
  messageIds: string[],
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/read`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ messageIds }),
  });
  if (!res.ok) throw new Error('Failed to mark messages as read');
}

export async function markAllMessagesAsRead(
  roomId: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/read/all`, {
    method: 'POST',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to mark all messages as read');
}

export async function getMessageInfo(
  roomId: string,
  messageId: string,
  accessToken: string
): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}/info`, {
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to fetch message info');
  return res.json();
}

// ─── Team roles and slash commands (other agents' endpoints, read-only here) ───────────────────

export interface TeamRoleLite {
  id: string;
  name: string;
  color: string | null;
  position: number;
  mentionable: boolean;
}

/** `GET /teams/:teamId/roles` (agent A). Failure or an old server: no roles, the UI falls back to the legacy ones. */
export async function listTeamRolesLite(teamId: string, accessToken: string): Promise<TeamRoleLite[]> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/roles`, { headers: authHeader(accessToken) });
  if (!res.ok) return [];
  const data = await res.json();
  const list: any[] = Array.isArray(data) ? data : data?.roles ?? [];
  return list
    .filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string')
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: typeof r.color === 'string' ? r.color : null,
      position: typeof r.position === 'number' ? r.position : 0,
      mentionable: r.mentionable !== false,
    }));
}

export interface BotCommand {
  botId: string;
  botName: string;
  botAvatarUrl?: string;
  name: string;
  description: string;
  usage?: string;
}

/**
 * Slash commands the team bots registered. Read from `GET /teams/:teamId/bots/commands`, or (backup) from `GET /teams/:teamId/bots`,
 * each bot with a `commands` list `{ name, description, usage }`. Missing endpoint or empty answer: no commands, only the built-in ones show.
 */
export async function listBotCommands(teamId: string, accessToken: string): Promise<BotCommand[]> {
  // Preferred: the flat `GET /teams/:id/bots/commands` (active bots only, readable by any member). The list below is the backup.
  try {
    const flat = await fetch(`${API_BASE_URL}/teams/${teamId}/bots/commands`, { headers: authHeader(accessToken) });
    if (flat.ok) {
      const rows = normalizeComposerCommands(await flat.json());
      return rows.map((c) => ({ botId: c.botId, botName: c.botName, botAvatarUrl: c.botAvatarUrl, name: c.name, description: c.description, usage: c.usage }));
    }
  } catch {
    // fall through to the bot list
  }
  try {
    const res = await fetch(`${API_BASE_URL}/teams/${teamId}/bots`, { headers: authHeader(accessToken) });
    if (!res.ok) return [];
    const data = await res.json();
    const bots: any[] = Array.isArray(data) ? data : data?.bots ?? [];
    const out: BotCommand[] = [];
    for (const bot of bots) {
      if (!bot || bot.isActive === false) continue;
      for (const c of Array.isArray(bot.commands) ? bot.commands : []) {
        if (c && typeof c.name === 'string') {
          out.push({
            botId: String(bot.id ?? bot.userId ?? ''),
            botName: String(bot.name ?? 'Bot'),
            botAvatarUrl: typeof bot.avatarUrl === 'string' ? bot.avatarUrl : undefined,
            name: c.name,
            description: typeof c.description === 'string' ? c.description : '',
            usage: typeof c.usage === 'string' ? c.usage : undefined,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

export interface MyTeamPermissions {
  isOwner: boolean;
  roles: Array<{ id: string; name: string; color?: string | null; position?: number }>;
  permissions: string[];
}

/** `GET /teams/:teamId/me/permissions`: the resolved team permissions (design section 6). Null when the server cannot say. */
export async function getMyTeamPermissions(teamId: string, accessToken: string): Promise<MyTeamPermissions | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/teams/${teamId}/me/permissions`, { headers: authHeader(accessToken) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      isOwner: Boolean(data?.isOwner),
      roles: Array.isArray(data?.roles) ? data.roles : [],
      permissions: Array.isArray(data?.permissions) ? data.permissions.filter((p: unknown) => typeof p === 'string') : [],
    };
  } catch {
    return null;
  }
}
