"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { runKqlQuery } from "@/lib/api/groups";
import type { KqlOutput, KqlTable } from "@/lib/query/kql";
import { runLocalOrServer, clearKqlServerCache, type KqlRunVia } from "@/lib/query/run-local-or-server";

export const PREVIEW_DEBOUNCE_MS = 500;
const CACHE_TTL_MS = 15_000;

export interface FlowPreviewState {
  /** The script this state belongs to. */
  forScript: string;
  status: "idle" | "loading" | "ok" | "error";
  outputs: KqlOutput[];
  via: KqlRunVia | null;
  error: string | null;
}

const IDLE: FlowPreviewState = { forScript: "", status: "idle", outputs: [], via: null, error: null };
const cache = new Map<string, { at: number; state: FlowPreviewState }>();

/** Runs `script` (debounced 500 ms, cached) while `enabled`. Never throws: failures become `status: "error"`. */
export function useFlowPreview(
  script: string,
  enabled: boolean,
  tables: KqlTable[],
  teamId: string | null,
  accessToken: string | null,
  nonce: number,
): FlowPreviewState {
  const [state, setState] = useState<FlowPreviewState>(IDLE);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const tablesKey = useMemo(() => tables.map((t) => `${t.id}:${t.rows.length}:${t.columns.length}`).join(","), [tables]);

  useEffect(() => {
    if (!enabled || !script.trim()) {
      setState(IDLE);
      return;
    }
    const key = `${teamId ?? ""}\u0000${tablesKey}\u0000${script}`;
    const hit = nonce === 0 ? cache.get(key) : undefined;
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setState(hit.state);
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, forScript: script, status: "loading", error: null }));
    const timer = setTimeout(async () => {
      try {
        if (nonce > 0) clearKqlServerCache();
        const out = await runLocalOrServer(
          { script, tables, teamId },
          {
            runServer: async (s) => {
              const token = tokenRef.current;
              if (!token || !teamId) throw new Error("Sign in and select a team to run this query.");
              const res = await runKqlQuery(teamId, s, token);
              return res.outputs as unknown as KqlOutput[];
            },
          },
        );
        const next: FlowPreviewState = { forScript: script, status: "ok", outputs: out.outputs, via: out.via, error: null };
        cache.set(key, { at: Date.now(), state: next });
        if (cache.size > 80) cache.delete(cache.keys().next().value as string);
        if (!cancelled) setState(next);
      } catch (error) {
        const message = String((error as { message?: string } | null)?.message ?? error ?? "Error");
        if (!cancelled) setState({ forScript: script, status: "error", outputs: [], via: null, error: message });
      }
    }, nonce > 0 ? 0 : PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // tables are keyed by tablesKey: a new array with the same content must not rerun the query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, enabled, tablesKey, teamId, nonce]);

  return state;
}
