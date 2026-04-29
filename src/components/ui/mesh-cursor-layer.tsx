"use client";

import type { RemoteCursor } from "@/hooks/useMeshCursors";

// SVG cursor icons keyed by tool mode
const CURSOR_SVGS: Record<string, (color: string) => React.ReactNode> = {
  select: (c) => (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
      <path d="M2 2l13 8-7 1.5L5 18z" fill={c} stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  pan: (c) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M8 3.5V9H6.5a1.5 1.5 0 000 3H7v1.5a1.5 1.5 0 003 0V13h1v1a1.5 1.5 0 003 0v-1h.5a1.5 1.5 0 000-3H14V7a1.5 1.5 0 00-3 0v2h-1V3.5a1.5 1.5 0 00-3 0z"
        fill={c} stroke="#000" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
  pen: (c) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M14.5 2.5l3 3-10 10H4.5v-3l10-10z" fill={c} stroke="#000" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12.5 4.5l3 3" stroke="#000" strokeWidth="1.1" />
    </svg>
  ),
  conn: (c) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="4" cy="10" r="3" fill={c} stroke="#000" strokeWidth="1.1" />
      <circle cx="16" cy="10" r="3" fill={c} stroke="#000" strokeWidth="1.1" />
      <path d="M7 10h6" stroke="#000" strokeWidth="1.5" strokeDasharray="2 1.5" />
      <path d="M2 4l2 2-2 2" stroke="#000" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
  vec: (c) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 16L9 4l3 8 2-3 2 7" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4" cy="16" r="2" fill={c} stroke="#000" strokeWidth="1.1" />
      <circle cx="9" cy="4" r="2" fill={c} stroke="#000" strokeWidth="1.1" />
    </svg>
  ),
};

function getCursorIcon(tool: string, color: string): React.ReactNode {
  const fn = CURSOR_SVGS[tool] ?? CURSOR_SVGS.select;
  return fn(color);
}

type Props = {
  cursors: RemoteCursor[];
  viewport: { x: number; y: number; zoom: number };
};

export function MeshCursorLayer({ cursors, viewport }: Props) {
  if (cursors.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {cursors.map((cursor) => {
        const sx = cursor.x * viewport.zoom + viewport.x;
        const sy = cursor.y * viewport.zoom + viewport.y;
        return (
          <div
            key={cursor.clientId}
            className="absolute"
            style={{ left: sx, top: sy, transform: "translate(0, 0)" }}
          >
            {/* Cursor icon */}
            <div style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}>
              {getCursorIcon(cursor.tool, cursor.color)}
            </div>
            {/* Name label */}
            <div
              className="ml-4 -mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-black shadow-md"
              style={{ background: cursor.color, marginTop: -4, marginLeft: 14 }}
            >
              {cursor.displayName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
