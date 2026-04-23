"use client";

import { useEffect, useState } from "react";
import { listTeamMembers, TeamRole } from "@/lib/api/contracts";

export function useActiveTeamRole(
  activeTeamId: string | null,
  accessToken: string | null,
  userId: string | null | undefined,
) {
  const [role, setRole] = useState<TeamRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activeTeamId || !accessToken || !userId) {
      setRole(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    listTeamMembers(activeTeamId, accessToken)
      .then((members) => {
        if (cancelled) return;
        const membership = members.find((member) => member.id === userId);
        setRole(membership?.role ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setRole(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTeamId, accessToken, userId]);

  return {
    role,
    isLoading,
    isAdmin: role === "owner" || role === "admin",
  };
}
