export type StrokeStyle = "solid" | "dashed" | "dotted";
export type EdgeStyle = "sharp" | "round";

export type MeshBrickStyle = {
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  opacity?: number;
  edges?: EdgeStyle;
};

export function asStyle(raw: unknown): MeshBrickStyle {
  return (raw && typeof raw === "object" ? raw : {}) as MeshBrickStyle;
}

export function dashArrayFor(strokeStyle: StrokeStyle | undefined, sw: number): string | undefined {
  const w = sw > 0 ? sw : 1;
  if (strokeStyle === "dashed") return `${(w * 3).toFixed(1)} ${(w * 2.5).toFixed(1)}`;
  if (strokeStyle === "dotted") return `${w.toFixed(1)} ${(w * 2).toFixed(1)}`;
  return undefined;
}

export function opacityFor(style: { opacity?: number } | undefined): number {
  const o = style?.opacity;
  if (typeof o !== "number" || Number.isNaN(o)) return 1;
  return Math.max(0, Math.min(1, o));
}

export function cornerRadiusFor(edges: EdgeStyle | undefined, base = 10): number {
  return edges === "sharp" ? 0 : base;
}
