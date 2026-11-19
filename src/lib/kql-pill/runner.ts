/**
 * Runs the KQL of a pill: locally over the open document's tables when the script only needs those,
 * on the server otherwise. Server runs go through one shared scheduler (dedupe + 30 s cache +
 * at most 4 requests in flight), so a document with many pills never floods the API.
 * Swap `serverRunner` / the scheduler here without touching the components.
 */
import { KqlError, parseKqlScript, type KqlOutput, type KqlTable } from "@/lib/query/kql";
import { canRunLocally, runLocalOrServer } from "@/lib/query/run-local-or-server";
import { ApiRequestError, runKqlQuery } from "@/lib/api/groups";
import { createKqlScheduler } from "./scheduler";
import type { KqlPillResult } from "./format";

export interface KqlPillRunArgs {
  script: string;
  teamId: string | null | undefined;
  accessToken: string | null | undefined;
  /** Tables of the open document/scope (enables local execution). */
  tables?: KqlTable[];
  /** Skip the cache (refresh button). */
  force?: boolean;
}

export interface KqlPillRunOutcome {
  result: KqlPillResult;
  via: "local" | "server";
  at: number;
}

export interface KqlPillErrorInfo {
  message: string;
  /** Character offset in the script, when the error is a syntax error. */
  position?: number;
}

export const kqlPillScheduler = createKqlScheduler({ concurrency: 4, ttlMs: 30_000 });

/** Last output of a script is the pill's result. */
export function pickPillOutput(outputs: KqlOutput[]): KqlPillResult | null {
  const last = outputs[outputs.length - 1];
  return last ? (last.result as unknown as KqlPillResult) : null;
}

export function describeKqlPillError(e: unknown): KqlPillErrorInfo {
  if (e instanceof KqlError) return { message: e.message, position: e.position };
  if (e instanceof ApiRequestError) {
    const details = e.details as { position?: unknown } | null | undefined;
    const position = details && typeof details.position === "number" ? details.position : undefined;
    return { message: e.message, position: e.status === 400 ? position : undefined };
  }
  return { message: e instanceof Error ? e.message : String(e) };
}

/** Syntax check without running (live validation in the dialog). Returns null when valid. */
export function checkKqlPillSyntax(script: string): KqlPillErrorInfo | null {
  try {
    parseKqlScript(script);
    return null;
  } catch (e) {
    return describeKqlPillError(e);
  }
}

/** Retries a request the server refused with 429 (many pills open at once): 1.5 s, 3 s, 6 s, then gives up. */
async function runWithBackoff<T>(job: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await job();
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (status !== 429 || attempt >= 3) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt + Math.random() * 400));
    }
  }
}

export async function runKqlPill(args: KqlPillRunArgs): Promise<KqlPillRunOutcome> {
  const { script, teamId, accessToken, tables = [], force } = args;
  parseKqlScript(script); // throws KqlError before any network call

  if (tables.length > 0 && canRunLocally(script, tables)) {
    const outcome = await runLocalOrServer({ script, tables, teamId });
    const result = pickPillOutput(outcome.outputs);
    if (!result) throw new KqlError("The script has no result.");
    return { result, via: "local", at: Date.now() };
  }

  if (!teamId || !accessToken) throw new Error("Sign in to a workspace to run this query.");
  const key = `${teamId}\u0000${script}`;
  const outcome = await kqlPillScheduler.run(
    key,
    async () => {
      const r = await runLocalOrServer(
        { script, tables: [], teamId },
        {
          cache: new Map(), // caching is the scheduler's job
          runServer: async (s) => (await runWithBackoff(() => runKqlQuery(teamId, s, accessToken))).outputs as unknown as KqlOutput[],
        },
      );
      const result = pickPillOutput(r.outputs);
      if (!result) throw new KqlError("The script has no result.");
      return { result, via: "server" as const, at: Date.now() };
    },
    { force },
  );
  return outcome;
}
