import type { CustomEmoji } from "./types.ts";

/** Mirrors Killio-Backend `src/modules/emojis/emojis.service.ts` (EmojiDto / EmojiListDto). */
export interface EmojiDto {
  id: string;
  teamId: string;
  name: string;
  shortcode: string;
  reaction: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  animated: boolean;
  createdBy: { id: string; name: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmojiLimits {
  static: number; animated: number; maxBytes: number; minDimension: number; maxDimension: number; maxAspectRatio: number; allowedTypes: string[];
}
export interface EmojiUsage { static: number; animated: number }
export interface EmojiPermissions { canCreate: boolean; canManage: boolean }
export interface EmojiList { emojis: EmojiDto[]; limits: EmojiLimits; usage: EmojiUsage; permissions: EmojiPermissions }

/** Same rule as the backend (EMOJI_NAME_PATTERN). */
export const EMOJI_NAME_PATTERN = /^[a-z0-9_]{2,32}$/;

/** Same cleaning as the backend's normalizeEmojiName, so the preview shows what the server will store. */
export function normalizeEmojiName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/^:+|:+$/g, "").toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
}

/** Name suggested from a file name ("Party Parrot.GIF" -> "party_parrot"). */
export function nameFromFileName(fileName: string): string {
  const base = fileName.split(/[\/]/).pop() ?? "";
  return normalizeEmojiName(base.replace(/\.[A-Za-z0-9]{1,8}$/, ""));
}

/** Relative urls (private storage) are served by the API host. */
export function resolveEmojiUrl(url: string, apiBase: string): string {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${apiBase.replace(/\/$/, "")}${url}`;
  return url;
}

export function toCustomEmoji(dto: EmojiDto, apiBase: string): CustomEmoji {
  return { id: dto.id, name: dto.name, url: resolveEmojiUrl(dto.url, apiBase), reaction: dto.reaction || `custom:${dto.id}`, animated: dto.animated };
}

/** Creator can always change their own; anybody else needs emojis.manage. (The server decides again.) */
export function canChangeEmoji(dto: EmojiDto, userId: string | null, perms: EmojiPermissions): boolean {
  return perms.canManage || (!!userId && dto.createdBy?.id === userId);
}

/** i18n key (inside the "emoji" namespace) for an API error code; unknown codes get the generic message. */
export function emojiErrorKey(code: string | undefined): string {
  switch (code) {
    case "EMOJI_NOT_A_MEMBER": return "errors.notMember";
    case "EMOJI_FORBIDDEN": return "errors.forbidden";
    case "EMOJI_NOT_FOUND": return "errors.notFound";
    case "EMOJI_FILE_REQUIRED": return "errors.fileRequired";
    case "EMOJI_TOO_LARGE": return "errors.tooLarge";
    case "EMOJI_UNSUPPORTED_TYPE": return "errors.unsupportedType";
    case "EMOJI_CORRUPT_IMAGE": return "errors.corruptImage";
    case "EMOJI_DIMENSIONS_INVALID": return "errors.dimensions";
    case "EMOJI_ASPECT_INVALID": return "errors.aspect";
    case "EMOJI_NAME_INVALID": return "errors.nameInvalid";
    case "EMOJI_NAME_TAKEN": return "errors.nameTaken";
    case "EMOJI_LIMIT_REACHED": return "errors.limitReached";
    case "EMOJI_STORAGE_FAILED": return "errors.storage";
    default: return "errors.generic";
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Client-side pre-check against the limits so obvious mistakes do not cost an upload (the server stays the authority). */
export function precheckFile(file: { type: string; size: number }, limits: EmojiLimits): "unsupportedType" | "tooLarge" | null {
  if (limits.allowedTypes.length && !limits.allowedTypes.includes(file.type)) return "unsupportedType";
  if (file.size > limits.maxBytes) return "tooLarge";
  return null;
}

/** Applies an updated list sorted by name (what the tab shows). */
export const sortEmojis = (list: EmojiDto[]): EmojiDto[] => [...list].sort((a, b) => a.name.localeCompare(b.name));
