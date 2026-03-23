"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthResponse } from "@/lib/api/contracts";

const LAST_TEAM_BY_USER_STORAGE_KEY = "killio_last_team_by_user";

type LastTeamByUser = Record<string, string>;

function readLastTeamByUser(): LastTeamByUser {
  try {
    const raw = localStorage.getItem(LAST_TEAM_BY_USER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as LastTeamByUser;
  } catch {
    return {};
  }
}

function writeLastTeamByUser(value: LastTeamByUser) {
  localStorage.setItem(LAST_TEAM_BY_USER_STORAGE_KEY, JSON.stringify(value));
}

export interface SessionAccount {
  user: AuthResponse["user"];
  accessToken: string;
  refreshToken: string | null;
  activeTeamId: string | null;
}

export type SessionContextType = {
  user: AuthResponse["user"] | null;
  activeTeamId: string | null;
  accessToken: string | null;
  accounts: SessionAccount[];
  setActiveTeamId: (id: string | null) => void;
  isLoading: boolean;
  logout: () => void;
  login: (userData: AuthResponse["user"], token: string, refreshToken?: string) => void;
  switchAccount: (userId: string) => void;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse["user"] | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SessionAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // On mount, load accounts from local storage
    try {
      const storedAccountsRaw = localStorage.getItem("killio_accounts");
      let loadedAccounts: SessionAccount[] = [];
      if (storedAccountsRaw) {
        loadedAccounts = JSON.parse(storedAccountsRaw);
        setAccounts(loadedAccounts);
      }

      const storedUser = localStorage.getItem("killio_user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        
        // Migrate legacy single account to array if needed
        if (loadedAccounts.length === 0) {
          const t = document.cookie.split("; ").find((row) => row.startsWith("killio_token="))?.split("=")[1];
          const rt = localStorage.getItem("killio_refresh");
          const team = localStorage.getItem("killio_active_team");
          if (t) {
            const legacyAccount: SessionAccount = {
              user: parsedUser,
              accessToken: t,
              refreshToken: rt,
              activeTeamId: team
            };
            setAccounts([legacyAccount]);
            localStorage.setItem("killio_accounts", JSON.stringify([legacyAccount]));
          }
        }
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

  const handleSetActiveTeam = (id: string | null) => {
    setActiveTeamId(id);
    if (id) {
      localStorage.setItem("killio_active_team", id);
    } else {
      localStorage.removeItem("killio_active_team");
    }
    
    // Update team id in accounts list too
    if (user) {
      const map = readLastTeamByUser();
      if (id) {
        map[user.id] = id;
      } else {
        delete map[user.id];
      }
      writeLastTeamByUser(map);

      setAccounts(prev => {
        const newAccs = prev.map(acc => acc.user.id === user.id ? { ...acc, activeTeamId: id } : acc);
        localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
        return newAccs;
      });
    }
  };

  const logout = () => {
    document.cookie = "killio_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("killio_refresh");
    localStorage.removeItem("killio_user");
    localStorage.removeItem("killio_active_team");
    
    // Also remove current user from accounts
    if (user) {
      setAccounts(prev => {
        const newAccs = prev.filter(a => a.user.id !== user.id);
        localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
        return newAccs;
      });
    }

    setUser(null);
    setActiveTeamId(null);
    setAccessToken(null);
    router.push("/login");
  };

  const login = (userData: AuthResponse["user"], token: string, refreshToken?: string) => {
    setUser(userData);
    setAccessToken(token);
    const existingAccount = accounts.find((account) => account.user.id === userData.id);
    const map = readLastTeamByUser();
    const restoredTeamId = existingAccount?.activeTeamId ?? map[userData.id] ?? null;
    setActiveTeamId(restoredTeamId);

    if (restoredTeamId) {
      localStorage.setItem("killio_active_team", restoredTeamId);
    } else {
      localStorage.removeItem("killio_active_team");
    }
    
    // Update accounts list
    setAccounts(prev => {
      const existing = prev.filter(a => a.user.id !== userData.id);
      const newAccs = [...existing, {
        user: userData,
        accessToken: token,
        refreshToken: refreshToken || null,
        activeTeamId: restoredTeamId
      }];
      localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
      return newAccs;
    });
  };

  const switchAccount = (userId: string) => {
    const target = accounts.find(a => a.user.id === userId);
    if (!target) return;
    
    setUser(target.user);
    setAccessToken(target.accessToken);
    setActiveTeamId(target.activeTeamId);
    
    // Update browser artifacts
    document.cookie = `killio_token=${target.accessToken}; path=/; max-age=604800`;
    localStorage.setItem("killio_user", JSON.stringify(target.user));
    if (target.refreshToken) localStorage.setItem("killio_refresh", target.refreshToken);
    else localStorage.removeItem("killio_refresh");
    
    if (target.activeTeamId) localStorage.setItem("killio_active_team", target.activeTeamId);
    else localStorage.removeItem("killio_active_team");

    // Force a hard reload to reset completely or just push to home
    window.location.href = "/";
  };

  return (
    <SessionContext.Provider
      value={{
        user,
        activeTeamId,
        accessToken,
        accounts,
        setActiveTeamId: handleSetActiveTeam,
        isLoading,
        logout,
        login,
        switchAccount
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
