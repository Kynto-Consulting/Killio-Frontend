/**
 * Compile + check with the real engine parser: which step has a problem of its own (compile error) and which is the first one
 * whose script the engine rejects ("needs engine support"). Nodes downstream of a broken one are not blamed again.
 */
import { parseKqlScript } from '../query/kql.ts';
import { compileFlow } from './compile.ts';
import { inputOf } from './steps.ts';
import type { CompileOptions, CompileResult, FlowGraph } from './types.ts';

export interface NodeIssue { kind: 'compile' | 'engine'; message: string; position?: number }
export interface Diagnosis { result: CompileResult; engineError: { message: string; position?: number } | null; issues: Record<string, NodeIssue> }

export function checkScript(script: string): { message: string; position?: number } | null {
  if (!script.trim()) return null;
  try {
    parseKqlScript(script);
    return null;
  } catch (error) {
    const e = error as { message?: string; position?: unknown };
    return { message: String(e?.message ?? error), position: typeof e?.position === 'number' ? e.position : undefined };
  }
}

let declarationsProbe: boolean | null = null;
/** Does the engine accept `param` / `fn` statements yet? (Probed once with the real parser; the compiler writes them only when it does.) */
export function engineSupportsDeclarations(): boolean {
  if (declarationsProbe === null) declarationsProbe = checkScript('param limite = 5\nfn doble(x) = x\nshow cards') === null;
  return declarationsProbe;
}

export function diagnoseFlow(graph: FlowGraph, options: CompileOptions = {}): Diagnosis {
  const result = compileFlow(graph, options);
  const issues: Record<string, NodeIssue> = {};
  for (const e of result.errors) if (!issues[e.nodeId]) issues[e.nodeId] = { kind: 'compile', message: e.message };

  const broken = new Set(Object.keys(issues));
  const failing = new Map<string, { message: string; position?: number }>();
  // walk in dependency order so that the first failing step of a chain is the one marked
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const handle of ['in', 'right', 'in2'] as const) { const up = inputOf(graph, id, handle); if (up) visit(up.id); }
    ordered.push(id);
  };
  for (const n of graph.nodes) visit(n.id);
  for (const id of ordered) {
    if (broken.has(id)) continue;
    const upstreamBroken = (['in', 'right', 'in2'] as const).some((h) => { const up = inputOf(graph, id, h); return up && (broken.has(up.id) || failing.has(up.id)); });
    if (upstreamBroken) continue;
    const r = compileFlow(graph, { ...options, upTo: id });
    if (r.errors.length > 0 || !r.script) continue;
    const bad = checkScript(r.script);
    if (bad) { failing.set(id, bad); issues[id] = { kind: 'engine', ...bad }; }
  }
  return { result, engineError: result.script ? checkScript(result.script) : null, issues };
}
