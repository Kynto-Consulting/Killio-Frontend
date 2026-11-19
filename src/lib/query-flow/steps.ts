/**
 * The "Applied steps" model: the node graph seen as ordered lists of steps (one list per named query), and the edits
 * the steps pane and the ribbon make on it (insert in the middle, delete, reorder, disable, rename, queries).
 * Pure functions over FlowGraph; every edit returns a new graph and never mutates its input.
 */
import { DEFAULT_QUERY_ID, dataOf, makeNode, uid } from './defaults.ts';
import type {
  FilterData, FlowEdge, FlowGraph, FlowNode, FlowQuery, GroupData, JoinData, LimitData, OutputData, SelectData, SortData, SourceData, TransformData, DistinctData, PivotData, TransposeData, UnpivotData,
} from './types.ts';

export const NODE_GAP_X = 280;

export function queriesOf(graph: FlowGraph): FlowQuery[] {
  return graph.queries && graph.queries.length > 0 ? graph.queries : [{ id: DEFAULT_QUERY_ID, name: 'Query1' }];
}
export const queryIdOf = (graph: FlowGraph, node: FlowNode): string => node.query ?? queriesOf(graph)[0].id;

const isMainEdge = (e: FlowEdge) => e.targetHandle !== 'right' && e.targetHandle !== 'in2';

export function inputOf(graph: FlowGraph, nodeId: string, handle: 'in' | 'right' | 'in2' = 'in'): FlowNode | null {
  const edge = graph.edges.find((e) => e.target === nodeId && (handle === 'in' ? isMainEdge(e) : e.targetHandle === handle));
  return edge ? graph.nodes.find((n) => n.id === edge.source) ?? null : null;
}

export function outputsOf(graph: FlowGraph, nodeId: string): FlowNode[] {
  return graph.edges.filter((e) => e.source === nodeId).map((e) => graph.nodes.find((n) => n.id === e.target)).filter((n): n is FlowNode => !!n);
}

/** Steps from the first one to `nodeId`, following the main input of each (cycle safe). */
export function chainTo(graph: FlowGraph, nodeId: string): FlowNode[] {
  const out: FlowNode[] = [];
  const seen = new Set<string>();
  let cur = graph.nodes.find((n) => n.id === nodeId) ?? null;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = inputOf(graph, cur.id);
  }
  return out;
}

/** The chain a node belongs to: from its first step to the end (downstream along main outputs). Output nodes are listed last. */
export function chainAround(graph: FlowGraph, nodeId: string): FlowNode[] {
  let tail = graph.nodes.find((n) => n.id === nodeId);
  if (!tail) return [];
  const seen = new Set<string>([tail.id]);
  for (;;) {
    const next: FlowNode | undefined = graph.edges
      .filter((e) => e.source === tail!.id && isMainEdge(e))
      .map((e) => graph.nodes.find((n) => n.id === e.target))
      .find((n): n is FlowNode => !!n && !seen.has(n.id));
    if (!next) break;
    seen.add(next.id);
    tail = next;
  }
  return chainTo(graph, tail.id);
}

export function nodesOfQuery(graph: FlowGraph, queryId: string): FlowNode[] {
  return graph.nodes.filter((n) => queryIdOf(graph, n) === queryId);
}

/** Last node of a query that nothing else (but an output) consumes. */
export function terminalOfQuery(graph: FlowGraph, queryId: string): FlowNode | null {
  const members = nodesOfQuery(graph, queryId).filter((n) => n.type !== 'output');
  const ends = members.filter((n) => !outputsOf(graph, n.id).some((t) => t.type !== 'output'));
  return ends[ends.length - 1] ?? null;
}

export function descendants(graph: FlowGraph, nodeId: string): Set<string> {
  const out = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of graph.edges) if (e.source === id && !out.has(e.target)) { out.add(e.target); stack.push(e.target); }
  }
  return out;
}

export function updateNode(graph: FlowGraph, nodeId: string, patch: Partial<FlowNode>): FlowGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) };
}
export function updateNodeData(graph: FlowGraph, nodeId: string, data: Record<string, unknown>): FlowGraph {
  return updateNode(graph, nodeId, { data });
}

/** Where a new step goes when `selectedId` is selected: right after it (before an Output). */
export function insertionPoint(graph: FlowGraph, selectedId: string | null, queryId?: string): FlowNode | null {
  const selected = selectedId ? graph.nodes.find((n) => n.id === selectedId) : null;
  if (selected) {
    if (selected.type === 'output') return inputOf(graph, selected.id);
    return selected;
  }
  return terminalOfQuery(graph, queryId ?? queriesOf(graph)[0].id);
}

/**
 * Adds `node` right after `afterId` in its chain: what `afterId` fed before now reads from the new step. With no
 * `afterId` the node is just added (a first step / a free branch).
 */
export function insertAfter(graph: FlowGraph, afterId: string | null, node: FlowNode): FlowGraph {
  const after = afterId ? graph.nodes.find((n) => n.id === afterId) : null;
  if (!after) return { ...graph, nodes: [...graph.nodes, node] };
  const query = node.query ?? after.query;
  const moved = descendants(graph, after.id);
  const placed: FlowNode = { ...node, ...(query ? { query } : {}), position: { x: after.position.x + NODE_GAP_X, y: after.position.y } };
  const nodes = graph.nodes.map((n) => (moved.has(n.id) ? { ...n, position: { x: n.position.x + NODE_GAP_X, y: n.position.y } } : n));
  const edges: FlowEdge[] = graph.edges.map((e) => (e.source === after.id && isMainEdge(e) ? { ...e, source: placed.id } : e));
  // keep the join / union side inputs of the old consumers where they were: only main edges were redirected
  edges.push({ id: uid('e'), source: after.id, target: placed.id, targetHandle: 'in' });
  // edges that were redirected must also keep feeding what they fed through handle 'in'; side edges (right / in2) stay on `after`
  return { ...graph, nodes: [...nodes, placed], edges };
}

/** Deletes a step and joins its input to what it fed. */
export function removeStep(graph: FlowGraph, nodeId: string): FlowGraph {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return graph;
  const input = graph.edges.find((e) => e.target === nodeId && isMainEdge(e));
  const consumers = graph.edges.filter((e) => e.source === nodeId);
  const kept = graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  const bridged: FlowEdge[] = input ? consumers.map((e) => ({ ...e, id: uid('e'), source: input.source })) : [];
  return { ...graph, nodes: graph.nodes.filter((n) => n.id !== nodeId), edges: [...kept, ...bridged] };
}

/** Moves a step one place up / down its chain (the source stays first). */
export function moveStep(graph: FlowGraph, nodeId: string, delta: -1 | 1): FlowGraph {
  const chain = chainAround(graph, nodeId);
  const i = chain.findIndex((n) => n.id === nodeId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= chain.length) return graph;
  const a = chain[i];
  const b = chain[j];
  if (i === 0 || j === 0 || a.type === 'output' || b.type === 'output') return graph;
  const order = [...chain];
  order[i] = b;
  order[j] = a;
  const inChain = new Set(chain.map((n) => n.id));
  const first = chain[0];
  const last = chain[chain.length - 1];
  // main edges between chain members are rebuilt; edges leaving the chain (to an output or to another query) move to the new last step
  const outside = graph.edges.filter((e) => e.source === last.id && !inChain.has(e.target));
  const kept = graph.edges.filter((e) => !(inChain.has(e.source) && inChain.has(e.target) && isMainEdge(e)) && !outside.includes(e));
  const rebuilt: FlowEdge[] = [];
  for (let k = 1; k < order.length; k++) rebuilt.push({ id: uid('e'), source: order[k - 1].id, target: order[k].id, targetHandle: 'in' });
  const newLast = order[order.length - 1];
  const rerouted = outside.map((e) => ({ ...e, source: newLast.id }));
  void first;
  return { ...graph, edges: [...kept, ...rebuilt, ...rerouted] };
}

export function toggleDisabled(graph: FlowGraph, nodeId: string): FlowGraph {
  const n = graph.nodes.find((x) => x.id === nodeId);
  if (!n || n.type === 'source' || n.type === 'output') return graph;
  return updateNode(graph, nodeId, { disabled: !n.disabled });
}

export function renameStep(graph: FlowGraph, nodeId: string, label: string): FlowGraph {
  const trimmed = label.trim();
  return updateNode(graph, nodeId, { label: trimmed || undefined });
}
export function describeStep(graph: FlowGraph, nodeId: string, note: string): FlowGraph {
  const trimmed = note.trim();
  return updateNode(graph, nodeId, { note: trimmed || undefined });
}

/** Copies every step up to `nodeId` into a new free branch (the first step of the copy is a source). Returns the new graph and the id of the copy of `nodeId`. */
export function duplicateBranch(graph: FlowGraph, nodeId: string): { graph: FlowGraph; copyId: string | null } {
  const chain = chainTo(graph, nodeId);
  if (chain.length === 0) return { graph, copyId: null };
  const maxY = Math.max(...graph.nodes.map((n) => n.position.y), 0);
  const map = new Map<string, string>();
  const copies = chain.map((n, idx) => {
    const copy: FlowNode = { ...n, id: uid('n'), data: JSON.parse(JSON.stringify(n.data)) as Record<string, unknown>, position: { x: idx * NODE_GAP_X, y: maxY + 170 } };
    map.set(n.id, copy.id);
    return copy;
  });
  const edges = chain.slice(1).map((n, idx): FlowEdge => ({ id: uid('e'), source: copies[idx].id, target: copies[idx + 1].id, targetHandle: 'in' }));
  void map;
  return { graph: { ...graph, nodes: [...graph.nodes, ...copies], edges: [...graph.edges, ...edges] }, copyId: copies[copies.length - 1].id };
}

// ── queries ──────────────────────────────────────────────────────────────────

export function addQuery(graph: FlowGraph, name?: string): { graph: FlowGraph; id: string } {
  const queries = queriesOf(graph);
  const id = uid('q');
  const nextName = name?.trim() || `Query${queries.length + 1}`;
  // nodes without a query belong to the first one: make that explicit before there are two
  const nodes = graph.nodes.map((n) => (n.query ? n : { ...n, query: queries[0].id }));
  return { graph: { ...graph, nodes, queries: [...queries, { id, name: nextName }] }, id };
}

export function renameQuery(graph: FlowGraph, id: string, name: string): FlowGraph {
  const trimmed = name.trim();
  if (!trimmed) return graph;
  return { ...graph, queries: queriesOf(graph).map((q) => (q.id === id ? { ...q, name: trimmed } : q)) };
}

export function removeQuery(graph: FlowGraph, id: string): FlowGraph {
  const queries = queriesOf(graph);
  if (queries.length <= 1) return graph;
  const doomed = new Set(nodesOfQuery(graph, id).map((n) => n.id));
  // sources that referenced the deleted query lose their reference
  const nodes = graph.nodes
    .filter((n) => !doomed.has(n.id))
    .map((n) => (n.type === 'source' && (n.data as { kind?: string; name?: string }).kind === 'query' && (n.data as { name?: string }).name === id ? { ...n, data: { kind: 'cards', name: '' } } : n));
  return { ...graph, nodes, edges: graph.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)), queries: queries.filter((q) => q.id !== id) };
}

/** A new query that starts from another query ("Reference" in Power Query). */
export function referenceQuery(graph: FlowGraph, fromQueryId: string): { graph: FlowGraph; id: string; sourceId: string } {
  const added = addQuery(graph);
  const source = makeNode('source', { x: 0, y: Math.max(...added.graph.nodes.map((n) => n.position.y), 0) + 170 }, { kind: 'query', name: fromQueryId }, { query: added.id });
  return { graph: { ...added.graph, nodes: [...added.graph.nodes, source] }, id: added.id, sourceId: source.id };
}

// ── describing a step ────────────────────────────────────────────────────────

const clip = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Short data-derived detail of a step (not translated: it is user data). */
export function summarize(node: FlowNode): string {
  switch (node.type) {
    case 'source': {
      const d = dataOf<SourceData>(node);
      return d.kind === 'rows' ? clip(d.name) : d.kind === 'name' ? clip(d.name) : d.kind === 'query' ? '' : d.kind;
    }
    case 'filter': {
      const d = dataOf<FilterData>(node);
      const first = d.conditions.find((c) => c.field.trim() || c.op === 'flag');
      const count = d.conditions.filter((c) => c.field.trim() || c.op === 'flag').length + (d.advanced.trim() ? 1 : 0);
      if (!first) return d.advanced.trim() ? clip(d.advanced) : '';
      return `${first.op === 'flag' ? first.value : `${first.field} ${first.op} ${first.values.length ? first.values.join(', ') : first.value}`}${count > 1 ? ` (+${count - 1})` : ''}`.trim();
    }
    case 'transform': {
      const d = dataOf<TransformData>(node);
      return d.columns.map((c) => c.alias || c.column || c.kind).join(', ');
    }
    case 'join': {
      const d = dataOf<JoinData>(node);
      return `${d.leftKey} = ${d.rightKey}`.trim() === '=' ? '' : `${d.leftKey} = ${d.rightKey}`;
    }
    case 'group': {
      const d = dataOf<GroupData>(node);
      return [d.dimensions.map((x) => (x.bucket !== 'none' ? `${x.bucket}(${x.field})` : x.field)).join(', '), d.metrics.map((m) => (m.field ? `${m.fn}(${m.field})` : m.fn)).join(', ')].filter(Boolean).join(' · ');
    }
    case 'select': return dataOf<SelectData>(node).columns.map((c) => c.alias || c.column).join(', ');
    case 'distinct': return dataOf<DistinctData>(node).columns.join(', ');
    case 'sort': return dataOf<SortData>(node).keys.filter((k) => k.field).map((k) => `${k.field} ${k.dir}`).join(', ');
    case 'limit': {
      const d = dataOf<LimitData>(node);
      return [d.offset ? `skip ${d.offset}` : '', d.droplast ? `drop last ${d.droplast}` : '', d.limit ? `keep ${d.limit}` : '', d.tail ? `last ${d.tail}` : ''].filter(Boolean).join(', ');
    }
    case 'unpivot': {
      const d = dataOf<UnpivotData>(node);
      return `${d.except ? 'except ' : ''}${d.columns.join(', ')}`;
    }
    case 'pivot': return dataOf<PivotData>(node).column;
    case 'transpose': return dataOf<TransposeData>(node).header ? 'header' : '';
    case 'output': return clip(dataOf<OutputData>(node).title || dataOf<OutputData>(node).kind);
    default: return '';
  }
}

/** Adds the steps of `extra` (a template) as a new named query below the existing ones; into an empty graph they simply replace it. */
export function appendGraph(graph: FlowGraph, extra: FlowGraph, name: string): { graph: FlowGraph; queryId: string } {
  if (graph.nodes.length === 0) {
    const queryId = queriesOf(graph)[0].id;
    const queries = queriesOf(graph).map((q, i) => (i === 0 ? { ...q, name: name.trim() || q.name } : q));
    return { graph: { nodes: extra.nodes.map((n) => ({ ...n, query: queryId })), edges: extra.edges, queries }, queryId };
  }
  const added = addQuery(graph, name);
  const top = Math.max(...added.graph.nodes.map((n) => n.position.y), 0) + NODE_GAP_X / 2;
  const nodes = extra.nodes.map((n) => ({ ...n, query: added.id, position: { x: n.position.x, y: n.position.y + top } }));
  return { graph: { ...added.graph, nodes: [...added.graph.nodes, ...nodes], edges: [...added.graph.edges, ...extra.edges] }, queryId: added.id };
}

// ── Power Query step / query menus ───────────────────────────────────────────

/** Deletes a step and every step after it in its chain ("Delete Until End"). Outputs fed by the chain are kept and left unconnected. */
export function deleteUntilEnd(graph: FlowGraph, nodeId: string): FlowGraph {
  const chain = chainAround(graph, nodeId);
  const i = chain.findIndex((n) => n.id === nodeId);
  if (i < 0) return graph;
  const doomed = new Set(chain.slice(i).filter((n) => n.type !== 'output').map((n) => n.id));
  return { ...graph, nodes: graph.nodes.filter((n) => !doomed.has(n.id)), edges: graph.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)) };
}

/** A copy of every step of a query as a new query ("Duplicate"); a step that read another query keeps reading it. */
export function duplicateQuery(graph: FlowGraph, queryId: string): { graph: FlowGraph; id: string } {
  const added = addQuery(graph, `${queriesOf(graph).find((q) => q.id === queryId)?.name ?? 'Query'} (2)`);
  const members = nodesOfQuery(added.graph, queryId);
  const ids = new Map<string, string>();
  const top = Math.max(...added.graph.nodes.map((n) => n.position.y), 0) + 170;
  const baseY = Math.min(...members.map((n) => n.position.y), 0);
  const copies = members.map((n) => {
    const copy: FlowNode = { ...n, id: uid('n'), query: added.id, data: JSON.parse(JSON.stringify(n.data)) as Record<string, unknown>, position: { x: n.position.x, y: n.position.y - baseY + top } };
    ids.set(n.id, copy.id);
    return copy;
  });
  const edges = added.graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e): FlowEdge => ({ ...e, id: uid('e'), source: ids.get(e.source)!, target: ids.get(e.target)! }));
  return { graph: { ...added.graph, nodes: [...added.graph.nodes, ...copies], edges: [...added.graph.edges, ...edges] }, id: added.id };
}

/**
 * "Extract Previous": the steps before `nodeId` move to a new query; in the original query a source that reads it replaces
 * them. Returns null for the first step (there is nothing before it).
 */
export function extractPrevious(graph: FlowGraph, nodeId: string, name?: string): { graph: FlowGraph; id: string } | null {
  const chain = chainTo(graph, nodeId);
  const index = chain.findIndex((n) => n.id === nodeId);
  if (index <= 0) return null;
  const moved = chain.slice(0, index);
  const added = addQuery(graph, name);
  const movedIds = new Set(moved.map((n) => n.id));
  const queryId = queryIdOf(graph, chain[index]);
  const first = chain[index];
  const ref = makeNode('source', { x: first.position.x - NODE_GAP_X, y: first.position.y }, { kind: 'query', name: added.id }, { query: queryId });
  const nodes = added.graph.nodes.map((n) => (movedIds.has(n.id) ? { ...n, query: added.id } : n));
  const edges = added.graph.edges.filter((e) => !(e.target === first.id && movedIds.has(e.source) && isMainEdge(e)));
  edges.push({ id: uid('e'), source: ref.id, target: first.id, targetHandle: 'in' });
  return { graph: { ...added.graph, nodes: [...nodes, ref], edges }, id: added.id };
}
