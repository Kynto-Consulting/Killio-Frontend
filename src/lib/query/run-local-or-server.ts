/**
 * Runs a KQL script where it is cheapest: locally when it only reads tables of the open document,
 * on the server otherwise (cards, documents, members... need the backend). Server results are cached
 * in memory per (team, script) for 30 s; local runs are instant and never cached.
 */
import { describeKqlSources, runKql, type KqlData, type KqlOutput, type KqlTable } from "./kql.ts";

export const SERVER_CACHE_TTL_MS = 30_000;

export type KqlRunVia = "local" | "server";
export interface KqlRunOutcome {
  outputs: KqlOutput[];
  via: KqlRunVia;
}

export interface RunLocalOrServerDeps {
  /** Defaults to the real engine. */
  describe?: (script: string) => { cards: boolean; sources: string[]; tables: string[] };
  runLocal?: (script: string, data: KqlData) => KqlOutput[];
  /** Calls the backend. Required for scripts that cannot run locally. */
  runServer?: (script: string) => Promise<KqlOutput[]>;
  cache?: Map<string, { at: number; outputs: KqlOutput[] }>;
  now?: () => number;
}

const defaultCache = new Map<string, { at: number; outputs: KqlOutput[] }>();

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Same lookup the engine does: by id or by (accent/case-insensitive) title. */
export function documentHasTable(tables: KqlTable[], ref: string): boolean {
  const wanted = norm(ref);
  return tables.some((t) => t.id === ref || norm(t.title) === wanted);
}

/** True when the script reads only tables that exist in `tables` (no cards, no named sources). */
export function canRunLocally(script: string, tables: KqlTable[], describe: RunLocalOrServerDeps["describe"] = describeKqlSources): boolean {
  const needs = describe(script);
  if (needs.cards || needs.sources.length > 0) return false;
  if (needs.tables.length === 0) return false;
  return needs.tables.every((ref) => documentHasTable(tables, ref));
}

export function clearKqlServerCache(cache: Map<string, unknown> = defaultCache) {
  cache.clear();
}

/** Throws KqlError on a syntax error (local parse) or whatever `runServer` throws. */
export async function runLocalOrServer(
  args: { script: string; tables: KqlTable[]; teamId: string | null | undefined },
  deps: RunLocalOrServerDeps = {},
): Promise<KqlRunOutcome> {
  const { script, tables, teamId } = args;
  const describe = deps.describe ?? describeKqlSources;
  const now = deps.now ?? Date.now;
  const cache = deps.cache ?? defaultCache;

  if (canRunLocally(script, tables, describe)) {
    const outputs = (deps.runLocal ?? ((s, d) => runKql(s, d)))(script, { tables });
    return { outputs, via: "local" };
  }

  if (!teamId) throw new Error("No active team: this query needs the server.");
  if (!deps.runServer) throw new Error("Server execution is not available.");

  const key = `${teamId}\u0000${script}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < SERVER_CACHE_TTL_MS) return { outputs: hit.outputs, via: "server" };
  const outputs = await deps.runServer(script);
  cache.set(key, { at: now(), outputs });
  return { outputs, via: "server" };
}
