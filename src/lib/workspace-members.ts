import type { AuthResponse, BoardMemberSummary, TeamMemberSummary } from "@/lib/api/contracts";

type NullableString = string | null | undefined;

export type SessionUser = AuthResponse["user"] & {
  email?: string | null;
  primaryEmail?: string | null;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
};

export type WorkspaceMemberLike = Partial<TeamMemberSummary> &
  Partial<BoardMemberSummary> & {
    displayName?: NullableString;
    workspaceAlias?: NullableString;
    baseDisplayName?: NullableString;
    name?: NullableString;
    alias?: NullableString;
    email?: NullableString;
    primaryEmail?: NullableString;
    avatar_url?: NullableString;
  };

export type WorkspaceMember = {
  id: string;
  name: string;
  alias: string | null;
  primaryEmail: string | null;
  avatarUrl: string | null;
  role: string | null;
  status: string | null;
};

export type ReferenceUser = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
};

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
  const id = pickFirst(input.id, input.userId, input.primaryEmail, input.email, "unknown") as string;
  const primaryEmail = pickFirst(input.primaryEmail, input.email);
  const alias = pickFirst(input.alias, input.workspaceAlias);
  const name =
    pickFirst(
      input.name,
      input.displayName,
      alias,
      input.baseDisplayName,
      deriveNameFromEmail(primaryEmail),
      id,
    ) ||
    "User";

  return {
    id,
    name,
    alias,
    primaryEmail,
    avatarUrl: pickFirst(input.avatarUrl, input.avatar_url),
    role: pickFirst(input.role),
    status: pickFirst(input.status),
  };
}

export function normalizeWorkspaceMembers(inputs: WorkspaceMemberLike[] = []): WorkspaceMember[] {
  return inputs.map((member) => normalizeWorkspaceMember(member));
}

export function toReferenceUsers(inputs: WorkspaceMemberLike[] = []): ReferenceUser[] {
  return normalizeWorkspaceMembers(inputs).map((member) => ({
    id: member.id,
    name: member.name,
    avatarUrl: member.avatarUrl,
    email: member.primaryEmail,
  }));
}

export function getWorkspaceMemberLabel(member: WorkspaceMemberLike | null | undefined, fallback = "User"): string {
  if (!member) {
    return fallback;
  }
  const normalized = normalizeWorkspaceMember(member);
  return normalized.alias || normalized.name || fallback;
}

export function normalizeSessionUser(input: unknown): SessionUser | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const id = pickFirst(raw.id, raw.sub);
  const name = pickFirst(raw.name, raw.displayName);
  const alias = pickFirst(raw.alias, raw.workspaceAlias);
  const email = pickFirst(raw.email, raw.primaryEmail);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    alias,
    email,
    primaryEmail: email,
    displayName: alias || name,
    username: alias || name,
    avatarUrl: pickFirst(raw.avatarUrl),
    avatar_url: pickFirst(raw.avatar_url),
  };
}
