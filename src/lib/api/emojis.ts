import { API_BASE_URL, fetchApi } from "@/lib/api/client";
import type { EmojiDto, EmojiList } from "@/lib/emoji/custom";

const q = encodeURIComponent;

export const listTeamEmojis = (teamId: string, accessToken: string) =>
  fetchApi<EmojiList>(`/teams/${q(teamId)}/emojis`, { accessToken });

/** multipart: `file` and optional `name` (the server derives it from the file name when missing). */
export function createTeamEmoji(teamId: string, file: File, name: string | undefined, accessToken: string): Promise<EmojiDto> {
  const form = new FormData();
  form.append("file", file);
  if (name?.trim()) form.append("name", name.trim());
  return fetchApi<EmojiDto>(`/teams/${q(teamId)}/emojis`, { method: "POST", body: form, accessToken });
}

export const renameTeamEmoji = (teamId: string, emojiId: string, name: string, accessToken: string) =>
  fetchApi<EmojiDto>(`/teams/${q(teamId)}/emojis/${q(emojiId)}`, { method: "PATCH", body: JSON.stringify({ name }), accessToken });

export const deleteTeamEmoji = (teamId: string, emojiId: string, accessToken: string) =>
  fetchApi<unknown>(`/teams/${q(teamId)}/emojis/${q(emojiId)}`, { method: "DELETE", accessToken });

export { API_BASE_URL };
