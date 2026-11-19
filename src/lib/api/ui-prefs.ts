import { fetchApi } from "./client";
import type { UiMode, UiModeSource } from "@/lib/ui-mode/ui-mode";
import type { OnboardingState } from "@/lib/ui-mode/onboarding";

export interface UiPrefs {
  mode: UiMode;
  modeSource: UiModeSource;
  userMode: UiMode | null;
  teamDefaultMode: UiMode | null;
  onboarding: OnboardingState;
}

const q = (teamId?: string | null) => (teamId ? `?teamId=${encodeURIComponent(teamId)}` : "");

export const getUiPrefs = (accessToken: string, teamId?: string | null) => fetchApi<UiPrefs>(`/ui-prefs${q(teamId)}`, { accessToken });

/** `mode: null` goes back to the team default. `onboarding` is a partial patch. */
export const updateUiPrefs = (
  patch: { mode?: UiMode | null; onboarding?: Partial<Omit<OnboardingState, "demo">> & { demo?: OnboardingState["demo"] } },
  accessToken: string,
  teamId?: string | null,
) => fetchApi<UiPrefs>(`/ui-prefs${q(teamId)}`, { method: "PUT", body: JSON.stringify(patch), accessToken });

export const setTeamDefaultUiMode = (teamId: string, mode: UiMode | null, accessToken: string) =>
  fetchApi<{ teamDefaultMode: UiMode | null }>(`/teams/${encodeURIComponent(teamId)}/ui-mode-default`, { method: "PUT", body: JSON.stringify({ mode }), accessToken });
