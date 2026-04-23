import type { AuthResponse, BoardMemberSummary, TeamMemberSummary } from "@/lib/api/contracts";

type NullableString = string | null | undefined;

export type WorkspaceMemberLike = Partial<TeamMemberSummary> &
  Partial<BoardMemberSummary> & {
    name?: NullableString;
    email?: NullableString;
    primaryEmail?: NullableString;
    avatar_url?: NullableString;
    username?: NullableString;
  };

export type WorkspaceMember = {
  id: string;
  userId: string;
  displayName: string;
  workspaceAlias: string | null;
  baseDisplayName: string | null;
  primaryEmail: string | null;
  avatarUrl: string | null;
  username: string | null;
  role: string | null;
  status: string | null;
};

export type ReferenceUser = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
};

const USERNAME_PATTERN = /^[a-z0-9._-]{2,}$/i;

function asCleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function deriveNameFromEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const at = email.indexOf("@");
  if (at <= 0) {
    return email;
  }
  return email.slice(0, at);
}

function pickFirst(...values: unknown[]): string | null {
  for (const value of values) {
    const clean = asCleanString(value);
    if (clean) {
      return clean;
    }
  }
  return null;
}

export function normalizeWorkspaceMember(input: WorkspaceMemberLike): WorkspaceMember {
  const id = pickFirst(input.userId, input.id, input.primaryEmail, input.email, "unknown") as string;
  const userId = pickFirst(input.userId, input.id, id) as string;
  const primaryEmail = pickFirst(input.primaryEmail, input.email);
  const workspaceAlias = pickFirst(input.workspaceAlias);
  const baseDisplayName = pickFirst(input.baseDisplayName, input.name, deriveNameFromEmail(primaryEmail));
  const displayName =
    pickFirst(input.displayName, workspaceAlias, input.name, baseDisplayName, deriveNameFromEmail(primaryEmail), userId) ||
    "User";

  return {
    id,
    userId,
    displayName,
    workspaceAlias,
    baseDisplayName,
    primaryEmail,
    avatarUrl: pickFirst(input.avatarUrl, input.avatar_url),
    username: pickFirst(input.username),
    role: pickFirst(input.role),
    status: pickFirst(input.status),
  };
}

export function normalizeWorkspaceMembers(inputs: WorkspaceMemberLike[] = []): WorkspaceMember[] {
  return inputs.map((member) => normalizeWorkspaceMember(member));
}

export function toReferenceUsers(inputs: WorkspaceMemberLike[] = []): ReferenceUser[] {
  return normalizeWorkspaceMembers(inputs).map((member) => ({
    id: member.userId || member.id,
    name: member.displayName,
    avatarUrl: member.avatarUrl,
    email: member.primaryEmail,
  }));
}

export function getWorkspaceMemberLabel(member: WorkspaceMemberLike | null | undefined, fallback = "User"): string {
  if (!member) {
    return fallback;
  }
  return normalizeWorkspaceMember(member).displayName || fallback;
}

export function normalizeSessionUser(input: unknown): AuthResponse["user"] | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const id = pickFirst(raw.id, raw.sub);
  const email = pickFirst(raw.email);

  let username = pickFirst(raw.username, raw.preferred_username, deriveNameFromEmail(email));
  let displayName = pickFirst(raw.displayName, raw.name, username, deriveNameFromEmail(email));

  if (!id || !email || !username || !displayName) {
    return null;
  }

  const usernameLooksLikeDisplay = /\s/.test(username);
  const displayLooksLikeUsername = USERNAME_PATTERN.test(displayName) && !/\s/.test(displayName);

  if (usernameLooksLikeDisplay && displayLooksLikeUsername) {
    const tmp = username;
    username = displayName;
    displayName = tmp;
  }

  return {
    id,
    email,
    username,
    displayName,
  };
}
