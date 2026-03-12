"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthResponse } from "@/lib/api/contracts";

export type SessionContextType = {
  user: AuthResponse["user"] | null;
  activeTeamId: string | null;
  accessToken: string | null;
  setActiveTeamId: (id: string) => void;
  isLoading: boolean;
  logout: () => void;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse["user"] | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // On mount, load user from local storage
    try {
      const storedUser = localStorage.getItem("killio_user");
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
      const storedTeam = localStorage.getItem("killio_active_team");
      if (storedTeam) {
        setActiveTeamId(storedTeam);
      }
      const token = document.cookie
        .split("; ")
        .find((row) => row.startsWith("killio_token="))
        ?.split("=")[1];
      if (token) {
        setAccessToken(token);
      }
    } catch {
      console.error("Failed to parse session data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSetActiveTeam = (id: string) => {
    setActiveTeamId(id);
    localStorage.setItem("killio_active_team", id);
  };

  const logout = () => {
    document.cookie = "killio_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("killio_refresh");
    localStorage.removeItem("killio_user");
    localStorage.removeItem("killio_active_team");
    setUser(null);
    setActiveTeamId(null);
    setAccessToken(null);
    router.push("/login");
  };

  return (
    <SessionContext.Provider
      value={{
        user,
        activeTeamId,
        accessToken,
        setActiveTeamId: handleSetActiveTeam,
        isLoading,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
