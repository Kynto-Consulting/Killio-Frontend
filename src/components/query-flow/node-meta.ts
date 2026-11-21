import { ArrowUpDown, BarChart2, Columns3, RotateCw, Rows3, Code2, Copy, Database, Filter, GitMerge, Hash, Layers, Sigma, Sparkles, Table2, type LucideIcon } from "lucide-react";

import type { NodeType } from "@/lib/query-flow/types";

export interface NodeMeta {
  icon: LucideIcon;
  /** Header colour of the node: saturated, so white text is readable in light and dark themes. */
  header: string;
  /** Border / ring colour when selected. */
  ring: string;
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  source: { icon: Database, header: "bg-teal-700", ring: "border-teal-500" },
  filter: { icon: Filter, header: "bg-sky-700", ring: "border-sky-500" },
  transform: { icon: Sparkles, header: "bg-violet-700", ring: "border-violet-500" },
  join: { icon: GitMerge, header: "bg-indigo-700", ring: "border-indigo-500" },
  union: { icon: Layers, header: "bg-indigo-700", ring: "border-indigo-500" },
  unpivot: { icon: Rows3, header: "bg-indigo-700", ring: "border-indigo-500" },
  pivot: { icon: Columns3, header: "bg-amber-700", ring: "border-amber-500" },
  transpose: { icon: RotateCw, header: "bg-rose-700", ring: "border-rose-500" },
  group: { icon: Sigma, header: "bg-amber-700", ring: "border-amber-500" },
  select: { icon: Table2, header: "bg-emerald-700", ring: "border-emerald-500" },
  distinct: { icon: Copy, header: "bg-emerald-700", ring: "border-emerald-500" },
  sort: { icon: ArrowUpDown, header: "bg-rose-700", ring: "border-rose-500" },
  limit: { icon: Hash, header: "bg-rose-700", ring: "border-rose-500" },
  output: { icon: BarChart2, header: "bg-primary", ring: "border-primary" },
  advanced: { icon: Code2, header: "bg-slate-700", ring: "border-slate-500" },
};

/** Types that can be added from the palette (an Output and an Advanced step are added too, from their own buttons). */
export const PALETTE_TYPES: NodeType[] = ["source", "filter", "transform", "join", "union", "unpivot", "group", "pivot", "select", "distinct", "sort", "limit", "transpose", "output", "advanced"];
