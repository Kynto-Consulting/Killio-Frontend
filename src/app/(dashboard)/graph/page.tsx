"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2, Sparkles, Share2, RefreshCw, X, ExternalLink } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { GraphCanvas } from "@/components/graph/graph-canvas";
import { collectLocalEntities, collectOnlineEntities } from "@/lib/graph/collect-entities";
import { buildGraph } from "@/lib/graph/build-graph";
import { enhanceEdges } from "@/lib/graph/tokenize";
import { getImageUrl } from "@/lib/image-cache";
import { readAssetFile } from "@/lib/local-workspace/assets";
import type { EntityInput, GNode, GNodeType, GEdgeType, GraphData } from "@/lib/graph/types";

const NODE_TYPES: Array<{ key: GNodeType; label: string; color: string }> = [
  { key: "document", label: "Documents", color: "#60a5fa" },
  { key: "board", label: "Boards", color: "#c084fc" },
  { key: "card", label: "Cards", color: "#34d399" },
  { key: "mesh", label: "Meshes", color: "#f472b6" },
  { key: "meshBrick", label: "Mesh bricks", color: "#94a3b8" },
];
const EDGE_TYPES: Array<{ key: GEdgeType; label: string; color: string }> = [
  { key: "ref", label: "Reference pills", color: "#f87171" },
  { key: "portal", label: "Portals", color: "#fbbf24" },
  { key: "mirror", label: "Mirrors", color: "#22d3ee" },
  { key: "connection", label: "Connections", color: "#64748b" },
  { key: "similarity", label: "Similarity (2.0)", color: "#a78bfa" },
];

export default function GraphPage() {
  const router = useRouter();
  const { accessToken, activeTeamId } = useSession();
  const localWs = useLocalWorkspace();
  const localMode = localWs.mode === "local";

  const [entities, setEntities] = React.useState<EntityInput[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [mode, setMode] = React.useState<"clear" | "enhanced">("clear");
  const [includeMeshBricks, setIncludeMeshBricks] = React.useState(false);
  const [showLabels, setShowLabels] = React.useState(true);
  const [showMedia, setShowMedia] = React.useState(true);
  const [hiddenNodes, setHiddenNodes] = React.useState<Set<string>>(new Set(["meshBrick"]));
  const [hiddenEdges, setHiddenEdges] = React.useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [preview, setPreview] = React.useState<GNode | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setProgress({ done: 0, total: 0 });
    try {
      const onP = (done: number, total: number) => setProgress({ done, total });
      if (localMode) {
        const dir = localWs.getDir();
        if (!dir) { setEntities([]); return; }
        setEntities(await collectLocalEntities(localWs.files, (p) => localWs.readFile(p), onP));
      } else if (accessToken && activeTeamId) {
        setEntities(await collectOnlineEntities(activeTeamId, accessToken, onP));
      } else {
        setEntities([]);
      }
    } catch (err) {
      console.error("[graph] failed to collect entities", err);
      setEntities([]);
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMode, accessToken, activeTeamId, localWs.files, localWs.status]);

  React.useEffect(() => { void load(); }, [load]);

  // Base graph (refs/portals/mirrors/connections).
  const base = React.useMemo<GraphData>(() => buildGraph(entities || [], { includeMeshBricks }), [entities, includeMeshBricks]);
  // Enhanced edges (client-side tokenization) computed lazily for the enhanced mode.
  const enhanced = React.useMemo(() => (mode === "enhanced" ? enhanceEdges(base.nodes) : []), [mode, base.nodes]);

  const data = React.useMemo<GraphData>(() => {
    const edges0 = mode === "enhanced" ? [...base.edges, ...enhanced] : base.edges;
    const nodes = base.nodes.filter((n) => !hiddenNodes.has(n.type));
    const keep = new Set(nodes.map((n) => n.id));
    const edges = edges0.filter((e) => !hiddenEdges.has(e.type) && keep.has(e.source) && keep.has(e.target));
    return { nodes, edges };
  }, [base, enhanced, mode, hiddenNodes, hiddenEdges]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set); next.has(key) ? next.delete(key) : next.add(key); setter(next);
  };

  // Resolve thumbnails (via the global image cache) for nodes that have an image.
  const [imageUrls, setImageUrls] = React.useState<Map<string, string>>(new Map());
  React.useEffect(() => {
    if (!showMedia) { setImageUrls(new Map()); return; }
    let alive = true;
    const dir = localMode ? localWs.getDir() : null;
    const readAsset = dir ? (name: string) => readAssetFile(dir, name).catch(() => null) : undefined;
    (async () => {
      const map = new Map<string, string>();
      for (const n of data.nodes) {
        if (!n.image) continue;
        try { const u = await getImageUrl(n.image, readAsset); if (u) map.set(n.id, u); } catch { /* skip */ }
      }
      if (alive) setImageUrls(map);
    })();
    return () => { alive = false; };
  }, [data.nodes, showMedia, localMode, localWs]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0a0b]">
      {/* Canvas */}
      {loading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">{progress.total ? `Reading ${progress.done}/${progress.total}…` : "Building graph…"}</p>
        </div>
      ) : data.nodes.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Share2 className="h-8 w-8 opacity-40" />
          <p className="text-sm">No documents, boards or meshes to graph yet.</p>
        </div>
      ) : (
        <GraphCanvas data={data} showLabels={showLabels} showMedia={showMedia} imageUrls={imageUrls} onNodeClick={(n, o) => { if (o.redirect) { if (n.route) router.push(n.route); } else { setPreview(n); } }} />
      )}

      {/* Top-left: title + counts + interaction hint */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          <span className="font-semibold text-foreground">Graph</span>
          {!loading && <span>· {data.nodes.length} nodes · {data.edges.length} links</span>}
        </div>
        {!loading && data.nodes.length > 0 && <span className="text-[11px] text-muted-foreground/60">Click previews · Ctrl/Cmd-click opens</span>}
      </div>

      {/* Preview portal (plain click) — like a mesh portal peek into the node */}
      {preview && (
        <div className="absolute bottom-4 left-4 w-80 max-w-[calc(100%-2rem)] rounded-xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{preview.type}</div>
              <h3 className="truncate text-sm font-semibold text-foreground">{preview.label}</h3>
            </div>
            <button onClick={() => setPreview(null)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          {preview.text ? <p className="mt-2 max-h-32 overflow-y-auto text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">{preview.text.slice(0, 600)}</p> : null}
          {preview.route && (
            <button onClick={() => { router.push(preview.route!); }} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent/90 transition-colors">
              <ExternalLink className="h-4 w-4" /> Open
            </button>
          )}
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute right-4 top-4 flex items-start gap-2">
        <button onClick={() => void load()} title="Reload" className="rounded-lg border border-border/60 bg-card/80 p-2 text-muted-foreground hover:text-foreground hover:bg-card transition-colors backdrop-blur">
          <RefreshCw className="h-4 w-4" />
        </button>
        <button onClick={() => setPanelOpen((v) => !v)} title="Options" className={`rounded-lg border p-2 backdrop-blur transition-colors ${panelOpen ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 bg-card/80 text-muted-foreground hover:text-foreground"}`}>
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {/* Options panel */}
      {panelOpen && (
        <div className="absolute right-4 top-16 w-64 rounded-xl border border-border/60 bg-card/95 p-3 shadow-2xl backdrop-blur space-y-4 text-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mode</span>
            <button onClick={() => setPanelOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/20 p-1">
            <button onClick={() => setMode("clear")} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${mode === "clear" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Clear</button>
            <button onClick={() => setMode("enhanced")} className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${mode === "enhanced" ? "bg-accent/15 text-accent shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Sparkles className="h-3 w-3" /> Enhanced</button>
          </div>
          {mode === "enhanced" && <p className="text-[10px] leading-snug text-muted-foreground/80">On-device tokenization links related notes (TF-IDF cosine, smart-pruned). Runs locally, no upload.</p>}

          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nodes</span>
            {NODE_TYPES.map((nt) => (
              <label key={nt.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!hiddenNodes.has(nt.key)} onChange={() => toggle(hiddenNodes, nt.key, setHiddenNodes)} className="accent-accent" />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: nt.color }} />
                <span className="text-xs">{nt.label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Links</span>
            {EDGE_TYPES.filter((e) => e.key !== "similarity" || mode === "enhanced").map((et) => (
              <label key={et.key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!hiddenEdges.has(et.key)} onChange={() => toggle(hiddenEdges, et.key, setHiddenEdges)} className="accent-accent" />
                <span className="h-0.5 w-3 rounded" style={{ background: et.color }} />
                <span className="text-xs">{et.label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <label className="flex items-center justify-between cursor-pointer"><span className="text-xs">Labels</span><input type="checkbox" checked={showLabels} onChange={() => setShowLabels((v) => !v)} className="accent-accent" /></label>
            <label className="flex items-center justify-between cursor-pointer"><span className="text-xs">Media / draw indicator</span><input type="checkbox" checked={showMedia} onChange={() => setShowMedia((v) => !v)} className="accent-accent" /></label>
            <label className="flex items-center justify-between cursor-pointer"><span className="text-xs">Mesh bricks + connections</span><input type="checkbox" checked={includeMeshBricks} onChange={() => { setIncludeMeshBricks((v) => { const nv = !v; if (nv) setHiddenNodes((h) => { const n = new Set(h); n.delete("meshBrick"); return n; }); return nv; }); }} className="accent-accent" /></label>
          </div>
        </div>
      )}
    </div>
  );
}
