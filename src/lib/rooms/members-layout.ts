/**
 * Sections of the members panel (Discord style): people who are online grouped by their highest role (with its colour),
 * bots apart, everybody else offline in one block. The input list must already be only the people who can SEE the room.
 * Pure, tested in members-layout.test.ts.
 */

export interface PanelRole {
  id: string;
  name: string;
  color?: string | null;
  position?: number;
}

export interface PanelMember {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  roles?: PanelRole[];
  isBot?: boolean;
  mutedUntil?: string | null;
}

export type SectionKind = "role" | "online" | "bots" | "offline";

export interface MemberSection {
  key: string;
  kind: SectionKind;
  /** Role name for `role` sections; the UI translates the other kinds. */
  title: string | null;
  color: string | null;
  members: PanelMember[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function highestRole(member: Pick<PanelMember, "roles">): PanelRole | null {
  const roles = member.roles ?? [];
  if (roles.length === 0) return null;
  return [...roles].sort((a, b) => (b.position ?? 0) - (a.position ?? 0) || a.name.localeCompare(b.name))[0];
}

/** Colour of the person's highest role, only when it is a valid `#rrggbb`. */
export function memberColor(member: Pick<PanelMember, "roles">): string | null {
  const color = highestRole(member)?.color;
  return color && HEX.test(color) ? color : null;
}

const byName = (a: PanelMember, b: PanelMember) =>
  a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }) || a.userId.localeCompare(b.userId);

export function buildMemberSections(members: readonly PanelMember[], onlineIds: ReadonlySet<string>): MemberSection[] {
  const sections: MemberSection[] = [];
  const roleBuckets = new Map<string, { role: PanelRole; members: PanelMember[] }>();
  const online: PanelMember[] = [];
  const bots: PanelMember[] = [];
  const offline: PanelMember[] = [];

  for (const m of members) {
    if (m.isBot) { bots.push(m); continue; }
    if (!onlineIds.has(m.userId)) { offline.push(m); continue; }
    const role = highestRole(m);
    if (!role) { online.push(m); continue; }
    const bucket = roleBuckets.get(role.id) ?? { role, members: [] };
    bucket.members.push(m);
    roleBuckets.set(role.id, bucket);
  }

  const orderedRoles = [...roleBuckets.values()].sort(
    (a, b) => (b.role.position ?? 0) - (a.role.position ?? 0) || a.role.name.localeCompare(b.role.name),
  );
  for (const { role, members: list } of orderedRoles) {
    sections.push({
      key: `role:${role.id}`, kind: "role", title: role.name,
      color: role.color && HEX.test(role.color) ? role.color : null, members: list.sort(byName),
    });
  }
  if (online.length) sections.push({ key: "online", kind: "online", title: null, color: null, members: online.sort(byName) });
  if (bots.length) sections.push({ key: "bots", kind: "bots", title: null, color: null, members: bots.sort(byName) });
  if (offline.length) sections.push({ key: "offline", kind: "offline", title: null, color: null, members: offline.sort(byName) });
  return sections;
}
