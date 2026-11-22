/**
 * Typed API of the team bots. Routes (Killio-Backend/src/modules/bots/bots.controller.ts, all under AuthGuard):
 *   GET    /teams/:teamId/bots                  list (members see public fields; `bots.manage` also sees script, roles, quota)
 *   GET    /teams/:teamId/bots/commands         flat commands of the ACTIVE bots (composer autocomplete)
 *   POST   /teams/:teamId/bots                  create   { name, description?, avatarUrl?, scriptId?, roleIds?, allowBotTriggers? }
 *   PATCH  /teams/:teamId/bots/:botId           update   (same fields + isActive)
 *   DELETE /teams/:teamId/bots/:botId           soft delete
 *   PUT    /teams/:teamId/bots/:botId/lock      lock / unlock the bot { locked }
 *   POST   /teams/:teamId/bots/:botId/duplicate copy the bot (refused while the bot or its code is locked)
 *   PUT    /teams/:teamId/bots/:botId/commands  replace   { commands: [{ name, description, usage }] }
 * Bots have no token or credentials: they are synthetic users driven by a script.
 */

import { fetchApi } from "@/lib/api/client";
import {
  commandsPayload, normalizeBot, normalizeBotList, normalizeCommand, normalizeComposerCommands,
  type Bot, type BotCommand, type BotList, type CommandDraft, type ComposerBotCommand,
} from "@/lib/bots/model";

const q = encodeURIComponent;

export interface BotWriteInput {
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  scriptId?: string | null;
  roleIds?: string[];
  isActive?: boolean;
  allowBotTriggers?: boolean;
}

export async function listBots(teamId: string, accessToken: string): Promise<BotList> {
  return normalizeBotList(await fetchApi<unknown>(`/teams/${q(teamId)}/bots`, { accessToken }));
}

export async function listComposerBotCommands(teamId: string, accessToken: string): Promise<ComposerBotCommand[]> {
  return normalizeComposerCommands(await fetchApi<unknown>(`/teams/${q(teamId)}/bots/commands`, { accessToken }));
}

function mustBot(raw: unknown): Bot {
  const bot = normalizeBot(raw);
  if (!bot) throw new Error("Unexpected bot response");
  return bot;
}

export async function createBot(teamId: string, input: BotWriteInput, accessToken: string): Promise<Bot> {
  return mustBot(await fetchApi<unknown>(`/teams/${q(teamId)}/bots`, { method: "POST", body: JSON.stringify(input), accessToken }));
}

export async function updateBot(teamId: string, botId: string, input: BotWriteInput, accessToken: string): Promise<Bot> {
  return mustBot(await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}`, { method: "PATCH", body: JSON.stringify(input), accessToken }));
}

/** Revalidates the script as a bot script and turns on bot and script (packs install bots paused). Rejects with the server's reason. */
export async function activateBot(teamId: string, botId: string, accessToken: string): Promise<Bot> {
  return mustBot(await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}/activate`, { method: "POST", accessToken }));
}

export async function pauseBot(teamId: string, botId: string, accessToken: string): Promise<Bot> {
  return mustBot(await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}/pause`, { method: "POST", accessToken }));
}

/** Locks / unlocks the BOT (identity and settings). A lock from a pack's publisher is never removed: the server answers 403 UNLOCK_FORBIDDEN. */
export async function setBotLock(teamId: string, botId: string, locked: boolean, accessToken: string): Promise<Bot> {
  return mustBot(await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}/lock`, { method: "PUT", body: JSON.stringify({ locked }), accessToken }));
}

/** Copies a bot with its script and commands (paused). A locked bot or a bot with locked code answers 403 BOT_LOCKED / SCRIPT_LOCKED. */
export async function duplicateBot(teamId: string, botId: string, name: string | undefined, accessToken: string): Promise<Bot> {
  return mustBot(await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}/duplicate`, { method: "POST", body: JSON.stringify(name ? { name } : {}), accessToken }));
}

export async function deleteBot(teamId: string, botId: string, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}`, { method: "DELETE", accessToken });
}

export async function setBotCommands(teamId: string, botId: string, commands: readonly CommandDraft[], accessToken: string): Promise<BotCommand[]> {
  const raw = await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}/commands`, { method: "PUT", body: JSON.stringify(commandsPayload(commands)), accessToken });
  return (Array.isArray(raw) ? raw : []).map(normalizeCommand).filter((c): c is BotCommand => !!c);
}
