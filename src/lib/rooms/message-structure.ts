/**
 * Structure of a room's messages: what each message offers (edit, delete, pin, thread), simple threads, pinned list and
 * the slash-command autocomplete. Pure, tested in message-structure.test.ts.
 */

export interface StructMessage {
  id: string;
  userId: string;
  type: string;
  createdAt: string;
  content?: string;
  threadRootId?: string | null;
  pinnedAt?: string | null;
  user?: { isBot?: boolean } | null;
  status?: string;
}

export interface ActionRights {
  canEditOwn: boolean;
  canDeleteOwn: boolean;
  canDeleteOthers: boolean;
  canPin: boolean;
  canReply: boolean;
  showReactions: boolean;
}

export interface MessageActions {
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  canReply: boolean;
  canThread: boolean;
  canReact: boolean;
}

/** Kinds written by people (or bots); the others are banners the room itself produced. */
const CONVERSATION_KINDS = new Set(["text", "ai", "ai_response"]);

const isPending = (m: StructMessage) => m.id.startsWith("temp-") || m.id.startsWith("bot-") || m.status === "sending" || m.status === "failed";

export function messageActions(message: StructMessage, currentUserId: string, rights: ActionRights): MessageActions {
  const conversational = CONVERSATION_KINDS.has(message.type) && !isPending(message);
  const own = Boolean(currentUserId) && message.userId === currentUserId;
  const isBotOrAi = message.type === "ai" || message.type === "ai_response" || Boolean(message.user?.isBot);
  return {
    // Only text written by a person can be edited: AI, bot and system messages are not "yours" to rewrite.
    canEdit: own && message.type === "text" && !isBotOrAi && rights.canEditOwn && conversational,
    canDelete: conversational && ((own && rights.canDeleteOwn) || rights.canDeleteOthers),
    canPin: conversational && rights.canPin,
    canReply: conversational && rights.canReply,
    canThread: conversational && rights.canReply && !message.threadRootId,
    canReact: conversational && rights.showReactions,
  };
}

export interface ThreadView<M extends StructMessage> {
  /** Messages shown in the main flow: everything that is not a thread reply. */
  main: M[];
  /** Replies per thread root, oldest first. */
  replies: Map<string, M[]>;
}

export function splitThreads<M extends StructMessage>(messages: readonly M[]): ThreadView<M> {
  const ids = new Set(messages.map((m) => m.id));
  const main: M[] = [];
  const replies = new Map<string, M[]>();
  for (const m of messages) {
    const root = m.threadRootId;
    // A reply whose root is not loaded (older page) stays in the main flow so it is never lost.
    if (root && ids.has(root)) {
      const list = replies.get(root) ?? [];
      list.push(m);
      replies.set(root, list);
    } else {
      main.push(m);
    }
  }
  for (const list of replies.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { main, replies };
}

export function threadSummary<M extends StructMessage>(replies: readonly M[] | undefined): { count: number; lastAt: string | null } {
  if (!replies || replies.length === 0) return { count: 0, lastAt: null };
  return { count: replies.length, lastAt: replies[replies.length - 1].createdAt };
}

/** Pinned messages, most recently pinned first. */
export function pinnedMessages<M extends StructMessage>(messages: readonly M[]): M[] {
  return messages.filter((m) => Boolean(m.pinnedAt)).sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
}

// ─── Slash commands ──────────────────────────────────────────────────────────────────────────

export interface SlashCommand {
  /** Name without the slash. */
  name: string;
  description: string;
  usage?: string;
  /** `builtin` or the name of the bot that registered it. */
  source: string;
  botAvatarUrl?: string;
}

export const BUILTIN_COMMANDS: readonly SlashCommand[] = [
  { name: "poll", description: "", usage: "/poll Question | Option 1 | Option 2", source: "builtin" },
  { name: "survey", description: "", usage: "/survey Question | Option 1 | Option 2", source: "builtin" },
];

/** Text after the slash while the command name is still being typed; null once there is a space (arguments) or no slash. */
export function activeSlashQuery(text: string): string | null {
  if (!text.startsWith("/")) return null;
  const rest = text.slice(1);
  return /^[a-z0-9_-]{0,32}$/i.test(rest) ? rest.toLowerCase() : null;
}

export function buildSlashCandidates(commands: readonly SlashCommand[], query: string, limit = 8): SlashCommand[] {
  const q = query.toLowerCase();
  const seen = new Set<string>();
  const ranked: Array<{ c: SlashCommand; rank: number }> = [];
  for (const c of commands) {
    const key = `${c.source}:${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = c.name.toLowerCase();
    const rank = !q ? 1 : name.startsWith(q) ? 0 : name.includes(q) ? 2 : -1;
    if (rank >= 0) ranked.push({ c, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name)).slice(0, limit).map((x) => x.c);
}

/** Pinned messages already loaded plus the ones the server lists (older pages), without duplicates, newest pin first. */
export function mergePinned<M extends StructMessage>(loaded: readonly M[], fetched: readonly M[]): M[] {
  const byId = new Map<string, M>();
  for (const m of fetched) if (m.pinnedAt) byId.set(m.id, m);
  // The loaded copy is the live one (it carries unpin / edit events), so it wins; an unpinned loaded message removes the fetched pin.
  for (const m of loaded) {
    if (m.pinnedAt) byId.set(m.id, m);
    else byId.delete(m.id);
  }
  return [...byId.values()].sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
}

/** Accent- and case-insensitive text search over message text, newest match last (same order as the list). */
export function filterMessagesByText<M extends StructMessage>(messages: readonly M[], query: string, visibleText: (m: M) => string): M[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = norm(query.trim());
  if (!q) return [...messages];
  return messages.filter((m) => norm(visibleText(m)).includes(q));
}
