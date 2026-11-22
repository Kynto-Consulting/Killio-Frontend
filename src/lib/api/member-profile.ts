import { fetchApi } from "@/lib/api/client";
import type { MemberProfile } from "@/lib/rooms/user-profile";

/** `GET /teams/:teamId/members/:userId/profile[?roomId=]`: the aggregated profile of a team member (see backend member-profile.service.ts). */
export function getMemberProfile(teamId: string, userId: string, roomId: string | null | undefined, accessToken: string): Promise<MemberProfile> {
  const qs = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
  return fetchApi<MemberProfile>(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/profile${qs}`, { accessToken });
}
