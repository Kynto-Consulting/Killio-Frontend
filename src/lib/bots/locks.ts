/**
 * Pure model of the two independent locks and of the immutable authorship of bots and scripts. No I/O; tested in locks.test.ts.
 * Contract: Killio-Backend/src/modules/scripts (script-access.rules.ts, authorship.ts) and src/modules/bots (bots.service.ts).
 *
 *  - BOT lock: identity and settings frozen (name, description, avatar, commands, bound script, trigger flag, triggers).
 *    Pause / activate and delete stay.
 *  - CODE lock (script lock): the script cannot be read, edited, exported, duplicated or shared. Pause / activate and delete stay.
 *  - lockSource "pack": locked by the publisher of the pack it was installed from. Never unlocked, only deleted.
 *  - lockSource "owner": locked inside the workspace. The one who locked it or the workspace owner can unlock it (the server decides).
 */

export type LockSource = "owner" | "pack";

export interface PackSource {
  packId: string;
  packTitle: string | null;
  packVersion: string | null;
  publisherName: string | null;
}

/** Read-only authorship. The original author never changes; `source` is set for things installed from a pack. */
export interface Authorship {
  originalAuthorName: string | null;
  source: PackSource | null;
  forkedFrom: { id: string; name: string | null } | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const source = (v: unknown): LockSource | null => (v === "owner" || v === "pack" ? v : null);

export function normalizeAuthorship(raw: unknown): Authorship {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const author = r.originalAuthor && typeof r.originalAuthor === "object" ? r.originalAuthor : null;
  const src = r.source && typeof r.source === "object" && typeof r.source.packId === "string" ? r.source : null;
  const fork = r.forkedFrom && typeof r.forkedFrom === "object" && typeof r.forkedFrom.id === "string" ? r.forkedFrom : null;
  return {
    // scripts expose the flat `originalAuthorName`; bots expose `originalAuthor: { name }`
    originalAuthorName: text(author?.name) ?? text(r.originalAuthorName),
    source: src ? { packId: src.packId, packTitle: text(src.packTitle), packVersion: text(src.packVersion), publisherName: text(src.publisherName) } : null,
    forkedFrom: fork ? { id: fork.id, name: text(fork.name) } : null,
  };
}

export interface LockFacts {
  locked: boolean;
  lockSource: LockSource | null;
}

export function normalizeLock(locked: unknown, src: unknown): LockFacts {
  const on = locked === true;
  return { locked: on, lockSource: on ? source(src) ?? "owner" : null };
}

/** What the UI may offer on a bot, from the facts the server sent. The server still decides (BOT_LOCKED / SCRIPT_LOCKED). */
export interface BotLockUi {
  botLocked: boolean;
  codeLocked: boolean;
  /** name / avatar / flags / roles form is editable. */
  canEditSettings: boolean;
  /** The description is the publisher's for an imported bot, and frozen by a bot lock for any bot. */
  descriptionFixed: boolean;
  canEditCommands: boolean;
  /** Open the script editor / read the code / export / duplicate. */
  canOpenScript: boolean;
  canBindScript: boolean;
  canDuplicate: boolean;
  /** Pause / activate and delete are state changes, never blocked by a lock. */
  canPause: true;
  canDelete: true;
  canLockBot: boolean;
  canUnlockBot: boolean;
  canLockCode: boolean;
  canUnlockCode: boolean;
}

export function botLockUi(bot: { locked: boolean; lockSource: LockSource | null; codeLocked: boolean; codeLockSource: LockSource | null; authorship: Pick<Authorship, "source">; scriptId?: string | null }, canManage = true): BotLockUi {
  const botLocked = bot.locked;
  const codeLocked = bot.codeLocked;
  const imported = bot.authorship.source !== null;
  return {
    botLocked,
    codeLocked,
    canEditSettings: canManage && !botLocked,
    descriptionFixed: botLocked || imported,
    canEditCommands: canManage && !botLocked,
    canOpenScript: !codeLocked,
    canBindScript: canManage && !botLocked,
    canDuplicate: canManage && !botLocked && !codeLocked,
    canPause: true,
    canDelete: true,
    canLockBot: canManage && !botLocked,
    canUnlockBot: canManage && botLocked && bot.lockSource !== "pack",
    canLockCode: canManage && !codeLocked && !!bot.scriptId,
    canUnlockCode: canManage && codeLocked && bot.codeLockSource !== "pack",
  };
}

export interface ScriptLockUi {
  codeLocked: boolean;
  /** The editor opens the graph, shows run logs and offers export / duplicate / share. */
  canOpen: boolean;
  canEdit: boolean;
  canDuplicate: boolean;
  canPause: true;
  canDelete: true;
  canLock: boolean;
  canUnlock: boolean;
}

export function scriptLockUi(script: { locked?: boolean; lockSource?: LockSource | null }): ScriptLockUi {
  const locked = script.locked === true;
  return {
    codeLocked: locked,
    canOpen: !locked,
    canEdit: !locked,
    canDuplicate: !locked,
    canPause: true,
    canDelete: true,
    canLock: !locked,
    canUnlock: locked && script.lockSource !== "pack",
  };
}

export type LockedErrorKind = "SCRIPT_LOCKED" | "BOT_LOCKED" | "UNLOCK_FORBIDDEN";

/** The stable code a 403 of the lock guard carries (ApiError.code), or null for any other error. */
export function lockedErrorKind(error: unknown): LockedErrorKind | null {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : null;
  return code === "SCRIPT_LOCKED" || code === "BOT_LOCKED" || code === "UNLOCK_FORBIDDEN" ? code : null;
}

/** Which lines of authorship to show, in order. Always read-only. The labels are i18n keys the caller resolves. */
export interface AuthorLine {
  kind: "originalAuthor" | "importedFrom" | "forkedFrom";
  values: Record<string, string>;
}

export function authorLines(a: Authorship): AuthorLine[] {
  const lines: AuthorLine[] = [];
  if (a.originalAuthorName) lines.push({ kind: "originalAuthor", values: { name: a.originalAuthorName } });
  if (a.source) {
    const pack = a.source.packTitle ?? a.source.packId;
    lines.push(a.source.publisherName
      ? { kind: "importedFrom", values: { pack, publisher: a.source.publisherName, ...(a.source.packVersion ? { version: a.source.packVersion } : {}) } }
      : { kind: "importedFrom", values: { pack, ...(a.source.packVersion ? { version: a.source.packVersion } : {}) } });
  }
  if (a.forkedFrom?.name) lines.push({ kind: "forkedFrom", values: { name: a.forkedFrom.name } });
  return lines;
}

/** What the bot block of the profile card shows. Only facts: never code, script ids or commands. */
export interface BotProfileFacts {
  description: string | null;
  isActive: boolean;
  creatorName: string | null;
  importedFrom: { pack: string; publisher: string | null; version: string | null } | null;
  botLocked: boolean;
  codeLocked: boolean;
}

export function botProfileFacts(bot: {
  description: string | null; isActive: boolean; createdByName: string | null;
  locked?: boolean; codeLocked?: boolean; originalAuthorName?: string | null;
  origin?: { packTitle: string | null; packId: string; packVersion: string | null; publisherName: string | null } | null;
}): BotProfileFacts {
  return {
    description: bot.description?.trim() || null,
    isActive: bot.isActive,
    // an imported bot shows its immutable original author (the publisher), not whoever installed it
    creatorName: bot.originalAuthorName ?? bot.createdByName,
    importedFrom: bot.origin ? { pack: bot.origin.packTitle ?? bot.origin.packId, publisher: bot.origin.publisherName, version: bot.origin.packVersion } : null,
    botLocked: bot.locked === true,
    codeLocked: bot.codeLocked === true,
  };
}

/**
 * Body of a bot PATCH with ONLY what changed and may change. The server refuses a PATCH that merely mentions a frozen field (BOT_LOCKED),
 * even with the same value, so a locked or imported bot must never send name / description / avatar / flags it did not touch.
 * Roles and per-room permissions are the workspace's own governance and stay editable.
 */
export function botPatch(
  bot: { name: string; description: string | null; avatarUrl: string | null; allowBotTriggers: boolean; roleIds: string[] },
  form: { name: string; description: string; avatarUrl: string; allowBotTriggers: boolean; roleIds: string[] },
  ui: { canEditSettings: boolean; descriptionFixed: boolean },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (ui.canEditSettings) {
    if (form.name.trim() !== bot.name) patch.name = form.name.trim();
    if (!ui.descriptionFixed && form.description.trim() !== (bot.description ?? "")) patch.description = form.description.trim() || null;
    if (form.avatarUrl.trim() !== (bot.avatarUrl ?? "")) patch.avatarUrl = form.avatarUrl.trim() || null;
    if (form.allowBotTriggers !== bot.allowBotTriggers) patch.allowBotTriggers = form.allowBotTriggers;
  }
  if ([...form.roleIds].sort().join() !== [...bot.roleIds].sort().join()) patch.roleIds = form.roleIds;
  return patch;
}

/** Scripts the publisher may put in a pack: a locked script cannot be read, so it cannot be captured (publish refuses it with SCRIPT_LOCKED). */
export function publishableScripts<T extends { locked?: boolean }>(scripts: readonly T[]): T[] {
  return scripts.filter((s) => s.locked !== true);
}

/** Assets of a publish request: a selected SCRIPT carries `lockCode: true` when the publisher ticked "Lock code" for it; other kinds never do. */
export function withCodeLocks<A extends { key: string; assetType: string }, O extends object>(
  selected: readonly A[],
  lockedKeys: readonly string[],
  base: (a: A) => O,
): Array<O & { lockCode?: true }> {
  return selected.map((a) => ({ ...base(a), ...(a.assetType === "script" && lockedKeys.includes(a.key) ? { lockCode: true as const } : {}) }));
}
