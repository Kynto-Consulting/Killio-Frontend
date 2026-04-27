# Mesh Board Refinement - Implementation Changes

## PHASE 1-4: Changes Required

### 1. `src/lib/api/contracts.ts` - Add buildMeshAiContext helper

**Location**: After line 1328 (after normalizeMeshState function)

**Add**:
```typescript
export function buildMeshAiContext(state: MeshState): string {
  const brickCount = Object.keys(state.bricksById).length;
  const connCount = Object.keys(state.connectionsById).length;
  const textBricks = Object.values(state.bricksById)
    .filter((b) => b.kind === "text")
    .map((b) => typeof b.content?.content === "string" ? b.content.content.slice(0, 50) : "")
    .filter((t) => t.length > 0)
    .slice(0, 5)
    .join("; ");
  return `Mesh: ${brickCount} bricks, ${connCount} conexiones. Textos: ${textBricks || "(vacío)"}`;
}
```

---

### 2. `src/app/(dashboard)/m/[meshId]/page.tsx` - Multiple Changes

#### CHANGE A: Add imports at top (after existing imports)
```typescript
import { PenToolbar } from "@/components/ui/pen-toolbar";
import { buildMeshAiContext } from "@/lib/api/contracts";
```

#### CHANGE B: Extend pen state variables (line ~688)
**Find**:
```typescript
// pen state
const [penStrokes,    setPenStrokes]    = useState<PenStroke[]>([]);
const [activePen,     setActivePen]     = useState<PenPoint[] | null>(null);
const [recognizing,   setRecognizing]   = useState(false);
```

**Replace with**:
```typescript
// pen state
const [penStrokes,    setPenStrokes]    = useState<PenStroke[]>([]);
const [activePen,     setActivePen]     = useState<PenPoint[] | null>(null);
const [recognizing,   setRecognizing]   = useState(false);
const [penColor, setPenColor] = useState<string>(() => localStorage.getItem("mesh:pen:color") ?? "#000000");
const [penStrokeWidth, setPenStrokeWidth] = useState<number>(() => parseFloat(localStorage.getItem("mesh:pen:width") ?? "2"));
```

#### CHANGE C: Add localStorage persistence effect (after state declarations, line ~710)
```typescript
// Persist pen settings
useEffect(() => {
  localStorage.setItem("mesh:pen:color", penColor);
  localStorage.setItem("mesh:pen:width", penStrokeWidth.toString());
}, [penColor, penStrokeWidth]);
```

#### CHANGE D: Extract userId from session (line ~654, with destructuring)
**Find**:
```typescript
const { accessToken, activeTeamId } = useSession();
```

**Replace with**:
```typescript
const { accessToken, activeTeamId, userId } = useSession();
```

#### CHANGE E: Create MESH_RICH_TEXT_CONTEXT (line ~1095, before render)
**Find**:
```typescript
const gPos = useCallback((id: string) => resolveGlobal(state.bricksById, id), [state.bricksById]);
```

**Add after**:
```typescript
const MESH_CONTEXT = useMemo<ResolverContext>(() => ({
  type: "mesh",
  meshBoardId: meshId ?? "",
  userId: userId ?? "",
}), [meshId, userId]);

const meshAiContext = useMemo(() => buildMeshAiContext(state), [state]);
```

#### CHANGE F: Update UnifiedTextBrick props (line ~1430)
**Find**:
```typescript
<UnifiedTextBrick
  brick={brick}
  editorKey={editingBrickId === brick.id ? "active" : "inactive"}
  readonly={editingBrickId !== brick.id}
  onUpdate={handleUnifierUpdate}
  richTextContext={MESH_RICH_TEXT_CONTEXT}
  Portal={Portal}
/>
```

**Replace with**:
```typescript
<UnifiedTextBrick
  brick={brick}
  editorKey={editingBrickId === brick.id ? "active" : "inactive"}
  readonly={editingBrickId !== brick.id}
  onUpdate={handleUnifierUpdate}
  richTextContext={MESH_CONTEXT}
  Portal={Portal}
/>
```

#### CHANGE G: Fix draw brick fill (line ~1470)
**Find**:
```typescript
const shapeFill = isDrawBrick ? "transparent" : sFill;
```

**Replace with**:
```typescript
const shapeFill = isDrawBrick ? "rgba(0,0,0,0)" : sFill;
```

#### CHANGE H: Apply pen color/width to strokes (line ~1075 in onMouseUp setTimeout)
**Find** (in the stroke batch creation):
```typescript
const normalizedBatch = strokes.map((s) =>
  s.points.map((p) => ({
    x: +Math.max(0, Math.min(1, (p.x - g.x) / Math.max(b.size.w, 1))).toFixed(4),
    y: +Math.max(0, Math.min(1, (p.y - g.y) / Math.max(b.size.h, 1))).toFixed(4),
  }))
);
```

**Replace entire setState call with**:
```typescript
setState((cur) => {
  const b = cur.bricksById[rawDrawTarget.id];
  if (!b) return cur;
  const c = asRec(b.content);
  const current = Array.isArray(c.manualStrokes) ? [...(c.manualStrokes as unknown[])] : [];
  const g = resolveGlobal(cur.bricksById, b.id);
  const normalizedBatch = strokes.map((s) =>
    s.points.map((p) => ({
      x: +Math.max(0, Math.min(1, (p.x - g.x) / Math.max(b.size.w, 1))).toFixed(4),
      y: +Math.max(0, Math.min(1, (p.y - g.y) / Math.max(b.size.h, 1))).toFixed(4),
    }))
  );
  // NEW: Add pen properties to strokes
  const batchWithPen = normalizedBatch.map((stroke) => ({
    stroke,
    color: penColor,
    width: penStrokeWidth,
  }));
  return {
    ...cur,
    bricksById: {
      ...cur.bricksById,
      [b.id]: { ...b, content: { ...c, manualStrokes: [...current, ...batchWithPen] } },
    },
  };
});
```

#### CHANGE I: Apply pen settings to created shapes (line ~1115 after iink recognition)
**Find**:
```typescript
if (mapped) {
  const sz = primaryShape?.bbox
    ? { w: Math.max(mapped.meshKind === "board_empty" ? 240 : 150, primaryShape.bbox.w),
        h: Math.max(mapped.meshKind === "board_empty" ? 160 : 110, primaryShape.bbox.h) }
    : undefined;
  nb = mkBrick(mapped.meshKind, Object.keys(cur.bricksById).length, parentId, pos, mapped.preset);
  if (sz) nb = { ...nb, size: sz };
}
```

**Replace with**:
```typescript
if (mapped) {
  const sz = primaryShape?.bbox
    ? { w: Math.max(mapped.meshKind === "board_empty" ? 240 : 150, primaryShape.bbox.w),
        h: Math.max(mapped.meshKind === "board_empty" ? 160 : 110, primaryShape.bbox.h) }
    : undefined;
  nb = mkBrick(mapped.meshKind, Object.keys(cur.bricksById).length, parentId, pos, mapped.preset);
  if (sz) nb = { ...nb, size: sz };
  // NEW: Apply pen color/width to shape
  nb = {
    ...nb,
    content: {
      ...nb.content,
      strokeColor: penColor,
      strokeWidth: penStrokeWidth,
    }
  };
}
```

#### CHANGE J: Apply pen settings to created text (line ~1120)
**Find**:
```typescript
} else {
  nb = setMd(mkBrick("text", Object.keys(cur.bricksById).length, parentId, pos), text!.trim());
}
```

**Replace with**:
```typescript
} else {
  // NEW: Prepend pen size/color tokens to text
  const baseText = text!.trim();
  const textWithTokens = `[size:${penStrokeWidth}rem][color:${penColor}]${baseText}`;
  nb = setMd(mkBrick("text", Object.keys(cur.bricksById).length, parentId, pos), textWithTokens);
}
```

#### CHANGE K: Add Pen Toolbar in JSX render (line ~2000, before canvas)
**Find** (the main canvas div render):
```typescript
<div
  ref={canvasRef}
  className="...canvas classes..."
  onMouseDown={onMouseDown}
  onMouseMove={onMouseMove}
  onMouseUp={onMouseUp}
>
```

**Add BEFORE this div**:
```typescript
{/* Pen Toolbar - Phase 4 */}
<PenToolbar
  color={penColor}
  strokeWidth={penStrokeWidth}
  onColorChange={setPenColor}
  onStrokeWidthChange={setPenStrokeWidth}
/>

{/* Chat Drawer Toggle - Phase 2 */}
<button
  onClick={() => {/* TODO: Integrate with useBoardChatDrawer */}}
  className="absolute top-4 right-4 z-50 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg shadow-md text-sm font-semibold"
  title="Open AI Chat"
>
  💬 Chat
</button>
```

#### CHANGE L: Update strokeToPath function signature (helper function, line ~1000)
**Find**:
```typescript
function strokeToPath(stroke: PenPoint[]): string {
  if (stroke.length < 2) return "";
  let d = `M ${stroke[0].x} ${stroke[0].y}`;
  for (let i = 1; i < stroke.length; i++) {
    d += ` L ${stroke[i].x} ${stroke[i].y}`;
  }
  return d;
}
```

**Replace with**:
```typescript
function strokeToPath(stroke: PenPoint[] | { stroke: PenPoint[]; color?: string; width?: number }): string {
  const points = Array.isArray(stroke) ? stroke : stroke.stroke;
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}
```

#### CHANGE M: Render pen preview strokes with colors (line ~1550 in canvas)
**Find**:
```typescript
{penStrokes.map((s, i) => (
  <path key={`pending-${i}`} d={strokeToPath(s)} stroke="#666" strokeWidth={2} fill="none" />
))}
```

**Replace with**:
```typescript
{penStrokes.map((s, i) => {
  const isEnhanced = typeof s === 'object' && 'color' in s;
  const color = isEnhanced ? (s as any).color : penColor;
  const width = isEnhanced ? (s as any).width : penStrokeWidth;
  return (
    <path 
      key={`pending-${i}`} 
      d={strokeToPath(s)} 
      stroke={color} 
      strokeWidth={width} 
      fill="none" 
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
})}
```

---

## Summary of Changes

| Phase | Component | What Changed | Lines |
|-------|-----------|--------------|-------|
| 1 | contracts.ts | Added `buildMeshAiContext` | +10 |
| 1 | mesh page | Fixed MESH_RICH_TEXT_CONTEXT | ~1430 |
| 2 | mesh page | Added AI context builder | ~810 |
| 2 | mesh page | Added chat toggle button | ~2000 |
| 3 | mesh page | Fixed draw brick transparency | ~1470 |
| 4 | mesh page | Added pen color/width state | ~690 |
| 4 | mesh page | Added pen toolbar render | ~2000 |
| 4 | mesh page | Applied pen to strokes | ~1075 |
| 4 | mesh page | Applied pen to shapes | ~1115 |
| 4 | mesh page | Applied pen to text | ~1120 |
| 4 | mesh page | Updated strokeToPath signature | ~1000 |
| 4 | mesh page | Render strokes with pen colors | ~1550 |
| - | New | Created PenToolbar component | - |

**Total files modified**: 3 (contracts.ts, mesh page, pen-toolbar.tsx)  
**New components**: 1 (PenToolbar)  
**All changes**: Frontend only, no backend changes needed
