"use client";

import { createContext, useContext, type ReactNode } from "react";

const KqlScopeContext = createContext<string | null>(null);

/** Team whose data the KQL pills below read. A document of another team than the active one still queries its own team. */
export function KqlScopeProvider({ teamId, children }: { teamId: string | null | undefined; children: ReactNode }) {
  return <KqlScopeContext.Provider value={teamId && teamId !== "local" ? teamId : null}>{children}</KqlScopeContext.Provider>;
}

export function useKqlScopeTeamId(): string | null {
  return useContext(KqlScopeContext);
}
