"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthResponse, refresh } from "@/lib/api/contracts";
import { normalizeSessionUser, type SessionUser } from "@/lib/workspace-members";

const LAST_TEAM_BY_USER_STORAGE_KEY = "killio_last_team_by_user";
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

// 31-day TTL in seconds, used when rememberMe was active
const REMEMBER_ME_TTL_SECONDS = 2_678_400;

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

function writeTokenCookie(token: string, maxAgeSeconds: number) {
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
  user: SessionUser;
  accessToken: string;
  refreshToken: string | null;
  activeTeamId: string | null;
  /** TTL used when writing the access-token cookie (seconds). Defaults to REMEMBER_ME_TTL_SECONDS. */
  expiresInSeconds?: number;
}

export type SessionContextType = {
  user: SessionUser | null;
  activeTeamId: string | null;
  accessToken: string | null;
  accounts: SessionAccount[];
  setActiveTeamId: (id: string | null) => void;
  isLoading: boolean;
  logout: () => void;
  login: (userData: AuthResponse["user"], token: string, refreshToken?: string, expiresInSeconds?: number) => void;
  switchAccount: (userId: string) => void;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SessionAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const clearAuthState = () => {
    // Clear legacy readable cookie if present
    document.cookie = "killio_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    // HttpOnly killio_refresh cookie is cleared server-side via /auth/logout
    localStorage.removeItem("killio_user");
    localStorage.removeItem("killio_active_team");
    setUser(null);
    setActiveTeamId(null);
    setAccessToken(null);
  };

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        // ── 1. Load persisted accounts ──────────────────────────────────────
        const storedAccountsRaw = localStorage.getItem("killio_accounts");
        let loadedAccounts: SessionAccount[] = [];
        if (storedAccountsRaw) {
          const parsed = JSON.parse(storedAccountsRaw) as unknown;
          if (Array.isArray(parsed)) {
            loadedAccounts = parsed
              .map((acc) => {
                if (!acc || typeof acc !== "object") return null;
                const record = acc as Record<string, unknown>;
                const normalizedUser = normalizeSessionUser(record.user);
                const at = typeof record.accessToken === "string" ? record.accessToken : null;
                if (!normalizedUser || !at) return null;
                return {
                  user: normalizedUser,
                  accessToken: at,
                  refreshToken: typeof record.refreshToken === "string" ? record.refreshToken : null,
                  activeTeamId: typeof record.activeTeamId === "string" ? record.activeTeamId : null,
                  expiresInSeconds: typeof record.expiresInSeconds === "number" ? record.expiresInSeconds : REMEMBER_ME_TTL_SECONDS,
                } satisfies SessionAccount;
              })
              .filter(Boolean) as SessionAccount[];
          }
          if (!cancelled) setAccounts(loadedAccounts);
        }

        const storedUser = localStorage.getItem("killio_user");
        const parsedUser = storedUser ? normalizeSessionUser(JSON.parse(storedUser)) : null;
        const storedTeam = localStorage.getItem("killio_active_team");
        const cookieToken = readTokenFromCookie();

        if (parsedUser && !cancelled) setUser(parsedUser);
        if (storedTeam && !cancelled) setActiveTeamId(storedTeam);

        // ── 2. Migrate legacy single account ────────────────────────────────
        if (parsedUser && cookieToken && loadedAccounts.length === 0) {
          const legacyAccount: SessionAccount = {
            user: parsedUser,
            accessToken: cookieToken,
            refreshToken: null,
            activeTeamId: storedTeam,
            expiresInSeconds: REMEMBER_ME_TTL_SECONDS,
          };
          loadedAccounts = [legacyAccount];
          localStorage.setItem("killio_accounts", JSON.stringify(loadedAccounts));
          if (!cancelled) setAccounts(loadedAccounts);
        }

        // ── 3. Validate existing cookie if present ───────────────────────────
        const tokenIsValid = cookieToken ? await validateAccessToken(cookieToken) : false;

        if (tokenIsValid && cookieToken) {
          if (!cancelled) setAccessToken(cookieToken);
          return;
        }

        // ── 4. No valid access token — attempt silent refresh via HttpOnly cookie ──
        // If there's no stored user, there's nothing to recover (fresh browser / never logged in).
        if (!parsedUser) return;

        const existingAccount = loadedAccounts.find((a) => a.user.id === parsedUser?.id);
        const storedExpiresInSeconds = existingAccount?.expiresInSeconds ?? REMEMBER_ME_TTL_SECONDS;
        const rememberMe = storedExpiresInSeconds >= REMEMBER_ME_TTL_SECONDS;

        try {
          // refresh() sends no token in body — the HttpOnly killio_refresh cookie is sent automatically
          const rotated = await refresh(undefined, rememberMe);
          const normalizedRotatedUser = normalizeSessionUser(rotated.user);
          if (!normalizedRotatedUser) throw new Error("Rotated session user payload is invalid");

          const newExpiresInSeconds = rotated.expiresInSeconds ?? storedExpiresInSeconds;
          // Backend already set the new HttpOnly refresh cookie; just store access token in memory
          localStorage.setItem("killio_user", JSON.stringify(normalizedRotatedUser));

          const map = readLastTeamByUser();
          const restoredTeamId = storedTeam ?? map[normalizedRotatedUser.id] ?? null;
          if (restoredTeamId) localStorage.setItem("killio_active_team", restoredTeamId);

          if (!cancelled) {
            writeTokenCookie(rotated.accessToken, newExpiresInSeconds);
            setUser(normalizedRotatedUser);
            setAccessToken(rotated.accessToken);
            setActiveTeamId(restoredTeamId);
            setAccounts((prev) => {
              const existing = prev.filter((acc) => acc.user.id !== normalizedRotatedUser.id);
              const updated: SessionAccount[] = [
                ...existing,
                {
                  user: normalizedRotatedUser,
                  accessToken: rotated.accessToken,
                  refreshToken: null,
                  activeTeamId: restoredTeamId,
                  expiresInSeconds: newExpiresInSeconds,
                },
              ];
              localStorage.setItem("killio_accounts", JSON.stringify(updated));
              return updated;
            });
          }
        } catch {
          if (!cancelled) clearAuthState();
        }
      } catch {
        console.error("Failed to parse session data");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void hydrateSession();
    return () => { cancelled = true; };
  }, []);

  const handleSetActiveTeam = (id: string | null) => {
    setActiveTeamId(id);
    if (id) {
      localStorage.setItem("killio_active_team", id);
    } else {
      localStorage.removeItem("killio_active_team");
    }

    if (user) {
      const map = readLastTeamByUser();
      if (id) {
        map[user.id] = id;
      } else {
        delete map[user.id];
      }
      writeLastTeamByUser(map);

      setAccounts((prev) => {
        const newAccs = prev.map((acc) =>
          acc.user.id === user.id ? { ...acc, activeTeamId: id } : acc
        );
        localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
        return newAccs;
      });
    }
  };

  const logout = () => {
    clearAuthState();

    if (user) {
      setAccounts((prev) => {
        const newAccs = prev.filter((a) => a.user.id !== user.id);
        localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
        return newAccs;
      });
    }

    router.push("/login");
  };

  const login = (
    userData: AuthResponse["user"],
    token: string,
    refreshToken?: string,
    expiresInSeconds?: number,
  ) => {
    const normalizedUser = normalizeSessionUser(userData);
    if (!normalizedUser) return;

    const ttl = expiresInSeconds ?? REMEMBER_ME_TTL_SECONDS;

    writeTokenCookie(token, ttl);
    setUser(normalizedUser);
    setAccessToken(token);
    const existingAccount = accounts.find((account) => account.user.id === normalizedUser.id);
    const map = readLastTeamByUser();
    const restoredTeamId = existingAccount?.activeTeamId ?? map[normalizedUser.id] ?? null;
    setActiveTeamId(restoredTeamId);

    if (restoredTeamId) {
      localStorage.setItem("killio_active_team", restoredTeamId);
    } else {
      localStorage.removeItem("killio_active_team");
    }

    setAccounts((prev) => {
      const existing = prev.filter((a) => a.user.id !== normalizedUser.id);
      const newAccs: SessionAccount[] = [
        ...existing,
        {
          user: normalizedUser,
          accessToken: token,
          refreshToken: refreshToken ?? null,
          activeTeamId: restoredTeamId,
          expiresInSeconds: ttl,
        },
      ];
      localStorage.setItem("killio_accounts", JSON.stringify(newAccs));
      return newAccs;
    });
  };

  const switchAccount = (userId: string) => {
    const target = accounts.find((a) => a.user.id === userId);
    if (!target) return;
    const normalizedUser = normalizeSessionUser(target.user);
    if (!normalizedUser) return;

    setUser(normalizedUser);
    setAccessToken(target.accessToken);
    setActiveTeamId(target.activeTeamId);
    writeTokenCookie(target.accessToken, target.expiresInSeconds ?? REMEMBER_ME_TTL_SECONDS);

    localStorage.setItem("killio_user", JSON.stringify(normalizedUser));

    if (target.activeTeamId) {
      localStorage.setItem("killio_active_team", target.activeTeamId);
    } else {
      localStorage.removeItem("killio_active_team");
    }

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
        switchAccount,
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
