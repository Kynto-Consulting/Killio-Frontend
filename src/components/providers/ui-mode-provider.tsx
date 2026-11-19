"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { getUiPrefs, updateUiPrefs, type UiPrefs } from "@/lib/api/ui-prefs";
import { EMPTY_ONBOARDING, type OnboardingState } from "@/lib/ui-mode/onboarding";
import { isUiMode, resolveUiMode, type UiMode, type UiModeSource } from "@/lib/ui-mode/ui-mode";

interface UiModeContextValue {
  mode: UiMode;
  source: UiModeSource;
  teamDefaultMode: UiMode | null;
  onboarding: OnboardingState;
  loaded: boolean;
  /** `null` = follow the team default. Optimistic; the stored data is never touched. */
  setMode: (mode: UiMode | null) => Promise<void>;
  patchOnboarding: (patch: Parameters<typeof updateUiPrefs>[0]["onboarding"]) => Promise<void>;
  setTeamDefaultMode: (mode: UiMode | null) => void;
  /** Wizard / tour visibility, driven from the layout and the Help menu. */
  wizardOpen: boolean;
  setWizardOpen: (v: boolean) => void;
  tourOpen: boolean;
  setTourOpen: (v: boolean) => void;
}

const FALLBACK: UiModeContextValue = {
  mode: "full", source: "default", teamDefaultMode: null, onboarding: EMPTY_ONBOARDING, loaded: false,
  setMode: async () => {}, patchOnboarding: async () => {}, setTeamDefaultMode: () => {},
  wizardOpen: false, setWizardOpen: () => {}, tourOpen: false, setTourOpen: () => {},
};

const Ctx = createContext<UiModeContextValue>(FALLBACK);
const cacheKey = (userId: string) => `killio_ui_mode:${userId}`;

/**
 * Loads the person's mode + onboarding state once per account/workspace. The last mode is cached in localStorage so the
 * sidebar does not flash all entries before the request returns; the server value then wins.
 */
export function UiModeProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken, activeTeamId } = useSession();
  const [prefs, setPrefs] = useState<UiPrefs | null>(null);
  const [cached, setCached] = useState<UiMode | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const userId = user?.id ?? null;
  const reqRef = useRef(0);

  useEffect(() => {
    if (!userId) { setCached(null); return; }
    try { const v = localStorage.getItem(cacheKey(userId)); setCached(isUiMode(v) ? v : null); } catch { setCached(null); }
  }, [userId]);

  useEffect(() => {
    if (!accessToken || !userId) { setPrefs(null); return; }
    const id = ++reqRef.current;
    getUiPrefs(accessToken, activeTeamId)
      .then((p) => {
        if (id !== reqRef.current) return;
        setPrefs(p);
        try { localStorage.setItem(cacheKey(userId), p.mode); } catch { /* storage unavailable */ }
      })
      .catch(() => { /* offline or old API: stay on full mode, nothing is blocked */ });
  }, [accessToken, userId, activeTeamId]);

  const apply = useCallback((p: UiPrefs) => {
    setPrefs(p);
    if (userId) try { localStorage.setItem(cacheKey(userId), p.mode); } catch { /* ignore */ }
  }, [userId]);

  const setMode = useCallback(async (mode: UiMode | null) => {
    if (!accessToken) return;
    setPrefs((cur) => {
      if (!cur) return cur;
      const r = resolveUiMode(mode, cur.teamDefaultMode);
      return { ...cur, userMode: mode, mode: r.mode, modeSource: r.source };
    });
    apply(await updateUiPrefs({ mode }, accessToken, activeTeamId));
  }, [accessToken, activeTeamId, apply]);

  const patchOnboarding = useCallback(async (patch: Parameters<typeof updateUiPrefs>[0]["onboarding"]) => {
    if (!accessToken) return;
    setPrefs((cur) => (cur ? { ...cur, onboarding: { ...cur.onboarding, ...(patch as object), answers: { ...cur.onboarding.answers, ...(patch?.answers ?? {}) } } as OnboardingState } : cur));
    apply(await updateUiPrefs({ onboarding: patch }, accessToken, activeTeamId));
  }, [accessToken, activeTeamId, apply]);

  const setTeamDefaultMode = useCallback((m: UiMode | null) => {
    setPrefs((cur) => {
      if (!cur) return cur;
      const r = resolveUiMode(cur.userMode, m);
      return { ...cur, teamDefaultMode: m, mode: r.mode, modeSource: r.source };
    });
  }, []);

  const value = useMemo<UiModeContextValue>(() => ({
    mode: prefs?.mode ?? cached ?? "full",
    source: prefs?.modeSource ?? (cached ? "user" : "default"),
    teamDefaultMode: prefs?.teamDefaultMode ?? null,
    onboarding: prefs?.onboarding ?? EMPTY_ONBOARDING,
    loaded: prefs !== null,
    setMode, patchOnboarding, setTeamDefaultMode, wizardOpen, setWizardOpen, tourOpen, setTourOpen,
  }), [prefs, cached, setMode, patchOnboarding, setTeamDefaultMode, wizardOpen, tourOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUiMode(): UiModeContextValue {
  return useContext(Ctx);
}
