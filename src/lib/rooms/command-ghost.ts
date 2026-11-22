/**
 * The "ghost" of a slash command (Discord style): the person's command is not a message; the bot's answer carries who used it.
 * Contract: Killio-Backend rooms.service sendMessage (`asCommand`) + bots/bot-dispatch.service.ts
 *   POST /rooms/:id/messages { content, asCommand: true }  ->  { commandInvocation: true, invocationId, invokedAt }  (nothing stored)
 *   the bot's message / ephemeral answer: metadata.interaction = { id, commandName, invokerUserId, invokerName, params, invokedAt, failed? }
 * Pure, tested in command-ghost.test.ts.
 */

export type CommandFailure = "no_response" | "rate_limited" | "quota" | "error";

export interface CommandGhost {
  id: string;
  commandName: string;
  invokerUserId: string;
  invokerName: string;
  params: Array<{ name: string; value: string }>;
  invokedAt: string;
  /** Set on the private "the application did not respond" answer. */
  failed: CommandFailure | null;
}

const FAILURES: readonly CommandFailure[] = ["no_response", "rate_limited", "quota", "error"];
const MAX_PARAMS = 25;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

/** Reads `metadata.interaction`. Tolerant: anything that is not the documented shape gives null (an old message shows as before). */
export function readCommandGhost(metadata: unknown): CommandGhost | null {
  const raw = metadata && typeof metadata === "object" ? (metadata as Record<string, any>).interaction : null;
  if (!raw || typeof raw !== "object") return null;
  const commandName = text(raw.commandName, 64).replace(/^\//, "");
  if (!/^[a-z0-9_-]{1,32}$/i.test(commandName)) return null;
  const params = (Array.isArray(raw.params) ? raw.params : [])
    .filter((p: any) => p && typeof p === "object" && typeof p.name === "string" && p.name)
    .slice(0, MAX_PARAMS)
    .map((p: any) => ({ name: text(p.name, 40), value: text(p.value, 300) }));
  const invokedAt = typeof raw.invokedAt === "string" && Number.isFinite(Date.parse(raw.invokedAt)) ? raw.invokedAt : "";
  return {
    id: text(raw.id, 64),
    commandName,
    invokerUserId: text(raw.invokerUserId, 64),
    invokerName: text(raw.invokerName, 120),
    params,
    invokedAt,
    failed: FAILURES.includes(raw.failed) ? raw.failed : null,
  };
}

/** Only a bot's message may show the header: the server stamps it, and a person's own message with a forged `interaction` stays plain. */
export const ghostOf = (message: { metadata?: unknown; user?: { isBot?: boolean } | null }): CommandGhost | null =>
  message.user?.isBot ? readCommandGhost(message.metadata) : null;

const COMMAND_TEXT = /^\/[a-z0-9_-]{1,32}(\s|$)/i;

/**
 * Text the composer may send as a command: starts with /name, no thread, no metadata (attachments...). The server decides whether a bot
 * really owns it; when none does the text comes back as an ordinary message.
 */
export const looksLikeCommand = (content: string, opts: { threadRootId?: string; metadata?: unknown } = {}): boolean =>
  !opts.threadRootId &&
  (opts.metadata == null || (typeof opts.metadata === "object" && Object.keys(opts.metadata as object).length === 0)) &&
  COMMAND_TEXT.test(content.trim());

/** The answer of POST /messages for a command a bot took over (no message exists). */
export const isCommandAck = (res: unknown): boolean => !!res && typeof res === "object" && (res as Record<string, unknown>).commandInvocation === true;

/** "Nov 21, 14:05" style label for the popover; "" for an unparsable date. */
export function formatInvokedAt(iso: string, locale?: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Where the popover opens: below the header when it fits, above otherwise, kept inside the viewport. */
export function popoverPosition(
  anchor: { left: number; top: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = 8,
): { left: number; top: number; placement: "below" | "above" } {
  const fitsBelow = anchor.bottom + gap + size.height <= viewport.height - margin;
  const fitsAbove = anchor.top - gap - size.height >= margin;
  const placement = fitsBelow || !fitsAbove ? "below" : "above";
  const top = placement === "below" ? Math.max(margin, Math.min(anchor.bottom + gap, viewport.height - margin - size.height)) : anchor.top - gap - size.height;
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - margin - size.width));
  return { left, top, placement };
}
