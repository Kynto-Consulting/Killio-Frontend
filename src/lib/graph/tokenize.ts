// On-premise (client-side) tokenizer + TF-IDF cosine similarity for the
// "enhanced" graph. Everything runs locally in the browser — no network, no
// server — then smart pruning keeps only the strongest few links per node so
// the graph stays legible (graph 2.0).

import type { GNode, GEdge } from "./types.ts";

const STOP = new Set([
  // English
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this", "that", "have", "from", "they", "what", "when", "where", "which", "their", "there", "would", "could", "should", "about", "into", "than", "then", "them", "been", "more", "some", "such", "only", "also", "very", "just", "like", "over", "after", "most", "other", "will", "can", "all", "any", "out", "how", "why", "who",
  // Spanish
  "que", "los", "las", "una", "uno", "del", "por", "con", "para", "como", "más", "pero", "sus", "este", "esta", "esto", "eso", "esa", "ese", "son", "fue", "han", "hay", "muy", "ya", "lo", "le", "se", "su", "al", "un", "es", "en", "de", "la", "el", "y", "o", "a", "porque", "cuando", "donde", "tambien", "todo", "todos", "entre", "sobre", "desde", "hasta",
]);

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    // strip reference tokens / markup so they don't pollute terms
    .replace(/@\[[^\]]*\]/g, " ").replace(/[$#]\[[^\]]*\]/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 24 && !STOP.has(w) && !/^\d+$/.test(w));
}

export type EnhanceOptions = { topK?: number; threshold?: number; maxTerms?: number };

/**
 * Build token-similarity edges between content nodes. Pure + synchronous.
 * Smart pruning = per-node top-K neighbours above a cosine threshold.
 */
export function enhanceEdges(nodes: GNode[], opts: EnhanceOptions = {}): GEdge[] {
  const topK = opts.topK ?? 4;
  const threshold = opts.threshold ?? 0.16;
  const maxTerms = opts.maxTerms ?? 40;

  const docs = nodes.filter((n) => (n.type === "document" || n.type === "card" || n.type === "mesh") && (n.text || "").trim().length > 0);
  if (docs.length < 2) return [];

  // Term frequencies + document frequency.
  const tf: Array<Map<string, number>> = [];
  const df = new Map<string, number>();
  for (const n of docs) {
    const counts = new Map<string, number>();
    for (const t of tokenize(n.text || "")) counts.set(t, (counts.get(t) || 0) + 1);
    tf.push(counts);
    for (const t of counts.keys()) df.set(t, (df.get(t) || 0) + 1);
  }

  const N = docs.length;
  // TF-IDF vectors, trimmed to the top `maxTerms` weighted terms, L2-normalized.
  const vecs: Array<Map<string, number>> = tf.map((counts) => {
    const weights: Array<[string, number]> = [];
    for (const [term, c] of counts) {
      const dft = df.get(term) || 1;
      if (dft === N) continue; // term in every doc → no discriminative value
      weights.push([term, (1 + Math.log(c)) * Math.log(N / dft)]);
    }
    weights.sort((a, b) => b[1] - a[1]);
    const top = weights.slice(0, maxTerms);
    let norm = 0;
    for (const [, w] of top) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    return new Map(top.map(([t, w]) => [t, w / norm]));
  });

  const cosine = (a: Map<string, number>, b: Map<string, number>) => {
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    let dot = 0;
    for (const [t, w] of small) { const v = large.get(t); if (v) dot += w * v; }
    return dot;
  };

  // Per-node candidate neighbours, then keep top-K (undirected dedup).
  const seen = new Set<string>();
  const edges: GEdge[] = [];
  for (let i = 0; i < N; i += 1) {
    const sims: Array<[number, number]> = [];
    for (let j = 0; j < N; j += 1) {
      if (i === j) continue;
      const s = cosine(vecs[i], vecs[j]);
      if (s >= threshold) sims.push([j, s]);
    }
    sims.sort((a, b) => b[1] - a[1]);
    for (const [j, s] of sims.slice(0, topK)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: docs[i].id, target: docs[j].id, type: "similarity", weight: +s.toFixed(3) });
    }
  }
  return edges;
}
