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

/** While permissions are being resolved, default everything to "allowed" so
 *  the UI doesn't flash a false "no permission" state before data arrives. */
const LOADING: PermissionState = {
  effectiveRole: "member",
  canEdit: true,
  canComment: true,
  canManageBoard: false,
  isReadOnly: false,
  loading: true,
};

const VIEWER: PermissionState = {
  effectiveRole: "viewer",
  canEdit: false,
  canComment: false,
  canManageBoard: false,
  isReadOnly: true,
  loading: false,
};

/** Local workspace boards are your own files on disk → always fully editable
 *  (there are no cloud memberships to resolve). */
const LOCAL_OWNER: PermissionState = {
  effectiveRole: "member",
  canEdit: true,
  canComment: true,
  canManageBoard: true,
  isReadOnly: false,
  loading: false,
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
 *
 * If `teamId` is not yet known (still loading the board), we stay in
 * LOADING state (optimistic allow) instead of resolving to viewer prematurely.
 */
export function usePermissions(
  boardId: string | null | undefined,
  teamId: string | null | undefined,
  userId: string | null | undefined,
  accessToken: string | null | undefined,
  localMode = false,
): PermissionState {
  const [state, setState] = useState<PermissionState>(localMode ? LOCAL_OWNER : LOADING);

  const resolve = useCallback(async () => {
    // Local workspace: owner of the file, full edit, no cloud lookup.
    if (localMode) {
      setState(LOCAL_OWNER);
      return;
    }
    if (!boardId || !userId || !accessToken) {
      setState({ ...VIEWER, loading: false });
      return;
    }

    // teamId not yet known — board data still loading. Stay optimistic.
    if (teamId === null || teamId === undefined) {
      setState(LOADING);
      return;
    }

    try {
      const [boardMembers, teamMembers] = await Promise.all([
        getBoardMembers(boardId, accessToken),
        listTeamMembers(teamId, accessToken).catch(() => [] as Awaited<ReturnType<typeof listTeamMembers>>),
      ]);

      // board_memberships query returns u.id as `id` → direct userId match
      const boardMember = boardMembers.find((m) => m.id === userId);
      // team_memberships returns user id in member.id
      const teamMember = teamMembers.find((m) => m.id === userId);

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
      setState({ ...VIEWER, loading: false });
    }
  }, [boardId, teamId, userId, accessToken, localMode]);

  useEffect(() => {
    setState(LOADING);
    resolve();
  }, [resolve]);

  return state;
}
