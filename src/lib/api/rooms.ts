const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type RoomType = 'channel' | 'thread' | 'dm';
export type RoomRole = 'admin' | 'member' | 'readonly';
export type LinkedEntityType = 'board' | 'document' | 'mesh';

export interface RoomPermissions {
  canPost: boolean;
  canCall: boolean;
  canInvite: boolean;
  canManage: boolean;
  canRecord: boolean;
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
  createdAt: string;
  updatedAt: string;
}

export interface RoomMember {
  userId: string;
  role: RoomRole;
  displayName: string;
  email: string;
  avatarUrl?: string;
  joinedAt: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  type: 'text' | 'ai' | 'system' | 'call_started' | 'call_ended';
  reactions?: Record<string, string[]>;
  callRef?: string;
  editedAt?: string;
  createdAt: string;
  user?: { displayName: string; email: string; avatarUrl?: string };
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

export interface CreateRoomInput {
  name: string;
  type: RoomType;
  groupId?: string;
  linkedEntityType?: LinkedEntityType;
  linkedEntityId?: string;
  description?: string;
  emoji?: string;
}

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

export async function listTeamRooms(teamId: string, accessToken: string): Promise<Room[]> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/rooms`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch rooms');
  return res.json();
}

export async function getRoom(roomId: string, accessToken: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch room');
  return res.json();
}

export async function createRoom(teamId: string, input: CreateRoomInput, accessToken: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/rooms`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create room');
  return res.json();
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

export async function listRoomMessages(
  roomId: string,
  accessToken: string,
  limit = 50,
  before?: string
): Promise<RoomMessage[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages?${params}`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function sendRoomMessage(roomId: string, content: string, accessToken: string): Promise<RoomMessage> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function addReaction(
  roomId: string,
  messageId: string,
  emoji: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: authHeader(accessToken),
    body: JSON.stringify({ emoji }),
  });
  if (!res.ok) throw new Error('Failed to add reaction');
}

export async function listRoomMembers(roomId: string, accessToken: string): Promise<RoomMember[]> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/members`, { headers: authHeader(accessToken) });
  if (!res.ok) throw new Error('Failed to fetch members');
  return res.json();
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
    // Fallback: grant member-level permissions so UI is functional before backend is ready
    return { canPost: true, canCall: true, canInvite: false, canManage: false, canRecord: true };
  }
  return res.json();
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
  if (!res.ok) throw new Error('Failed to create room group');
  return res.json();
}

export async function deleteRoomGroup(teamId: string, groupId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/teams/${teamId}/room-groups/${groupId}`, {
    method: 'DELETE',
    headers: authHeader(accessToken),
  });
  if (!res.ok) throw new Error('Failed to delete room group');
}
