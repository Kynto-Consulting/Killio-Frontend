import { NODE_GAP_X, queryIdOf, queriesOf } from './steps.ts';
import type { FlowGraph } from './types.ts';

export const NODE_GAP_Y = 170;

/** Left-to-right layout: a column per depth (longest path from a source), a lane per chain; each query gets its own band. */
export function autoLayout(graph: FlowGraph): FlowGraph {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const e of graph.edges) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e.source]);
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = (incoming.get(id) ?? []).reduce((m, s) => Math.max(m, depthOf(s) + 1), 0);
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const n of graph.nodes) depthOf(n.id);

  const positions = new Map<string, { x: number; y: number }>();
  let bandTop = 0;
  for (const q of queriesOf(graph)) {
    const members = graph.nodes.filter((n) => queryIdOf(graph, n) === q.id);
    const perColumn = new Map<number, number>();
    // a node on the main path keeps the lane of its main input; other nodes take the next free lane of their column
    const lane = new Map<string, number>();
    const ordered = [...members].sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));
    let rows = 0;
    for (const n of ordered) {
      const d = depth.get(n.id) ?? 0;
      const main = graph.edges.find((e) => e.target === n.id && e.targetHandle !== 'right' && e.targetHandle !== 'in2');
      const inherited = main ? lane.get(main.source) : undefined;
      let l = inherited ?? 0;
      const taken = new Set(ordered.filter((o) => (depth.get(o.id) ?? 0) === d && lane.has(o.id)).map((o) => lane.get(o.id)));
      if (inherited === undefined || taken.has(l)) { l = 0; while (taken.has(l)) l++; }
      lane.set(n.id, l);
      perColumn.set(d, (perColumn.get(d) ?? 0) + 1);
      rows = Math.max(rows, l + 1);
      positions.set(n.id, { x: d * NODE_GAP_X, y: bandTop + l * NODE_GAP_Y });
    }
    bandTop += Math.max(rows, 1) * NODE_GAP_Y + 40;
  }
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: positions.get(n.id) ?? n.position })) };
}
