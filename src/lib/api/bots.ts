/**
 * Typed API of the team bots. Routes (Killio-Backend/src/modules/bots/bots.controller.ts, all under AuthGuard):
 *   GET    /teams/:teamId/bots                  list (members see public fields; `bots.manage` also sees script, roles, quota)
 *   GET    /teams/:teamId/bots/commands         flat commands of the ACTIVE bots (composer autocomplete)
 *   POST   /teams/:teamId/bots                  create   { name, description?, avatarUrl?, scriptId?, roleIds?, allowBotTriggers? }
 *   PATCH  /teams/:teamId/bots/:botId           update   (same fields + isActive)
 *   DELETE /teams/:teamId/bots/:botId           soft delete
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

export async function deleteBot(teamId: string, botId: string, accessToken: string): Promise<void> {
  await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}`, { method: "DELETE", accessToken });
}

export async function setBotCommands(teamId: string, botId: string, commands: readonly CommandDraft[], accessToken: string): Promise<BotCommand[]> {
  const raw = await fetchApi<unknown>(`/teams/${q(teamId)}/bots/${q(botId)}/commands`, { method: "PUT", body: JSON.stringify(commandsPayload(commands)), accessToken });
  return (Array.isArray(raw) ? raw : []).map(normalizeCommand).filter((c): c is BotCommand => !!c);
}
