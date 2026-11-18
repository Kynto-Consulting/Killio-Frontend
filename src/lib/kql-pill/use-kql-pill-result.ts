"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/providers/session-provider";
import { useKqlScopeTeamId } from "./scope";
import { canRunLocally } from "@/lib/query/run-local-or-server";
import type { KqlTable } from "@/lib/query/kql";
import { describeKqlPillError, runKqlPill, type KqlPillErrorInfo, type KqlPillRunOutcome } from "./runner";

export type KqlPillState =
  | { status: "idle" }
  | { status: "loading"; previous?: KqlPillRunOutcome }
  | { status: "ok"; outcome: KqlPillRunOutcome; refreshing?: boolean }
  | { status: "error"; error: KqlPillErrorInfo };

/** Last successful result per (team, script): remounts (editor repaints) show it instead of a skeleton. */
const lastKnown = new Map<string, KqlPillRunOutcome>();
const knownKey = (teamId: string | null | undefined, script: string) => `${teamId ?? ""}\u0000${script}`;

export function getLastKnownKqlResult(teamId: string | null | undefined, script: string) {
  return lastKnown.get(knownKey(teamId, script));
}

interface Options {
  tables?: KqlTable[];
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Evaluates a KQL script for display. Never throws. Debounced, deduped and capped through the
 * shared scheduler; results that arrive after unmount or after the script changed are ignored.
 */
export function useKqlPillResult(script: string, { tables, enabled = true, debounceMs = 120 }: Options = {}) {
  const { accessToken, activeTeamId: sessionTeamId } = useSession();
  const scopeTeamId = useKqlScopeTeamId();
  // The document's own team wins over the team that happens to be active in the sidebar.
  const activeTeamId = scopeTeamId ?? sessionTeamId;
  const trimmed = script.trim();

  const localTables = useMemo(() => {
    if (!tables || tables.length === 0 || !trimmed) return undefined;
    try {
      return canRunLocally(script, tables) ? tables : undefined;
    } catch {
      return undefined;
    }
  }, [script, tables, trimmed]);

  const canRun = Boolean(localTables) || Boolean(accessToken && activeTeamId);
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);
  const [state, setState] = useState<KqlPillState>(() => {
    const known = trimmed ? lastKnown.get(knownKey(activeTeamId, script)) : undefined;
    return known ? { status: "ok", outcome: known } : { status: "idle" };
  });

  useEffect(() => {
    if (!enabled || !trimmed || !canRun) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    const known = lastKnown.get(knownKey(activeTeamId, script));
    setState((prev) =>
      prev.status === "ok" ? { ...prev, refreshing: true } : known ? { status: "ok", outcome: known, refreshing: true } : { status: "loading" },
    );
    const force = forceRef.current;
    forceRef.current = false;
    const timer = setTimeout(() => {
      runKqlPill({ script, teamId: activeTeamId, accessToken, tables: localTables, force })
        .then((outcome) => {
          lastKnown.set(knownKey(activeTeamId, script), outcome);
          if (!cancelled) setState({ status: "ok", outcome });
        })
        .catch((e) => {
          if (!cancelled) setState({ status: "error", error: describeKqlPillError(e) });
        });
    }, force ? 0 : debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [script, trimmed, enabled, canRun, activeTeamId, accessToken, localTables, debounceMs, nonce]);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { state, refresh, canRun, teamId: activeTeamId };
}
