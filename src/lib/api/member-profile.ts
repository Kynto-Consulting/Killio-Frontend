import { fetchApi } from "@/lib/api/client";
import type { MemberModeration } from "@/lib/rooms/user-profile-compact";
import type { MemberProfile } from "@/lib/rooms/user-profile";

/** `GET /teams/:teamId/members/:userId/profile[?roomId=]`: the aggregated profile of a team member (see backend member-profile.service.ts). */
export function getMemberProfile(teamId: string, userId: string, roomId: string | null | undefined, accessToken: string): Promise<MemberProfile> {
  const qs = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
  return fetchApi<MemberProfile>(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/profile${qs}`, { accessToken });
}

/** `GET /teams/:teamId/members/:userId/moderation[?roomId=]`: counters, moderation permissions, account dates and mute. Moderators only. */
export function getMemberModeration(teamId: string, userId: string, roomId: string | null | undefined, accessToken: string): Promise<MemberModeration> {
  const qs = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
  return fetchApi<MemberModeration>(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/moderation${qs}`, { accessToken });
}
