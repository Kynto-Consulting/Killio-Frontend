"use client";

import { useState, useEffect, useCallback } from "react";
import { getBoardMembers, listTeamMembers } from "@/lib/api/contracts";
import {
  getEffectiveBoardRole,
  canEditCards,
  canComment,
  canManageBoard,
  BoardRole,
} from "@/lib/permissions";

export interface PermissionState {
  effectiveRole: BoardRole;
  canEdit: boolean;
  canComment: boolean;
  canManageBoard: boolean;
  isReadOnly: boolean;
  loading: boolean;
}

const DEFAULT: PermissionState = {
  effectiveRole: "viewer",
  canEdit: false,
  canComment: false,
  canManageBoard: false,
  isReadOnly: true,
  loading: true,
};

/**
 * Resolves the current user's effective permissions on a board.
 *
 * Fetches both board_memberships and team_memberships in parallel, merges them
 * via `getEffectiveBoardRole`, and returns typed capability flags.
 *
 * Note: `getBoardMembers` returns rows where `id` is the user's ID (u.id from
 * the SQL join on users). So we can match directly: member.id === userId.
 *
 * Falls back to read-only on any error.
 */
export function usePermissions(
  boardId: string | null | undefined,
  teamId: string | null | undefined,
  userId: string | null | undefined,
  accessToken: string | null | undefined,
): PermissionState {
  const [state, setState] = useState<PermissionState>(DEFAULT);

  const resolve = useCallback(async () => {
    if (!boardId || !userId || !accessToken) {
      setState({ ...DEFAULT, loading: false });
      return;
    }

    try {
      const [boardMembers, teamMembers] = await Promise.all([
        getBoardMembers(boardId, accessToken),
        teamId
          ? listTeamMembers(teamId, accessToken).catch(() => [])
          : Promise.resolve([]),
      ]);

      // board_memberships query returns u.id as `id` → direct userId match
      const boardMember = boardMembers.find((m) => m.id === userId);
      // team_memberships uses the member.userId field from TeamMemberSummary
      const teamMember = teamMembers.find((m) => m.userId === userId);

      const effective = getEffectiveBoardRole(
        boardMember?.role ?? null,
        teamMember?.role ?? null,
      );

      setState({
        effectiveRole: effective,
        canEdit: canEditCards(effective),
        canComment: canComment(effective),
        canManageBoard: canManageBoard(effective),
        isReadOnly: !canEditCards(effective),
        loading: false,
      });
    } catch {
      setState({ ...DEFAULT, loading: false });
    }
  }, [boardId, teamId, userId, accessToken]);

  useEffect(() => {
    setState(DEFAULT);
    resolve();
  }, [resolve]);

  return state;
}
