/**
 * Mentions in room messages. Wire format (stored in the message text, same family as the other `@[...]` references):
 *   @[user:<id>:<name>]   @[group:<id>:<name>]   @[role:<id>:<name>]   @[everyone:everyone:everyone]
 * Plain text `@everyone` / `@todos` typed by hand is recognised too. Pure, tested in mentions.test.ts.
 */

export type MentionKind = "user" | "group" | "role" | "everyone";

export const EVERYONE_TOKEN = "@[everyone:everyone:everyone]";

export interface ParsedMentions {
  users: string[];
  groups: string[];
  roles: string[];
  everyone: boolean;
}

const TOKEN_RE = /@\[(user|group|role|everyone):([^:\]]+)(?::([^\]]*))?\]/g;
const PLAIN_EVERYONE_RE = /(^|[\s(])@(everyone|todos)(?![\w@-])/i;

export function roleMentionToken(role: { id: string; name: string }): string {
  return `@[role:${role.id}:${cleanLabel(role.name)}]`;
}

export function userMentionToken(user: { id: string; name: string }): string {
  return `@[user:${user.id}:${cleanLabel(user.name)}]`;
}

export function groupMentionTokenOf(group: { id: string; name: string }): string {
  return `@[group:${group.id}:${cleanLabel(group.name)}]`;
}

/** A label inside a token cannot contain `]` (it would close the token). */
function cleanLabel(name: string): string {
  return name.replace(/[\]\n\r]/g, " ").trim() || "?";
}

export function parseMentions(raw: string): ParsedMentions {
  const content = fromWireMentions(raw);
  const out: ParsedMentions = { users: [], groups: [], roles: [], everyone: false };
  const seen = { user: new Set<string>(), group: new Set<string>(), role: new Set<string>() };
  for (const m of content.matchAll(TOKEN_RE)) {
    const kind = m[1] as MentionKind;
    const id = m[2];
    if (kind === "everyone") out.everyone = true;
    else if (!seen[kind].has(id)) {
      seen[kind].add(id);
      (kind === "user" ? out.users : kind === "group" ? out.groups : out.roles).push(id);
    }
  }
  if (!out.everyone && PLAIN_EVERYONE_RE.test(content.replace(TOKEN_RE, " "))) out.everyone = true;
  return out;
}

export interface MentionTarget {
  userId?: string | null;
  roleIds?: readonly string[];
  groupIds?: readonly string[];
}

/** True when the message notifies this person: by name, through one of their roles or groups, or everyone. */
export function mentionsMe(content: string, me: MentionTarget): boolean {
  const parsed = parseMentions(content);
  if (parsed.everyone) return true;
  if (me.userId && parsed.users.includes(me.userId)) return true;
  if (me.roleIds?.some((id) => parsed.roles.includes(id))) return true;
  if (me.groupIds?.some((id) => parsed.groups.includes(id))) return true;
  return false;
}

/**
 * Without the right to mention everyone the token is turned into inert text, so it does not highlight or notify
 * (the backend decides in the end; this only avoids showing a promise the server will not keep).
 */
export function neutralizeEveryone(content: string, canMentionEveryone: boolean): string {
  if (canMentionEveryone) return content;
  return content
    .replace(/@\[everyone:[^\]]*\]/g, "everyone")
    .replace(/@\[[^\]]*\]\(everyone\)/g, "everyone")
    .replace(/(^|[\s(])@(everyone|todos)(?![\w@-])/gi, "$1$2");
}

export interface MentionCandidate {
  kind: MentionKind;
  id: string;
  label: string;
  token: string;
  /** `#rrggbb` of the role / group, when it has one. */
  color: string | null;
  subtitle?: string;
  avatarUrl?: string | null;
}

export interface MentionSources {
  users?: Array<{ id: string; name: string; email?: string | null; avatarUrl?: string | null }>;
  roles?: Array<{ id: string; name: string; color?: string | null; mentionable?: boolean }>;
  groups?: Array<{ id: string; name: string; color?: string | null; memberCount?: number }>;
  canMentionEveryone?: boolean;
  /** Label shown for the `@everyone` row (already translated). */
  everyoneLabel?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export const safeColor = (c: string | null | undefined): string | null => (c && HEX.test(c) ? c : null);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Autocomplete rows for the text typed after `@`: prefix matches first, then substring; groups, roles, people. */
export function buildMentionCandidates(sources: MentionSources, query: string, limit = 8): MentionCandidate[] {
  const q = norm(query.trim());
  const all: MentionCandidate[] = [];
  const everyoneLabel = sources.everyoneLabel ?? "everyone";
  if (sources.canMentionEveryone) {
    all.push({ kind: "everyone", id: "everyone", label: everyoneLabel, token: EVERYONE_TOKEN, color: null });
  }
  for (const r of sources.roles ?? []) {
    if (r.mentionable === false) continue;
    all.push({ kind: "role", id: r.id, label: r.name, token: roleMentionToken(r), color: safeColor(r.color) });
  }
  for (const g of sources.groups ?? []) {
    all.push({
      kind: "group", id: g.id, label: g.name, token: groupMentionTokenOf(g), color: safeColor(g.color),
      subtitle: typeof g.memberCount === "number" ? String(g.memberCount) : undefined,
    });
  }
  for (const u of sources.users ?? []) {
    all.push({ kind: "user", id: u.id, label: u.name, token: userMentionToken(u), color: null, subtitle: u.email ?? undefined, avatarUrl: u.avatarUrl });
  }

  const rank = (c: MentionCandidate): number => {
    if (!q) return 1;
    const label = norm(c.label);
    const extra = c.kind === "everyone" ? "todos all here" : c.kind === "user" ? norm(c.subtitle ?? "") : "";
    if (label.startsWith(q)) return 0;
    if (label.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (label.includes(q) || extra.includes(q)) return 2;
    return -1;
  };
  return all
    .map((c, i) => ({ c, r: rank(c), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Text after the last `@` that is still being typed (no whitespace yet), or null when the caret is not in a mention. */
export function activeMentionQuery(textBeforeCaret: string): string | null {
  const at = textBeforeCaret.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/[\s(]/.test(textBeforeCaret[at - 1])) return null; // e-mail address, not a mention
  const after = textBeforeCaret.slice(at + 1);
  if (/[\s\]]/.test(after) || after.startsWith("[") || after.length > 40) return null;
  return after;
}

// ─── Wire format of the server ────────────────────────────────────────────────────────────────
// The rooms backend reads mentions as `@[Name](target)`, where target is a user id, `everyone`, `role:<id>` or `group:<id>`
// (it checks the right to mention and notifies from them). The editor works with the `@[kind:id:Name]` tokens above, so
// they are converted on the way out and back on the way in.

const WIRE_RE = /@\[([^\]]*)\]\(([^)]+)\)/g;
const SAFE_ID = /^[\w-]{1,64}$/;

/** Converts what the server stores into the editor tokens. Anything that is not a mention (a link, say) is left alone. */
export function fromWireMentions(content: string): string {
  if (!content.includes("](")) return content;
  return content.replace(WIRE_RE, (whole, name: string, target: string) => {
    const t = target.trim();
    if (t === "everyone") return EVERYONE_TOKEN;
    const label = cleanLabel(name);
    if (t.startsWith("role:") && SAFE_ID.test(t.slice(5))) return `@[role:${t.slice(5)}:${label}]`;
    if (t.startsWith("group:") && SAFE_ID.test(t.slice(6))) return `@[group:${t.slice(6)}:${label}]`;
    if (SAFE_ID.test(t)) return `@[user:${t}:${label}]`;
    return whole;
  });
}

/** Converts the editor tokens into what the server reads, so it can authorise and notify. */
export function toWireMentions(content: string): string {
  return content.replace(TOKEN_RE, (_whole, kind: MentionKind, id: string, name?: string) => {
    if (kind === "everyone") return "@[everyone](everyone)";
    const label = cleanLabel(name ?? "");
    return kind === "user" ? `@[${label}](${id})` : `@[${label}](${kind}:${id})`;
  });
}
