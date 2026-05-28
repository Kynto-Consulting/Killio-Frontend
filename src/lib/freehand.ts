import { getStroke } from "perfect-freehand";

export type InkPoint = { x: number; y: number; t?: number } | [number, number] | number[];

const STROKE_OPTIONS = {
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
  last: true,
};

function toTuple(p: InkPoint): [number, number] {
  if (Array.isArray(p)) return [p[0] ?? 0, p[1] ?? 0];
  return [p.x, p.y];
}

/**
 * Convert a perfect-freehand outline (closed polygon of points) into an SVG
 * path `d` string with quadratic smoothing between vertices. Pure + testable.
 */
export function outlineToSvgPath(outline: number[][]): string {
  const len = outline.length;
  if (len < 2) return "";
  let d = `M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)} Q`;
  for (let i = 0; i < len; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % len];
    const mx = ((x0 + x1) / 2).toFixed(2);
    const my = ((y0 + y1) / 2).toFixed(2);
    d += ` ${x0.toFixed(2)} ${y0.toFixed(2)} ${mx} ${my}`;
  }
  return d + " Z";
}

/**
 * Build a filled SVG path for a freehand stroke. `size` is the nominal pen
 * width in the same coordinate space as the points (already scaled to pixels).
 */
export function strokeToFilledPath(points: InkPoint[], size: number): string {
  if (!points.length) return "";
  const tuples = points.map(toTuple);
  const outline = getStroke(tuples, { ...STROKE_OPTIONS, size: Math.max(1, size) });
  return outlineToSvgPath(outline as number[][]);
}
