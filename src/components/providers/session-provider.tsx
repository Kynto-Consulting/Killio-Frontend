"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthResponse, refresh } from "@/lib/api/contracts";

const LAST_TEAM_BY_USER_STORAGE_KEY = "killio_last_team_by_user";
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

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

function readTokenFromCookie(): string | null {
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith("killio_token="))
    ?.split("=")[1];

  if (!raw) return null;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function writeTokenCookie(token: string, maxAgeSeconds = 604800) {
  document.cookie = `killio_token=${encodeURIComponent(token)}; path=/; max-age=${maxAgeSeconds}`;
}

async function validateAccessToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
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

  const clearAuthState = () => {
    document.cookie = "killio_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("killio_refresh");
    localStorage.removeItem("killio_user");
    localStorage.removeItem("killio_active_team");
    setUser(null);
    setActiveTeamId(null);
    setAccessToken(null);
  };

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      // On mount, load accounts from local storage and recover an active session when possible.
      try {
        const storedAccountsRaw = localStorage.getItem("killio_accounts");
        let loadedAccounts: SessionAccount[] = [];
        if (storedAccountsRaw) {
          loadedAccounts = JSON.parse(storedAccountsRaw);
          if (!cancelled) {
            setAccounts(loadedAccounts);
          }
        }

        const storedUser = localStorage.getItem("killio_user");
        const parsedUser = storedUser ? (JSON.parse(storedUser) as AuthResponse["user"]) : null;
        const storedTeam = localStorage.getItem("killio_active_team");
        const refreshToken = localStorage.getItem("killio_refresh");
        const cookieToken = readTokenFromCookie();

        if (parsedUser && !cancelled) {
          setUser(parsedUser);
        }

        if (storedTeam && !cancelled) {
          setActiveTeamId(storedTeam);
        }

        // Migrate legacy single account to accounts[] if needed.
        if (parsedUser && cookieToken && loadedAccounts.length === 0) {
          const legacyAccount: SessionAccount = {
            user: parsedUser,
            accessToken: cookieToken,
            refreshToken,
            activeTeamId: storedTeam,
          };
          loadedAccounts = [legacyAccount];
          localStorage.setItem("killio_accounts", JSON.stringify(loadedAccounts));
          if (!cancelled) {
            setAccounts(loadedAccounts);
          }
        }

        if (!cookieToken) {
          return;
        }

        const tokenIsValid = await validateAccessToken(cookieToken);

        if (tokenIsValid) {
          if (!cancelled) {
            setAccessToken(cookieToken);
          }
          return;
        }

        if (!refreshToken) {
          if (!cancelled) {
            clearAuthState();
          }
          return;
        }

        try {
          const rotated = await refresh(refreshToken);
          writeTokenCookie(rotated.accessToken, rotated.expiresInSeconds);
          localStorage.setItem("killio_refresh", rotated.refreshToken);
          localStorage.setItem("killio_user", JSON.stringify(rotated.user));

          const map = readLastTeamByUser();
          const restoredTeamId = storedTeam ?? map[rotated.user.id] ?? null;
          if (restoredTeamId) {
            localStorage.setItem("killio_active_team", restoredTeamId);
          }

          if (!cancelled) {
            setUser(rotated.user);
            setAccessToken(rotated.accessToken);
            setActiveTeamId(restoredTeamId);
            setAccounts((prev) => {
              const existing = prev.filter((acc) => acc.user.id !== rotated.user.id);
              const updated = [
                ...existing,
                {
                  user: rotated.user,
                  accessToken: rotated.accessToken,
                  refreshToken: rotated.refreshToken,
                  activeTeamId: restoredTeamId,
                },
              ];
              localStorage.setItem("killio_accounts", JSON.stringify(updated));
              return updated;
            });
          }
        } catch {
          if (!cancelled) {
            clearAuthState();
          }
        }
      } catch {
        console.error("Failed to parse session data");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
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
    clearAuthState();
    
    // Also remove current user from accounts
    if (user) {
      setAccounts(prev => {
        const newAccs = prev.filter(a => a.user.id !== user.id);
        localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
        return newAccs;
      });
    }

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
