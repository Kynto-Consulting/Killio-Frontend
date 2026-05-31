"use client";

// ─── Mesh Board – Miro/Excalidraw-style canvas ────────────────────────────────
// Modes: select · pan · pen (iinkTS → bricks)
// Features: inline editing, delete, diamond-decision, board-relative children,
//   reparent drag-drop, resize, vector edit, connections, realtime (Ably).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle, BarChart2, CheckSquare, ChevronDown, ChevronRight, ChevronUp, ChevronsDown, ChevronsUp, Code2,
  Bot, Copy, Edit3, ExternalLink, Eye, FileText, Film, GitBranch, Hand, History,
  Download, Image, Layers, LayoutGrid, LayoutTemplate, Link2, Loader2, MessageSquare,
  Minus, MoreHorizontal, MousePointer, Palette, Pencil, Save, Send, Sparkles, Square, Star, Trash2, Type, Wand2, X,
  Share2, ZoomIn, ZoomOut, Grid3X3, Maximize2, Settings2, Upload, Check, HardDrive,
} from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { UnifiedBrickRenderer } from "@/components/bricks/brick-renderer";
import { UnifiedTextBrick } from "@/components/bricks/unified-text-brick";
import { RichText } from "@/components/ui/rich-text";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import { useBoardPresence } from "@/hooks/useBoardPresence";
import { DocumentBrick } from "@/lib/api/documents";
import type { ResolverContext } from "@/lib/reference-resolver";
import { EntitySelectorModal, type EntitySelectorResult } from "@/components/ui/entity-selector-modal";
import { PenToolbar } from "@/components/ui/pen-toolbar";
import { BoardChatDrawer } from "@/components/ui/board-chat-drawer";
import { AgentChatPanel } from "@/components/agent";
import { MeshShareModal } from "@/components/ui/mesh-share-modal";
import { BoardSettingsModal } from "@/components/ui/board-settings-modal";
import { updateBoardDetails, updateBoardAppearance, generateMeshWithAi, type GeneratedMesh } from "@/lib/api/contracts";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { dashArrayFor, opacityFor, cornerRadiusFor, type StrokeStyle, type EdgeStyle } from "@/lib/mesh-style";
import { useOpHistory } from "@/lib/history/use-op-history";
import { computeMeshDelta, makeMeshApplier } from "@/lib/history/mesh-ops";
import type { OpScope } from "@/lib/history/types";
import { strokeToFilledPath } from "@/lib/freehand";
import { parseMermaidToMesh } from "@/lib/mermaid-mesh";
import { parseGrarkdownToMesh, isGrarkdown } from "@/lib/grarkdown-mesh";
import { parseExcalidrawToTemplate, extractExcalidrawSceneFromPng, excalidrawSceneFromText } from "@/lib/excalidraw-mesh";
import { templateToMeshState } from "@/lib/mesh-import";
import { PublicMeshCanvas } from "@/components/ui/public-mesh-canvas";
import { ChartGlyph } from "@/components/ui/chart-glyph";
import { ChartBrickRender, ChartBrickEditor, defaultChartSpec, CHART_PALETTE as CHART_PALETTE_NEW, type ChartSpec, type ChartType } from "@/components/ui/chart-brick";
import { captureTemplate, instantiateTemplate, loadUserTemplates, persistUserTemplates, type MeshTemplate } from "@/lib/mesh-templates";
import { TEMPLATE_CATALOG, TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/mesh-templates-catalog";
import { MeshTemplateThumb } from "@/components/ui/mesh-template-thumb";
import { reorderInList, type ZOrderOp } from "@/lib/z-order";
import { serializeMeshToKm, deserializeKmToMesh } from "@/lib/mesh-file";
import { logLocalActivity } from "@/lib/local-workspace/local-activity";
import { localPickerContext } from "@/lib/local-workspace/local-references";
import { makeEnvelope, writeBricksToClipboard, writeBricksToDataTransfer, ensureClipboardChannel, type ClipboardBrick } from "@/lib/clipboard/brick-clipboard";
import { bricksToMarkdown, bricksToHtml } from "@/lib/clipboard/brick-serialize";
import { bricksFromClipboardEvent, bricksFromDataTransfer } from "@/lib/clipboard/brick-deserialize";
import { PublishLocalModal } from "@/components/ui/publish-local-modal";
import { publishLocalMesh } from "@/lib/local-workspace/publish-local";
import { readAssetFile } from "@/lib/local-workspace/assets";
import { downloadKillioFile, readKillioFile, killioFilename, KILLIO_EXT, encodeKillioFile, decodeKillioFile } from "@/lib/killio-file";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { useOnline } from "@/hooks/use-online";
import { readWorkspaceFileWithMeta, writeWorkspaceFile } from "@/lib/local-workspace/fs-access";
import {
  MeshBrick, MeshBrickKind, MeshConnection, MeshState,
  getBoard, getMesh, updateMeshState, deleteBoard,
} from "@/lib/api/contracts";
import { useRealtime } from "@/components/providers/realtime-provider";
import { realtimeChannel } from "@/lib/realtime/channels";
import { getDocument } from "@/lib/api/documents";
import { toast } from "@/lib/toast";
import { useMeshCursors } from "@/hooks/useMeshCursors";
import { useMeshLocks } from "@/hooks/useMeshLocks";
import { MeshCursorLayer } from "@/components/ui/mesh-cursor-layer";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────

type ToolMode = "select" | "pan" | "pen" | "conn" | "vec";
type Port = "top" | "right" | "bottom" | "left";

type ShapePreset =
  | "rect" | "rounded-rect" | "circle" | "ellipse" | "diamond"
  | "triangle" | "hexagon" | "star" | "arrow" | "note" | "frame-vector" | "flow-terminator"
  | "parallelogram" | "cylinder" | "cross" | "chevron" | "pentagon"
  // Basic geometric
  | "trapezoid" | "trapezoid-inv" | "octagon" | "stadium" | "half-circle" | "bevel"
  | "triangle-rt" | "diamond-wide" | "kite" | "wedge"
  // Flow / diagramming
  | "hexagon-v" | "parallelogram-rev" | "prep-hex" | "data-io" | "off-page" | "collate"
  | "predefined-process" | "manual-input" | "delay-shape"
  // Arrows
  | "arrow-left" | "arrow-up" | "arrow-down" | "double-arrow-h" | "double-arrow-v"
  // Figures & symbols
  | "heart" | "shield" | "lightning" | "house" | "cloud" | "star-6" | "star-4" | "star-8"
  | "starburst" | "cross-x" | "tag" | "ribbon" | "callout" | "banner" | "gem"
  | "location-pin" | "thought-bubble"
  // Frames & containers
  | "bracket-left" | "bracket-right";

type ConnStyle = "technical" | "dashed" | "handdrawn" | "bezier" | "curved";

type DragState    = { brickId: string; startMouse: { x: number; y: number }; startPosition: { x: number; y: number }; originalParentId: string | null; group?: { id: string; start: { x: number; y: number } }[] };
type ResizeState  = { brickId: string; startMouse: { x: number; y: number }; startSize: { w: number; h: number } };
type VecDragState = { brickId: string; pointIndex: number; startMouse: { x: number; y: number } };
type PanDragState = { startMouse: { x: number; y: number }; startViewport: { x: number; y: number } };
type PinchGestureState = {
  startDistance: number;
  startViewport: { x: number; y: number; zoom: number };
  centerScreen: { x: number; y: number };
};
type PenPoint     = { x: number; y: number; t: number };
type PenStroke    = { points: PenPoint[]; color?: string; width?: number };

type MetaEntry = { kind: MeshBrickKind; label: string; unifierKind?: string; icon: React.ReactNode };

// ─── Toolbar config ───────────────────────────────────────────────────────────

const BASIC_BRICKS: MetaEntry[] = [
  { kind: "board_empty", label: "Board",   icon: <LayoutGrid className="h-4 w-4" /> },
  { kind: "text",        label: "Text",    icon: <Type       className="h-4 w-4" /> },
  { kind: "portal",      label: "Portal",  icon: <Link2      className="h-4 w-4" /> },
  { kind: "mirror",      label: "Mirror",  icon: <Copy       className="h-4 w-4" /> },
  { kind: "draw",        label: "Draw",    icon: <Pencil     className="h-4 w-4" /> },
  { kind: "script",      label: "Script",  icon: <Code2      className="h-4 w-4" /> },
];

const CONTENT_BRICKS: MetaEntry[] = [
  { kind: "portal",  label: "Doc",      unifierKind: "text",      icon: <FileText      className="h-4 w-4" /> },
  { kind: "portal",  label: "Gráfico",  unifierKind: "graph",     icon: <BarChart2     className="h-4 w-4" /> },
  { kind: "portal",  label: "Media",    unifierKind: "media",     icon: <Film          className="h-4 w-4" /> },
  { kind: "portal",  label: "Imagen",   unifierKind: "image",     icon: <Image         className="h-4 w-4" /> },
  { kind: "portal",  label: "Tabla",    unifierKind: "table",     icon: <MessageSquare className="h-4 w-4" /> },
  { kind: "portal",  label: "Lista",    unifierKind: "checklist", icon: <CheckSquare   className="h-4 w-4" /> },
  { kind: "portal",  label: "Cita",     unifierKind: "quote",     icon: <MessageSquare className="h-4 w-4" /> },
  { kind: "portal",  label: "Callout",  unifierKind: "callout",   icon: <AlertTriangle className="h-4 w-4" /> },
  { kind: "mirror",  label: "Acordeón", unifierKind: "accordion", icon: <ChevronDown   className="h-4 w-4" /> },
  { kind: "mirror",  label: "Tabs",     unifierKind: "tabs",      icon: <Layers        className="h-4 w-4" /> },
  { kind: "mirror",  label: "Columnas", unifierKind: "columns",   icon: <Copy          className="h-4 w-4" /> },
  { kind: "mirror",  label: "Card",     unifierKind: "callout",   icon: <Copy          className="h-4 w-4" /> },
  { kind: "portal",  label: "Divider",  unifierKind: "divider",   icon: <Minus         className="h-4 w-4" /> },
];

type ShapeCategory = { label: string; icon: React.ReactNode; shapes: { preset: ShapePreset; label: string }[] };
const SHAPE_CATEGORIES: ShapeCategory[] = [
  {
    label: "Básicas", icon: <Square className="h-3 w-3" />,
    shapes: [
      { preset: "rect",          label: "Rect"     },
      { preset: "rounded-rect",  label: "Round"    },
      { preset: "circle",        label: "Círculo"  },
      { preset: "ellipse",       label: "Elipse"   },
      { preset: "triangle",      label: "Triáng"   },
      { preset: "triangle-rt",   label: "Tri-rect" },
      { preset: "trapezoid",     label: "Trapecio" },
      { preset: "trapezoid-inv", label: "Trap-inv" },
      { preset: "octagon",       label: "Octágono" },
      { preset: "bevel",         label: "Bisel"    },
      { preset: "diamond-wide",  label: "Rombo"    },
      { preset: "stadium",       label: "Cápsula"  },
      { preset: "half-circle",   label: "Semicírc" },
      { preset: "kite",          label: "Cometa"   },
      { preset: "wedge",         label: "Cuña"     },
      { preset: "gem",           label: "Gema"     },
    ],
  },
  {
    label: "Flujo", icon: <GitBranch className="h-3 w-3" />,
    shapes: [
      { preset: "diamond",            label: "Decisión"  },
      { preset: "parallelogram",      label: "E/S Datos" },
      { preset: "parallelogram-rev",  label: "E/S Rev"   },
      { preset: "flow-terminator",    label: "Terminar"  },
      { preset: "hexagon",            label: "Preparar"  },
      { preset: "hexagon-v",          label: "Hex-V"     },
      { preset: "pentagon",           label: "Paso"      },
      { preset: "prep-hex",           label: "Elongado"  },
      { preset: "data-io",            label: "Datos IO"  },
      { preset: "off-page",           label: "Off-Page"  },
      { preset: "collate",            label: "Colar"     },
      { preset: "predefined-process", label: "Subproc"   },
      { preset: "manual-input",       label: "Manual"    },
      { preset: "delay-shape",        label: "Demora"    },
    ],
  },
  {
    label: "Figuras", icon: <Star className="h-3 w-3" />,
    shapes: [
      { preset: "star",      label: "Estrella" },
      { preset: "star-6",    label: "Hexagr"   },
      { preset: "star-4",    label: "Destello" },
      { preset: "star-8",    label: "Octogr"   },
      { preset: "starburst", label: "Rafaga"   },
      { preset: "cross",     label: "Cruz"     },
      { preset: "cross-x",   label: "X Mark"   },
      { preset: "heart",     label: "Corazón"  },
      { preset: "shield",    label: "Escudo"   },
      { preset: "lightning", label: "Rayo"     },
      { preset: "house",     label: "Casa"     },
      { preset: "cloud",     label: "Nube"     },
      { preset: "tag",       label: "Etiqueta" },
      { preset: "ribbon",    label: "Cinta"    },
      { preset: "banner",    label: "Banner"   },
      { preset: "location-pin", label: "Pin"   },
    ],
  },
  {
    label: "Flechas", icon: <ChevronRight className="h-3 w-3" />,
    shapes: [
      { preset: "arrow",          label: "→ Derecha" },
      { preset: "arrow-left",     label: "← Izq"     },
      { preset: "arrow-up",       label: "↑ Arriba"  },
      { preset: "arrow-down",     label: "↓ Abajo"   },
      { preset: "double-arrow-h", label: "↔ Horiz"   },
      { preset: "double-arrow-v", label: "↕ Vert"    },
      { preset: "chevron",        label: "Chevron"   },
    ],
  },
  {
    label: "Globos", icon: <MessageSquare className="h-3 w-3" />,
    shapes: [
      { preset: "callout",       label: "Globo rect" },
      { preset: "thought-bubble", label: "Pensam"    },
      { preset: "bracket-left",  label: "[ Bracket"  },
      { preset: "bracket-right", label: "] Bracket"  },
    ],
  },
  {
    label: "Marcos", icon: <FileText className="h-3 w-3" />,
    shapes: [
      { preset: "note",         label: "Nota"   },
      { preset: "frame-vector", label: "Marco"  },
      { preset: "cylinder",     label: "BD"     },
    ],
  },
];
const SHAPES = SHAPE_CATEGORIES.flatMap((c) => c.shapes);

// Chart metabrick palette + spec defaults come from chart-brick.tsx. Inserting
// one creates a draw brick whose content.chart is a typed spec object (NOT a
// Mermaid string) — edited via a structured UI in the style panel.
const CHART_PALETTE = CHART_PALETTE_NEW;

// ─── Custom cursors ──────────────────────────────────────────────────────────
// Double-layer SVG: dark thick stroke behind + white/accent stroke in front
// gives contrast on both light and dark backgrounds.

function svgCursor(svg: string, hx: number, hy: number): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, auto`;
}

const CURSOR = {
  // Arrow pointer (select mode)
  select: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="20" viewBox="0 0 16 20">
      <path d="M2 1.5v15.5l3.2-3.8 2.8 6 2.2-1-2.8-6H15Z" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round" fill="#0f172a"/>
      <path d="M2 1.5v15.5l3.2-3.8 2.8 6 2.2-1-2.8-6H15Z" stroke="white" stroke-width="1" stroke-linejoin="round" fill="white"/>
    </svg>`, 2, 1
  ),
  // Open hand (pan mode)
  grab: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <g stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" fill="none">
        <path d="M8 10V5a1.5 1.5 0 0 1 3 0v5M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V11M8 10V8.5a1.5 1.5 0 0 0-3 0V13c0 3.5 2.5 6 5.5 6s5.5-2.5 5.5-6V11"/>
      </g>
      <g stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none">
        <path d="M8 10V5a1.5 1.5 0 0 1 3 0v5M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V11M8 10V8.5a1.5 1.5 0 0 0-3 0V13c0 3.5 2.5 6 5.5 6s5.5-2.5 5.5-6V11"/>
      </g>
    </svg>`, 10, 4
  ),
  // Closed fist (mid-drag)
  grabbing: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <g stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" fill="none">
        <path d="M7 12.5V9.5a1.5 1.5 0 0 1 3 0M10 9.5V8.5a1.5 1.5 0 0 1 3 0v1M13 9.5V9a1.5 1.5 0 0 1 3 0V10.5M7 12.5v-1a1.5 1.5 0 0 0-3 0V14c0 3.5 2.5 6 5.5 6s5.5-2.5 5.5-6v-3.5"/>
      </g>
      <g stroke="white" stroke-width="1.5" stroke-linecap="round" fill="none">
        <path d="M7 12.5V9.5a1.5 1.5 0 0 1 3 0M10 9.5V8.5a1.5 1.5 0 0 1 3 0v1M13 9.5V9a1.5 1.5 0 0 1 3 0V10.5M7 12.5v-1a1.5 1.5 0 0 0-3 0V14c0 3.5 2.5 6 5.5 6s5.5-2.5 5.5-6v-3.5"/>
      </g>
    </svg>`, 10, 11
  ),
  // Pencil at 45° angle (pen/draw mode) — tip at bottom-left
  pen: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <path d="M3 19L6 12L17.5 1L21 5L9.5 16Z" stroke="#0f172a" stroke-width="2" stroke-linejoin="round" fill="#0f172a"/>
      <path d="M3 19L6 12L9.5 16Z" stroke="#0f172a" stroke-width="2" stroke-linejoin="round" fill="#334155"/>
      <path d="M3 19L6 12L17.5 1L21 5L9.5 16Z" stroke="white" stroke-width="1" stroke-linejoin="round" fill="white"/>
      <path d="M3 19L6 12L9.5 16Z" stroke="white" stroke-width="0.5" stroke-linejoin="round" fill="#94a3b8"/>
      <line x1="15" y1="3.5" x2="19" y2="7.5" stroke="white" stroke-width="0.75"/>
    </svg>`, 3, 19
  ),
  // Cyan crosshair with center dot (connector mode)
  conn: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="4" fill="none" stroke="#0f172a" stroke-width="3"/>
      <line x1="11" y1="1" x2="11" y2="6" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="11" y1="16" x2="11" y2="21" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="1" y1="11" x2="6" y2="11" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="16" y1="11" x2="21" y2="11" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="11" cy="11" r="4" fill="none" stroke="#22d3ee" stroke-width="1.5"/>
      <line x1="11" y1="1" x2="11" y2="6" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="11" y1="16" x2="11" y2="21" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="1" y1="11" x2="6" y2="11" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="16" y1="11" x2="21" y2="11" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="11" cy="11" r="1.8" fill="#22d3ee"/>
    </svg>`, 11, 11
  ),
  // Arrow with cyan bezier node dot (vec/edit mode)
  vec: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <path d="M2.5 19L8 3L17.5 17.5H12L9 10Z" stroke="#0f172a" stroke-width="2.2" stroke-linejoin="round" fill="#0f172a"/>
      <path d="M2.5 19L8 3L17.5 17.5H12L9 10Z" stroke="white" stroke-width="1" stroke-linejoin="round" fill="white"/>
      <circle cx="8" cy="3" r="2.2" fill="#22d3ee" stroke="#0f172a" stroke-width="1"/>
    </svg>`, 8, 3
  ),
  // Crosshair without dot (selection rect / eraser)
  crosshair: svgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="4" fill="none" stroke="#0f172a" stroke-width="3"/>
      <line x1="11" y1="1" x2="11" y2="6" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="11" y1="16" x2="11" y2="21" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="1" y1="11" x2="6" y2="11" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <line x1="16" y1="11" x2="21" y2="11" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="11" cy="11" r="4" fill="none" stroke="white" stroke-width="1.5"/>
      <line x1="11" y1="1" x2="11" y2="6" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="11" y1="16" x2="11" y2="21" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="1" y1="11" x2="6" y2="11" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="16" y1="11" x2="21" y2="11" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`, 11, 11
  ),
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const BRICK_SIZE: Record<MeshBrickKind, { w: number; h: number }> = {
  board_empty: { w: 520, h: 340 },
  text:        { w: 200, h: 90  },
  frame:       { w: 260, h: 180 },
  script:      { w: 240, h: 140 },
  mirror:      { w: 220, h: 140 },
  portal:      { w: 220, h: 160 },
  decision:    { w: 150, h: 110 },
  draw:        { w: 160, h: 120 },
};

const BRICK_MIN: Partial<Record<MeshBrickKind, { w: number; h: number }>> = {
  board_empty: { w: 200, h: 140 },
  text:        { w: 100, h: 40  },
  frame:       { w: 80,  h: 60  },
  draw:        { w: 60,  h: 40  },
  decision:    { w: 70,  h: 50  },
  portal:      { w: 100, h: 60  },
  mirror:      { w: 100, h: 60  },
  script:      { w: 100, h: 60  },
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function mkId(prefix: string) {
  return typeof crypto?.randomUUID === "function"
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`;
}

function asRec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function resolveGlobal(by: Record<string, MeshBrick>, id: string): { x: number; y: number } {
  const b = by[id];
  if (!b) return { x: 0, y: 0 };
  if (!b.parentId) return { x: b.position.x, y: b.position.y };
  const p = resolveGlobal(by, b.parentId);
  return { x: p.x + b.position.x, y: p.y + b.position.y };
}

function isDesc(by: Record<string, MeshBrick>, ancId: string, id: string): boolean {
  let cur = by[id];
  while (cur?.parentId) {
    if (cur.parentId === ancId) return true;
    cur = by[cur.parentId];
  }
  return false;
}

function isContainer(b: MeshBrick): boolean {
  return b.kind === "board_empty" || !!asRec(b.content).isContainer;
}

function boardAt(by: Record<string, MeshBrick>, x: number, y: number, excl: string): MeshBrick | null {
  const boards = Object.values(by).filter(
    (b) => isContainer(b) && b.id !== excl && !isDesc(by, excl, b.id),
  );
  for (let i = boards.length - 1; i >= 0; i--) {
    const g = resolveGlobal(by, boards[i].id);
    if (x >= g.x && x <= g.x + boards[i].size.w && y >= g.y && y <= g.y + boards[i].size.h)
      return boards[i];
  }
  return null;
}

function childOrder(b: MeshBrick): string[] {
  const co = asRec(b.content).childOrder;
  return Array.isArray(co) ? (co as string[]).filter((v) => typeof v === "string") : [];
}

function withChildOrder(b: MeshBrick, order: string[]): MeshBrick {
  return { ...b, content: { ...asRec(b.content), childOrder: order, isContainer: true } };
}

function getMd(b: MeshBrick): string {
  const md = asRec(b.content).markdown;
  return typeof md === "string" ? md : "";
}

function setMd(b: MeshBrick, md: string): MeshBrick {
  return { ...b, content: { ...asRec(b.content), markdown: md } };
}


function toDocBrick(mb: MeshBrick, forcedKind?: string): DocumentBrick {
  const c = asRec(mb.content);
  const md = typeof c.markdown === "string" ? c.markdown : "";
  const kind = forcedKind ?? (typeof c.unifierKind === "string" ? c.unifierKind : "text");
  return {
    id: mb.id,
    documentId: `mesh:${mb.id}`,
    kind,
    position: 0,
    content: { ...c, kind, markdown: md, text: md },
    createdByUserId: "mesh",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function mkPreviewBrick(idSeed: string, kind: string, markdown: string, contentOverride?: Record<string, unknown> | null): DocumentBrick {
  const safeKind = kind.trim() || "text";
  const content = contentOverride && typeof contentOverride === "object"
    ? { ...contentOverride, kind: typeof contentOverride.kind === "string" ? contentOverride.kind : safeKind }
    : { kind: safeKind, markdown, text: markdown };
  return {
    id: `preview_${idSeed}`,
    documentId: `preview:${idSeed}`,
    kind: safeKind,
    position: 0,
    content,
    createdByUserId: "mesh",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

// ─── Connector pathfinding helpers ───────────────────────────────────────────

/** Where a line from brick center toward (tcx,tcy) exits the brick border. */
function edgeExit(bx: number, by: number, bw: number, bh: number, tcx: number, tcy: number) {
  const cx = bx + bw / 2, cy = by + bh / 2;
  const dx = tcx - cx, dy = tcy - cy;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return { x: cx, y: cy - bh / 2, nx: 0, ny: -1 };
  const w2 = bw / 2, h2 = bh / 2;
  if (Math.abs(dx) * h2 >= Math.abs(dy) * w2) {
    const t = w2 / Math.abs(dx);
    return { x: cx + dx * t, y: cy + dy * t, nx: Math.sign(dx), ny: 0 };
  }
  const t = h2 / Math.abs(dy);
  return { x: cx + dx * t, y: cy + dy * t, nx: 0, ny: Math.sign(dy) };
}

/** Liang-Barsky segment–AABB intersection. */
function segHitsRect(ax: number, ay: number, bx: number, by: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - rx, rx + rw - ax, ay - ry, ry + rh - ay];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const t = q[i] / p[i]; if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
  }
  return t0 < t1;
}

/** Ray-casting point-in-polygon (winding). */
function pointInPolygon(px: number, py: number, pts: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True if segment (ax,ay)→(bx,by) crosses any edge of the polygon OR its midpoint is inside. */
function segHitsPolyPts(
  ax: number, ay: number, bx: number, by: number,
  pts: Array<{ x: number; y: number }>,
): boolean {
  // Midpoint inside polygon — catches segments wholly inside concave pockets
  if (pointInPolygon((ax + bx) / 2, (ay + by) / 2, pts)) return true;
  const n = pts.length;
  const d1x = bx - ax, d1y = by - ay;
  for (let i = 0; i < n; i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    const d2x = B.x - A.x, d2y = B.y - A.y;
    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) continue;
    const t = ((A.x - ax) * d2y - (A.y - ay) * d2x) / cross;
    const u = ((A.x - ax) * d1y - (A.y - ay) * d1x) / cross;
    // t strictly inside (0,1) so endpoint touches don't count; u in [0,1]
    if (t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1) return true;
  }
  return false;
}

type VecPts = { x: number; y: number }[];
type ObstaclePoly = { x: number; y: number; w: number; h: number; polyPts?: Array<{ x: number; y: number }> };

// A legacy "decision" brick renders as a diamond but never stores shapePreset,
// so connection/obstacle math must treat it as a diamond — otherwise edges exit
// on the bounding box instead of the diamond outline.
function presetOfBrick(b: MeshBrick): ShapePreset | undefined {
  if (b.kind === "decision") return "diamond";
  const p = asRec(b.content).shapePreset;
  return typeof p === "string" ? (p as ShapePreset) : undefined;
}

function mkObstaclePoly(b: MeshBrick, g: { x: number; y: number }): ObstaclePoly {
  const preset = presetOfBrick(b);
  const bvp = Array.isArray(asRec(b.content).vectorPoints) ? asRec(b.content).vectorPoints as VecPts : undefined;
  const rawNorm = bvp ?? (preset ? SHAPE_PTS[preset] : undefined);
  let polyPts: Array<{ x: number; y: number }> | undefined;
  if (rawNorm) {
    polyPts = rawNorm.map(p => ({ x: g.x + p.x * b.size.w, y: g.y + p.y * b.size.h }));
  } else if (preset === "circle" || preset === "ellipse" || preset === "flow-terminator") {
    const a = b.size.w / 2, bh = b.size.h / 2, cx = g.x + a, cy = g.y + bh;
    polyPts = Array.from({ length: 16 }, (_, i) => {
      const θ = (i / 16) * Math.PI * 2;
      return { x: cx + a * Math.cos(θ), y: cy + bh * Math.sin(θ) };
    });
  }
  return { x: g.x, y: g.y, w: b.size.w, h: b.size.h, polyPts };
}

function collisionScore(
  pts: Array<{ x: number; y: number }>, obs: ObstaclePoly[],
  skipFirst = 0, skipLast = 0,
): number {
  let n = 0;
  const end = pts.length - 1 - skipLast;
  for (let i = skipFirst; i < end; i++) {
    const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y;
    for (const o of obs) {
      if (o.polyPts) {
        if (segHitsPolyPts(ax, ay, bx, by, o.polyPts)) n++;
      } else {
        if (segHitsRect(ax, ay, bx, by, o.x + 4, o.y + 4, o.w - 8, o.h - 8)) n++;
      }
    }
  }
  return n;
}

/** Build an ObstaclePoly from a plain rect + optional preset/vecPts (no MeshBrick needed). */
function mkPolyFromRect(
  rect: { x: number; y: number; w: number; h: number },
  preset?: ShapePreset, vecPts?: VecPts,
): ObstaclePoly {
  const rawNorm = vecPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  let polyPts: Array<{ x: number; y: number }> | undefined;
  if (rawNorm) {
    polyPts = rawNorm.map(p => ({ x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h }));
  } else if (preset === "circle" || preset === "ellipse" || preset === "flow-terminator") {
    const a = rect.w / 2, bh = rect.h / 2, cx = rect.x + a, cy = rect.y + bh;
    polyPts = Array.from({ length: 16 }, (_, i) => {
      const θ = (i / 16) * Math.PI * 2;
      return { x: cx + a * Math.cos(θ), y: cy + bh * Math.sin(θ) };
    });
  }
  return { ...rect, polyPts };
}

/** Polyline with rounded corners of radius r using Q bezier arcs. */
function smoothPoly(pts: Array<{ x: number; y: number }>, r: number): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], c = pts[i], b = pts[i + 1];
    const d1 = Math.hypot(c.x - a.x, c.y - a.y);
    const d2 = Math.hypot(b.x - c.x, b.y - c.y);
    const cr = Math.min(r, d1 / 2, d2 / 2);
    if (cr < 1) { d += ` L${c.x.toFixed(1)},${c.y.toFixed(1)}`; continue; }
    const t1 = cr / d1, t2 = cr / d2;
    const qx = c.x - (c.x - a.x) * t1, qy = c.y - (c.y - a.y) * t1;
    const ex = c.x + (b.x - c.x) * t2, ey = c.y + (b.y - c.y) * t2;
    d += ` L${qx.toFixed(1)},${qy.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  }
  d += ` L${pts[pts.length - 1].x.toFixed(1)},${pts[pts.length - 1].y.toFixed(1)}`;
  return d;
}

const STUB = 28, CORNER_R = 10, SNAP_R = 22;
const ALL_PORTS: Port[] = ["top", "right", "bottom", "left"];

function portAbsPos(gx: number, gy: number, bw: number, bh: number, port: Port) {
  switch (port) {
    case "top":    return { x: gx + bw / 2, y: gy,          nx: 0,  ny: -1 };
    case "right":  return { x: gx + bw,     y: gy + bh / 2, nx: 1,  ny: 0  };
    case "bottom": return { x: gx + bw / 2, y: gy + bh,     nx: 0,  ny: 1  };
    case "left":   return { x: gx,          y: gy + bh / 2, nx: -1, ny: 0  };
  }
}

function polylineLength(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++)
    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return len;
}

type AnchorNorm = { x: number; y: number };

function resolveConnEndpoint(
  rect: { x: number; y: number; w: number; h: number },
  port: Port | undefined,
  preset: ShapePreset | undefined,
  anchor: AnchorNorm | undefined,
  fallback: { x: number; y: number },
  vecPts?: { x: number; y: number }[],  // user-modified normalized vec points for this brick
): { x: number; y: number; nx: number; ny: number } {
  if (anchor) {
    const ax = rect.x + anchor.x * rect.w, ay = rect.y + anchor.y * rect.h;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const ddx = ax - cx, ddy = ay - cy, dlen = Math.hypot(ddx, ddy) || 1;
    return { x: ax, y: ay, nx: ddx / dlen, ny: ddy / dlen };
  }
  if (port) return shapePortAbsPos(rect.x, rect.y, rect.w, rect.h, preset, port, vecPts);
  return shapeEdgeExit(rect.x, rect.y, rect.w, rect.h, preset, fallback.x, fallback.y, vecPts);
}

function buildConnPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: ObstaclePoly[],
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): string {
  return smoothPoly(buildConnPolyline(srcRect, tgtRect, obs, srcPort, tgtPort, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts), CORNER_R);
}

function buildConnPolyline(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  obs: ObstaclePoly[],
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): Array<{ x: number; y: number }> {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const s1 = { x: e1.x + e1.nx * STUB, y: e1.y + e1.ny * STUB };
  const s2 = { x: e2.x + e2.nx * STUB, y: e2.y + e2.ny * STUB };

  // Include src and tgt shapes as obstacles so the route can't re-enter them.
  // We skip the first (e1→s1) and last (s2→e2) stub segments when scoring because
  // those necessarily touch the shape borders.
  const srcOb = mkPolyFromRect(srcRect, srcPreset, srcVecPts);
  const tgtOb = mkPolyFromRect(tgtRect, tgtPreset, tgtVecPts);
  const allObs = [srcOb, tgtOb, ...obs];
  const score = (pts: Array<{ x: number; y: number }>) => collisionScore(pts, allObs, 1, 1);

  // Direct routes: HV and VH
  const hvPts: Array<{ x: number; y: number }> = [e1, s1, { x: s2.x, y: s1.y }, s2, e2];
  const vhPts: Array<{ x: number; y: number }> = [e1, s1, { x: s1.x, y: s2.y }, s2, e2];
  const hvSc = score(hvPts), vhSc = score(vhPts);
  // Early exit — skip bypass generation if a direct route is already clean
  if (hvSc === 0 && vhSc === 0) return polylineLength(hvPts) <= polylineLength(vhPts) ? hvPts : vhPts;
  if (hvSc === 0) return hvPts;
  if (vhSc === 0) return vhPts;

  // Both blocked: try corner-hugging bypass routes around each obstacle
  const M = 36;
  let best = hvSc <= vhSc ? hvPts : vhPts;
  let bestSc = Math.min(hvSc, vhSc), bestLen = polylineLength(best);

  const consider = (cand: Array<{ x: number; y: number }>) => {
    const cs = score(cand), cl = polylineLength(cand);
    if (cs < bestSc || (cs === bestSc && cl < bestLen)) { best = cand; bestSc = cs; bestLen = cl; }
  };

  for (const ob of allObs) {
    const top = ob.y - M, bot = ob.y + ob.h + M;
    const lft = ob.x - M,  rgt = ob.x + ob.w + M;
    // Simple axis-aligned detours
    consider([e1, s1, { x: s1.x, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: s2.y }, s2, e2]);
    // Corner-hugging routes (reliable for large obstacles like draw bricks / boards)
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: top }, { x: s2.x, y: top }, s2, e2]);
    consider([e1, s1, { x: lft, y: s1.y }, { x: lft, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: rgt, y: s1.y }, { x: rgt, y: bot }, { x: s2.x, y: bot }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: top }, { x: lft, y: top }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: top }, { x: rgt, y: top }, { x: rgt, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: lft, y: bot }, { x: lft, y: s2.y }, s2, e2]);
    consider([e1, s1, { x: s1.x, y: bot }, { x: rgt, y: bot }, { x: rgt, y: s2.y }, s2, e2]);
  }
  return best;
}

function pointAtPolylineFraction(pts: Array<{ x: number; y: number }>, fraction: number): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];

  const clamped = Math.max(0, Math.min(1, fraction));
  let total = 0;
  const segments: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segments.push(seg);
    total += seg;
  }
  if (total <= 0) return pts[Math.floor((pts.length - 1) / 2)];

  const target = total * clamped;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (acc + seg >= target) {
      const t = seg > 0 ? (target - acc) / seg : 0;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

function findRawDrawAt(by: Record<string, MeshBrick>, x: number, y: number): MeshBrick | null {
  const candidates = Object.values(by).filter((b) => {
    if (b.kind !== "draw") return false;
    const c = asRec(b.content);
    return typeof c.shapePreset !== "string";
  });

  for (let i = candidates.length - 1; i >= 0; i--) {
    const b = candidates[i];
    const g = resolveGlobal(by, b.id);
    if (x >= g.x && x <= g.x + b.size.w && y >= g.y && y <= g.y + b.size.h) {
      return b;
    }
  }
  return null;
}

function insertBrick(state: MeshState, brick: MeshBrick, globalDrop?: { x: number; y: number }): MeshState {
  const by = { ...state.bricksById };
  let root = [...state.rootOrder];
  let parentId = brick.parentId ?? null;
  let pos = { ...brick.position };

  if (globalDrop) {
    const container = boardAt(state.bricksById, globalDrop.x, globalDrop.y, brick.id);
    parentId = container?.id ?? null;
    if (parentId) {
      const pg = resolveGlobal(state.bricksById, parentId);
      pos = { x: globalDrop.x - pg.x, y: globalDrop.y - pg.y };
    } else {
      pos = { ...globalDrop };
    }
  }

  const placed: MeshBrick = { ...brick, parentId, position: pos };
  by[placed.id] = placed;

  if (parentId && by[parentId]) {
    by[parentId] = withChildOrder(by[parentId], [...childOrder(by[parentId]), placed.id]);
  } else {
    root = [...root, placed.id];
  }

  return { ...state, bricksById: by, rootOrder: root };
}

// ─── Delete helpers ───────────────────────────────────────────────────────────

function descendants(by: Record<string, MeshBrick>, id: string): string[] {
  const result: string[] = [];
  const q = [id];
  while (q.length) {
    const cur = q.shift()!;
    result.push(cur);
    Object.values(by).filter((b) => b.parentId === cur).forEach((b) => q.push(b.id));
  }
  return result;
}

function deleteBrick(state: MeshState, id: string): MeshState {
  const brick = state.bricksById[id];
  if (!brick) return state;
  const del = new Set(descendants(state.bricksById, id));
  const by = { ...state.bricksById };
  let root = state.rootOrder.filter((i) => !del.has(i));
  if (brick.parentId && by[brick.parentId]) {
    by[brick.parentId] = withChildOrder(by[brick.parentId], childOrder(by[brick.parentId]).filter((i) => i !== id));
  }
  del.forEach((i) => delete by[i]);
  const conns: Record<string, MeshConnection> = {};
  Object.values(state.connectionsById).forEach((c) => {
    if (!del.has(c.cons[0]) && !del.has(c.cons[1])) conns[c.id] = c;
  });
  return { ...state, bricksById: by, rootOrder: root, connectionsById: conns };
}

function deleteConn(state: MeshState, id: string): MeshState {
  const conns = { ...state.connectionsById };
  delete conns[id];
  return { ...state, connectionsById: conns };
}

// ─── Brick factory ────────────────────────────────────────────────────────────

function mkBrick(
  kind: MeshBrickKind,
  count: number,
  parentId: string | null = null,
  pos?: { x: number; y: number },
  shapePreset?: ShapePreset,
  unifierKind?: string,
): MeshBrick {
  const id  = mkId("brick");
  const size = BRICK_SIZE[kind] ?? { w: 180, h: 120 };
  const defaultPts = shapePreset ? SHAPE_PTS[shapePreset] : undefined;

  let content: Record<string, unknown>;
  if (kind === "board_empty" || kind === "frame") {
    content = { childOrder: [], isContainer: true,
      ...(kind === "frame" ? { style: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.04)", strokeWidth: 2 } } : {}) };
  } else if (kind === "text") {
    content = { markdown: "" };
  } else if (kind === "decision") {
    content = { markdown: "**¿Decisión?**" };
  } else if (kind === "portal") {
    if (unifierKind) { content = { unifierKind, markdown: "" }; }
    else             { content = { targetType: "mesh", targetId: "", targetLabel: "" }; }
  } else if (kind === "mirror") {
    if (unifierKind) { content = { unifierKind: unifierKind ?? "callout", markdown: "" }; }
    else             { content = { sourceId: "", sourceLabel: "", previewMarkdown: "" }; }
  } else if (shapePreset) {
    content = {
      shapePreset, isContainer: true, childOrder: [],
      vectorPoints: defaultPts ? JSON.parse(JSON.stringify(defaultPts)) : undefined,
      style: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.08)", strokeWidth: 2 },
    };
  } else if (kind === "draw") {
    content = { isContainer: true, childOrder: [] };
  } else {
    content = {};
  }

  return {
    id, kind, parentId,
    position: pos ?? { x: 64 + (count % 6) * 60, y: 64 + Math.floor(count / 6) * 60 },
    size,
    content,
  } as MeshBrick;
}

// ─── iinkTS ───────────────────────────────────────────────────────────────────

type IinkShape = { kind: string; bbox: { x: number; y: number; w: number; h: number } | null };
type IinkResult = { text: string | null; shapes: IinkShape[] };

async function callIink(strokes: PenStroke[], w: number, h: number, token: string, meshId: string): Promise<IinkResult | null> {
  if (!strokes.length) return null;
  const payload = {
    strokes: strokes.map((s) => ({
      x: s.points.map((p) => Math.round(p.x)),
      y: s.points.map((p) => Math.round(p.y)),
      t: s.points.map((p) => p.t),
    })),
    width: Math.round(w),
    height: Math.round(h),
  };
  try {
    const res = await fetch(`${API_BASE}/meshes/${meshId}/iink`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { text: data.text ?? null, shapes: data.shapes ?? [] };
  } catch {
    return null;
  }
}

// Map MyScript shape kind → MeshBrickKind + optional shapePreset
function shapeKindToBrick(kind: string): { meshKind: MeshBrickKind; preset?: ShapePreset } | null {
  switch (kind.toLowerCase()) {
    case "rectangle": case "square":         return { meshKind: "board_empty" };
    case "rhombus":   case "diamond":        return { meshKind: "decision" };
    case "circle":    case "ellipse":        return { meshKind: "draw", preset: "circle" };
    case "triangle":                         return { meshKind: "draw", preset: "triangle" };
    case "hexagon":                          return { meshKind: "draw", preset: "hexagon" };
    case "parallelogram":                    return { meshKind: "draw", preset: "rounded-rect" };
    default:                                 return null;
  }
}

function strokesBBox(strokes: PenStroke[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  strokes.forEach((s) => s.points.forEach((p) => {
    if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
  }));
  if (!isFinite(x0)) return { x: 0, y: 0, w: 120, h: 50 };
  return { x: x0, y: y0, w: Math.max(x1 - x0, 80), h: Math.max(y1 - y0, 30) };
}

// ─── Raw-draw brick merge helpers ──────────────────────────────────────────────
// A raw draw brick stores `content.manualStrokes`: strokes whose points are
// normalized 0..1 against the brick's own size. Merging / growing means working
// in global canvas coords, then re-normalizing to a new bounds — never clamping
// (clamping is what used to squash a drawing to fit instead of absorbing it).
type NormStroke = { points: { x: number; y: number }[]; color?: string; width?: number };

function getManualStrokes(b: MeshBrick): NormStroke[] {
  const c = asRec(b.content);
  return Array.isArray(c.manualStrokes) ? (c.manualStrokes as NormStroke[]) : [];
}

function isRawDraw(b: MeshBrick | null | undefined): b is MeshBrick {
  return !!b && b.kind === "draw" && typeof asRec(b.content).shapePreset !== "string";
}

// Denormalize a draw brick's strokes into absolute canvas coordinates.
function drawStrokesGlobal(by: Record<string, MeshBrick>, b: MeshBrick): NormStroke[] {
  const g = resolveGlobal(by, b.id);
  return getManualStrokes(b).map((s) => ({
    points: s.points.map((p) => ({ x: g.x + p.x * b.size.w, y: g.y + p.y * b.size.h })),
    color: s.color,
    width: s.width,
  }));
}

// Re-normalize absolute strokes into a target bounds. No clamping: bounds are
// always chosen to contain every point, so the drawing keeps its shape.
function normStrokesToBounds(globalStrokes: NormStroke[], bounds: { x: number; y: number; w: number; h: number }): NormStroke[] {
  return globalStrokes.map((s) => ({
    points: s.points.map((p) => ({
      x: +((p.x - bounds.x) / Math.max(bounds.w, 1)).toFixed(4),
      y: +((p.y - bounds.y) / Math.max(bounds.h, 1)).toFixed(4),
    })),
    color: s.color,
    width: s.width,
  }));
}

// Merge two+ raw draw bricks (and an optional connecting stroke) into the first
// id. Union their global rects + all ink, re-normalize, drop the rest, and clean
// up child orders / connections that referenced the absorbed bricks.
function mergeDrawBricks(
  state: MeshState,
  ids: string[],
  extra: PenStroke[] | null,
  color: string,
  width: number,
): MeshState {
  const by = { ...state.bricksById };
  const bricks = ids.map((id) => by[id]).filter(Boolean) as MeshBrick[];
  if (bricks.length < 2) return state;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const allStrokes: NormStroke[] = [];
  bricks.forEach((b) => {
    const g = resolveGlobal(by, b.id);
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x + b.size.w); maxY = Math.max(maxY, g.y + b.size.h);
    allStrokes.push(...drawStrokesGlobal(by, b));
  });
  if (extra && extra.length) {
    extra.forEach((s) => s.points.forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }));
    allStrokes.push(...extra.map((s) => ({ points: s.points, color: s.color ?? color, width: s.width ?? width })));
  }
  const bounds = { x: minX, y: minY, w: Math.max(maxX - minX, 40), h: Math.max(maxY - minY, 30) };
  const normalized = normStrokesToBounds(allStrokes, bounds);

  const keep = bricks[0];
  const dropIds = new Set(bricks.slice(1).map((b) => b.id));
  const parentId = keep.parentId ?? null;
  const pg = parentId ? resolveGlobal(by, parentId) : { x: 0, y: 0 };
  by[keep.id] = {
    ...keep,
    position: { x: bounds.x - pg.x, y: bounds.y - pg.y },
    size: { w: bounds.w, h: bounds.h },
    content: { ...asRec(keep.content), isContainer: true, manualStrokes: normalized },
  };
  dropIds.forEach((id) => { delete by[id]; });

  Object.keys(by).forEach((id) => {
    const co = childOrder(by[id]);
    if (co.some((c) => dropIds.has(c))) by[id] = withChildOrder(by[id], co.filter((c) => !dropIds.has(c)));
  });
  const root = state.rootOrder.filter((id) => !dropIds.has(id));
  const connectionsById = { ...state.connectionsById };
  Object.keys(connectionsById).forEach((cid) => {
    if (connectionsById[cid].cons.some((c) => dropIds.has(c))) delete connectionsById[cid];
  });
  return { ...state, bricksById: by, rootOrder: root, connectionsById };
}

// ─── Shape geometry ───────────────────────────────────────────────────────────

function hexPts() {
  return [-90, -30, 30, 90, 150, 210].map((d) => {
    const r = (d * Math.PI) / 180;
    return { x: +(0.5 + 0.5 * Math.cos(r)).toFixed(4), y: +(0.5 + 0.5 * Math.sin(r)).toFixed(4) };
  });
}

function starPts() {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const oa = ((i * 72 - 90) * Math.PI) / 180;
    const ia = ((i * 72 - 54) * Math.PI) / 180;
    pts.push({ x: +(0.5 + 0.5 * Math.cos(oa)).toFixed(4), y: +(0.5 + 0.5 * Math.sin(oa)).toFixed(4) });
    pts.push({ x: +(0.5 + 0.22 * Math.cos(ia)).toFixed(4), y: +(0.5 + 0.22 * Math.sin(ia)).toFixed(4) });
  }
  return pts;
}

function pentPts() {
  return Array.from({ length: 5 }, (_, i) => {
    const a = ((i * 72 - 90) * Math.PI) / 180;
    return { x: +(0.5 + 0.5 * Math.cos(a)).toFixed(4), y: +(0.5 + 0.5 * Math.sin(a)).toFixed(4) };
  });
}

function nStarPts(n: number, outer = 0.5, inner = 0.22) {
  const pts: { x: number; y: number }[] = [];
  const step = Math.PI / n;
  for (let i = 0; i < n * 2; i++) {
    const a = i * step - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: +(0.5 + r * Math.cos(a)).toFixed(4), y: +(0.5 + r * Math.sin(a)).toFixed(4) });
  }
  return pts;
}

const SHAPE_PTS: Partial<Record<ShapePreset, { x: number; y: number }[]>> = {
  // ── Existing ──
  diamond:        [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }],
  triangle:       [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  hexagon:        hexPts(),
  pentagon:       pentPts(),
  star:           starPts(),
  arrow:          [{ x: 0, y: 0.35 }, { x: 0.6, y: 0.35 }, { x: 0.6, y: 0.1 }, { x: 1, y: 0.5 }, { x: 0.6, y: 0.9 }, { x: 0.6, y: 0.65 }, { x: 0, y: 0.65 }],
  "frame-vector": [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  parallelogram:  [{ x: 0.15, y: 0 }, { x: 1, y: 0 }, { x: 0.85, y: 1 }, { x: 0, y: 1 }],
  cross:          [{ x: 0.33, y: 0 }, { x: 0.67, y: 0 }, { x: 0.67, y: 0.33 }, { x: 1, y: 0.33 }, { x: 1, y: 0.67 }, { x: 0.67, y: 0.67 }, { x: 0.67, y: 1 }, { x: 0.33, y: 1 }, { x: 0.33, y: 0.67 }, { x: 0, y: 0.67 }, { x: 0, y: 0.33 }, { x: 0.33, y: 0.33 }],
  chevron:        [{ x: 0, y: 0 }, { x: 0.72, y: 0 }, { x: 1, y: 0.5 }, { x: 0.72, y: 1 }, { x: 0, y: 1 }, { x: 0.28, y: 0.5 }],

  // ── Basic geometric ──
  trapezoid:         [{ x: 0.15, y: 0 }, { x: 0.85, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  "trapezoid-inv":   [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.85, y: 1 }, { x: 0.15, y: 1 }],
  octagon:           [{ x: 0.29, y: 0 }, { x: 0.71, y: 0 }, { x: 1, y: 0.29 }, { x: 1, y: 0.71 }, { x: 0.71, y: 1 }, { x: 0.29, y: 1 }, { x: 0, y: 0.71 }, { x: 0, y: 0.29 }],
  bevel:             [{ x: 0.12, y: 0 }, { x: 0.88, y: 0 }, { x: 1, y: 0.12 }, { x: 1, y: 0.88 }, { x: 0.88, y: 1 }, { x: 0.12, y: 1 }, { x: 0, y: 0.88 }, { x: 0, y: 0.12 }],
  "triangle-rt":     [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  "diamond-wide":    [{ x: 0.5, y: 0.12 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0.88 }, { x: 0, y: 0.5 }],
  kite:              [{ x: 0.5, y: 0 }, { x: 1, y: 0.62 }, { x: 0.5, y: 1 }, { x: 0, y: 0.62 }],
  wedge:             [{ x: 0.5, y: 0.5 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  gem:               [{ x: 0.5, y: 0 }, { x: 1, y: 0.32 }, { x: 0.72, y: 1 }, { x: 0.28, y: 1 }, { x: 0, y: 0.32 }],

  // ── Flow / diagramming ──
  "hexagon-v":          [{ x: 0.5, y: 0 }, { x: 1, y: 0.25 }, { x: 1, y: 0.75 }, { x: 0.5, y: 1 }, { x: 0, y: 0.75 }, { x: 0, y: 0.25 }],
  "parallelogram-rev":  [{ x: 0, y: 0 }, { x: 0.85, y: 0 }, { x: 1, y: 1 }, { x: 0.15, y: 1 }],
  "prep-hex":           [{ x: 0.12, y: 0 }, { x: 0.88, y: 0 }, { x: 1, y: 0.5 }, { x: 0.88, y: 1 }, { x: 0.12, y: 1 }, { x: 0, y: 0.5 }],
  "data-io":            [{ x: 0.2, y: 0 }, { x: 1, y: 0 }, { x: 0.8, y: 1 }, { x: 0, y: 1 }],
  "off-page":           [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.65 }, { x: 0.5, y: 1 }, { x: 0, y: 0.65 }],
  collate:              [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0.5, y: 0.5 }],
  "manual-input":       [{ x: 0, y: 0.22 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  "delay-shape":        [{ x: 0, y: 0 }, { x: 0.65, y: 0 }, { x: 1, y: 0.5 }, { x: 0.65, y: 1 }, { x: 0, y: 1 }],

  // ── Arrows ──
  "arrow-left":     [{ x: 0, y: 0.5 }, { x: 0.38, y: 0 }, { x: 0.38, y: 0.28 }, { x: 1, y: 0.28 }, { x: 1, y: 0.72 }, { x: 0.38, y: 0.72 }, { x: 0.38, y: 1 }],
  "arrow-up":       [{ x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.72, y: 0.38 }, { x: 0.72, y: 1 }, { x: 0.28, y: 1 }, { x: 0.28, y: 0.38 }, { x: 0, y: 0.38 }],
  "arrow-down":     [{ x: 0.5, y: 1 }, { x: 1, y: 0.62 }, { x: 0.72, y: 0.62 }, { x: 0.72, y: 0 }, { x: 0.28, y: 0 }, { x: 0.28, y: 0.62 }, { x: 0, y: 0.62 }],
  "double-arrow-h": [{ x: 0, y: 0.5 }, { x: 0.28, y: 0 }, { x: 0.28, y: 0.28 }, { x: 0.72, y: 0.28 }, { x: 0.72, y: 0 }, { x: 1, y: 0.5 }, { x: 0.72, y: 1 }, { x: 0.72, y: 0.72 }, { x: 0.28, y: 0.72 }, { x: 0.28, y: 1 }],
  "double-arrow-v": [{ x: 0.5, y: 0 }, { x: 1, y: 0.28 }, { x: 0.72, y: 0.28 }, { x: 0.72, y: 0.72 }, { x: 1, y: 0.72 }, { x: 0.5, y: 1 }, { x: 0, y: 0.72 }, { x: 0.28, y: 0.72 }, { x: 0.28, y: 0.28 }, { x: 0, y: 0.28 }],

  // ── Figures & symbols ──
  heart:          [{ x: 0.5, y: 0.28 }, { x: 0.73, y: 0 }, { x: 1, y: 0.22 }, { x: 1, y: 0.52 }, { x: 0.5, y: 1 }, { x: 0, y: 0.52 }, { x: 0, y: 0.22 }, { x: 0.27, y: 0 }],
  shield:         [{ x: 0.5, y: 0 }, { x: 1, y: 0.12 }, { x: 1, y: 0.58 }, { x: 0.5, y: 1 }, { x: 0, y: 0.58 }, { x: 0, y: 0.12 }],
  lightning:      [{ x: 0.6, y: 0 }, { x: 0.12, y: 0.52 }, { x: 0.45, y: 0.52 }, { x: 0.4, y: 1 }, { x: 0.88, y: 0.48 }, { x: 0.55, y: 0.48 }],
  house:          [{ x: 0.5, y: 0 }, { x: 1, y: 0.42 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.42 }],
  "star-6":       nStarPts(6, 0.5, 0.26),
  "star-4":       nStarPts(4, 0.5, 0.18),
  "star-8":       nStarPts(8, 0.5, 0.22),
  starburst:      nStarPts(12, 0.5, 0.32),
  "cross-x":      [{ x: 0.15, y: 0 }, { x: 0.5, y: 0.35 }, { x: 0.85, y: 0 }, { x: 1, y: 0.15 }, { x: 0.65, y: 0.5 }, { x: 1, y: 0.85 }, { x: 0.85, y: 1 }, { x: 0.5, y: 0.65 }, { x: 0.15, y: 1 }, { x: 0, y: 0.85 }, { x: 0.35, y: 0.5 }, { x: 0, y: 0.15 }],
  tag:            [{ x: 0, y: 0 }, { x: 0.78, y: 0 }, { x: 1, y: 0.5 }, { x: 0.78, y: 1 }, { x: 0, y: 1 }],
  ribbon:         [{ x: 0.1, y: 0 }, { x: 0.9, y: 0 }, { x: 1, y: 0.5 }, { x: 0.9, y: 1 }, { x: 0.1, y: 1 }, { x: 0, y: 0.5 }],
  callout:        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.68 }, { x: 0.38, y: 0.68 }, { x: 0.2, y: 1 }, { x: 0.14, y: 0.68 }, { x: 0, y: 0.68 }],
  banner:         [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.85, y: 0.66 }, { x: 0.5, y: 0.8 }, { x: 0.15, y: 0.66 }, { x: 0, y: 1 }],
  "location-pin": [{ x: 0.5, y: 0 }, { x: 1, y: 0.38 }, { x: 0.5, y: 1 }, { x: 0, y: 0.38 }],

  // ── Frames / containers ──
  "bracket-left":  [{ x: 0.6, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 1 }, { x: 0.6, y: 1 }],
  "bracket-right": [{ x: 0.4, y: 0 }, { x: 0.7, y: 0 }, { x: 0.7, y: 1 }, { x: 0.4, y: 1 }],
};

/** Analytical ellipse exit: ray from (cx,cy) in direction (dx,dy) hitting ellipse with semi-axes (a,b). */
function ellipseExit(
  cx: number, cy: number, a: number, b: number,
  dx: number, dy: number,
): { x: number; y: number; nx: number; ny: number } {
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: cx, y: cy - b, nx: 0, ny: -1 };
  const ndx = dx / len, ndy = dy / len;
  const t = 1 / Math.sqrt((ndx / a) ** 2 + (ndy / b) ** 2);
  const ex = cx + ndx * t, ey = cy + ndy * t;
  // Cardinal-snap outward normal
  const nx = Math.abs(ndx) >= Math.abs(ndy) ? (ndx > 0 ? 1 : -1) : 0;
  const ny = Math.abs(ndx) >= Math.abs(ndy) ? 0 : (ndy > 0 ? 1 : -1);
  return { x: ex, y: ey, nx, ny };
}

/** Ray–polygon intersection. Returns first point where ray (cx,cy)→(dx,dy) exits the polygon. */
function rayPolygonExit(
  cx: number, cy: number,
  pts: Array<{ x: number; y: number }>,
  dx: number, dy: number,
): { x: number; y: number; nx: number; ny: number } {
  const n = pts.length;
  let bestT = Infinity, bestX = cx, bestY = cy, bestNx = 0, bestNy = -1;
  for (let i = 0; i < n; i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    const edx = B.x - A.x, edy = B.y - A.y;
    const denom = edx * dy - edy * dx;
    if (Math.abs(denom) < 1e-10) continue;
    const ox = cx - A.x, oy = cy - A.y;
    const u = (ox * dy - oy * dx) / denom;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    const t = (ox * edy - oy * edx) / denom;
    if (t < 1e-6 || t >= bestT) continue;
    bestT = t; bestX = cx + t * dx; bestY = cy + t * dy;
    const el = Math.hypot(edx, edy) || 1;
    let nx = edy / el, ny = -edx / el;
    if (nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
    bestNx = nx; bestNy = ny;
  }
  return { x: bestX, y: bestY, nx: bestNx, ny: bestNy };
}

/** Where a line from brick center exits its actual shape border (polygon-aware). */
function shapeEdgeExit(
  bx: number, by: number, bw: number, bh: number,
  preset: ShapePreset | undefined,
  tcx: number, tcy: number,
  customPts?: { x: number; y: number }[],  // user-modified normalized vec points
): { x: number; y: number; nx: number; ny: number } {
  if (preset === "circle" || preset === "ellipse")
    return ellipseExit(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, tcx - (bx + bw / 2), tcy - (by + bh / 2));
  if (preset === "flow-terminator") {
    const r = Math.min(bw, bh) / 2;
    return ellipseExit(bx + bw / 2, by + bh / 2, r, r, tcx - (bx + bw / 2), tcy - (by + bh / 2));
  }
  // Prefer user-modified vec points, fall back to preset template, then bounding-box
  const rawPts = customPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  if (!rawPts) return edgeExit(bx, by, bw, bh, tcx, tcy);
  const cx = bx + bw / 2, cy = by + bh / 2;
  const dx = tcx - cx, dy = tcy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return { x: cx, y: cy - bh / 2, nx: 0, ny: -1 };
  // Snap to the nearest cardinal magnet port (vertex for a diamond) so the
  // orthogonal connector lands on an actual anchor point instead of an
  // arbitrary diagonal-edge point with a forced cardinal normal.
  const cardinals: Array<[Port, number, number]> = [["top", 0, -1], ["right", 1, 0], ["bottom", 0, 1], ["left", -1, 0]];
  let best: Port = "top", bestDot = -Infinity;
  for (const [port, pdx, pdy] of cardinals) {
    const dot = (dx / len) * pdx + (dy / len) * pdy;
    if (dot > bestDot) { bestDot = dot; best = port; }
  }
  return shapePortAbsPos(bx, by, bw, bh, preset, best, customPts);
}

/** Magnet port position on the actual shape border (polygon-aware). */
function shapePortAbsPos(
  gx: number, gy: number, bw: number, bh: number,
  preset: ShapePreset | undefined,
  port: Port,
  customPts?: { x: number; y: number }[],  // user-modified normalized vec points
): { x: number; y: number; nx: number; ny: number } {
  const dirs: Record<Port, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
  const [dx, dy] = dirs[port];
  if (preset === "circle" || preset === "ellipse")
    return { ...ellipseExit(gx + bw / 2, gy + bh / 2, bw / 2, bh / 2, dx, dy), nx: dx, ny: dy };
  if (preset === "flow-terminator") {
    const r = Math.min(bw, bh) / 2;
    return { ...ellipseExit(gx + bw / 2, gy + bh / 2, r, r, dx, dy), nx: dx, ny: dy };
  }
  const rawPts = customPts ?? (preset ? SHAPE_PTS[preset] : undefined);
  if (!rawPts) return portAbsPos(gx, gy, bw, bh, port);
  const result = rayPolygonExit(gx + bw / 2, gy + bh / 2, rawPts.map(p => ({ x: gx + p.x * bw, y: gy + p.y * bh })), dx, dy);
  return { x: result.x, y: result.y, nx: dx, ny: dy };
}

// ─── SVG renderers ────────────────────────────────────────────────────────────

function ShapeSvg({ preset, w, h, pts, stroke = "#22d3ee", fill = "rgba(34,211,238,0.07)", sw = 2, cr = 10, dash }: {
  preset: ShapePreset; w: number; h: number;
  pts?: { x: number; y: number }[];
  stroke?: string; fill?: string; sw?: number; cr?: number; dash?: string;
}) {
  const vp = pts ?? SHAPE_PTS[preset];

  if (preset === "circle" || preset === "ellipse" || preset === "flow-terminator") {
    const rx = preset === "flow-terminator" ? Math.min(w / 2, h / 2) : w / 2 - 2;
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <ellipse cx={w / 2} cy={h / 2} rx={rx} ry={h / 2 - 2} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (preset === "rect") {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={cr} ry={cr} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (preset === "rounded-rect") {
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={cr} ry={cr} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (preset === "note") {
    const fold = Math.min(w * 0.18, 28);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <polygon points={`0,0 ${w - fold},0 ${w},${fold} ${w},${h} 0,${h}`} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
        <polyline points={`${w - fold},0 ${w - fold},${fold} ${w},${fold}`} stroke={stroke} fill="none" strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (preset === "cylinder") {
    const ry = Math.max(5, h * 0.14);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <rect x={1} y={ry} width={w - 2} height={h - ry * 2} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
        <ellipse cx={w / 2} cy={ry} rx={w / 2 - 1} ry={ry} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
        <ellipse cx={w / 2} cy={h - ry} rx={w / 2 - 1} ry={ry} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
        <line x1={1} y1={ry} x2={1} y2={h - ry} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
        <line x1={w - 1} y1={ry} x2={w - 1} y2={h - ry} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (preset === "stadium") {
    // Pill / capsule — rect with fully rounded ends (rx = h/2).
    const rx = Math.min(w / 2, h / 2);
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={rx} ry={rx} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (preset === "half-circle") {
    // Semicircle — flat top, arc bottom.
    const r = Math.min(w / 2 - 1, h - 2);
    const cx = w / 2;
    const d = `M${cx - r},1 L${cx + r},1 A${r},${r} 0 0 1 ${cx - r},1 Z`;
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0">
        <path d={d} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
      </svg>
    );
  }
  if (!vp) return null;
  const pStr = vp.map((p) => `${+(p.x * w).toFixed(1)},${+(p.y * h).toFixed(1)}`).join(" ");
  // Fixed viewBox preserves 1:1 mapping so dots and polygon always align.
  // overflow:visible lets points dragged outside the brick bounds render cleanly.
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0"
      style={{ overflow: "visible" }}>
      <polygon points={pStr} stroke={stroke} fill={fill} strokeWidth={sw} strokeDasharray={dash} />
    </svg>
  );
}


function defaultMeshState(): MeshState {
  return { version: "1.0.0", viewport: { x: 0, y: 0, zoom: 1 }, rootOrder: [], bricksById: {}, connectionsById: {} };
}

function connStyle(preset: ConnStyle): Record<string, unknown> {
  if (preset === "dashed")    return { stroke: "#7dd3fc", width: 2,   pattern: "dashed", connType: "technical" };
  if (preset === "handdrawn") return { stroke: "#c4b5fd", width: 2.5, pattern: "solid",  connType: "handdrawn" };
  if (preset === "bezier")    return { stroke: "#6ee7b7", width: 2,   pattern: "solid",  connType: "bezier"    };
  if (preset === "curved")    return { stroke: "#fbbf24", width: 2,   pattern: "solid",  connType: "curved"    };
  return                             { stroke: "#22d3ee", width: 2,   pattern: "solid",  connType: "technical" };
}

// Pure: turn a GeneratedMesh (nodes+edges) into a MeshTemplate (bricks+connections)
// WITHOUT touching live state — so the result can be previewed before insertion.
// Mirrors the brick/connection construction used when applying a diagram: parent
// nesting, per-node colors, title/description split into header + nested text
// brick, [color] tint, and clean-reverse-pair → bidirectional collapse.
function generatedMeshToTemplate(mesh: GeneratedMesh, connPreset: ConnStyle): MeshTemplate {
  const byId: Record<string, MeshBrick> = {};
  const order: string[] = [];
  const refToId: Record<string, string> = {};
  let count = 0;
  const pushChild = (parentId: string, childId: string) => {
    const pc = asRec(byId[parentId].content);
    const co = Array.isArray(pc.childOrder) ? (pc.childOrder as string[]) : [];
    byId[parentId] = { ...byId[parentId], content: { ...pc, isContainer: true, childOrder: [...co, childId] } };
  };

  mesh.nodes.forEach((n) => {
    const parentId = n.parent ? (refToId[n.parent] ?? null) : null;
    const pos = { x: Math.round(n.x), y: Math.round(n.y) };
    const tint = (s: string) => (s && n.textColor ? `[color:${n.textColor}]${s}[/color]` : s);
    const nlIdx = n.label ? n.label.indexOf("\n") : -1;
    const title = n.label ? (nlIdx >= 0 ? n.label.slice(0, nlIdx) : n.label).trim() : "";
    const descBody = n.label && nlIdx >= 0
      ? n.label.slice(nlIdx + 1).split("\n").map((s) => s.trim()).filter(Boolean).join("\n\n")
      : "";

    let nb: MeshBrick;
    if (n.kind === "board") {
      nb = mkBrick("board_empty", count++, parentId, pos);
      if (title) nb = { ...nb, content: { ...asRec(nb.content), label: title } };
    } else if (n.kind === "text") {
      nb = setMd(mkBrick("text", count++, parentId, pos), tint(n.label || ""));
    } else if (Array.isArray(n.vectorPoints) && n.vectorPoints.length >= 3) {
      nb = mkBrick("draw", count++, parentId, pos, "polygon" as ShapePreset);
      nb = { ...nb, content: { ...asRec(nb.content), shapePreset: "polygon", vectorPoints: n.vectorPoints } };
      if (title) nb = { ...nb, content: { ...asRec(nb.content), markdown: tint(title) } };
    } else {
      const preset = (n.shape ?? "rect") as ShapePreset;
      nb = mkBrick("draw", count++, parentId, pos, preset);
      if (title) {
        nb = descBody
          ? { ...nb, content: { ...asRec(nb.content), label: title, isContainer: true, childOrder: [] } }
          : { ...nb, content: { ...asRec(nb.content), markdown: tint(title) } };
      }
    }
    if (n.stroke || n.fill) {
      const content = asRec(nb.content);
      const style = { ...asRec(content.style) };
      if (n.stroke) style.stroke = n.stroke;
      if (n.fill) style.fill = n.fill;
      nb = { ...nb, content: { ...content, style } };
    }
    nb = { ...nb, size: { w: Math.round(n.w), h: Math.round(n.h) } };
    byId[nb.id] = nb; order.push(nb.id);
    if (parentId && byId[parentId]) pushChild(parentId, nb.id);
    refToId[n.ref] = nb.id;

    if (n.kind === "shape" && descBody) {
      const tb0 = setMd(mkBrick("text", count++, nb.id, { x: 12, y: 38 }), tint(descBody));
      const tb = { ...tb0, size: { w: Math.max(60, nb.size.w - 24), h: Math.max(28, nb.size.h - 52) } };
      byId[tb.id] = tb; order.push(tb.id);
      pushChild(nb.id, tb.id);
    }
  });

  const connections: MeshConnection[] = [];
  const mkDocLabel = (txt?: string) => txt
    ? { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: txt }] }] }
    : { type: "doc" as const, content: [] };
  const resolved = mesh.edges
    .map((e) => ({ e, src: refToId[e.from], tgt: refToId[e.to] }))
    .filter((r) => r.src && r.tgt && r.src !== r.tgt);
  const groups = new Map<string, typeof resolved>();
  resolved.forEach((r) => { const key = [r.src, r.tgt].sort().join("|"); (groups.get(key) ?? groups.set(key, []).get(key)!).push(r); });
  const mkConn = (src: string, tgt: string, e: typeof resolved[number]["e"], bidir: boolean, labelTxt?: string) => {
    const style: Record<string, unknown> = { ...connStyle(connPreset) };
    if (e.color) style.stroke = e.color;
    if (e.pattern) style.pattern = e.pattern;
    if (typeof e.width === "number") style.width = e.width;
    if (e.connType) style.connType = e.connType;
    if (bidir) style.bidir = true;
    connections.push({ id: mkId("conn"), cons: [src, tgt], label: mkDocLabel(labelTxt ?? e.label), style });
  };
  groups.forEach((grp) => {
    const isCleanReversePair = grp.length === 2 && grp[0].src === grp[1].tgt && grp[0].tgt === grp[1].src;
    if (isCleanReversePair) {
      const merged = [grp[0].e.label, grp[1].e.label].filter(Boolean).join("  |  ");
      mkConn(grp[0].src, grp[0].tgt, grp[0].e, true, merged || undefined);
    } else {
      grp.forEach((r) => mkConn(r.src, r.tgt, r.e, false));
    }
  });

  return { id: "generated", name: "Generated", bricks: order.map((id) => byId[id]), connections };
}

/** Deterministic pseudo-random based on string seed. */
function seedRand(seed: string, i: number): number {
  let h = 5381;
  for (let j = 0; j < seed.length; j++) h = (h * 33 ^ seed.charCodeAt(j)) >>> 0;
  h = (h * 1664525 + i * 1013904223) >>> 0;
  return (h / 4294967296);
}

/** Hand-drawn wavy path using cubic beziers with seeded offsets. */
function handDrawnPath(pts: Array<{ x: number; y: number }>, seed: string): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const px = -dy / len, py = dx / len;
    const amp = Math.min(6, len * 0.12);
    const w1 = (seedRand(seed, i * 4)     - 0.5) * 2 * amp;
    const w2 = (seedRand(seed, i * 4 + 1) - 0.5) * 2 * amp;
    const cp1x = (a.x + dx / 3 + px * w1).toFixed(1);
    const cp1y = (a.y + dy / 3 + py * w1).toFixed(1);
    const cp2x = (a.x + dx * 2 / 3 + px * w2).toFixed(1);
    const cp2y = (a.y + dy * 2 / 3 + py * w2).toFixed(1);
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

/** Cubic bezier from src edge to tgt edge with explicit control points. */
function buildBezierPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  cp1?: { x: number; y: number },
  cp2?: { x: number; y: number },
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): { d: string; e1x: number; e1y: number; e2x: number; e2y: number; cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const stubLen = Math.max(60, Math.hypot(e2.x - e1.x, e2.y - e1.y) * 0.35);
  const defaultCp1 = cp1 ?? { x: e1.x + e1.nx * stubLen, y: e1.y + e1.ny * stubLen };
  const defaultCp2 = cp2 ?? { x: e2.x + e2.nx * stubLen, y: e2.y + e2.ny * stubLen };
  const d = `M${e1.x.toFixed(1)},${e1.y.toFixed(1)} C${defaultCp1.x.toFixed(1)},${defaultCp1.y.toFixed(1)} ${defaultCp2.x.toFixed(1)},${defaultCp2.y.toFixed(1)} ${e2.x.toFixed(1)},${e2.y.toFixed(1)}`;
  return { d, e1x: e1.x, e1y: e1.y, e2x: e2.x, e2y: e2.y, cp1: defaultCp1, cp2: defaultCp2 };
}

/** Organic curved path (quadratic bezier through midpoint). */
function buildCurvedPath(
  srcRect: { x: number; y: number; w: number; h: number },
  tgtRect: { x: number; y: number; w: number; h: number },
  srcPort?: Port, tgtPort?: Port,
  srcPreset?: ShapePreset, tgtPreset?: ShapePreset,
  srcAnchor?: AnchorNorm, tgtAnchor?: AnchorNorm,
  srcVecPts?: VecPts, tgtVecPts?: VecPts,
): string {
  const sc = { x: srcRect.x + srcRect.w / 2, y: srcRect.y + srcRect.h / 2 };
  const tc = { x: tgtRect.x + tgtRect.w / 2, y: tgtRect.y + tgtRect.h / 2 };
  const e1 = resolveConnEndpoint(srcRect, srcPort, srcPreset, srcAnchor, tc, srcVecPts);
  const e2 = resolveConnEndpoint(tgtRect, tgtPort, tgtPreset, tgtAnchor, sc, tgtVecPts);
  const mx = (e1.x + e2.x) / 2 + (e2.y - e1.y) * 0.25;
  const my = (e1.y + e2.y) / 2 - (e2.x - e1.x) * 0.25;
  return `M${e1.x.toFixed(1)},${e1.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${e2.x.toFixed(1)},${e2.y.toFixed(1)}`;
}

// ─── Toolbar item component ───────────────────────────────────────────────────

function TBItem({
  icon, label, draggable: drag = false,
  onDragStart, onClick, active = false,
}: {
  icon: React.ReactNode; label: string;
  draggable?: boolean; onDragStart?: (e: React.DragEvent) => void;
  onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={drag}
      onDragStart={onDragStart}
      onClick={onClick}
      title={label}
      className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-[9px] leading-none transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent/20 hover:text-foreground"
      }`}
    >
      {icon}
      <span className="mt-0.5 max-w-[48px] truncate">{label}</span>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type MeshBoardPageProps = {
  mobileMode?: boolean;
};

export default function MeshBoardPage({ mobileMode = false }: MeshBoardPageProps) {
  const tMesh = useTranslations("mesh");
  const tShare = useTranslations("share-local");
  const params  = useParams() as { path?: string | string[] };
  const router  = useRouter();
  const localWs = useLocalWorkspace();
  const localMode = localWs.mode === "local";
  const online = useOnline();
  // Catch-all route. Cloud: meshId = first segment. Local: nested .km file path.
  const pathSegs = Array.isArray(params?.path) ? params.path : params?.path ? [params.path] : [];
  const localFile = localMode ? (() => { const p = pathSegs.map((s) => decodeURIComponent(s)).join("/"); return p.endsWith(".km") ? p : `${p}.km`; })() : "";
  // A `.km` path is always a local workspace file, never a cloud board id. On a
  // deep-link/reload the local workspace may still be reconnecting (mode not yet
  // "local"); without this guard the editor would fire cloud fetches with the
  // filename as an id → /boards/<name>.km 403 + blank canvas.
  const looksLocalFile = (decodeURIComponent(pathSegs[0] ?? "")).endsWith(".km");
  // meshId drives cloud APIs + realtime; null in local mode so realtime stays off.
  const meshId = (localMode || looksLocalFile) ? undefined : (pathSegs[0] ?? undefined);
  const { accessToken, activeTeamId, user } = useSession();
  const realtime = useRealtime();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const presenceMembers = useBoardPresence(meshId ?? null, user, accessToken);

  const [toolMode,       setToolMode]       = useState<ToolMode>("select");

  const { cursors: remoteCursors, publishCursor } = useMeshCursors(
    meshId ?? null,
    user?.id ?? null,
    user?.displayName ?? user?.name ?? user?.email ?? "User",
    accessToken,
    toolMode,
  );

  const { locks: brickLocks, publishLock, publishUnlock } = useMeshLocks(
    meshId ?? null,
    user?.id ?? null,
    user?.displayName ?? user?.name ?? user?.email ?? "User",
    user?.email ? getUserAvatarUrl(user?.avatarUrl, user.email, 24) : undefined,
    accessToken,
  );

  const [state,      setState]      = useState<MeshState>(defaultMeshState());
  const [revision,   setRevision]   = useState(0);
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(null);
  const [isLoading,  setIsLoading]  = useState(false);
  const [isSaving,   setIsSaving]   = useState(false);
  const [meshAppearance, setMeshAppearance] = useState<{
    backgroundKind?: string;
    backgroundValue?: string | null;
    backgroundImageUrl?: string | null;
    backgroundGradient?: string | null;
    themeKind?: "preset" | "custom";
    themePreset?: string | null;
    themeCustom?: Record<string, unknown>;
    coverImageUrl?: string | null;
  }>({ backgroundKind: "color", backgroundValue: "#000000" });

  // entity selector modal state (portal / mirror double-click)
  const [selectorModalBrickId,   setSelectorModalBrickId]   = useState<string | null>(null);
  const [selectorModalBrickKind, setSelectorModalBrickKind] = useState<"portal" | "mirror">("portal");

  // tool state — toolMode/setToolMode declared above (needed by useMeshCursors)
  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
  const [editingConnId,  setEditingConnId]  = useState<string | null>(null);
  const [editingBrickId, setEditingBrickId] = useState<string | null>(null);
  const [editingValue,   setEditingValue]   = useState<string>("");
  // Which field of a shape is being edited: its header label, or its raw body.
  const [editingField,   setEditingField]   = useState<"label" | "raw">("raw");
  const [connSrcId,      setConnSrcId]      = useState<string | null>(null);
  const [connSrcAnchor,  setConnSrcAnchor]  = useState<AnchorNorm | null>(null);
  const [connPreset,     setConnPreset]     = useState<ConnStyle>("technical");
  const [toolbarPanel,   setToolbarPanel]   = useState<"mode" | "basics" | "content" | "shapes" | "conn" | "status" | "style" | "templates" | "layers" | null>(null);

  // drag state
  const [dragState,    setDragState]    = useState<DragState | null>(null);
  const [resizeState,  setResizeState]  = useState<ResizeState | null>(null);
  const [vecDragState, setVecDragState] = useState<VecDragState | null>(null);
  const [panDragState, setPanDragState] = useState<PanDragState | null>(null);
  const [selRect,      setSelRect]      = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Ref mirrors selRect so event-handler closures always see the latest value (avoids stale-closure bug in onMouseMove/onMouseUp)
  const selRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Mouseup after rubber-band selection is followed by a click; consume that click to avoid clearing the new selection.
  const ignoreNextCanvasClickRef = useRef(false);
  const [pointer,      setPointer]      = useState<{ x: number; y: number } | null>(null);

  // pen state
  const [penStrokes,    setPenStrokes]    = useState<PenStroke[]>([]);
  const [activePen,     setActivePen]     = useState<PenPoint[] | null>(null);
  const [recognizing,   setRecognizing]   = useState(false);
  const [penColor, setPenColor] = useState<string>("#ffffff");
  const [penStrokeWidth, setPenStrokeWidth] = useState<number>(2);
  // "ink" = freehand pen that keeps/creates draw boards; "smart" = iink shape/text recognition
  const [penMode, setPenMode] = useState<"ink" | "smart">("ink");
  const [collapsedBoards, setCollapsedBoards] = useState<Set<string>>(new Set());
  const [hoveredRawDrawId, setHoveredRawDrawId] = useState<string | null>(null);
  const [connSrcPort,  setConnSrcPort]  = useState<Port | null>(null);
  const [snapTarget,   setSnapTarget]   = useState<{ brickId: string; port: Port } | null>(null);
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const bricksByIdRef = useRef(state.bricksById);
  bricksByIdRef.current = state.bricksById;
  const [showGrid,     setShowGrid]     = useState(true);
  // bezier cp drag: { connId, cp: 1|2, startMouse, startCp }
  const [bezierCpDrag, setBezierCpDrag] = useState<{ connId: string; cp: 1 | 2; startMouse: { x: number; y: number }; startCp: { x: number; y: number } } | null>(null);
  const penTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const penStrokesRef  = useRef<PenStroke[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<PinchGestureState | null>(null);
  const flushPenRef = useRef<(() => void) | null>(null);

  // Restore pen settings from localStorage safely on client.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedColor = window.localStorage.getItem("mesh:pen:color");
    const storedWidth = window.localStorage.getItem("mesh:pen:width");
    const storedMode = window.localStorage.getItem("mesh:pen:mode");
    if (storedColor) setPenColor(storedColor);
    const parsed = storedWidth ? Number.parseFloat(storedWidth) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) setPenStrokeWidth(parsed);
    if (storedMode === "ink" || storedMode === "smart") setPenMode(storedMode);
  }, []);

  // Persist pen settings to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mesh:pen:color", penColor);
    window.localStorage.setItem("mesh:pen:width", penStrokeWidth.toString());
    window.localStorage.setItem("mesh:pen:mode", penMode);
  }, [penColor, penStrokeWidth, penMode]);

  // Smart pen (iink) needs backend + internet → force plain ink when unavailable.
  useEffect(() => {
    if (penMode === "smart" && (!online || localMode || !meshId || !accessToken)) setPenMode("ink");
  }, [online, localMode, meshId, accessToken, penMode]);

  useEffect(() => {
    if (!mobileMode) return;
    setToolMode("pan");
  }, [mobileMode]);

  // Block browser-level pinch/ctrl+scroll zoom over the canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const prevent = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  const isSavingRef = useRef(false);
  const revisionRef = useRef(0);
  const stateHashRef = useRef("");
  const lastSavedHashRef = useRef("");
  const localLastModifiedRef = useRef(0);
  const meshBoardNameRef = useRef("Mesh");
  // Op-history baseline: the last state NOT produced by a user edit (load, save
  // echo, remote sync, undo/redo). The recorder diffs against it; syncing it at
  // those sites prevents recording non-user changes. See history block below.
  const meshHistoryBaselineRef = useRef<MeshState>(state);
  const stateRef = useRef<MeshState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Local load (from .km file in the workspace folder) ────────────────────────
  useEffect(() => {
    if (!localMode) return;
    const dir = localWs.getDir();
    if (!dir) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        // readWorkspaceFileWithMeta can reject (e.g. a folder handle restored
        // after reload lost read permission) — must not leave loading stuck or
        // throw an unhandled rejection, which left the canvas blank.
        const meta = await readWorkspaceFileWithMeta(dir, localFile);
        if (cancelled) return;
        if (meta) {
          const decoded = decodeKillioFile(meta.text);
          const { state: imported, meta: m } = deserializeKmToMesh(decoded.payload);
          setState(imported);
          if (imported.viewport) setViewport(imported.viewport);
          setMeshBoardName(m.title || localFile.replace(/\.km$/, ""));
          stateHashRef.current = JSON.stringify(imported);
          lastSavedHashRef.current = stateHashRef.current;
          localLastModifiedRef.current = meta.lastModified;
        } else {
          setState(defaultMeshState());
          setMeshBoardName(localFile.replace(/\.km$/, ""));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[mesh] local load failed", err);
        toast(tMesh("errors.loadFailed"), "error");
        setState(defaultMeshState());
        setMeshBoardName(localFile.replace(/\.km$/, ""));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMode, localFile, localWs.status]);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!meshId || !accessToken) return;
    setIsLoading(true);
    Promise.all([
      getMesh(meshId, accessToken),
      getBoard(meshId, accessToken).catch(() => null),
    ])
      .then(([s, board]) => {
        setState(s.state);
        setRevision(s.revision);
        setUpdatedAt(s.updatedAt);
        const vp = asRec(s.state.viewport);
        const vx = typeof vp.x === "number" ? vp.x : 0;
        const vy = typeof vp.y === "number" ? vp.y : 0;
        const vz = typeof vp.zoom === "number" && vp.zoom > 0 ? vp.zoom : 1;
        setViewport({ x: vx, y: vy, zoom: vz });
        const initialHash = JSON.stringify(s.state);
        stateHashRef.current = initialHash;
        lastSavedHashRef.current = initialHash;
        revisionRef.current = s.revision;
        if (board) {
          setMeshBoardName(board.name);
          setMeshBoardDescription(board.description ?? null);
          setMeshAppearance({
            backgroundKind: board.backgroundKind,
            backgroundValue: board.backgroundValue,
            backgroundImageUrl: board.backgroundImageUrl,
            backgroundGradient: board.backgroundGradient,
            themeKind: board.themeKind ?? undefined,
            themePreset: board.themePreset ?? undefined,
            themeCustom: board.themeCustom ?? undefined,
          });
        }
      })
      .catch(() => toast(tMesh("errors.loadFailed"), "error"))
      .finally(() => setIsLoading(false));
  }, [meshId, accessToken]);

  // ── Local side-update: reload when the .km file changes on disk ───────────────
  useEffect(() => {
    if (!localMode || isLoading) return;
    const dir = localWs.getDir();
    if (!dir) return;
    const id = setInterval(async () => {
      const meta = await readWorkspaceFileWithMeta(dir, localFile);
      if (!meta || meta.lastModified <= localLastModifiedRef.current + 1) return;
      const dirty = stateHashRef.current !== lastSavedHashRef.current;
      if (dirty) return; // don't clobber unsaved local edits
      try {
        const { state: imported } = deserializeKmToMesh(decodeKillioFile(meta.text).payload);
        meshHistoryBaselineRef.current = imported; // side-update reload: not a user edit
        setState(imported);
        if (imported.viewport) setViewport(imported.viewport);
        stateHashRef.current = JSON.stringify(imported);
        lastSavedHashRef.current = stateHashRef.current;
        localLastModifiedRef.current = meta.lastModified;
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMode, isLoading, localFile]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useBoardRealtime(meshId, (e) => {
    if (e.type !== "mesh.state.updated") return;
    const p = e.payload as Record<string, unknown>;
    if (p.meshId !== meshId) return;
    const nr = typeof p.revision === "number" ? p.revision : null;
    const ns = p.state as MeshState | undefined;
    if (!nr || !ns || nr <= revision) return;
    const remoteHash = JSON.stringify(ns);
    stateHashRef.current = remoteHash;
    lastSavedHashRef.current = remoteHash;
    revisionRef.current = nr;
    const vp = asRec(ns.viewport);
    const vx = typeof vp.x === "number" ? vp.x : 0;
    const vy = typeof vp.y === "number" ? vp.y : 0;
    const vz = typeof vp.zoom === "number" && vp.zoom > 0 ? vp.zoom : 1;
    setViewport({ x: vx, y: vy, zoom: vz });
    meshHistoryBaselineRef.current = ns; // remote sync: not a local user edit
    setState(ns); setRevision(nr); setUpdatedAt(new Date().toISOString());
  }, accessToken);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    stateHashRef.current = JSON.stringify(state);
  }, [state]);

  const saveMeshState = useCallback(async (nextState: MeshState, opts?: { silent?: boolean }) => {
    const payloadState: MeshState = {
      ...nextState,
      viewport: { x: viewportRef.current.x, y: viewportRef.current.y, zoom: viewportRef.current.zoom },
    };
    const snapshotHash = JSON.stringify(payloadState);

    // Local mode: serialize → write the .km file in the workspace folder.
    if (localMode) {
      const dir = localWs.getDir();
      if (!dir) return false;
      setIsSaving(true);
      try {
        const km = serializeMeshToKm(payloadState, { meshId: localFile, title: meshBoardNameRef.current });
        await writeWorkspaceFile(dir, localFile, encodeKillioFile({ kind: "km", schemaVersion: km.schemaVersion, payload: km }));
        lastSavedHashRef.current = snapshotHash;
        const m = await readWorkspaceFileWithMeta(dir, localFile);
        if (m) localLastModifiedRef.current = m.lastModified;
        void logLocalActivity(dir, localFile, { action: "mesh.updated", actorId: user?.id ?? "local", scope: "mesh", scopeId: localFile });
        return true;
      } catch { if (!opts?.silent) toast(tMesh("errors.saveFailed"), "error"); return false; }
      finally { setIsSaving(false); }
    }

    if (!meshId || !accessToken) return false;
    if (isSavingRef.current) return false;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const s = await updateMeshState(meshId, { state: payloadState, expectedRevision: revisionRef.current }, accessToken);
      const serverHash = JSON.stringify(s.state);
      lastSavedHashRef.current = serverHash;
      revisionRef.current = s.revision;

      // Avoid snapping back if user kept editing while autosave was in flight.
      if (stateHashRef.current === snapshotHash) {
        stateHashRef.current = serverHash;
        meshHistoryBaselineRef.current = s.state; // server echo: not a user edit
        setState(s.state);
      }
      setRevision(s.revision);
      setUpdatedAt(s.updatedAt);
      if (!opts?.silent) toast(tMesh("feedback.saved"), "success");
      return true;
    } catch (err: any) {
      const body = err?.response ?? err?.data;
      if (body?.error === "MESH_REVISION_CONFLICT" && body.currentState) {
        // Server has a newer revision — apply it and show a warning
        meshHistoryBaselineRef.current = body.currentState; // remote conflict resolve
        setState(body.currentState);
        revisionRef.current = body.currentRevision;
        setRevision(body.currentRevision);
        lastSavedHashRef.current = JSON.stringify(body.currentState);
        stateHashRef.current = JSON.stringify(body.currentState);
        toast(tMesh("feedback.conflictResolved"), "warning");
      } else {
        if (!opts?.silent) toast(tMesh("errors.saveFailed"), "error");
      }
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshId, accessToken, localMode, localFile]);

  // ── Op-history: undo/redo as mesh deltas ───────────────────────────────────
  // Mesh is a whole-state model (autosave + revision). The applier replaces the
  // affected entities and persists via saveMeshState, which rides the existing
  // mesh.state.updated broadcast so undo/redo converge across peers. Transport
  // is the whole-state sync, so we don't double-publish op events (broadcast/
  // subscribe off). Pure delta + reducer live in src/lib/history/mesh-ops.ts.
  const meshApplier = useCallback(
    makeMeshApplier({
      getState: () => stateRef.current,
      setState: (next) => setState(next),
      save: (next) => { void saveMeshState(next, { silent: true }); },
      markBaseline: (next) => { meshHistoryBaselineRef.current = next; },
    }),
    [saveMeshState],
  );
  const history = useOpHistory({
    scope: { kind: "mesh", id: (meshId ?? localFile) as string } as OpScope,
    apply: meshApplier,
    enabled: false, // transport rides the existing whole-state realtime sync
    broadcast: false,
    cap: 100,
  });

  // Recorder: diff the baseline against settled state and record one op per
  // edit burst (debounced so a drag/resize collapses into a single undo step).
  const meshRecordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meshPendingBase = useRef<MeshState | null>(null);
  useEffect(() => {
    if (isLoading || history.applyingRef.current) {
      meshHistoryBaselineRef.current = state;
      return;
    }
    if (state === meshHistoryBaselineRef.current) return;
    if (meshPendingBase.current === null) meshPendingBase.current = meshHistoryBaselineRef.current;
    meshHistoryBaselineRef.current = state;
    if (meshRecordTimer.current) clearTimeout(meshRecordTimer.current);
    meshRecordTimer.current = setTimeout(() => {
      const base = meshPendingBase.current;
      meshPendingBase.current = null;
      if (!base) return;
      const draft = computeMeshDelta(base, stateRef.current);
      if (draft) history.record(draft);
    }, 450);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isLoading]);

  // ── Canvas coords ────────────────────────────────────────────────────────────
  const toCanvas = useCallback((cx: number, cy: number) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sx = cx - r.left;
    const sy = cy - r.top;
    return {
      x: (sx - viewport.x) / viewport.zoom,
      y: (sy - viewport.y) / viewport.zoom,
    };
  }, [viewport.x, viewport.y, viewport.zoom]);

  const fromEv = useCallback((e: { clientX: number; clientY: number }) => toCanvas(e.clientX, e.clientY), [toCanvas]);

  const onCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    setViewport((current) => {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = Math.max(0.2, Math.min(2.8, current.zoom * zoomFactor));
      const worldX = (sx - current.x) / current.zoom;
      const worldY = (sy - current.y) / current.zoom;
      return {
        x: sx - worldX * nextZoom,
        y: sy - worldY * nextZoom,
        zoom: nextZoom,
      };
    });
  }, []);

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileMode || e.pointerType !== "touch") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const next = touchPointersRef.current;
    next.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (next.size === 1) {
      pinchStateRef.current = null;

      if (toolMode === "pen") {
        const { x, y } = fromEv(e);
        setActivePen([{ x, y, t: Date.now() }]);
        return;
      }

      if (toolMode === "select") {
        const { x, y } = fromEv(e);
        const rect = { x1: x, y1: y, x2: x, y2: y };
        selRectRef.current = rect;
        setSelRect(rect);
        setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
        return;
      }

      // pan mode (default)
      setPanDragState({
        startMouse: { x: e.clientX, y: e.clientY },
        startViewport: { x: viewportRef.current.x, y: viewportRef.current.y },
      });
      return;
    }

    if (next.size === 2) {
      setPanDragState(null);
      const [p1, p2] = Array.from(next.values());
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;
      pinchStateRef.current = {
        startDistance: Math.max(1, Math.hypot(dx, dy)),
        startViewport: { x: viewportRef.current.x, y: viewportRef.current.y, zoom: viewportRef.current.zoom },
        centerScreen: { x: centerX, y: centerY },
      };
    }
  }, [mobileMode, toolMode, fromEv]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileMode || e.pointerType !== "touch") return;
    const next = touchPointersRef.current;
    if (!next.has(e.pointerId)) return;
    next.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (next.size >= 2) {
      const pinch = pinchStateRef.current;
      if (!pinch) return;
      const [p1, p2] = Array.from(next.values());
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const ratio = distance / pinch.startDistance;
      const nextZoom = Math.max(0.2, Math.min(2.8, pinch.startViewport.zoom * ratio));
      const worldX = (pinch.centerScreen.x - pinch.startViewport.x) / pinch.startViewport.zoom;
      const worldY = (pinch.centerScreen.y - pinch.startViewport.y) / pinch.startViewport.zoom;
      setViewport({
        x: pinch.centerScreen.x - worldX * nextZoom,
        y: pinch.centerScreen.y - worldY * nextZoom,
        zoom: nextZoom,
      });
      return;
    }

    if (next.size === 1 && panDragState) {
      setViewport({
        x: panDragState.startViewport.x + (e.clientX - panDragState.startMouse.x),
        y: panDragState.startViewport.y + (e.clientY - panDragState.startMouse.y),
        zoom: viewportRef.current.zoom,
      });
      return;
    }

    if (next.size === 1 && toolMode === "pen" && activePen) {
      const { x, y } = fromEv(e);
      setActivePen((p) => p ? [...p, { x, y, t: Date.now() }] : p);
      return;
    }

    if (next.size === 1 && toolMode === "select" && selRectRef.current) {
      const { x, y } = fromEv(e);
      const updated = { ...selRectRef.current, x2: x, y2: y };
      selRectRef.current = updated;
      setSelRect(updated);
      return;
    }
  }, [mobileMode, panDragState, toolMode, activePen, fromEv]);

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobileMode || e.pointerType !== "touch") return;
    const next = touchPointersRef.current;
    next.delete(e.pointerId);

    if (next.size === 0) {
      pinchStateRef.current = null;
      setPanDragState(null);
      if (toolMode === "pen") flushPenRef.current?.();
      return;
    }

    if (next.size === 1) {
      pinchStateRef.current = null;
      const [remaining] = Array.from(next.values());
      setPanDragState({
        startMouse: { x: remaining.x, y: remaining.y },
        startViewport: { x: viewportRef.current.x, y: viewportRef.current.y },
      });
    }
  }, [mobileMode, toolMode]);

  const gPos = useCallback((id: string) => resolveGlobal(state.bricksById, id), [state.bricksById]);

  // Phase 1: Context for mentions resolution inside mesh
  // Local mode: @-mention targets come from workspace files (cloud has none here).
  const refDocs = useMemo(() => (localMode ? localPickerContext(localWs.files, localWs.folders).documents : []), [localMode, localWs.files, localWs.folders]);
  const refBoards = useMemo(() => (localMode ? localPickerContext(localWs.files, localWs.folders).boards : []), [localMode, localWs.files, localWs.folders]);

  const MESH_CONTEXT = useMemo<ResolverContext>(() => ({
    documents: refDocs as any,
    boards: refBoards as any,
    users: [],
    activeBricks: [],
  }), [refDocs, refBoards]);

  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  // Parsed/generated result awaiting user confirmation before insertion (preview).
  const [diagramPreview, setDiagramPreview] = useState<MeshTemplate | null>(null);
  const [isTextToDiagramOpen, setIsTextToDiagramOpen] = useState(false);
  const [diagramPrompt, setDiagramPrompt] = useState("");
  const [diagramGenerating, setDiagramGenerating] = useState(false);
  const [diagramMode, setDiagramMode] = useState<"ai" | "mermaid">("ai");
  const [userTemplates, setUserTemplates] = useState<MeshTemplate[]>([]);
  const [tplCategory, setTplCategory] = useState<TemplateCategory | "all">("all");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"copilot" | "chat" | "activity">("chat");
  const [portalPreview, setPortalPreview] = useState<{ url: string; title: string } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isBoardSettingsOpen, setIsBoardSettingsOpen] = useState(false);
  const kmImportInputRef = useRef<HTMLInputElement | null>(null);
  const [meshBoardName, setMeshBoardName] = useState("Mesh");
  meshBoardNameRef.current = meshBoardName;
  const [meshBoardDescription, setMeshBoardDescription] = useState<string | null>(null);
  const portalHydrationInFlightRef = useRef<Set<string>>(new Set());
  const portalHydrationAttemptRef = useRef<Record<string, string>>({});
  const portalScreenshotInFlightRef = useRef<Set<string>>(new Set());
  const portalScreenshotAttemptRef = useRef<Record<string, string>>({});
  // Live list of portals to refresh periodically — updated from state without restarting the interval
  const portalsForRefreshRef = useRef<Array<{ brickId: string; portalHref: string }>>([]);
  const floatingToolbarRef = useRef<HTMLDivElement | null>(null);

  const buildPortalHref = useCallback((
    targetType: string,
    targetId: string,
    opts?: { layout?: boolean },
  ) => {
    if (!targetId) return "";
    const layoutEnabled = opts?.layout ?? true;
    const base = targetType === "mesh" ? `/m/${targetId}` : targetType === "board" ? `/b/${targetId}` : `/d/${targetId}`;
    if (layoutEnabled) return base;
    const params = new URLSearchParams();
    params.set("layout", "false");
    return `${base}?${params.toString()}`;
  }, []);

  const buildPortalFallbackImageDataUrl = useCallback((
    title: string,
    subtitle: string,
    targetType: string,
  ): string => {
    const esc = (value: string) => value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const safeTitle = esc((title || "Portal").slice(0, 48));
    const safeSubtitle = esc((subtitle || targetType || "Preview").slice(0, 64));
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="100%" stop-color="#1e3a8a"/>
          </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#g)"/>
        <g fill="none" stroke="rgba(255,255,255,0.08)">
          <rect x="90" y="110" width="1100" height="500" rx="20"/>
          <rect x="120" y="150" width="1040" height="52" rx="12"/>
          <rect x="120" y="224" width="720" height="300" rx="16"/>
          <rect x="862" y="224" width="298" height="300" rx="16"/>
        </g>
        <text x="130" y="186" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="22" letter-spacing="2">${safeSubtitle.toUpperCase()}</text>
        <text x="130" y="300" fill="#ffffff" font-family="Arial, sans-serif" font-size="48" font-weight="700">${safeTitle}</text>
        <text x="130" y="350" fill="#94a3b8" font-family="Arial, sans-serif" font-size="26">Vista cacheada del portal</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, []);

  const capturePortalScreenshot = useCallback(async (portalHref: string): Promise<string | null> => {
    if (typeof window === "undefined" || !portalHref) return null;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.style.width = "1280px";
    iframe.style.height = "720px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      iframe.onload = null;
      iframe.onerror = null;
      iframe.remove();
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("portal screenshot timeout")), 20000);
        iframe.onload = () => {
          window.clearTimeout(timeoutId);
          resolve();
        };
        iframe.onerror = () => {
          window.clearTimeout(timeoutId);
          reject(new Error("portal screenshot load failed"));
        };
        iframe.src = portalHref;
      });

      // Wait for JS/data to finish loading — Next.js apps need a few seconds to hydrate
      await new Promise((resolve) => window.setTimeout(resolve, 3500));

      const frameDoc = iframe.contentDocument;
      if (!frameDoc) return null;
      if (frameDoc.readyState !== "complete") {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }

      const root = (frameDoc.querySelector("main") as HTMLElement | null) ?? frameDoc.body;
      if (!root) return null;

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(root, {
        backgroundColor: "#020617",
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: true,
        logging: false,
        width: 1280,
        height: 720,
      });
      try {
        return canvas.toDataURL("image/webp", 0.85);
      } catch {
        return canvas.toDataURL("image/jpeg", 0.85);
      }
    } catch {
      return null;
    } finally {
      cleanup();
    }
  }, []);

  const loadPortalArtifact = useCallback(async (
    targetType: string,
    targetId: string,
    fallbackLabel?: string,
  ): Promise<{ markdown: string; kind: string; subtitle: string; title: string } | null> => {
    if (!accessToken || !targetId) return null;

    const extractMarkdown = (input: unknown): string => {
      if (typeof input === "string") return input;
      if (input && typeof input === "object") {
        const rec = input as Record<string, unknown>;
        if (typeof rec.markdown === "string") return rec.markdown;
        if (typeof rec.text === "string") return rec.text;
        if (typeof rec.summary === "string") return rec.summary;
        if (typeof rec.label === "string") return rec.label;
      }
      return "";
    };

    try {
      if (targetType === "document") {
        const doc = await getDocument(targetId, accessToken);
        const firstBrick = (doc.bricks || []).find((b) => extractMarkdown(b.content).trim().length > 0) ?? (doc.bricks || [])[0];
        const markdown = firstBrick ? extractMarkdown(firstBrick.content).trim() : "";
        return {
          markdown: markdown || tMesh("hints.noDocContent"),
          kind: firstBrick?.kind ?? "text",
          subtitle: "Documento",
          title: doc.title || fallbackLabel || targetId,
        };
      }

      if (targetType === "board") {
        const board = await getBoard(targetId, accessToken);
        const firstCard = board.lists.flatMap((l) => l.cards || [])[0];
        const firstBlock = firstCard?.blocks?.find((blk) => extractMarkdown(blk).trim().length > 0) ?? firstCard?.blocks?.[0];
        const markdown = extractMarkdown(firstBlock).trim() || firstCard?.summary?.trim() || firstCard?.title || "";
        return {
          markdown: markdown || tMesh("hints.noCardContent"),
          kind: firstBlock?.kind ?? "text",
          subtitle: `Board${firstCard?.title ? ` · ${firstCard.title}` : ""}`,
          title: board.name || fallbackLabel || targetId,
        };
      }

      const mesh = await getMesh(targetId, accessToken);
      const byId = mesh.state.bricksById;
      const orderedIds = [
        ...mesh.state.rootOrder,
        ...Object.keys(byId).filter((id) => !mesh.state.rootOrder.includes(id)),
      ];
      const firstBrick = orderedIds
        .map((id) => byId[id])
        .find((b) => b && extractMarkdown(b.content).trim().length > 0) ?? orderedIds.map((id) => byId[id]).find(Boolean);
      const markdown = firstBrick ? extractMarkdown(firstBrick.content).trim() : "";
      return {
        markdown: markdown || tMesh("hints.noMeshContent"),
        kind: firstBrick?.kind ?? "text",
        subtitle: "Mesh",
        title: fallbackLabel || targetId,
      };
    } catch {
      return null;
    }
  }, [accessToken]);

  const portalBrickSignatures = useMemo(
    () => Object.values(state.bricksById)
      .filter((b) => b.kind === "portal")
      .map((b) => {
        const c = (b.content as Record<string, unknown>) ?? {};
        return `${b.id}:${c.targetId ?? ""}:${c.targetType ?? ""}`;
      })
      .sort()
      .join("|"),
    [state.bricksById],
  );

  useEffect(() => {
    if (!accessToken) return;

    const portals = Object.values(state.bricksById).filter((b) => {
      if (b.kind !== "portal") return false;
      const content = asRec(b.content);
      if (typeof content.unifierKind === "string") return false;
      return typeof content.targetId === "string" && content.targetId.trim().length > 0;
    });

    portals.forEach((portalBrick) => {
      const content = asRec(portalBrick.content);
      const targetType = typeof content.targetType === "string" ? content.targetType : "mesh";
      const targetId = typeof content.targetId === "string" ? content.targetId.trim() : "";
      const targetLabel = typeof content.targetLabel === "string" ? content.targetLabel : "";
      const hasPreview = typeof content.previewMarkdown === "string" && content.previewMarkdown.trim().length > 0;
      const hasPreviewImage = typeof content.previewImageDataUrl === "string" && content.previewImageDataUrl.startsWith("data:image/");
      const previewImageSource = typeof content.previewImageSource === "string" ? content.previewImageSource : "";
      const hasScreenshotImage = hasPreviewImage && previewImageSource === "screenshot";
      if (!targetId) {
        delete portalHydrationAttemptRef.current[portalBrick.id];
        delete portalScreenshotAttemptRef.current[portalBrick.id];
        return;
      }

      const screenshotSignature = `${targetType}:${targetId}`;
      if (!hasScreenshotImage && !portalScreenshotInFlightRef.current.has(portalBrick.id) && portalScreenshotAttemptRef.current[portalBrick.id] !== screenshotSignature) {
        portalScreenshotAttemptRef.current[portalBrick.id] = screenshotSignature;
        portalScreenshotInFlightRef.current.add(portalBrick.id);
        const portalHref = buildPortalHref(targetType, targetId, { layout: false });
        const fallbackImageDataUrl = buildPortalFallbackImageDataUrl(
          targetLabel || targetId,
          targetType === "mesh" ? "Mesh Board" : targetType === "board" ? "Kanban Board" : "Documento",
          targetType,
        );

        // Set fallback immediately so the portal shows something right away
        if (!hasPreviewImage) {
          setState((cur) => {
            const live = cur.bricksById[portalBrick.id];
            if (!live || live.kind !== "portal") return cur;
            const liveContent = asRec(live.content);
            if (typeof liveContent.previewImageDataUrl === "string" && liveContent.previewImageDataUrl.startsWith("data:image/")) return cur;
            return {
              ...cur,
              bricksById: {
                ...cur.bricksById,
                [portalBrick.id]: {
                  ...live,
                  content: { ...liveContent, previewImageDataUrl: fallbackImageDataUrl, previewImageSource: "fallback", previewImageCapturedAt: new Date().toISOString() },
                },
              },
            };
          });
        }

        void capturePortalScreenshot(portalHref)
          .then((screenshotDataUrl) => {
            if (!screenshotDataUrl) return; // keep the fallback already set
            setState((cur) => {
              const live = cur.bricksById[portalBrick.id];
              if (!live || live.kind !== "portal") return cur;
              const liveContent = asRec(live.content);
              return {
                ...cur,
                bricksById: {
                  ...cur.bricksById,
                  [portalBrick.id]: {
                    ...live,
                    content: {
                      ...liveContent,
                      previewImageDataUrl: screenshotDataUrl,
                      previewImageSource: "screenshot",
                      previewImageCapturedAt: new Date().toISOString(),
                    },
                  },
                },
              };
            });
          })
          .finally(() => {
            portalScreenshotInFlightRef.current.delete(portalBrick.id);
          });
      }

      if (hasPreview) return;

      const signature = `${targetType}:${targetId}`;
      if (portalHydrationAttemptRef.current[portalBrick.id] === signature) return;
      if (portalHydrationInFlightRef.current.has(portalBrick.id)) return;

      portalHydrationAttemptRef.current[portalBrick.id] = signature;
      portalHydrationInFlightRef.current.add(portalBrick.id);
      void loadPortalArtifact(targetType, targetId, targetLabel)
        .then((artifact) => {
          if (!artifact) return;
          setState((cur) => {
            const live = cur.bricksById[portalBrick.id];
            if (!live || live.kind !== "portal") return cur;
            const liveContent = asRec(live.content);
            const alreadyHasPreview = typeof liveContent.previewMarkdown === "string" && liveContent.previewMarkdown.trim().length > 0;
            if (alreadyHasPreview) return cur;
            return {
              ...cur,
              bricksById: {
                ...cur.bricksById,
                [portalBrick.id]: {
                  ...live,
                  content: {
                    ...liveContent,
                    previewMarkdown: artifact.markdown,
                    previewKind: artifact.kind,
                    previewSubtitle: artifact.subtitle,
                    previewTitle: artifact.title,
                  },
                },
              },
            };
          });
        })
        .finally(() => {
          portalHydrationInFlightRef.current.delete(portalBrick.id);
        });
    });
  }, [accessToken, buildPortalFallbackImageDataUrl, buildPortalHref, capturePortalScreenshot, loadPortalArtifact, portalBrickSignatures]);

  // Keep the refresh-ref in sync whenever bricks change (no interval restart needed)
  useEffect(() => {
    portalsForRefreshRef.current = Object.values(state.bricksById)
      .filter((b) => {
        if (b.kind !== "portal") return false;
        const c = asRec(b.content);
        if (typeof c.unifierKind === "string") return false;
        return typeof c.targetId === "string" && (c.targetId as string).trim().length > 0;
      })
      .map((b) => {
        const c = asRec(b.content);
        const targetType = typeof c.targetType === "string" ? c.targetType : "mesh";
        const targetId = typeof c.targetId === "string" ? c.targetId.trim() : "";
        return { brickId: b.id, portalHref: buildPortalHref(targetType, targetId, { layout: false }) };
      })
      .filter((p) => !!p.portalHref);
  }, [state.bricksById, buildPortalHref]);

  // Periodic portal screenshot refresh — stable interval, reads from ref to avoid restarts
  useEffect(() => {
    const REFRESH_MS = 5000;
    const id = window.setInterval(() => {
      portalsForRefreshRef.current.forEach(({ brickId, portalHref }) => {
        if (portalScreenshotInFlightRef.current.has(brickId)) return;
        portalScreenshotInFlightRef.current.add(brickId);
        void capturePortalScreenshot(portalHref)
          .then((screenshotDataUrl) => {
            if (!screenshotDataUrl) return;
            setState((cur) => {
              const live = cur.bricksById[brickId];
              if (!live || live.kind !== "portal") return cur;
              const liveContent = asRec(live.content);
              return {
                ...cur,
                bricksById: {
                  ...cur.bricksById,
                  [brickId]: {
                    ...live,
                    content: { ...liveContent, previewImageDataUrl: screenshotDataUrl, previewImageSource: "screenshot", previewImageCapturedAt: new Date().toISOString() },
                  },
                },
              };
            });
          })
          .finally(() => { portalScreenshotInFlightRef.current.delete(brickId); });
      });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [capturePortalScreenshot]);

  // ── Mirror hydration (option 1: fetch on mount / when brick is added) ─────────
  const mirrorHydrationAttemptRef = useRef<Record<string, string>>({});
  const mirrorHydrationInFlightRef = useRef<Set<string>>(new Set());

  const mirrorBrickSignatures = useMemo(
    () => Object.values(state.bricksById)
      .filter((b) => b.kind === "mirror")
      .map((b) => {
        const c = (b.content as Record<string, unknown>) ?? {};
        return `${b.id}:${c.sourceId ?? ""}:${c.sourceType ?? ""}`;
      })
      .sort()
      .join("|"),
    [state.bricksById],
  );

  useEffect(() => {
    if (!accessToken) return;
    const mirrors = Object.values(state.bricksById).filter((b) => {
      if (b.kind !== "mirror") return false;
      const c = asRec(b.content);
      return typeof c.sourceScopeId === "string" && (c.sourceScopeId as string).trim().length > 0
          && typeof c.sourceId === "string" && (c.sourceId as string).trim().length > 0;
    });

    mirrors.forEach((mirrorBrick) => {
      const c = asRec(mirrorBrick.content);
      const sourceType   = typeof c.sourceType   === "string" ? c.sourceType   : "mesh";
      const sourceScopeId = (c.sourceScopeId as string).trim();
      const sourceId     = (c.sourceId as string).trim();
      const sig = `${sourceType}:${sourceScopeId}:${sourceId}`;
      if (mirrorHydrationAttemptRef.current[mirrorBrick.id] === sig) return;
      if (mirrorHydrationInFlightRef.current.has(mirrorBrick.id)) return;
      mirrorHydrationAttemptRef.current[mirrorBrick.id] = sig;
      mirrorHydrationInFlightRef.current.add(mirrorBrick.id);

      void (async () => {
        try {
          let previewMarkdown = "";
          let previewContent: Record<string, unknown> | null = null;
          if (sourceType === "mesh") {
            const mesh = await getMesh(sourceScopeId, accessToken);
            const brick = mesh.state.bricksById[sourceId];
            if (brick) {
              const bc = asRec(brick.content);
              previewMarkdown = typeof bc.markdown === "string" ? bc.markdown
                : typeof bc.text === "string" ? bc.text : "";
              previewContent = bc as Record<string, unknown>;
            }
          } else if (sourceType === "board") {
            const board = await getBoard(sourceScopeId, accessToken);
            const card = board.lists.flatMap((l) => l.cards || []).find((card) => card.id === sourceId || card.blocks?.some((blk: Record<string, unknown>) => blk.id === sourceId));
            if (card) {
              previewMarkdown = card.summary?.trim() || card.title || "";
            }
          } else if (sourceType === "document") {
            const doc = await getDocument(sourceScopeId, accessToken);
            const brick = (doc.bricks || []).find((b) => b.id === sourceId);
            if (brick) {
              const bc = asRec(brick.content);
              previewMarkdown = typeof bc.markdown === "string" ? bc.markdown : typeof bc.text === "string" ? bc.text : "";
            }
          }
          if (!previewMarkdown && !previewContent) return;
          setState((cur) => {
            const live = cur.bricksById[mirrorBrick.id];
            if (!live || live.kind !== "mirror") return cur;
            return { ...cur, bricksById: { ...cur.bricksById, [mirrorBrick.id]: { ...live, content: { ...asRec(live.content), previewMarkdown, previewContent } } } };
          });
        } catch { /* silent */ } finally {
          mirrorHydrationInFlightRef.current.delete(mirrorBrick.id);
        }
      })();
    });
  }, [accessToken, mirrorBrickSignatures]);

  // ── Mirror WS refresh (option 3: subscribe to source mesh channel) ────────────
  useEffect(() => {
    if (!accessToken) return;
    // Collect distinct source scope IDs and which mirror bricks watch them
    const scopeMap = new Map<string, { scopeId: string; brickIds: Set<string> }>();
    Object.values(state.bricksById).forEach((b) => {
      if (b.kind !== "mirror") return;
      const c = asRec(b.content);
      const sourceType    = typeof c.sourceType    === "string" ? c.sourceType    : "mesh";
      const sourceScopeId = typeof c.sourceScopeId === "string" ? (c.sourceScopeId as string).trim() : "";
      if (!sourceScopeId || sourceType !== "mesh") return;
      if (!scopeMap.has(sourceScopeId)) scopeMap.set(sourceScopeId, { scopeId: sourceScopeId, brickIds: new Set() });
      scopeMap.get(sourceScopeId)!.brickIds.add(b.id);
    });
    if (scopeMap.size === 0) return;

    const subscriptions: Array<{ channelName: string; listener: (msg: { name: string; data: unknown; clientId?: string }) => void }> = [];

    scopeMap.forEach(({ scopeId, brickIds }) => {
      const channel = realtime.getChannel(realtimeChannel.mesh(scopeId));
      const listener = async (message: { name: string; data: unknown; clientId?: string }) => {
        const data = (message.data ?? {}) as Record<string, unknown>;
        const eventType = message.name ?? "";
        if (eventType !== "mesh.brick.updated" && eventType !== "mesh.state.updated") return;
        // Re-fetch the source mesh and update all mirrors watching this scope
        try {
          const mesh = await getMesh(scopeId, accessToken);
          setState((cur) => {
            let next = cur;
            brickIds.forEach((mirrorId) => {
              const mirrorBrick = cur.bricksById[mirrorId];
              if (!mirrorBrick || mirrorBrick.kind !== "mirror") return;
              const mc = asRec(mirrorBrick.content);
              const sourceId = typeof mc.sourceId === "string" ? mc.sourceId : "";
              if (!sourceId) return;
              // Only update if this specific brick changed (if brickId is in payload)
              const payloadBrickId = typeof data.brickId === "string" ? data.brickId : null;
              if (payloadBrickId && payloadBrickId !== sourceId) return;
              const sourceBrick = mesh.state.bricksById[sourceId];
              if (!sourceBrick) return;
              const bc = asRec(sourceBrick.content);
              const previewMarkdown = typeof bc.markdown === "string" ? bc.markdown : typeof bc.text === "string" ? bc.text : "";
              next = { ...next, bricksById: { ...next.bricksById, [mirrorId]: { ...mirrorBrick, content: { ...mc, previewMarkdown, previewContent: bc as Record<string, unknown> } } } };
            });
            return next;
          });
        } catch { /* silent */ }
      };
      channel.subscribe("mesh.brick.updated", listener);
      channel.subscribe("mesh.state.updated", listener);
      subscriptions.push({ channelName: realtimeChannel.mesh(scopeId), listener });
    });

    return () => {
      subscriptions.forEach(({ channelName, listener }) => {
        const channel = realtime.getChannel(channelName);
        try { channel.unsubscribe("mesh.brick.updated", listener); } catch {}
        try { channel.unsubscribe("mesh.state.updated", listener); } catch {}
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, meshId, realtime]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (active?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); void history.undo(); return; }
        if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); void history.redo(); return; }
      }
      if (e.key === "s" || e.key === "v") { setToolMode("select"); return; }
      if (e.key === "h")                  { setToolMode("pan"); return; }
      if (e.key === "p")                  { setToolMode("pen"); return; }
      if (e.key === "Escape")             { setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null); setConnSrcId(null); setEditingBrickId(null); setEditingConnId(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.size > 0) {
          setState((c) => { let s = c; selectedIds.forEach((id) => { s = deleteBrick(s, id); }); return s; });
          setSelectedIds(new Set()); toast(tMesh("feedback.deletedCount", { count: selectedIds.size }), "success");
        } else {
          if (selectedId) { setState((c) => deleteBrick(c, selectedId)); setSelectedId(null); toast(tMesh("feedback.deleted"), "success"); }
          if (selectedConnId) { setState((c) => deleteConn(c, selectedConnId)); setSelectedConnId(null); }
        }
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selectedId, selectedIds, selectedConnId, editingBrickId, history]);

  // ── Clipboard: copy selected bricks / paste bricks as canvas meta-bricks ────
  const pasteBricksToMesh = useCallback((bricks: ClipboardBrick[], at?: { x: number; y: number }) => {
    if (bricks.length === 0) return;
    const el = canvasRef.current; const vp = viewportRef.current;
    const cx = at ? at.x : (el ? (el.clientWidth / 2 - vp.x) / Math.max(vp.zoom, 0.01) : 400);
    const cy = at ? at.y : (el ? (el.clientHeight / 2 - vp.y) / Math.max(vp.zoom, 0.01) : 300);
    setState((cur) => {
      let next = cur; const base = Object.keys(cur.bricksById).length; let i = 0;
      for (const cb of bricks) {
        const uk = String((cb.content as any)?.unifierKind || (cb.content as any)?.kind || cb.kind || "text").toLowerCase();
        const entry = CONTENT_BRICKS.find((e) => e.unifierKind === uk) || CONTENT_BRICKS.find((e) => e.unifierKind === "text")!;
        const b = mkBrick(entry.kind, base + i, null, undefined, undefined, entry.unifierKind);
        b.content = { ...(b.content as Record<string, unknown>), unifierKind: entry.unifierKind, ...((cb.content && typeof cb.content === "object") ? cb.content as Record<string, unknown> : {}) };
        next = insertBrick(next, b, { x: cx + i * 26, y: cy + i * 26 });
        i += 1;
      }
      return next;
    });
    toast(tMesh("clipboard.pasted", { n: bricks.length }), "success");
  }, [tMesh]);

  useEffect(() => {
    ensureClipboardChannel();
    const inEditable = () => {
      if (editingBrickId) return true;
      const el = (typeof window !== "undefined" ? window.document.activeElement : null) as HTMLElement | null;
      return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    const collectSelected = (): ClipboardBrick[] => {
      const ids = selectedIds.size > 0 ? [...selectedIds] : (selectedId ? [selectedId] : []);
      return ids.map((id) => state.bricksById[id]).filter(Boolean).map((b) => {
        const c = (b.content && typeof b.content === "object" ? b.content as Record<string, unknown> : {});
        const kind = String(c.unifierKind || b.kind);
        return { kind, content: b.content } as ClipboardBrick;
      });
    };
    const onCopy = (e: ClipboardEvent) => {
      if (inEditable()) return;
      const bricks = collectSelected();
      if (bricks.length === 0 || !e.clipboardData) return;
      e.preventDefault();
      writeBricksToDataTransfer(e.clipboardData, makeEnvelope("mesh", meshId ?? localFile, bricks), { html: bricksToHtml(bricks), plain: bricksToMarkdown(bricks) });
      toast(tMesh("clipboard.copied", { n: bricks.length }), "success");
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inEditable()) return;
      const bricks = bricksFromClipboardEvent(e);
      if (bricks.length === 0) return;
      e.preventDefault();
      pasteBricksToMesh(bricks);
    };
    // Cut = copy the selection, then delete every selected brick.
    const onCut = (e: ClipboardEvent) => {
      if (inEditable()) return;
      const ids = selectedIds.size > 0 ? [...selectedIds] : (selectedId ? [selectedId] : []);
      const bricks = collectSelected();
      if (bricks.length === 0 || !e.clipboardData) return;
      e.preventDefault();
      writeBricksToDataTransfer(e.clipboardData, makeEnvelope("mesh", meshId ?? localFile, bricks), { html: bricksToHtml(bricks), plain: bricksToMarkdown(bricks) });
      setState((c) => { let s = c; ids.forEach((id) => { s = deleteBrick(s, id); }); return s; });
      setSelectedIds(new Set()); setSelectedId(null);
      toast(tMesh("clipboard.cut", { n: ids.length }), "success");
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("copy", onCopy); window.removeEventListener("cut", onCut); window.removeEventListener("paste", onPaste); };
  }, [selectedId, selectedIds, state.bricksById, editingBrickId, meshId, localFile, pasteBricksToMesh, tMesh]);

  useEffect(() => {
    if (!toolbarPanel) return;
    const onOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!floatingToolbarRef.current?.contains(target)) {
        setToolbarPanel(null);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [toolbarPanel]);

  const dockBtnClass = useCallback((active: boolean) => (
    `inline-flex ${mobileMode ? "h-10 w-10" : "h-9 w-9"} items-center justify-center rounded-xl border transition-colors ${
      active
        ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-100"
        : "border-white/10 bg-slate-900/85 text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-100"
    }`
  ), [mobileMode]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    await saveMeshState(state, { silent: false });
  }, [saveMeshState, state]);

  const handleDownloadMesh = useCallback(() => {
    if (!meshId) return;
    try {
      const km = serializeMeshToKm(
        { ...state, viewport: { x: viewportRef.current.x, y: viewportRef.current.y, zoom: viewportRef.current.zoom } },
        { meshId, title: meshBoardName },
      );
      downloadKillioFile(
        { kind: "km", schemaVersion: km.schemaVersion, payload: km },
        killioFilename("km", meshBoardName, meshId),
      );
      toast(tMesh("feedback.downloaded"), "success");
    } catch {
      toast(tMesh("errors.downloadFailed"), "error");
    }
  }, [meshId, state, meshBoardName]);

  // Import a .km binary file → replace current mesh state (after confirm) and
  // persist so the server revision is bumped (otherwise autosave conflict-reverts).
  const handleImportMeshFile = useCallback((file: File) => {
    readKillioFile(file).then((kf) => {
      if (kf.kind !== "km") { toast(tMesh("file.importWrongKind"), "error"); return; }
      const { state: imported } = deserializeKmToMesh(kf.payload);
      const count = Object.keys(imported.bricksById).length;
      if (typeof window !== "undefined" && !window.confirm(tMesh("file.importConfirm", { count }))) return;
      setState(imported);
      setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
      if (imported.viewport) setViewport(imported.viewport);
      void saveMeshState(imported, { silent: true });
      toast(tMesh("file.imported", { count }), "success");
    }).catch(() => toast(tMesh("file.importFailed"), "error"));
  }, [saveMeshState, tMesh]);

  const handleShareMesh = useCallback(() => {
    setIsShareModalOpen(true);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!localMode && (!meshId || !accessToken)) return;
    const currentHash = stateHashRef.current;
    if (!currentHash || currentHash === lastSavedHashRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveMeshState(state, { silent: true });
    }, localMode ? 400 : 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [meshId, accessToken, isLoading, state, saveMeshState, localMode]);


  // ── Inline editing ────────────────────────────────────────────────────────────
  const startEdit = useCallback((brickId: string, field: "label" | "raw" = "raw") => {
    const b = state.bricksById[brickId];
    if (!b) return;
    if (b.kind === "text" || b.kind === "decision") { setEditingField("raw"); setEditingValue(getMd(b)); setEditingBrickId(brickId); return; }
    if (b.kind === "draw" || b.kind === "frame") {
      // Label (header) and raw body are independent edit contexts.
      setEditingField(field);
      setEditingValue(field === "label" ? (typeof asRec(b.content).label === "string" ? (asRec(b.content).label as string) : "") : getMd(b));
      setEditingBrickId(brickId);
      return;
    }
    if (b.kind === "portal") {
      if (activeTeamId) {
        setSelectorModalBrickKind("portal");
        setSelectorModalBrickId(brickId);
        return;
      }
      const lbl = typeof asRec(b.content).targetLabel === "string" ? asRec(b.content).targetLabel as string : "";
      setEditingValue(lbl); setEditingBrickId(brickId); return;
    }
    if (b.kind === "mirror") {
      if (activeTeamId) {
        setSelectorModalBrickKind("mirror");
        setSelectorModalBrickId(brickId);
        return;
      }
      const lbl = typeof asRec(b.content).sourceLabel === "string" ? asRec(b.content).sourceLabel as string : "";
      setEditingValue(lbl); setEditingBrickId(brickId); return;
    }
    setEditingBrickId(brickId);
  }, [state.bricksById]);

  const commitEdit = useCallback(() => {
    if (!editingBrickId) return;
    setState((cur) => {
      const b = cur.bricksById[editingBrickId];
      if (!b) return cur;
      let updated: MeshBrick;
      if (b.kind === "text" || b.kind === "decision") updated = setMd(b, editingValue);
      else if (b.kind === "draw" || b.kind === "frame") {
        updated = editingField === "label"
          ? { ...b, content: { ...asRec(b.content), label: editingValue } }
          : setMd(b, editingValue);
      }
      else if (b.kind === "portal") updated = { ...b, content: { ...asRec(b.content), targetLabel: editingValue } };
      else if (b.kind === "mirror") updated = { ...b, content: { ...asRec(b.content), sourceLabel: editingValue } };
      else return cur;
      return { ...cur, bricksById: { ...cur.bricksById, [editingBrickId]: updated } };
    });
    setEditingBrickId(null);
  }, [editingBrickId, editingValue, editingField]);

  const handleUnifierUpdate = useCallback((brickId: string) => (updates: Partial<DocumentBrick>) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;

      const rawUpdates = (updates && typeof updates === "object") ? (updates as Record<string, unknown>) : {};
      const contentPatch = (
        rawUpdates.content && typeof rawUpdates.content === "object" && !Array.isArray(rawUpdates.content)
          ? (rawUpdates.content as Record<string, unknown>)
          : rawUpdates
      );

      return {
        ...cur,
        bricksById: {
          ...cur.bricksById,
          [brickId]: { ...b, content: { ...asRec(b.content), ...contentPatch } },
        },
      };
    });
  }, []);

  // ── Add bricks ────────────────────────────────────────────────────────────────
  // Compute current viewport center in canvas-space. Used as the default insert
  // point so click-to-insert doesn't dump every brick at (0,0).
  const canvasCenter = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return toCanvas(r.left + r.width / 2, r.top + r.height / 2);
  }, [toCanvas]);

  const addMeta = useCallback((entry: MetaEntry, at?: { x: number; y: number }) => {
    let newId = "";
    const center = at ?? canvasCenter();
    setState((cur) => {
      const b = mkBrick(entry.kind, Object.keys(cur.bricksById).length, null, undefined, undefined, entry.unifierKind);
      newId = b.id;
      let drop: { x: number; y: number } | undefined;
      if (center && !(selectedId && cur.bricksById[selectedId]?.kind === "board_empty")) {
        drop = { x: center.x - b.size.w / 2, y: center.y - b.size.h / 2 };
      } else if (selectedId && cur.bricksById[selectedId]?.kind === "board_empty") {
        const board = cur.bricksById[selectedId];
        const g = resolveGlobal(cur.bricksById, selectedId);
        const n = childOrder(board).length;
        drop = { x: g.x + 20 + (n % 3) * 60, y: g.y + 40 + Math.floor(n / 3) * 50 };
      }
      return insertBrick(cur, b, drop);
    });
    // auto-focus new text bricks
    if (entry.kind === "text") {
      setTimeout(() => { setEditingBrickId(newId); setEditingValue(""); }, 30);
    }
  }, [selectedId, canvasCenter]);

  const addShape = useCallback((preset: ShapePreset, at?: { x: number; y: number }) => {
    const center = at ?? canvasCenter();
    setState((cur) => {
      const kind: MeshBrickKind = preset === "frame-vector" ? "frame" : "draw";
      const b = mkBrick(kind, Object.keys(cur.bricksById).length, null, undefined, preset);
      const drop = center ? { x: center.x - b.size.w / 2, y: center.y - b.size.h / 2 } : undefined;
      return insertBrick(cur, b, drop);
    });
  }, [canvasCenter]);

  // Insert a chart metabrick: a `draw` brick whose content carries a typed
  // chart spec object (pie/bar/line/…). Rendered as one SVG; the spec is
  // editable via a structured UI in the style panel.
  const addChart = useCallback((tplKey: ChartType, at?: { x: number; y: number }) => {
    const chart = defaultChartSpec(tplKey);
    const center = at ?? canvasCenter();
    let newId = "";
    setState((cur) => {
      const b0 = mkBrick("draw", Object.keys(cur.bricksById).length, null, undefined);
      const b = { ...b0, size: { w: 360, h: 300 }, content: { chart } };
      newId = b.id;
      const drop = center ? { x: center.x - b.size.w / 2, y: center.y - b.size.h / 2 } : undefined;
      return insertBrick(cur, b, drop);
    });
    if (newId) { setSelectedId(newId); setToolbarPanel("style"); }
  }, [canvasCenter]);

  // ── Drag-from-toolbar ────────────────────────────────────────────────────────
  const onToolDragStart = useCallback((e: React.DragEvent, data: { type: "meta"; entry: MetaEntry } | { type: "shape"; preset: ShapePreset } | { type: "chart"; key: string }) => {
    e.dataTransfer.setData("killio-mesh", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const onCanvasDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);

  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const pos = toCanvas(e.clientX, e.clientY);
    const raw = e.dataTransfer.getData("killio-mesh");
    if (raw) {
      let data: any;
      try { data = JSON.parse(raw); } catch { return; }
      if (data.type === "meta") addMeta(data.entry, pos);
      if (data.type === "shape") addShape(data.preset, pos);
      if (data.type === "chart") addChart(data.key as ChartType, pos);
      return;
    }
    // Dropped bricks / markdown / plain text from anywhere → meta-bricks at cursor.
    const bricks = bricksFromDataTransfer(e.dataTransfer);
    if (bricks.length > 0) pasteBricksToMesh(bricks, pos);
  }, [addMeta, addShape, toCanvas, pasteBricksToMesh]);

  // ── Connections ───────────────────────────────────────────────────────────────
  const addConn = useCallback((src: string, tgt: string, sp?: Port, tp?: Port, sa?: AnchorNorm, ta?: AnchorNorm) => {
    if (src === tgt) return;
    setState((cur) => {
      // Exact duplicate (same direction) — ignore.
      if (Object.values(cur.connectionsById).some((c) => c.cons[0] === src && c.cons[1] === tgt)) return cur;
      // Reverse pair already exists → flip it to bidirectional instead of
      // stacking two arrows. Matches the import-time collapse logic.
      const rev = Object.values(cur.connectionsById).find((c) => c.cons[0] === tgt && c.cons[1] === src);
      if (rev) {
        const updated: MeshConnection = { ...rev, style: { ...asRec(rev.style), bidir: true } };
        return { ...cur, connectionsById: { ...cur.connectionsById, [rev.id]: updated } };
      }
      const style: Record<string, unknown> = { ...connStyle(connPreset) };
      if (sp) style.srcPort = sp;
      if (tp) style.tgtPort = tp;
      if (sa) style.srcAnchorNorm = sa;
      if (ta) style.tgtAnchorNorm = ta;
      const conn: MeshConnection = { id: mkId("conn"), cons: [src, tgt], label: { type: "doc", content: [] }, style };
      return { ...cur, connectionsById: { ...cur.connectionsById, [conn.id]: conn } };
    });
  }, [connPreset]);


  // Insert a full-fidelity MeshTemplate (e.g. an Excalidraw import) at the
  // viewport centre, remapping ids so it never collides with existing bricks.
  const applyMeshTemplateAtCenter = useCallback((tpl: MeshTemplate): number => {
    if (!tpl.bricks.length) return 0;
    const vp = viewportRef.current; const el = canvasRef.current;
    const cx = el ? (el.clientWidth / 2 - vp.x) / Math.max(vp.zoom, 0.01) : 400;
    const cy = el ? (el.clientHeight / 2 - vp.y) / Math.max(vp.zoom, 0.01) : 300;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    tpl.bricks.forEach((b) => { if (!b.parentId) { minX = Math.min(minX, b.position.x); minY = Math.min(minY, b.position.y); maxX = Math.max(maxX, b.position.x + b.size.w); maxY = Math.max(maxY, b.position.y + b.size.h); } });
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }
    const offset = { x: Math.round(cx - (minX + maxX) / 2), y: Math.round(cy - (minY + maxY) / 2) };
    const { bricks, connections } = instantiateTemplate(tpl, offset, mkId);
    setState((cur) => {
      const by = { ...cur.bricksById }; const root = [...cur.rootOrder];
      bricks.forEach((b) => { by[b.id] = b; if (!b.parentId) root.push(b.id); });
      const connectionsById = { ...cur.connectionsById };
      connections.forEach((c) => { connectionsById[c.id] = c; });
      return { ...cur, bricksById: by, rootOrder: root, connectionsById };
    });
    return bricks.length;
  }, []);

  // Import a dropped/picked file (.excalidraw / .excalidraw.png / .json / .md).
  const importDiagramFile = useCallback(async (file: File): Promise<void> => {
    try {
      const isPng = /\.png$/i.test(file.name) || file.type === "image/png";
      if (isPng) {
        const scene = await extractExcalidrawSceneFromPng(new Uint8Array(await file.arrayBuffer()));
        if (!scene) { toast(tMesh("errors.diagramEmpty"), "error"); return; }
        const tpl = parseExcalidrawToTemplate(scene);
        if (tpl.bricks.length) setDiagramPreview(tpl); else toast(tMesh("errors.diagramEmpty"), "error");
        return;
      }
      const text = await file.text();
      // Excalidraw: plain JSON or an Obsidian markdown drawing (compressed-json).
      const scene = excalidrawSceneFromText(text);
      if (scene) {
        const tpl = parseExcalidrawToTemplate(scene);
        if (tpl.bricks.length) setDiagramPreview(tpl); else toast(tMesh("errors.diagramEmpty"), "error");
        return;
      }
      // Mermaid / erDiagram / Grarkdown text — drop into the box for review.
      setDiagramPrompt(text);
    } catch {
      toast(tMesh("errors.diagramFailed"), "error");
    }
  }, [tMesh]);

  // Insert the previewed template at viewport centre and close the modal.
  const confirmInsertPreview = useCallback(() => {
    if (!diagramPreview) return;
    const n = applyMeshTemplateAtCenter(diagramPreview);
    if (n > 0) toast(tMesh("feedback.diagramGenerated", { count: n }), "success");
    setDiagramPreview(null);
    setDiagramPrompt("");
    setIsTextToDiagramOpen(false);
  }, [diagramPreview, applyMeshTemplateAtCenter, tMesh]);

  const handleGenerateDiagram = useCallback(async () => {
    const prompt = diagramPrompt.trim();
    if (!prompt || diagramGenerating) return;

    // Import mode parses locally — no network call. Auto-detects the format:
    // Excalidraw JSON → native bricks; Grarkdown → graph; else Mermaid/erDiagram.
    // Result is shown as a PREVIEW; the user confirms before it's inserted.
    if (diagramMode === "mermaid") {
      try {
        const src = prompt;
        const scene = excalidrawSceneFromText(src);
        let tpl: MeshTemplate;
        if (scene) {
          tpl = parseExcalidrawToTemplate(scene);
        } else if (isGrarkdown(src)) {
          tpl = generatedMeshToTemplate(parseGrarkdownToMesh(src), connPreset);
        } else {
          tpl = generatedMeshToTemplate(parseMermaidToMesh(src), connPreset);
        }
        if (tpl.bricks.length) setDiagramPreview(tpl);
        else toast(tMesh("errors.diagramEmpty"), "error");
      } catch {
        toast(tMesh("errors.diagramFailed"), "error");
      }
      return;
    }

    // AI mode: one-shot generation → preview (user decides whether to insert).
    setDiagramGenerating(true);
    try {
      const scope = activeTeamId ? "team" : "personal";
      const scopeId = activeTeamId ?? (user?.id ?? "");
      const mesh = await generateMeshWithAi({ scope, scopeId, prompt }, accessToken ?? undefined);
      const tpl = generatedMeshToTemplate(mesh, connPreset);
      if (tpl.bricks.length) setDiagramPreview(tpl);
      else toast(tMesh("errors.diagramEmpty"), "error");
    } catch {
      toast(tMesh("errors.diagramFailed"), "error");
    } finally {
      setDiagramGenerating(false);
    }
  }, [diagramPrompt, diagramGenerating, diagramMode, activeTeamId, user?.id, accessToken, connPreset, tMesh]);

  // Load saved user templates on mount.
  useEffect(() => { setUserTemplates(loadUserTemplates()); }, []);

  // Insert a saved (full-fidelity) template at viewport center.
  const insertUserTemplate = useCallback((tpl: MeshTemplate) => {
    const vp = viewportRef.current;
    const el = canvasRef.current;
    const cx = el ? (el.clientWidth / 2 - vp.x) / Math.max(vp.zoom, 0.01) : 400;
    const cy = el ? (el.clientHeight / 2 - vp.y) / Math.max(vp.zoom, 0.01) : 300;
    // center the template around viewport center using its bbox
    let maxX = 0, maxY = 0;
    tpl.bricks.forEach((b) => { if (!b.parentId) { maxX = Math.max(maxX, b.position.x + b.size.w); maxY = Math.max(maxY, b.position.y + b.size.h); } });
    const offset = { x: Math.round(cx - maxX / 2), y: Math.round(cy - maxY / 2) };
    const { bricks, connections } = instantiateTemplate(tpl, offset, mkId);
    setState((cur) => {
      const by = { ...cur.bricksById };
      const root = [...cur.rootOrder];
      bricks.forEach((b) => { by[b.id] = b; if (!b.parentId) root.push(b.id); });
      const connectionsById = { ...cur.connectionsById };
      connections.forEach((c) => { connectionsById[c.id] = c; });
      return { ...cur, bricksById: by, rootOrder: root, connectionsById };
    });
    toast(tMesh("feedback.templateInserted"), "success");
    setToolbarPanel(null);
  }, []);

  const saveSelectionAsTemplate = useCallback(() => {
    const ids = selectedIds.size ? selectedIds : (selectedId ? new Set([selectedId]) : new Set<string>());
    if (!ids.size) { toast(tMesh("errors.templateNoSelection"), "error"); return; }
    const name = (typeof window !== "undefined" ? window.prompt(tMesh("templates.namePrompt")) : "") ?? "";
    if (!name.trim()) return;
    const tpl = captureTemplate(name, ids, state.bricksById, state.connectionsById, mkId);
    if (!tpl) { toast(tMesh("errors.templateNoSelection"), "error"); return; }
    setUserTemplates((cur) => { const next = [tpl, ...cur]; persistUserTemplates(next); return next; });
    toast(tMesh("feedback.templateSaved"), "success");
  }, [selectedIds, selectedId, state.bricksById, state.connectionsById]);

  const deleteUserTemplate = useCallback((id: string) => {
    setUserTemplates((cur) => { const next = cur.filter((t) => t.id !== id); persistUserTemplates(next); return next; });
  }, []);

  // Z-order: reorder the selected brick within its sibling list (root or parent's children).
  const changeLayer = useCallback((op: ZOrderOp) => {
    const id = selectedId;
    if (!id) return;
    setState((cur) => {
      const b = cur.bricksById[id];
      if (!b) return cur;
      if (!b.parentId) {
        const next = reorderInList(cur.rootOrder, id, op);
        if (next === cur.rootOrder) return cur;
        return { ...cur, rootOrder: next };
      }
      const parent = cur.bricksById[b.parentId];
      if (!parent) return cur;
      const co = childOrder(parent);
      const next = reorderInList(co, id, op);
      if (next === co) return cur;
      return { ...cur, bricksById: { ...cur.bricksById, [parent.id]: withChildOrder(parent, next) } };
    });
  }, [selectedId]);

  const startConnFromPort = useCallback((brickId: string, port: Port) => {
    if (toolMode !== "conn") return;
    setConnSrcId(brickId); setConnSrcPort(port); setConnSrcAnchor(null);
  }, [toolMode]);

  const startConnFromAnchor = useCallback((brickId: string, anchor: AnchorNorm) => {
    if (toolMode !== "conn") return;
    setConnSrcId(brickId); setConnSrcPort(null); setConnSrcAnchor(anchor);
  }, [toolMode]);

  const finishConnAtPort = useCallback((brickId: string, port: Port) => {
    if (!connSrcId || connSrcId === brickId) return;
    addConn(connSrcId, brickId, connSrcPort ?? undefined, port, connSrcAnchor ?? undefined);
    setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); setSnapTarget(null);
    toast(tMesh("feedback.connCreated"), "success");
  }, [connSrcId, connSrcPort, connSrcAnchor, addConn]);

  const finishConnAtAnchor = useCallback((brickId: string, anchor: AnchorNorm) => {
    if (!connSrcId || connSrcId === brickId) return;
    addConn(connSrcId, brickId, connSrcPort ?? undefined, undefined, connSrcAnchor ?? undefined, anchor);
    setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); setSnapTarget(null);
    toast(tMesh("feedback.connCreated"), "success");
  }, [connSrcId, connSrcPort, connSrcAnchor, addConn]);

  // ── Mouse move ────────────────────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const { x, y } = fromEv(e);
    setPointer({ x, y });
    publishCursor(x, y);

    // Rubber-band selection rect — use ref so the check is never stale
    if (toolMode === "select" && selRectRef.current) {
      const updated = { ...selRectRef.current, x2: x, y2: y };
      selRectRef.current = updated;
      setSelRect(updated);
    }

    // Update snap target when mid-connection
    if (toolMode === "conn" && connSrcId) {
      let bestId: string | null = null, bestPort: Port | null = null, bestDist = SNAP_R;
      Object.values(bricksByIdRef.current).forEach((b) => {
        if (b.id === connSrcId) return;
        const g = resolveGlobal(bricksByIdRef.current, b.id);
        const bPreset = asRec(b.content).shapePreset as ShapePreset | undefined;
        const bVecPts = Array.isArray(asRec(b.content).vectorPoints) ? asRec(b.content).vectorPoints as VecPts : undefined;
        ALL_PORTS.forEach((port) => {
          const mp = shapePortAbsPos(g.x, g.y, b.size.w, b.size.h, bPreset, port, bVecPts);
          const d = Math.hypot(x - mp.x, y - mp.y);
          if (d < bestDist) { bestDist = d; bestId = b.id; bestPort = port; }
        });
      });
      setSnapTarget(bestId && bestPort ? { brickId: bestId, port: bestPort } : null);
    }

    if (toolMode === "pan" && panDragState) {
      setViewport((current) => ({
        ...current,
        x: panDragState.startViewport.x + (e.clientX - panDragState.startMouse.x),
        y: panDragState.startViewport.y + (e.clientY - panDragState.startMouse.y),
      }));
      return;
    }

    if (toolMode === "pen" && activePen) {
      setActivePen((p) => p ? [...p, { x, y, t: Date.now() }] : p);
      return;
    }

    // Bezier control point drag
    if (bezierCpDrag) {
      const dx = x - bezierCpDrag.startMouse.x;
      const dy = y - bezierCpDrag.startMouse.y;
      const newCp = { x: bezierCpDrag.startCp.x + dx, y: bezierCpDrag.startCp.y + dy };
      setState((cur) => {
        const co = cur.connectionsById[bezierCpDrag.connId];
        if (!co) return cur;
        const key = bezierCpDrag.cp === 1 ? "cp1" : "cp2";
        return { ...cur, connectionsById: { ...cur.connectionsById, [bezierCpDrag.connId]: { ...co, style: { ...asRec(co.style), [key]: newCp } } } };
      });
      return;
    }

    if (toolMode !== "select" && toolMode !== "vec") return;

    if (vecDragState) {
      setState((cur) => {
        const b = cur.bricksById[vecDragState.brickId];
        if (!b) return cur;
        const g = resolveGlobal(cur.bricksById, b.id);
        const nx = (x - g.x) / Math.max(b.size.w, 1);
        const ny = (y - g.y) / Math.max(b.size.h, 1);
        const c  = asRec(b.content);
        // Seed from the preset's default polygon when the shape has no explicit
        // vectorPoints yet (e.g. imported shapes) so vec editing works on them.
        const preset0 = typeof c.shapePreset === "string" ? (c.shapePreset as ShapePreset) : undefined;
        const base = Array.isArray(c.vectorPoints) ? (c.vectorPoints as { x: number; y: number }[]) : (preset0 && SHAPE_PTS[preset0] ? SHAPE_PTS[preset0]! : []);
        const pts = [...base];
        pts[vecDragState.pointIndex] = { x: +nx.toFixed(4), y: +ny.toFixed(4) };
        return { ...cur, bricksById: { ...cur.bricksById, [b.id]: { ...b, content: { ...c, vectorPoints: pts } } } };
      });
      return;
    }

    if (resizeState) {
      const dx = x - resizeState.startMouse.x;
      const dy = y - resizeState.startMouse.y;
      setState((cur) => {
        const b = cur.bricksById[resizeState.brickId];
        if (!b) return cur;
        const min = BRICK_MIN[b.kind] ?? { w: 60, h: 40 };
        return { ...cur, bricksById: { ...cur.bricksById, [b.id]: { ...b, size: { w: Math.max(min.w, resizeState.startSize.w + dx), h: Math.max(min.h, resizeState.startSize.h + dy) } } } };
      });
      return;
    }

    if (dragState) {
      const dx = x - dragState.startMouse.x;
      const dy = y - dragState.startMouse.y;
      setState((cur) => {
        // Multi-select drag: translate every selected brick by the same delta.
        if (dragState.group && dragState.group.length > 1) {
          const by = { ...cur.bricksById };
          for (const g of dragState.group) {
            const gb = by[g.id];
            if (gb) by[g.id] = { ...gb, position: { x: g.start.x + dx, y: g.start.y + dy } };
          }
          return { ...cur, bricksById: by };
        }
        const b = cur.bricksById[dragState.brickId];
        if (!b) return cur;
        return { ...cur, bricksById: { ...cur.bricksById, [b.id]: { ...b, position: { x: dragState.startPosition.x + dx, y: dragState.startPosition.y + dy } } } };
      });
    }
  }, [toolMode, fromEv, panDragState, activePen, vecDragState, resizeState, dragState, connSrcId, bezierCpDrag, publishCursor]);

  // ── Pen flush (shared between mouse-up and touch pointer-up) ─────────────────
  const flushPen = useCallback(() => {
    if (!(activePen && activePen.length > 1)) return;
    const stroke: PenStroke = { points: activePen, color: penColor, width: penStrokeWidth };
    setActivePen(null);
    penStrokesRef.current = [...penStrokesRef.current, stroke];
    setPenStrokes([...penStrokesRef.current]);
    if (penTimer.current) clearTimeout(penTimer.current);
    penTimer.current = setTimeout(() => {
      const strokes = penStrokesRef.current;
      penStrokesRef.current = [];
      setPenStrokes([]);
      if (!strokes.length) return;

      // Draw a line between two raw draw bricks → merge them (absorbing the
      // connecting stroke). Endpoints, not midpoint: the join line lives in the
      // gap, so its midpoint is outside both bricks.
      {
        const allPts = strokes.flatMap((s) => s.points);
        if (allPts.length >= 2) {
          const start = allPts[0], end = allPts[allPts.length - 1];
          const aHit = findRawDrawAt(state.bricksById, start.x, start.y);
          const bHit = findRawDrawAt(state.bricksById, end.x, end.y);
          if (aHit && bHit && aHit.id !== bHit.id) {
            setState((cur) => mergeDrawBricks(cur, [aHit.id, bHit.id], strokes, penColor, penStrokeWidth));
            toast(tMesh("feedback.drawMerged"), "success");
            return;
          }
        }
      }

      const rawDrawTarget = (() => {
        const bb = strokesBBox(strokes);
        const mid = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
        return findRawDrawAt(state.bricksById, mid.x, mid.y);
      })();

      if (rawDrawTarget) {
        // Append to the existing brick, GROWING its bounds to absorb any ink
        // that falls outside — never clamp (clamping squashed the drawing to fit).
        setState((cur) => {
          const b = cur.bricksById[rawDrawTarget.id];
          if (!b) return cur;
          const c = asRec(b.content);
          const g = resolveGlobal(cur.bricksById, b.id);
          const existingGlobal = drawStrokesGlobal(cur.bricksById, b);
          const newGlobal: NormStroke[] = strokes.map((s) => ({
            points: s.points.map((p) => ({ x: p.x, y: p.y })),
            color: s.color ?? penColor,
            width: s.width ?? penStrokeWidth,
          }));
          // New bounds = union of the current brick rect and the incoming ink.
          const nb = strokesBBox(strokes);
          const minX = Math.min(g.x, nb.x), minY = Math.min(g.y, nb.y);
          const maxX = Math.max(g.x + b.size.w, nb.x + nb.w), maxY = Math.max(g.y + b.size.h, nb.y + nb.h);
          const bounds = { x: minX, y: minY, w: Math.max(maxX - minX, 40), h: Math.max(maxY - minY, 30) };
          const normalized = normStrokesToBounds([...existingGlobal, ...newGlobal], bounds);
          return {
            ...cur,
            bricksById: {
              ...cur.bricksById,
              [b.id]: {
                ...b,
                position: { x: b.position.x + (bounds.x - g.x), y: b.position.y + (bounds.y - g.y) },
                size: { w: bounds.w, h: bounds.h },
                content: { ...c, manualStrokes: normalized },
              },
            },
          };
        });
        return;
      }

      // Ink pen, no target board: create a fresh draw board sized to the ink and store the strokes in it.
      // Smart (iink) recognition needs the backend + internet; offline or in a
      // local workspace we always fall back to plain ink.
      if (penMode === "ink" || !online || localMode || !accessToken || !meshId) {
        const bb = strokesBBox(strokes);
        const pad = 14;
        const originX = bb.x - pad;
        const originY = bb.y - pad;
        const w = bb.w + pad * 2;
        const h = bb.h + pad * 2;
        setState((cur) => {
          const board = boardAt(cur.bricksById, bb.x + bb.w / 2, bb.y + bb.h / 2, "");
          const parentId = board?.id ?? null;
          let pos = { x: originX, y: originY };
          if (parentId && board) { const pg = resolveGlobal(cur.bricksById, parentId); pos = { x: originX - pg.x, y: originY - pg.y }; }
          const normalizedBatch = strokes.map((s) => ({
            points: s.points.map((p) => ({
              x: +Math.max(0, Math.min(1, (p.x - originX) / Math.max(w, 1))).toFixed(4),
              y: +Math.max(0, Math.min(1, (p.y - originY) / Math.max(h, 1))).toFixed(4),
            })),
            color: s.color ?? penColor,
            width: s.width ?? penStrokeWidth,
          }));
          let nb = mkBrick("draw", Object.keys(cur.bricksById).length, parentId, pos);
          nb = { ...nb, size: { w, h }, content: { ...asRec(nb.content), isContainer: true, manualStrokes: normalizedBatch } };
          const by = { ...cur.bricksById, [nb.id]: nb };
          let root = cur.rootOrder;
          if (!parentId) root = [...root, nb.id];
          if (parentId && board) by[board.id] = withChildOrder(board, [...childOrder(board), nb.id]);
          return { ...cur, bricksById: by, rootOrder: root };
        });
        return;
      }

      const el = canvasRef.current;
      const cw = el ? el.clientWidth / Math.max(viewport.zoom, 0.01) : 1600;
      const ch = el ? el.clientHeight / Math.max(viewport.zoom, 0.01) : 900;
      setRecognizing(true);
      callIink(strokes, cw, ch, accessToken ?? "", meshId ?? "").then((result) => {
        setRecognizing(false);
        if (!result) { toast(tMesh("errors.iinkNoResponse"), "error"); return; }
        const { text, shapes } = result;
        const primaryShape = shapes[0];
        const mapped = primaryShape ? shapeKindToBrick(primaryShape.kind) : null;
        if (!mapped && (!text || !text.trim())) {
          // Try line-to-connection: if stroke endpoints are near two different bricks
          const allPts = strokes.flatMap((s) => s.points);
          if (allPts.length >= 2) {
            const start = allPts[0], end = allPts[allPts.length - 1];
            setState((cur) => {
              let srcId: string | null = null, tgtId: string | null = null, srcD = 100, tgtD = 100;
              Object.values(cur.bricksById).forEach((b) => {
                const g = resolveGlobal(cur.bricksById, b.id);
                const cx = g.x + b.size.w / 2, cy = g.y + b.size.h / 2;
                const ds = Math.hypot(cx - start.x, cy - start.y);
                const de = Math.hypot(cx - end.x, cy - end.y);
                if (ds < srcD) { srcD = ds; srcId = b.id; }
                if (de < tgtD) { tgtD = de; tgtId = b.id; }
              });
              if (srcId && tgtId && srcId !== tgtId) {
                const conn: MeshConnection = { id: mkId("conn"), cons: [srcId, tgtId], label: { type: "doc", content: [] }, style: { ...connStyle(connPreset) } };
                toast(tMesh("feedback.connByStroke"), "success");
                return { ...cur, connectionsById: { ...cur.connectionsById, [conn.id]: conn } };
              }
              return cur;
            });
          }
          return;
        }
        const bbox = strokesBBox(strokes);
        setState((cur) => {
          const mid = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
          const board = boardAt(cur.bricksById, mid.x, mid.y, "");
          const parentId = board?.id ?? null;
          let pos = { x: bbox.x, y: bbox.y };
          if (parentId && board) { const pg = resolveGlobal(cur.bricksById, parentId); pos = { x: bbox.x - pg.x, y: bbox.y - pg.y }; }
          let nb: MeshBrick;
          if (mapped) {
            const sz = primaryShape?.bbox
              ? { w: Math.max(mapped.meshKind === "board_empty" ? 240 : 150, primaryShape.bbox.w),
                  h: Math.max(mapped.meshKind === "board_empty" ? 160 : 110, primaryShape.bbox.h) }
              : undefined;
            nb = mkBrick(mapped.meshKind, Object.keys(cur.bricksById).length, parentId, pos, mapped.preset);
            if (sz) nb = { ...nb, size: sz };
            if (mapped.meshKind === "draw" || mapped.meshKind === "frame") {
              const content = asRec(nb.content);
              const style = asRec(content.style);
              nb = {
                ...nb,
                content: {
                  ...content,
                  style: {
                    ...style,
                    stroke: penColor,
                    strokeWidth: penStrokeWidth,
                  },
                  strokeColor: penColor,
                  strokeWidth: penStrokeWidth,
                },
              };
            }
          } else {
            // Phase 4: Derive size from bbox height, bold from stroke width, color from pen
            const baseText = text!.trim();
            // bbox height (canvas px) → rem: ~40px = 1rem, clamped 0.6–5
            const sizeRem = Math.max(0.6, Math.min(5, bbox.h / 40)).toFixed(2);
            // stroke width ≥ 3 → bold markdown
            const styledText = penStrokeWidth >= 3 ? `**${baseText}**` : baseText;
            // wrap with properly-closed tags
            const isDefaultColor = penColor === "#ffffff" || penColor === "#fff" || !penColor;
            const textWithTokens = isDefaultColor
              ? `[size:${sizeRem}rem]${styledText}[/size]`
              : `[size:${sizeRem}rem][color:${penColor}]${styledText}[/color][/size]`;
            nb = setMd(mkBrick("text", Object.keys(cur.bricksById).length, parentId, pos), textWithTokens);
          }
          const by = { ...cur.bricksById, [nb.id]: nb };
          let root = cur.rootOrder;
          if (!parentId) root = [...root, nb.id];
          if (parentId && board) by[board.id] = withChildOrder(board, [...childOrder(board), nb.id]);
          return { ...cur, bricksById: by, rootOrder: root };
        });
        if (mapped) toast(tMesh("feedback.shapeRecognized", { kind: primaryShape!.kind }), "success");
        else if (text) toast(`"${text.trim().slice(0, 30)}"`, "success");
      });
    }, 900);
  }, [activePen, penColor, penStrokeWidth, penMode, state.bricksById, viewport.zoom, accessToken, connPreset, online, localMode, meshId, tMesh]);

  // Keep flushPenRef current so onCanvasPointerUp (defined earlier) can call it
  flushPenRef.current = flushPen;

  // ── Mouse up ──────────────────────────────────────────────────────────────────
  const onMouseUp = useCallback(() => {
    if (bezierCpDrag) { setBezierCpDrag(null); return; }
    if (panDragState) { setPanDragState(null); return; }

    // pen flush — use ref to avoid React Strict Mode double-invoke
    if (toolMode === "pen" && activePen && activePen.length > 1) {
      flushPen();
      return;
    }
    setActivePen(null);

    // Drag a raw draw brick onto another raw draw brick → merge them.
    if (dragState) {
      const dragged = state.bricksById[dragState.brickId];
      if (isRawDraw(dragged)) {
        const g = resolveGlobal(state.bricksById, dragged.id);
        const cx = g.x + dragged.size.w / 2, cy = g.y + dragged.size.h / 2;
        const target = Object.values(state.bricksById)
          .filter((b) => b.id !== dragged.id && isRawDraw(b))
          .reverse()
          .find((b) => {
            const gb = resolveGlobal(state.bricksById, b.id);
            return cx >= gb.x && cx <= gb.x + b.size.w && cy >= gb.y && cy <= gb.y + b.size.h;
          });
        if (target) {
          setState((cur) => mergeDrawBricks(cur, [target.id, dragged.id], null, penColor, penStrokeWidth));
          toast(tMesh("feedback.drawMerged"), "success");
          publishUnlock(dragState.brickId);
          setDragState(null); setResizeState(null); setVecDragState(null);
          return;
        }
      }
    }

    // reparent on drag end (single-brick drags only; group moves are pure translation)
    if (dragState && !dragState.group) {
      const { brickId, originalParentId } = dragState;
      setState((cur) => {
        const b = cur.bricksById[brickId];
        if (!b) return cur;
        const g  = resolveGlobal(cur.bricksById, brickId);
        const cx = g.x + b.size.w / 2;
        const cy = g.y + b.size.h / 2;
        const newParent = boardAt(cur.bricksById, cx, cy, brickId)?.id ?? null;
        if (newParent === originalParentId) return cur;

        let by   = { ...cur.bricksById };
        let root = cur.rootOrder;

        if (originalParentId && by[originalParentId])
          by[originalParentId] = withChildOrder(by[originalParentId], childOrder(by[originalParentId]).filter((i) => i !== brickId));
        else
          root = root.filter((i) => i !== brickId);

        let newPos = { x: g.x, y: g.y };
        if (newParent) { const pg = resolveGlobal(by, newParent); newPos = { x: g.x - pg.x, y: g.y - pg.y }; }

        by[brickId] = { ...b, parentId: newParent, position: newPos };
        if (newParent && by[newParent]) by[newParent] = withChildOrder(by[newParent], [...childOrder(by[newParent]), brickId]);
        else root = [...root, brickId];

        return { ...cur, bricksById: by, rootOrder: root };
      });
    }
    // Rubber-band finalization — always read from ref (never stale)
    const currentSelRect = selRectRef.current;
    if (currentSelRect) {
      selRectRef.current = null;
      setSelRect(null);
      const rx1 = Math.min(currentSelRect.x1, currentSelRect.x2), ry1 = Math.min(currentSelRect.y1, currentSelRect.y2);
      const rx2 = Math.max(currentSelRect.x1, currentSelRect.x2), ry2 = Math.max(currentSelRect.y1, currentSelRect.y2);
      if (rx2 - rx1 > 4 || ry2 - ry1 > 4) {
        const ids = new Set<string>();
        Object.values(state.bricksById).forEach((b) => {
          const g = resolveGlobal(state.bricksById, b.id);
          if (g.x < rx2 && g.x + b.size.w > rx1 && g.y < ry2 && g.y + b.size.h > ry1) ids.add(b.id);
        });
        setSelectedIds(ids);
        setSelectedId(null);
        ignoreNextCanvasClickRef.current = true;
      }
    }

    if (dragState) {
      if (dragState.group) dragState.group.forEach((g) => publishUnlock(g.id));
      else publishUnlock(dragState.brickId);
    }
    if (resizeState) publishUnlock(resizeState.brickId);
    setDragState(null);
    setResizeState(null);
    setVecDragState(null);
  }, [bezierCpDrag, panDragState, toolMode, activePen, dragState, resizeState, selRect, state.bricksById, accessToken, connPreset, penColor, penStrokeWidth, viewport.zoom, publishUnlock, flushPen, tMesh]);

  // ── Drag start ─────────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.PointerEvent, brickId: string) => {
    if (toolMode !== "select") return;
    if (editingBrickId === brickId) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    // Shift/Ctrl/Meta-click toggles a brick in the multi-selection (no drag).
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedIds((cur) => {
        const n = new Set(cur);
        if (selectedId) n.add(selectedId);
        if (n.has(brickId)) n.delete(brickId); else n.add(brickId);
        return n;
      });
      setSelectedId(null);
      setSelectedConnId(null);
      return;
    }
    const existingLock = brickLocks.get(brickId);
    if (existingLock) {
      toast(tMesh("feedback.lockedBy", { name: existingLock.displayName }), "warning");
      return;
    }
    const { x, y } = fromEv(e);
    const b = state.bricksById[brickId];
    if (!b) return;

    // Dragging a brick that's part of the current multi-selection moves the
    // whole group; capture each member's start position.
    const inMulti = selectedIds.has(brickId) && selectedIds.size > 1;
    if (inMulti) {
      const group = [...selectedIds]
        .map((id) => { const gb = state.bricksById[id]; return gb ? { id, start: { ...gb.position } } : null; })
        .filter((g): g is { id: string; start: { x: number; y: number } } => !!g);
      publishLock(brickId, "drag");
      setDragState({ brickId, startMouse: { x, y }, startPosition: { ...b.position }, originalParentId: b.parentId, group });
      setSelectedConnId(null);
      return;
    }

    publishLock(brickId, "drag");
    setDragState({ brickId, startMouse: { x, y }, startPosition: { ...b.position }, originalParentId: b.parentId });
    setSelectedId(brickId);
    setSelectedIds(new Set()); // collapse any stale multi-selection
    setSelectedConnId(null);
  }, [toolMode, fromEv, state.bricksById, editingBrickId, brickLocks, publishLock, selectedId, selectedIds]);

  const startResize = useCallback((e: React.PointerEvent, brickId: string) => {
    e.stopPropagation();
    const existingLock = brickLocks.get(brickId);
    if (existingLock) {
      toast(tMesh("feedback.lockedBy", { name: existingLock.displayName }), "warning");
      return;
    }
    const { x, y } = fromEv(e);
    const b = state.bricksById[brickId];
    if (!b) return;
    publishLock(brickId, "resize");
    setResizeState({ brickId, startMouse: { x, y }, startSize: { ...b.size } });
  }, [fromEv, state.bricksById, brickLocks, publishLock]);

  const deleteVecPoint = useCallback((brickId: string, idx: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const preset0 = typeof c.shapePreset === "string" ? (c.shapePreset as ShapePreset) : undefined;
      const pts = Array.isArray(c.vectorPoints) ? [...(c.vectorPoints as { x: number; y: number }[])] : (preset0 && SHAPE_PTS[preset0] ? [...SHAPE_PTS[preset0]!] : []);
      if (pts.length <= 3) return cur; // keep minimum triangle
      pts.splice(idx, 1);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, vectorPoints: pts } } } };
    });
  }, []);

  const insertVecPoint = useCallback((brickId: string, nx: number, ny: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const preset0 = typeof c.shapePreset === "string" ? (c.shapePreset as ShapePreset) : undefined;
      const pts = Array.isArray(c.vectorPoints) ? [...(c.vectorPoints as { x: number; y: number }[])] : (preset0 && SHAPE_PTS[preset0] ? [...SHAPE_PTS[preset0]!] : []);
      if (!pts.length) return cur;
      const newPt = { x: +Math.max(0, Math.min(1, nx)).toFixed(4), y: +Math.max(0, Math.min(1, ny)).toFixed(4) };
      let bestEdge = 0, bestDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length];
        const edx = B.x - A.x, edy = B.y - A.y, lenSq = edx * edx + edy * edy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((newPt.x - A.x) * edx + (newPt.y - A.y) * edy) / lenSq)) : 0;
        const dist = Math.hypot(newPt.x - A.x - t * edx, newPt.y - A.y - t * edy);
        if (dist < bestDist) { bestDist = dist; bestEdge = i; }
      }
      pts.splice(bestEdge + 1, 0, newPt);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, vectorPoints: pts } } } };
    });
  }, []);

  const addCustomPort = useCallback((brickId: string, nx: number, ny: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const current = Array.isArray(c.customPorts) ? [...(c.customPorts as AnchorNorm[])] : [];
      current.push({ x: +Math.max(0, Math.min(1, nx)).toFixed(4) as unknown as number, y: +Math.max(0, Math.min(1, ny)).toFixed(4) as unknown as number });
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, customPorts: current } } } };
    });
  }, []);

  const deleteCustomPort = useCallback((brickId: string, idx: number) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      const current = Array.isArray(c.customPorts) ? [...(c.customPorts as AnchorNorm[])] : [];
      current.splice(idx, 1);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, customPorts: current } } } };
    });
  }, []);

  const clearDrawStrokes = useCallback((brickId: string) => {
    setState((cur) => {
      const b = cur.bricksById[brickId];
      if (!b) return cur;
      const c = asRec(b.content);
      return { ...cur, bricksById: { ...cur.bricksById, [brickId]: { ...b, content: { ...c, manualStrokes: [] } } } };
    });
  }, []);

  const startVecDrag = useCallback((e: React.PointerEvent, brickId: string, idx: number) => {
    e.stopPropagation();
    setVecDragState({ brickId, pointIndex: idx, startMouse: fromEv(e) });
  }, [fromEv]);

  // ── Canvas mouse down ────────────────────────────────────────────────────────
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (toolMode === "pan") {
      setPanDragState({ startMouse: { x: e.clientX, y: e.clientY }, startViewport: { x: viewportRef.current.x, y: viewportRef.current.y } });
      return;
    }
    if (toolMode === "pen") {
      const { x, y } = fromEv(e);
      setActivePen([{ x, y, t: Date.now() }]);
      return;
    }
    if (toolMode === "select" && e.button === 0 && e.target === e.currentTarget) {
      const { x, y } = fromEv(e);
      const rect = { x1: x, y1: y, x2: x, y2: y };
      selRectRef.current = rect;
      setSelRect(rect);
      setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
    }
  }, [toolMode, fromEv]);

  // ── Canvas clicks ────────────────────────────────────────────────────────────
  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    if (toolMode === "select" && ignoreNextCanvasClickRef.current) {
      ignoreNextCanvasClickRef.current = false;
      return;
    }

    if (toolMode === "conn" && connSrcId) {
      if (snapTarget) {
        addConn(connSrcId, snapTarget.brickId, connSrcPort ?? undefined, snapTarget.port, connSrcAnchor ?? undefined);
        setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); setSnapTarget(null);
        toast(tMesh("feedback.connCreated"), "success");
        return;
      }
      const { x, y } = fromEv(e);
      let nearId: string | null = null, nd = Infinity;
      Object.values(state.bricksById).forEach((b) => {
        if (b.id === connSrcId) return;
        const g = gPos(b.id);
        const d = Math.hypot(g.x + b.size.w / 2 - x, g.y + b.size.h / 2 - y);
        if (d < nd) { nd = d; nearId = b.id; }
      });
      if (nearId && nd <= 160) { addConn(connSrcId, nearId, connSrcPort ?? undefined, undefined, connSrcAnchor ?? undefined); setConnSrcId(null); setConnSrcPort(null); setConnSrcAnchor(null); toast(tMesh("feedback.connCreated"), "success"); }
      return;
    }
    if (toolMode !== "select") return;
    if (editingConnId) setEditingConnId(null);
    if (editingBrickId) setEditingBrickId(null);
    setSelectedId(null); setSelectedIds(new Set()); setSelectedConnId(null);
  }, [toolMode, connSrcId, connSrcPort, snapTarget, fromEv, state.bricksById, gPos, addConn, editingBrickId, editingConnId]);

  const onBrickClick = useCallback((e: React.MouseEvent, brickId: string) => {
    e.stopPropagation();
    if (editingBrickId && editingBrickId !== brickId) {
      setEditingBrickId(null);
    }
    if (editingConnId) {
      setEditingConnId(null);
    }
    if (toolMode === "conn") {
      if (!connSrcId) { setConnSrcId(brickId); setConnSrcPort(null); return; }
      if (connSrcId !== brickId) {
        if (snapTarget?.brickId === brickId) {
          addConn(connSrcId, brickId, connSrcPort ?? undefined, snapTarget.port);
        } else {
          addConn(connSrcId, brickId, connSrcPort ?? undefined);
        }
        setConnSrcId(null); setConnSrcPort(null); setSnapTarget(null);
        toast(tMesh("feedback.connCreated"), "success");
      }
      return;
    }
    if (toolMode !== "select" && toolMode !== "vec") return;
    setSelectedId(brickId);
    setSelectedIds(new Set());
    setSelectedConnId(null);
  }, [toolMode, connSrcId, connSrcPort, snapTarget, addConn, editingBrickId, editingConnId]);

  const onBrickDblClick = useCallback((e: React.MouseEvent, brickId: string) => {
    e.stopPropagation();
    if (toolMode !== "select") return;
    startEdit(brickId);
  }, [toolMode, startEdit]);

  // ── Bricks connected to at least one connector ─────────────────────────────
  const connectedBrickIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(state.connectionsById).forEach((c) => {
      s.add(c.cons[0]);
      s.add(c.cons[1]);
    });
    return s;
  }, [state.connectionsById]);

  // Render in cloud mode (meshId), local mode, or for a `.km` deep-link that is
  // still resolving its local workspace — only bail when it's truly nothing.
  if (!meshId && !localMode && !looksLocalFile) return null;

  // ── Brick renderer ────────────────────────────────────────────────────────────
  function renderBrick(brick: MeshBrick): React.ReactNode {
    // Treat legacy "decision" kind as draw+diamond shape with text
    if (brick.kind === "decision") {
      brick = { ...brick, kind: "draw", content: { ...asRec(brick.content), shapePreset: "diamond", isContainer: false,
        style: { stroke: "#22d3ee", fill: "rgba(34,211,238,0.09)", strokeWidth: 2 } } } as MeshBrick;
    }
    const isBoard   = brick.kind === "board_empty";
    const isSel     = selectedId === brick.id;
    const isEditing = editingBrickId === brick.id;
    const isConnSrc = connSrcId === brick.id;
    const c         = asRec(brick.content);
    const shapeP    = c.shapePreset as ShapePreset | undefined;
    const vecPts    = c.vectorPoints as { x: number; y: number }[] | undefined;
    const styleR    = asRec(c.style);
    const sStroke   = typeof styleR.stroke === "string" ? styleR.stroke : "#22d3ee";
    const sFill     = typeof styleR.fill   === "string" ? styleR.fill   : "rgba(34,211,238,0.07)";
    const sSW       = typeof styleR.strokeWidth === "number" ? styleR.strokeWidth : 2;
    const sDash     = dashArrayFor(styleR.strokeStyle as StrokeStyle | undefined, sSW);
    const sOpacity  = opacityFor(styleR as { opacity?: number });
    const sCr       = cornerRadiusFor(styleR.edges as EdgeStyle | undefined);
    const uKind     = typeof c.unifierKind === "string" ? c.unifierKind : null;
    const isUnifier = brick.kind === "text" || ((brick.kind === "portal" || brick.kind === "mirror") && !!uKind);
    const unifierKindFinal = uKind ?? (brick.kind === "mirror" ? "callout" : "text");
    const docBrick  = (isUnifier) ? toDocBrick(brick, unifierKindFinal) : null;
    const chartSpec   = brick.kind === "draw" && c.chart && typeof (c.chart as any).type === "string" ? (c.chart as ChartSpec) : null;
    const chartSrc    = brick.kind === "draw" && typeof c.chartSource === "string" ? (c.chartSource as string) : null;
    const isChart     = chartSpec !== null || chartSrc !== null;
    const isShape     = (brick.kind === "draw" || brick.kind === "frame") && !!shapeP && !isChart;
    const isDrawBrick = brick.kind === "draw";
    const isCont      = isBoard || !!c.isContainer;
    // Children rendered in the parent's childOrder (z-order) — falls back to
    // appending any orphan children not yet listed in childOrder, preserving
    // both reorderings and newly added bricks.
    const kids        = (() => {
      if (!isCont) return [] as MeshBrick[];
      const co = childOrder(brick);
      const all = Object.values(state.bricksById).filter((b) => b.parentId === brick.id);
      const ordered = co.map((id) => state.bricksById[id]).filter((b): b is MeshBrick => !!b && b.parentId === brick.id);
      const seen = new Set(ordered.map((b) => b.id));
      return [...ordered, ...all.filter((b) => !seen.has(b.id))];
    })();
    const isMultiSel  = selectedIds.has(brick.id);
    const isConnected = connectedBrickIds.has(brick.id);
    // Multi-selected bricks get a distinct, high-contrast ring so the group is
    // obvious vs a single selection (white).
    const ring        = isMultiSel ? " ring-2 ring-sky-400 ring-offset-1 ring-offset-slate-900" : isSel ? " ring-2 ring-white/70" : isConnSrc ? " ring-2 ring-cyan-300" : "";

    // Magnet port dots rendered inside each brick when conn mode is active
    const brickShapePreset = asRec(brick.content).shapePreset as ShapePreset | undefined;
    const brickVecPts = Array.isArray(asRec(brick.content).vectorPoints) ? asRec(brick.content).vectorPoints as VecPts : undefined;
    const brickCustomPorts = Array.isArray(asRec(brick.content).customPorts)
      ? (asRec(brick.content).customPorts as AnchorNorm[]) : [];
    const magnetDots = toolMode === "conn" ? (
      <div className="pointer-events-none absolute inset-0 z-50">
        {ALL_PORTS.map((port) => {
          const mp = shapePortAbsPos(0, 0, brick.size.w, brick.size.h, brickShapePreset, port, brickVecPts);
          const isSnap = snapTarget?.brickId === brick.id && snapTarget.port === port;
          const isSrc  = connSrcId === brick.id && connSrcPort === port;
          return (
            <div key={port} style={{ position: "absolute", left: mp.x, top: mp.y, transform: "translate(-50%,-50%)" }}
              className={`pointer-events-auto rounded-full border-2 cursor-crosshair transition-all duration-100
                ${isSnap || isSrc
                  ? "h-4 w-4 border-white bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.7)]"
                  : "h-2.5 w-2.5 border-cyan-500 bg-slate-900/80 hover:h-3.5 hover:w-3.5 hover:border-cyan-300 hover:bg-cyan-400/60"}`}
              onMouseDown={(e) => { e.stopPropagation(); startConnFromPort(brick.id, port); }}
              onMouseUp={(e) => { e.stopPropagation(); if (connSrcId && connSrcId !== brick.id) finishConnAtPort(brick.id, port); }}
              onMouseEnter={() => { if (connSrcId && connSrcId !== brick.id) setSnapTarget({ brickId: brick.id, port }); }}
              onMouseLeave={() => setSnapTarget((s) => (s?.brickId === brick.id && s.port === port) ? null : s)}
            />
          );
        })}
        {/* Custom user-defined magnet ports */}
        {brickCustomPorts.map((cp, i) => (
          <div key={`cp-${i}`}
            style={{ position: "absolute", left: cp.x * brick.size.w, top: cp.y * brick.size.h, transform: "translate(-50%,-50%)" }}
            className="pointer-events-auto h-3 w-3 rounded-full border-2 border-yellow-400 bg-yellow-900/60 cursor-crosshair hover:h-4 hover:w-4 hover:bg-yellow-400/70 transition-all duration-100"
            title="Puerto personalizado · Clic der. para eliminar en modo vec"
            onMouseDown={(e) => { e.stopPropagation(); startConnFromAnchor(brick.id, cp); }}
            onMouseUp={(e) => { e.stopPropagation(); if (connSrcId && connSrcId !== brick.id) finishConnAtAnchor(brick.id, cp); }}
          />
        ))}
      </div>
    ) : null;
    // Custom port dots in vec mode (for editing)
    const vecCustomPortDots = toolMode === "vec" && isSel ? (
      <div className="pointer-events-none absolute inset-0 z-50">
        {brickCustomPorts.map((cp, i) => (
          <div key={`vcp-${i}`}
            style={{ position: "absolute", left: cp.x * brick.size.w, top: cp.y * brick.size.h, transform: "translate(-50%,-50%)" }}
            className="pointer-events-auto h-3.5 w-3.5 rounded-full border-2 border-yellow-400 bg-yellow-500 cursor-pointer"
            title="Puerto personalizado · Clic der. para eliminar"
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteCustomPort(brick.id, i); }}
          />
        ))}
      </div>
    ) : null;

    // Lock overlay — shown when another user is dragging/editing this brick
    const activeLock = brickLocks.get(brick.id);
    const lockOverlay = activeLock ? (
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[inherit] bg-slate-900/50 backdrop-blur-[1px]">
        {activeLock.avatarUrl ? (
          <img src={activeLock.avatarUrl} alt={activeLock.displayName}
            className="h-7 w-7 rounded-full border-2 border-amber-400 shadow-lg" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-900/80 text-[10px] font-bold text-amber-200">
            {activeLock.displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="ml-1.5 max-w-[100px] truncate rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-amber-200">
          {activeLock.displayName}
        </span>
      </div>
    ) : null;

    // ─ Board ─
    if (isBoard) {
      const collapsed = collapsedBoards.has(brick.id);
      const boardH = collapsed ? 28 : brick.size.h;
      const toggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedBoards((prev) => {
          const next = new Set(prev);
          next.has(brick.id) ? next.delete(brick.id) : next.add(brick.id);
          return next;
        });
      };
      const bSR   = asRec(asRec(brick.content).style);
      const bStroke = typeof bSR.stroke === "string" ? bSR.stroke : (isSel ? "rgba(255,255,255,0.5)" : "rgba(34,211,238,0.6)");
      const bFill   = typeof bSR.fill   === "string" ? bSR.fill   : undefined;
      const bDashStyle = bSR.strokeStyle === "dashed" ? "dashed" : bSR.strokeStyle === "dotted" ? "dotted" : "solid";
      return (
        <div
          key={brick.id}
          className={`group/board absolute rounded-xl border transition-[height] duration-150${ring}${bFill ? "" : " bg-cyan-950/10"}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: boardH,
            borderColor: bStroke, borderWidth: 2, borderStyle: bDashStyle,
            backgroundColor: bFill ?? undefined, opacity: sOpacity,
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab, overflow: collapsed ? "hidden" : "visible" }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onPointerDown={(e) => startDrag(e, brick.id)}
        >
          {/* Board header */}
          <div className="relative z-20 flex h-7 items-center justify-between border-b border-cyan-400/20 px-2 text-[10px] font-bold uppercase tracking-widest text-cyan-200 select-none">
            <span className="truncate">{(asRec(brick.content).label as string) || "Board"}</span>
            <div className="flex items-center gap-1">
              <span className="opacity-20">{brick.id.slice(-4)}</span>
              <button
                type="button"
                className="ml-1 flex h-4 w-4 items-center justify-center rounded text-cyan-300 opacity-50 hover:opacity-100 hover:bg-cyan-400/20 transition-opacity"
                onClick={toggleCollapse}
                title={collapsed ? "Expandir" : "Minimizar"}
              >
                <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
              </button>
            </div>
          </div>
          {/* Children – positions are local to the board div */}
          {!collapsed && kids.map((child) => renderBrick(child))}
          {!collapsed && isSel && (
            <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize"
              onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />
          )}
          {/* Quick-add bar for selected board */}
          {isSel && !collapsed && (
            <div className="absolute -bottom-7 left-0 z-40 flex items-center gap-1 rounded-md border border-cyan-400/30 bg-slate-900/90 px-1.5 py-0.5 shadow-lg"
              onPointerDown={(e) => e.stopPropagation()}>
              <span className="mr-1 text-[8px] text-cyan-400/60">+ Añadir:</span>
              {BASIC_BRICKS.slice(0, 3).map((entry) => (
                <button key={entry.kind} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 40 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
              {CONTENT_BRICKS.slice(0, 2).map((entry, i) => (
                <button key={i} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 40 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
            </div>
          )}
          {magnetDots}
          {lockOverlay}
        </div>
      );
    }

    // ─ Chart metabrick (draw with a Mermaid chartSource) ─ rendered as one SVG.
    if (isChart) {
      return (
        <div key={brick.id}
          className={`group absolute${ring} rounded-md`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab, overflow: "visible", opacity: sOpacity }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onPointerDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") { setSelectedId(brick.id); setToolbarPanel("style"); } }}
        >
          <div className="pointer-events-none h-full w-full overflow-hidden rounded-md">
            {chartSpec
              ? <ChartBrickRender chart={chartSpec} w={brick.size.w} h={brick.size.h} className="h-full w-full" />
              : <ChartGlyph source={chartSrc!} className="h-full w-full" />}
          </div>
          {magnetDots}
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
        </div>
      );
    }

    // ─ Shape (draw/frame with shapePreset) ─ also a container if isContainer flag is set
    if (isShape) {
      const collapsed    = collapsedBoards.has(brick.id);
      const shapeH       = collapsed ? 28 : brick.size.h;
      const shapeLabel   = typeof c.label === "string" ? c.label : "";
      const shapeStroke = sStroke;
      const hasFillOverride = typeof asRec(c.style).fill === "string";
      const shapeFill = isDrawBrick && !hasFillOverride ? "rgba(0,0,0,0)" : sFill;
      const toggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedBoards((prev) => { const n = new Set(prev); n.has(brick.id) ? n.delete(brick.id) : n.add(brick.id); return n; });
      };
      return (
        <div key={brick.id}
          className={`group absolute${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: shapeH,
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab, overflow: "visible", opacity: sOpacity }}
          onClick={(e) => { if (e.altKey && toolMode === "vec" && isSel) { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); addCustomPort(brick.id, (e.clientX - r.left) / brick.size.w, (e.clientY - r.top) / brick.size.h); return; } onBrickClick(e, brick.id); }}
          onPointerDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "vec" && isSel && vecPts) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); insertVecPoint(brick.id, (e.clientX - r.left) / brick.size.w, (e.clientY - r.top) / brick.size.h); return; } if (toolMode === "select") startEdit(brick.id); }}
        >
          {!collapsed && <ShapeSvg preset={shapeP!} w={brick.size.w} h={brick.size.h} pts={vecPts} stroke={shapeStroke} fill={shapeFill} sw={sSW} dash={sDash} cr={sCr} />}
          {/* Header – borderless floating label ABOVE the shape (never crossing it).
              Double-click the header to edit the LABEL (independent of the raw body).
              Shown when collapsed / labeled / has children / selected. */}
          {(collapsed || shapeLabel || kids.length > 0 || isSel) && (
            <div className="absolute inset-x-0 bottom-full z-20 mb-1 flex items-end justify-between gap-2 select-none"
              style={{ borderBottom: `1.5px solid ${shapeStroke}` }}
              onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") startEdit(brick.id, "label"); }}>
              {isEditing && editingField === "label" ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="Título…"
                  className="pointer-events-auto min-w-0 flex-1 bg-transparent pb-0.5 text-[11px] font-medium leading-none outline-none placeholder:text-white/30"
                  style={{ color: shapeStroke }}
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }}
                />
              ) : (
                <span className="truncate pb-0.5 text-[11px] font-medium leading-none drop-shadow-sm" style={{ color: shapeStroke }}>
                  {shapeLabel
                    ? <RichText content={shapeLabel} context={MESH_CONTEXT} className="inline text-[11px] leading-none" />
                    : <span className="opacity-40">{String(shapeP)}</span>}
                </span>
              )}
              <button type="button" className="mb-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/10"
                style={{ color: shapeStroke }}
                onClick={toggleCollapse} title={collapsed ? "Expandir" : "Minimizar"}>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
              </button>
            </div>
          )}
          {/* Raw content centred in the shape (read view). Hidden while the raw
              editor is open. Double-click the body to edit it. */}
          {!collapsed && !(isEditing && editingField === "raw") && getMd(brick).trim() && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ padding: `${Math.round(brick.size.h * 0.18)}px ${Math.round(brick.size.w * 0.18)}px`, zIndex: 10 }}>
              <div className="pointer-events-none w-full text-center text-[11px] leading-snug text-white/90 break-words drop-shadow-sm [&_*]:text-inherit">
                <RichText content={getMd(brick)} context={MESH_CONTEXT} className="inline" />
              </div>
            </div>
          )}
          {!collapsed && isEditing && editingField === "raw" && (
            <div
              className="absolute inset-0 z-20"
              style={{ padding: `${Math.round(brick.size.h * 0.18)}px ${Math.round(brick.size.w * 0.18)}px` }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="h-full w-full overflow-auto rounded bg-slate-950/75 px-1 py-0.5">
                <UnifiedTextBrick
                  id={`shape-text-${brick.id}`}
                  text={getMd(brick)}
                  onUpdate={(nextMd) => {
                    setState((cur) => {
                      const b = cur.bricksById[brick.id];
                      if (!b) return cur;
                      return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: setMd(b, nextMd) } };
                    });
                  }}
                  readonly={false}
                  documents={refDocs as any}
                  boards={refBoards as any}
                  activeBricks={[]}
                  users={[]}
                />
              </div>
            </div>
          )}
          {/* Children when container */}
          {isCont && !collapsed && kids.map((child) => renderBrick(child))}
          {/* Quick-add bar when selected container */}
          {isSel && isCont && !collapsed && (
            <div className="absolute -bottom-7 left-0 z-40 flex items-center gap-1 rounded-md border border-cyan-400/30 bg-slate-900/90 px-1.5 py-0.5 shadow-lg"
              onPointerDown={(e) => e.stopPropagation()}>
              <span className="mr-1 text-[8px] text-cyan-400/60">+ Añadir:</span>
              {BASIC_BRICKS.slice(0, 3).map((entry) => (
                <button key={entry.kind} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 36 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
            </div>
          )}
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {isSel && toolMode === "vec" && (vecPts ?? (shapeP ? SHAPE_PTS[shapeP] : undefined))?.map((pt, i) => (
            <div key={i} className="absolute z-40 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full bg-yellow-300 ring-1 ring-black/60"
              style={{ left: pt.x * brick.size.w, top: pt.y * brick.size.h }}
              title="Arrastrar para mover · Clic derecho para eliminar"
              onPointerDown={(e) => startVecDrag(e, brick.id, i)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteVecPoint(brick.id, i); }} />
          ))}
          {vecCustomPortDots}
          {magnetDots}
          {lockOverlay}
        </div>
      );
    }

    // ─ Raw draw area (no shape preset): transparent area, only border on hover/connected ─
    if (brick.kind === "draw" && !shapeP) {
      const isHoverRaw = hoveredRawDrawId === brick.id;
      const manualStrokes = Array.isArray(c.manualStrokes)
        ? (c.manualStrokes as Array<Array<{ x: number; y: number }> | { points: Array<{ x: number; y: number }>; color?: string; width?: number }>)
        : [];
      const rawOutline = isConnected
        ? "2px solid rgba(34,211,238,0.55)"
        : isHoverRaw
          ? "1px solid rgba(34,211,238,0.35)"
          : "1px solid transparent";

      return (
        <div
          key={brick.id}
          className={`group absolute${ring}`}
          style={{
            left: brick.position.x,
            top: brick.position.y,
            width: brick.size.w,
            height: brick.size.h,
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab,
            outline: rawOutline,
            borderRadius: 10,
            background: "transparent",
          }}
          onMouseEnter={() => setHoveredRawDrawId(brick.id)}
          onMouseLeave={() => setHoveredRawDrawId((cur) => (cur === brick.id ? null : cur))}
          onClick={(e) => onBrickClick(e, brick.id)}
          onPointerDown={(e) => startDrag(e, brick.id)}
        >
          {manualStrokes.length > 0 && (
            <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${brick.size.w} ${brick.size.h}`}>
              {manualStrokes.map((strokeEntry, idx) => {
                const strokePts = Array.isArray(strokeEntry) ? strokeEntry : strokeEntry.points;
                const strokeColor = Array.isArray(strokeEntry) ? "#67e8f9" : (strokeEntry.color ?? "#67e8f9");
                const strokeWidth = Array.isArray(strokeEntry) ? 2 : (strokeEntry.width ?? 2);
                if (!Array.isArray(strokePts) || strokePts.length < 2) return null;
                const pixelPts = strokePts.map((p) => [p.x * brick.size.w, p.y * brick.size.h] as [number, number]);
                const d = strokeToFilledPath(pixelPts, strokeWidth * 2);
                return (
                  <path
                    key={idx}
                    d={d}
                    fill={strokeColor}
                    stroke="none"
                    opacity={0.95}
                  />
                );
              })}
            </svg>
          )}
          {/* Children when this raw draw is a container */}
          {isCont && kids.map((child) => renderBrick(child))}
          {isSel && isCont && (
            <div className="absolute -bottom-7 left-0 z-40 flex items-center gap-1 rounded-md border border-cyan-400/30 bg-slate-900/90 px-1.5 py-0.5 shadow-lg"
              onPointerDown={(e) => e.stopPropagation()}>
              <span className="mr-1 text-[8px] text-cyan-400/60">+ Añadir:</span>
              {BASIC_BRICKS.slice(0, 3).map((entry) => (
                <button key={entry.kind} type="button" title={entry.label}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); addMeta(entry, { x: resolveGlobal(state.bricksById, brick.id).x + 20, y: resolveGlobal(state.bricksById, brick.id).y + 36 }); }}>
                  {entry.icon}<span className="ml-0.5">{entry.label}</span>
                </button>
              ))}
            </div>
          )}
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {vecCustomPortDots}
          {magnetDots}
          {lockOverlay}
        </div>
      );
    }

    // ─ Portal (navigable link to another board/document) ─
    if (brick.kind === "portal" && !uKind) {
      const targetType = typeof c.targetType === "string" ? c.targetType as string : "mesh";
      const targetId   = typeof c.targetId   === "string" ? c.targetId   : "";
      const targetLabel = typeof c.targetLabel === "string" ? c.targetLabel : "";
      const portalRenderMode = typeof c.portalRenderMode === "string" ? c.portalRenderMode : "artifact";
      const previewMd = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";
      const previewKind = typeof c.previewKind === "string" ? c.previewKind : "text";
      const previewSubtitle = typeof c.previewSubtitle === "string" ? c.previewSubtitle : "";
      const previewImageDataUrl = typeof c.previewImageDataUrl === "string" ? c.previewImageDataUrl : "";
      const portalPreviewBrick = previewMd.trim()
        ? mkPreviewBrick(`portal_${brick.id}`, previewKind, previewMd)
        : null;
      const portalHref = buildPortalHref(targetType, targetId, { layout: false });
      return (
        <div key={brick.id}
          className={`group absolute overflow-hidden rounded-xl border-2${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            borderColor: isSel ? "rgba(255,255,255,0.5)" : "rgba(59,130,246,0.55)",
            background: "rgba(15,23,42,0.92)",
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onPointerDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (toolMode !== "select") return;
            if (portalHref) {
              setPortalPreview({ url: portalHref, title: targetLabel || targetId });
              return;
            }
            startEdit(brick.id);
          }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-blue-500/20 bg-blue-950/50 px-2.5 select-none">
            <ExternalLink className="h-3 w-3 shrink-0 text-blue-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-300">Portal</span>
            {targetLabel && <span className="ml-1 truncate text-[9px] text-blue-200/70">{targetLabel}</span>}
            {portalHref && !isEditing && (
              <div className="pointer-events-auto ml-auto flex items-center gap-0.5">
                <button type="button" className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-blue-400/60 hover:text-blue-200 hover:bg-blue-500/20 transition-colors" onClick={(e) => { e.stopPropagation(); setPortalPreview({ url: portalHref, title: targetLabel || targetId }); }} title="Ver en pantalla completa">
                  <Maximize2 className="h-2.5 w-2.5" />
                </button>
                <a href={portalHref} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] text-blue-400/60 hover:text-blue-200 hover:bg-blue-500/20 transition-colors" onClick={(e) => e.stopPropagation()} title="Abrir en nueva pestaña" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
          </div>
          <div className="h-[calc(100%-28px)]">
            {isEditing ? (
              <div className="flex w-full flex-col gap-2 p-2.5" onPointerDown={(e) => e.stopPropagation()}>
                <select className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground pointer-events-auto"
                  defaultValue={targetType}
                  onChange={(e) => setState((cur) => {
                    const b = cur.bricksById[brick.id]; if (!b) return cur;
                    return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), targetType: e.target.value, previewMarkdown: "", previewKind: "", previewSubtitle: "", previewTitle: "", previewImageDataUrl: "", previewImageSource: "", previewImageCapturedAt: "" } } } };
                  })}
                  onKeyDown={(e) => e.stopPropagation()}>
                  <option value="mesh">Mesh Board</option>
                  <option value="board">Kanban Board</option>
                  <option value="document">Documento</option>
                </select>
                <select className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground pointer-events-auto"
                  defaultValue={portalRenderMode}
                  onChange={(e) => setState((cur) => {
                    const b = cur.bricksById[brick.id]; if (!b) return cur;
                    return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), portalRenderMode: e.target.value } } } };
                  })}
                  onKeyDown={(e) => e.stopPropagation()}>
                  <option value="artifact">Artifact / screenshot</option>
                  <option value="live">Live mini preview</option>
                </select>
                <input autoFocus type="text" placeholder="Nombre del destino…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none pointer-events-auto"
                  value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }} />
                <input type="text" placeholder="ID (meshId / docId)…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={targetId}
                  onBlur={(e) => { const v = e.target.value.trim(); setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), targetId: v, previewMarkdown: "", previewKind: "", previewSubtitle: "", previewTitle: "", previewImageDataUrl: "", previewImageSource: "", previewImageCapturedAt: "" } } } }; }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
              </div>
            ) : targetId ? (
              /* Preview fills full body — double-click on brick opens the iframe overlay */
              <div className="relative h-full w-full overflow-hidden bg-slate-900/60">
                {portalRenderMode === "live" && portalHref ? (
                  <iframe
                    src={portalHref}
                    title={`portal-live-${brick.id}`}
                    className="h-full w-full pointer-events-none"
                  />
                ) : previewImageDataUrl ? (
                  <img
                    src={previewImageDataUrl}
                    alt="Portal preview"
                    className="w-full"
                    style={{ display: "block" }}
                    loading="lazy"
                  />
                ) : portalPreviewBrick ? (
                  <div className="pointer-events-none h-full overflow-hidden p-1.5">
                    <UnifiedBrickRenderer
                      brick={portalPreviewBrick}
                      canEdit={false}
                      onUpdate={() => undefined}
                      documents={refDocs as any}
                      boards={refBoards as any}
                      activeBricks={[portalPreviewBrick]}
                      users={[]}
                      isCompact
                    />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    <ExternalLink className="h-8 w-8 text-blue-400/25" />
                    <p className="text-[9px] text-blue-400/40">{tMesh("hints.dblClickPreview")}</p>
                  </div>
                )}
                {/* Hover overlay with subtitle info */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-2 py-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <p className="truncate text-[10px] font-medium text-blue-100">{targetLabel || targetId.slice(0, 24)}</p>
                  <p className="text-[8px] text-blue-400/60">{previewSubtitle || (targetType === "mesh" ? "Mesh Board" : targetType === "board" ? "Kanban Board" : "Documento")}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-[10px] text-muted-foreground/40">{tMesh("hints.dblClickConfigPortal")}</p>
              </div>
            )}
          </div>
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
          {lockOverlay}
        </div>
      );
    }

    // ─ Mirror (read-only window into a brick from another document) ─
    if (brick.kind === "mirror" && !uKind) {
      const sourceId       = typeof c.sourceId       === "string" ? c.sourceId       : "";
      const sourceLabel    = typeof c.sourceLabel    === "string" ? c.sourceLabel    : "";
      const previewMd      = typeof c.previewMarkdown === "string" ? c.previewMarkdown : "";
      const previewContent = c.previewContent && typeof c.previewContent === "object" ? c.previewContent as Record<string, unknown> : null;
      const sourceKind     = typeof c.sourceType === "string" ? c.sourceType : "";
      const sourceBrickKind = typeof c.sourceBrickKind === "string" ? c.sourceBrickKind : "text";
      const sourcePath     = typeof c.sourcePath === "string" ? c.sourcePath : "";
      const previewKind = !previewContent && ["beautiful_table", "bountiful_table", "database", "tabs", "columns", "accordion"].includes(sourceBrickKind)
        ? "text"
        : sourceBrickKind;
      const mirrorPreviewBrick = (previewContent || previewMd.trim())
        ? mkPreviewBrick(`mirror_${brick.id}`, previewKind, previewMd, previewContent)
        : null;
      return (
        <div key={brick.id}
          className={`group absolute overflow-hidden rounded-xl border${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            borderColor: isSel ? "rgba(255,255,255,0.45)" : "rgba(168,85,247,0.35)",
            background: "transparent",
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onPointerDown={(e) => startDrag(e, brick.id)}
          onDoubleClick={(e) => { e.stopPropagation(); if (toolMode === "select") startEdit(brick.id); }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-slate-900/45 px-2.5 backdrop-blur-md select-none">
            <Eye className="h-3 w-3 shrink-0 text-purple-400" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-purple-300">Mirror</span>
            {sourceLabel && <span className="ml-auto truncate text-[9px] text-purple-400/50">{sourceLabel}</span>}
            <span className="ml-1 text-[7px] text-purple-400/30">read-only</span>
          </div>
          <div className="flex h-[calc(100%-28px)] flex-col overflow-hidden">
            {isEditing ? (
              <div className="flex flex-col gap-2 p-3" onPointerDown={(e) => e.stopPropagation()}>
                <input autoFocus type="text" placeholder="Nombre de la fuente…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground outline-none pointer-events-auto"
                  value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitEdit(); e.stopPropagation(); }} />
                <input type="text" placeholder="ID del brick fuente…"
                  className="rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={sourceId}
                  onBlur={(e) => { const v = e.target.value.trim(); setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), sourceId: v } } } }; }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
                <textarea rows={3} placeholder="Preview markdown (cache local)…"
                  className="resize-none rounded border border-border bg-background px-2 py-1 text-[10px] font-mono text-foreground outline-none pointer-events-auto"
                  defaultValue={previewMd}
                  onBlur={(e) => { const v = e.target.value; setState((cur) => { const b = cur.bricksById[brick.id]; if (!b) return cur; return { ...cur, bricksById: { ...cur.bricksById, [brick.id]: { ...b, content: { ...asRec(b.content), previewMarkdown: v } } } }; }); }}
                  onKeyDown={(e) => e.stopPropagation()} />
              </div>
            ) : (previewMd || sourceId) ? (
              <div className="pointer-events-none overflow-auto p-2 opacity-95">
                {mirrorPreviewBrick ? (
                  <div className="h-full w-full overflow-hidden rounded-md border border-white/10 bg-transparent">
                    <UnifiedBrickRenderer
                      brick={mirrorPreviewBrick}
                      canEdit={false}
                      onUpdate={() => undefined}
                      documents={refDocs as any}
                      boards={refBoards as any}
                      activeBricks={[mirrorPreviewBrick]}
                      users={[]}
                      isCompact
                    />
                  </div>
                ) : (
                  <>
                    <p className="truncate text-[9px] uppercase tracking-wide text-purple-300/60">{sourceKind || "source"}{sourcePath ? ` · ${sourcePath}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground/60">Fuente: {sourceLabel || sourceId.slice(0, 30)}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-[10px] text-muted-foreground/40">{tMesh("hints.dblClickConfigMirror")}</p>
              </div>
            )}
          </div>
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
          {lockOverlay}
        </div>
      );
    }

    // ─ Text / Portal-with-unifierKind / Mirror-with-unifierKind (unified renderer) ─
    if (docBrick) {
      return (
        <div
          key={brick.id}
          className={`group absolute overflow-hidden transition-[outline-color] duration-100${ring}`}
          style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
            cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab,
            outline: (isSel || isMultiSel) ? "2px solid rgba(255,255,255,0.5)" : isConnected ? "2px solid rgba(34,211,238,0.55)" : "1px solid transparent",
            borderRadius: 6 }}
          onMouseEnter={(e) => { if (!isSel && !isMultiSel && !isConnected) (e.currentTarget as HTMLElement).style.outlineColor = "rgba(34,211,238,0.35)"; }}
          onMouseLeave={(e) => { if (!isSel && !isMultiSel && !isConnected) (e.currentTarget as HTMLElement).style.outlineColor = "transparent"; }}
          onClick={(e) => onBrickClick(e, brick.id)}
          onPointerDown={(e) => { if (isEditing) { e.stopPropagation(); return; } startDrag(e, brick.id); }}
          onDoubleClick={(e) => onBrickDblClick(e, brick.id)}
        >
          <div className={`h-full w-full overflow-auto ${isEditing ? "pointer-events-auto" : "pointer-events-none"}`}>
            <UnifiedBrickRenderer
              brick={docBrick}
              canEdit={isEditing}
              onUpdate={handleUnifierUpdate(brick.id)}
              documents={refDocs as any}
              boards={refBoards as any}
              activeBricks={[docBrick]}
              users={[]}
              isCompact
            />
          </div>
          {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
          {magnetDots}
          {lockOverlay}
        </div>
      );
    }

    // ─ Generic fallback ─
    return (
      <div
        key={brick.id}
        className={`absolute rounded-md border bg-slate-900/70${ring}`}
        style={{ left: brick.position.x, top: brick.position.y, width: brick.size.w, height: brick.size.h,
          borderColor: "rgba(100,180,255,0.25)", borderWidth: 1,
          cursor: dragState?.brickId === brick.id ? CURSOR.grabbing : CURSOR.grab }}
        onClick={(e) => onBrickClick(e, brick.id)}
        onPointerDown={(e) => startDrag(e, brick.id)}
      >
        <div className="p-2">
          <p className="text-[10px] font-bold uppercase text-cyan-100">{brick.kind}</p>
          <p className="text-[9px] opacity-30">{brick.id.slice(-8)}</p>
        </div>
        {isSel && <div className="absolute bottom-0 right-0 z-30 h-5 w-5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-sm bg-white/30 ring-1 ring-white/60 hover:bg-white/50" aria-label="Resize" onPointerDown={(e) => { e.stopPropagation(); startResize(e, brick.id); }} />}
      </div>
    );
  }

  // Render order follows state.rootOrder (z-order: later = on top). Falling
  // back to Object.values ignored layer reorderings — layers panel was a no-op.
  const rootBricks = state.rootOrder.map((id) => state.bricksById[id]).filter((b): b is MeshBrick => !!b && !b.parentId);
  const anyDrag    = !!(dragState || resizeState || vecDragState || panDragState || selRect);

  const meshBgStyle: React.CSSProperties & { backgroundImage?: string; background?: string } = (() => {
    const a = meshAppearance;
    if (a.backgroundKind === "image" && a.backgroundImageUrl)
      return { backgroundImage: `url(${a.backgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
    if (a.backgroundKind === "color" && a.backgroundValue)
      return { backgroundColor: a.backgroundValue };
    if (a.backgroundKind === "gradient" && a.backgroundGradient && !a.backgroundGradient.startsWith("bg-"))
      return { background: a.backgroundGradient };
    // preset is now stored as a hex color
    if (a.backgroundKind === "preset" && a.backgroundValue &&
        (a.backgroundValue.startsWith("#") || a.backgroundValue.startsWith("rgb")))
      return { backgroundColor: a.backgroundValue };
    return {};
  })();
  const meshBgClass = (() => {
    const a = meshAppearance;
    if (a.backgroundKind === "gradient" && a.backgroundGradient?.startsWith("bg-")) return a.backgroundGradient;
    // only use preset value as class if it's a Tailwind class (legacy)
    if (a.backgroundKind === "preset" && a.backgroundValue && a.backgroundValue.startsWith("bg-")) return a.backgroundValue;
    return "";
  })();

  return (
    <>
    <div className={`relative flex h-full flex-col ${meshBgClass}`} style={{ userSelect: anyDrag ? "none" : undefined, ...meshBgStyle }}>
      {/* Local workspace needs a permission re-grant (deep-link/reload loses the
          file-system handle's access). Prompt to reconnect — a user gesture. */}
      {looksLocalFile && localWs.status === "needs-permission" && (
        <div className="absolute inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-slate-950/80 backdrop-blur-sm">
          <HardDrive className="h-10 w-10 text-cyan-300/70" />
          <p className="max-w-sm text-center text-sm text-slate-300">{tMesh("local.reconnectHint")}</p>
          <button type="button" onClick={() => void localWs.reconnect()}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/90 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
            <HardDrive className="h-4 w-4" /> {tMesh("local.reconnect")}
          </button>
        </div>
      )}
      {/* Phase 4: Pen Toolbar */}
      {toolMode === "pen" && (
        <PenToolbar
          color={penColor}
          strokeWidth={penStrokeWidth}
          mode={penMode}
          onColorChange={setPenColor}
          onStrokeWidthChange={setPenStrokeWidth}
          onModeChange={setPenMode}
          smartDisabled={!online || localMode || !meshId || !accessToken}
          smartDisabledReason={tMesh("errors.iinkNoResponse")}
        />
      )}

      {isTextToDiagramOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!diagramGenerating) setIsTextToDiagramOpen(false); }}>
          <div className="w-[min(560px,92vw)] rounded-2xl border border-cyan-300/25 bg-slate-950/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              <h2 className="text-sm font-semibold text-cyan-100">{tMesh("textToDiagram.title")}</h2>
            </div>
            {diagramPreview ? (
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-slate-400">{tMesh("textToDiagram.previewHint")}</p>
                <div className="relative h-[340px] w-full overflow-hidden rounded-xl border border-cyan-400/20 bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.06),transparent_70%)]">
                  <PublicMeshCanvas state={templateToMeshState(diagramPreview)} />
                </div>
                <p className="text-center text-[11px] text-slate-400">
                  {tMesh("textToDiagram.previewCount", { bricks: diagramPreview.bricks.length, conns: diagramPreview.connections.length })}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setDiagramPreview(null)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                    {tMesh("textToDiagram.discard")}
                  </button>
                  <button type="button" onClick={confirmInsertPreview}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400">
                    <Check className="h-3.5 w-3.5" /> {tMesh("textToDiagram.insert")}
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="mb-3 flex gap-1 rounded-lg border border-white/10 bg-slate-900/60 p-0.5">
              {(["ai", "mermaid"] as const).map((mode) => (
                <button key={mode} type="button" disabled={diagramGenerating}
                  onClick={() => setDiagramMode(mode)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${diagramMode === mode ? "bg-cyan-500/25 text-cyan-100" : "text-slate-400 hover:text-cyan-100"}`}>
                  {mode === "ai" ? tMesh("textToDiagram.tabAi") : tMesh("textToDiagram.tabImport")}
                </button>
              ))}
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-400">{diagramMode === "ai" ? tMesh("textToDiagram.hint") : tMesh("textToDiagram.mermaidHint")}</p>
            <textarea
              autoFocus
              value={diagramPrompt}
              onChange={(e) => setDiagramPrompt(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleGenerateDiagram(); if (e.key === "Escape" && !diagramGenerating) setIsTextToDiagramOpen(false); }}
              placeholder={diagramMode === "ai" ? tMesh("textToDiagram.placeholder") : tMesh("textToDiagram.mermaidPlaceholder")}
              rows={diagramMode === "mermaid" ? 7 : 4}
              disabled={diagramGenerating}
              spellCheck={diagramMode === "ai"}
              className={`w-full resize-none rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50 disabled:opacity-60 ${diagramMode === "mermaid" ? "font-mono text-[12px]" : ""}`}
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              {diagramMode === "mermaid" && (
                <label className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20">
                  <Upload className="h-3.5 w-3.5" />
                  {tMesh("textToDiagram.importFile")}
                  <input type="file" accept=".excalidraw,.json,.md,.mmd,.png,application/json,image/png" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void importDiagramFile(f); e.currentTarget.value = ""; }} />
                </label>
              )}
              <button type="button" disabled={diagramGenerating}
                onClick={() => setIsTextToDiagramOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
                {tMesh("textToDiagram.cancel")}
              </button>
              <button type="button" disabled={diagramGenerating || !diagramPrompt.trim()}
                onClick={handleGenerateDiagram}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">
                {diagramGenerating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {tMesh("textToDiagram.generating")}</> : <><Sparkles className="h-3.5 w-3.5" /> {tMesh("textToDiagram.generate")}</>}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {isAiDrawerOpen && activeTeamId && (
        <div className={`absolute right-0 top-0 z-40 h-full ${mobileMode ? "w-full max-w-full" : "w-[360px] max-w-[90vw]"} shadow-2xl`}>
          <AgentChatPanel
            teamId={activeTeamId}
            entityType="mesh"
            entityId={meshId ?? undefined}
            onClose={() => setIsAiDrawerOpen(false)}
            className="h-full border-l border-border/60"
          />
        </div>
      )}
      {!mobileMode && (
      <>
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card/70 px-5 py-2.5">
        {/* Left: board name + live indicator */}
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold tracking-tight text-foreground truncate max-w-[220px]" title={meshBoardName}>
            {meshBoardName || "Mesh Board"}
          </h1>
          <div className="h-4 w-px bg-border/60" />
          <span className="inline-flex items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
          <span className="hidden sm:inline text-[11px] text-muted-foreground">
            {Object.keys(state.bricksById).length} {tMesh("header.bricks")}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5">
          {/* Selection context actions */}
          {selectedId && (() => {
            const selB = state.bricksById[selectedId];
            const hasStrokes = selB?.kind === "draw" && !asRec(selB.content).shapePreset &&
              Array.isArray(asRec(selB.content).manualStrokes) &&
              (asRec(selB.content).manualStrokes as unknown[]).length > 0;
            return hasStrokes ? (
              <button type="button" onClick={() => clearDrawStrokes(selectedId)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-950/30 px-2.5 text-xs text-orange-300 hover:bg-orange-900/40">
                <Trash2 className="h-3.5 w-3.5" /> Clear strokes
              </button>
            ) : null;
          })()}
          {(selectedId || selectedConnId || selectedIds.size > 0) && (
            <button type="button" onClick={() => {
              if (selectedIds.size > 0) {
                setState((c) => { let s = c; selectedIds.forEach((id) => { s = deleteBrick(s, id); }); return s; });
                setSelectedIds(new Set()); toast(tMesh("feedback.deletedCount", { count: selectedIds.size }), "success");
              } else {
                if (selectedId) { setState((c) => deleteBrick(c, selectedId)); setSelectedId(null); toast(tMesh("feedback.deleted"), "success"); }
                if (selectedConnId) { setState((c) => deleteConn(c, selectedConnId)); setSelectedConnId(null); }
              }
            }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-500/40 bg-red-950/30 px-2.5 text-xs text-red-300 hover:bg-red-900/40">
              <Trash2 className="h-3.5 w-3.5" /> {selectedIds.size > 1 ? tMesh("feedback.deletedCount", { count: selectedIds.size }) : tMesh("feedback.deleted")}
            </button>
          )}

          {/* Presence avatars */}
          <div className="hidden items-center -space-x-1.5 px-1 sm:flex">
            {presenceMembers.slice(0, 5).map((member) => (
              <img
                key={member.clientId}
                src={getUserAvatarUrl(member.data.avatar_url, member.data.email, 24)}
                alt={member.data.displayName}
                title={member.data.displayName}
                className="h-6 w-6 rounded-full border-2 border-background ring-1 ring-border/40 object-cover bg-muted shadow-sm"
              />
            ))}
            {presenceMembers.length > 5 && (
              <div className="h-6 min-w-6 rounded-full border-2 border-background bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground inline-flex items-center justify-center shadow-sm">
                +{presenceMembers.length - 5}
              </div>
            )}
            {presenceMembers.length === 0 && (
              <div className="h-6 min-w-6 rounded-full border-2 border-background bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground inline-flex items-center justify-center animate-pulse shadow-sm">
                ...
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-border/60 mx-0.5" />

          {/* Copilot: hidden in local mode unless online (uses personal plan) */}
          {(!localMode || online) && (
            <button
              type="button"
              onClick={() => { setSidebarTab("copilot"); setIsAiDrawerOpen(false); setIsCommentsOpen(true); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                isCommentsOpen && sidebarTab === "copilot"
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-card/60 text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copilot</span>
            </button>
          )}

          {/* Team chat is room-backed — unavailable in local mode */}
          {!localMode && (
            <button
              type="button"
              onClick={() => { setSidebarTab("chat"); setIsAiDrawerOpen(false); setIsCommentsOpen(true); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                isCommentsOpen && sidebarTab === "chat"
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-card/60 text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          )}

          {/* Activity stays available offline (local sidecar) */}
          {localMode && (
            <button
              type="button"
              onClick={() => { setSidebarTab("activity"); setIsAiDrawerOpen(false); setIsCommentsOpen(true); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                isCommentsOpen && sidebarTab === "activity"
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-card/60 text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Actividad</span>
            </button>
          )}

          {/* Share: cloud sharing, or local publish to personal workspace */}
          {!localMode ? (
            <button
              type="button"
              onClick={handleShareMesh}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsPublishOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tShare("button")}</span>
            </button>
          )}

          {/* Export .km */}
          <button
            type="button"
            onClick={handleDownloadMesh}
            title={tMesh("file.export")}
            aria-label={tMesh("file.export")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {/* Import .km */}
          <button
            type="button"
            onClick={() => kmImportInputRef.current?.click()}
            title={tMesh("file.import")}
            aria-label={tMesh("file.import")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <input
            ref={kmImportInputRef}
            type="file"
            accept={KILLIO_EXT.km}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportMeshFile(f); e.target.value = ""; }}
          />

          {/* Settings (rename, appearance, delete) */}
          <button
            type="button"
            onClick={() => setIsBoardSettingsOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:border-accent/30 hover:text-foreground transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Save */}
          <button type="button" onClick={handleSave} disabled={isSaving || isLoading}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Save</span>
          </button>

        </div>
      </div>
      </>
      )}

      {mobileMode && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-slate-950/72 px-3 py-2 text-[10px] text-slate-100 shadow-[0_12px_28px_rgba(0,0,0,0.45)] backdrop-blur-md">
            <span className="font-semibold tracking-wide">Mesh</span>
            <span className="text-slate-400">rev {revision}</span>
            <span className="text-slate-400">{Object.keys(state.bricksById).length} bricks</span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-500/15 text-cyan-100 disabled:opacity-50"
              title="Guardar"
              aria-label="Guardar"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left toolbar ── */}
        <div className="hidden w-[180px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card/80 py-2 text-[10px]">

          {/* Modos */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">{tMesh("toolbar.modeLabel")}</p>
            <div className="grid grid-cols-3 gap-1">
              {([
                ["select", tMesh("toolbar.modes.select"), <MousePointer key="i-select" className="h-3.5 w-3.5" />, tMesh("toolbar.modeShortcuts.select")],
                ["pan",    tMesh("toolbar.modes.pan"),    <Hand          key="i-pan"    className="h-3.5 w-3.5" />, tMesh("toolbar.modeShortcuts.pan")],
                ["pen",    tMesh("toolbar.modes.pen"),    <Pencil        key="i-pen"    className="h-3.5 w-3.5" />, tMesh("toolbar.modeShortcuts.pen")],
                ["conn",   tMesh("toolbar.modes.conn"),   <Link2         key="i-conn"   className="h-3.5 w-3.5" />, tMesh("toolbar.modeShortcuts.conn")],
                ["vec",    tMesh("toolbar.modes.vec"),    <Edit3         key="i-vec"    className="h-3.5 w-3.5" />, tMesh("toolbar.modeShortcuts.vec")],
              ] as [ToolMode, string, React.ReactNode, string][]).map(([m, label, icon, key]) => (
                <button key={m} type="button" title={`${label}${key ? ` (${key})` : ""}`}
                  onClick={() => { setToolMode(m); if (m !== "conn") setConnSrcId(null); }}
                  className={`flex h-8 flex-col items-center justify-center gap-0.5 rounded-lg text-[8px] transition-colors ${toolMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent/20"}`}>
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            {toolMode === "conn" && (
              <select value={connPreset} onChange={(e) => setConnPreset(e.target.value as ConnStyle)}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-1.5 py-1 text-[9px] text-foreground">
                <option value="technical">─ Technical</option>
                <option value="dashed">- - Dashed</option>
                <option value="handdrawn">∿ Hand</option>
                <option value="bezier">⌒ Bezier</option>
                <option value="curved">◡ Curved</option>
              </select>
            )}
          </section>

          <div className="mx-2 mb-2 h-px bg-border/50" />

          {/* Básicos */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Básicos</p>
            <div className="grid grid-cols-2 gap-1">
              {BASIC_BRICKS.map((entry, i) => (
                <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                  onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                  onClick={() => addMeta(entry)} />
              ))}
            </div>
          </section>

          <div className="mx-2 mb-2 h-px bg-border/50" />

          {/* Contenido */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Contenido</p>
            <div className="grid grid-cols-2 gap-1">
              {CONTENT_BRICKS.map((entry, i) => (
                <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                  onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                  onClick={() => addMeta(entry)} />
              ))}
            </div>
          </section>

          <div className="mx-2 mb-2 h-px bg-border/50" />

          {/* Formas */}
          <section className="px-2 pb-2">
            <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Formas</p>
            {SHAPE_CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-2">
                <div className="mb-1 flex items-center gap-1 text-[7px] text-muted-foreground/60">
                  {cat.icon}<span className="uppercase tracking-wider">{cat.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {cat.shapes.map(({ preset, label }) => (
                    <button key={preset} type="button" title={label} draggable
                      onClick={() => addShape(preset)}
                      onDragStart={(e) => onToolDragStart(e, { type: "shape", preset })}
                      className="flex flex-col items-center gap-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground">
                      <div className="h-[18px] w-[32px] relative">
                        <ShapeSvg preset={preset} w={32} h={18} stroke="currentColor" fill="none" sw={1.5} />
                      </div>
                      <span className="text-[7px] leading-none truncate max-w-[36px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {/* Charts — insert a data-driven chart metabrick (editable Mermaid source). */}
            <div className="mb-2">
              <div className="mb-1 flex items-center gap-1 text-[7px] text-muted-foreground/60">
                <BarChart2 className="h-3 w-3" /><span className="uppercase tracking-wider">{tMesh("charts.groupLabel")}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {CHART_PALETTE.map(({ key, labelKey }) => { const label = tMesh(`charts.types.${labelKey}` as any); return (
                  <button key={key} type="button" title={label} draggable
                    onClick={() => addChart(key)}
                    onDragStart={(e) => onToolDragStart(e, { type: "chart", key })}
                    className="flex flex-col items-center gap-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground">
                    <div className="h-[18px] w-[32px] relative [&_text]:hidden">
                      <ChartBrickRender chart={defaultChartSpec(key)} w={360} h={300} className="h-full w-full" />
                    </div>
                    <span className="text-[7px] leading-none truncate max-w-[36px]">{label}</span>
                  </button>
                ); })}
              </div>
            </div>
          </section>

          {/* Pen status */}
          {toolMode === "pen" && (
            <div className="mx-2 mt-auto rounded-lg bg-purple-500/20 p-2 text-center text-[8px] text-purple-200">
              {recognizing ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : <Pencil className="mx-auto h-3 w-3" />}
              <p className="mt-1">{penStrokes.length > 0 ? `${penStrokes.length} trazos` : "Dibuja en el canvas"}</p>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div className="relative flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <div
              ref={canvasRef}
              className="absolute inset-0 overflow-hidden touch-none"
              style={{
                cursor: panDragState ? CURSOR.grabbing
                  : toolMode === "pan" ? CURSOR.grab
                  : toolMode === "pen" ? CURSOR.pen
                  : toolMode === "conn" ? CURSOR.conn
                  : toolMode === "vec" ? CURSOR.vec
                  : selRect ? CURSOR.crosshair
                  : CURSOR.select,
                backgroundImage: showGrid
                  ? "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)"
                  : "none",
                backgroundSize: showGrid ? `${Math.max(10, 20 * viewport.zoom)}px ${Math.max(10, 20 * viewport.zoom)}px` : undefined,
                backgroundPosition: showGrid ? `${viewport.x}px ${viewport.y}px` : undefined,
              }}
              onMouseDown={mobileMode ? undefined : onCanvasMouseDown}
              onMouseMove={mobileMode ? undefined : onMouseMove}
              onMouseUp={mobileMode ? undefined : onMouseUp}
              onMouseLeave={() => { setActivePen(null); setDragState(null); setResizeState(null); setPanDragState(null); selRectRef.current = null; setSelRect(null); }}
              onPointerDown={mobileMode ? onCanvasPointerDown : undefined}
              onPointerMove={mobileMode ? onCanvasPointerMove : undefined}
              onPointerUp={mobileMode ? onCanvasPointerUp : undefined}
              onPointerCancel={mobileMode ? onCanvasPointerUp : undefined}
              onClick={onCanvasClick}
              onWheel={onCanvasWheel}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
            >
              {/* ── Remote cursors overlay (screen-space, outside viewport transform) ── */}
              <MeshCursorLayer cursors={remoteCursors} viewport={viewport} />

              {rootBricks.length === 0 && (
                <div className="pointer-events-none absolute left-8 top-8 z-10 flex items-center gap-2 rounded border border-dashed border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground/60">
                  <AlertTriangle className="h-4 w-4" /> {tMesh("hints.toolbar")}
                </div>
              )}

              <div
                className="absolute inset-0"
                style={{
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                  transformOrigin: "0 0",
                }}
              >

                {/* Connections + pen strokes SVG overlay */}
                <svg className="pointer-events-none absolute inset-0 overflow-visible" style={{ width: "100%", height: "100%" }}>
                  <defs>
                    <marker id="arr-norm" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                      <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="context-stroke" />
                    </marker>
                    <marker id="arr-sel" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                      <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="context-stroke" />
                    </marker>
                    {/* Reversed heads for bidirectional connections (markerStart). */}
                    <marker id="arr-norm-rev" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse">
                      <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="context-stroke" />
                    </marker>
                    <marker id="arr-sel-rev" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse">
                      <path d="M0,0.5 L6,3.5 L0,6.5 Z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {Object.values(state.connectionsById).map((conn) => {
                    // If an endpoint brick is hidden because an ancestor board is
                    // collapsed, re-route the connection to the OUTERMOST collapsed
                    // ancestor (the board actually shown) — stepwise by depth, so a
                    // deep child folds up to whichever level is currently visible.
                    const anchorId = (id: string): string => {
                      const chain: string[] = []; let c: MeshBrick | undefined = state.bricksById[id];
                      while (c) { chain.push(c.id); c = c.parentId ? state.bricksById[c.parentId] : undefined; }
                      for (let i = chain.length - 1; i >= 0; i--) if (collapsedBoards.has(chain[i])) return chain[i];
                      return id;
                    };
                    const src = state.bricksById[anchorId(conn.cons[0])];
                    const tgt = state.bricksById[anchorId(conn.cons[1])];
                    if (!src || !tgt) return null;
                    if (src.id === tgt.id) return null; // both folded into the same collapsed board
                    const sg = gPos(src.id); const tg = gPos(tgt.id);
                    const st = asRec(conn.style);
                    const stroke    = typeof st.stroke === "string" ? st.stroke : "#22d3ee";
                    const width     = typeof st.width  === "number" ? st.width  : 2;
                    const dashed    = st.pattern === "dashed";
                    const cType     = typeof st.connType === "string" ? st.connType : "technical";
                    const isSC      = selectedConnId === conn.id;
                    const cs        = isSC ? "#fff" : stroke;
                    const cw        = isSC ? width + 1 : width;
                    const srcH      = collapsedBoards.has(src.id) ? 28 : src.size.h;
                    const tgtH      = collapsedBoards.has(tgt.id) ? 28 : tgt.size.h;
                    const srcR      = { x: sg.x, y: sg.y, w: src.size.w, h: srcH };
                    const tgtR      = { x: tg.x, y: tg.y, w: tgt.size.w, h: tgtH };
                    const sp        = typeof st.srcPort === "string" ? st.srcPort as Port : undefined;
                    const tp        = typeof st.tgtPort === "string" ? st.tgtPort as Port : undefined;
                    const srcPreset = presetOfBrick(src);
                    const tgtPreset = presetOfBrick(tgt);
                    const srcAnchor = st.srcAnchorNorm as AnchorNorm | undefined;
                    const tgtAnchor = st.tgtAnchorNorm as AnchorNorm | undefined;
                    // User-modified vector points — used so connections track edited polygon borders
                    const srcVecPts = Array.isArray(asRec(src.content).vectorPoints) ? asRec(src.content).vectorPoints as VecPts : undefined;
                    const tgtVecPts = Array.isArray(asRec(tgt.content).vectorPoints) ? asRec(tgt.content).vectorPoints as VecPts : undefined;
                    const markerId  = isSC ? "url(#arr-sel)" : "url(#arr-norm)";
                    const bidir     = st.bidir === true;
                    const markerStartId = bidir ? (isSC ? "url(#arr-sel-rev)" : "url(#arr-norm-rev)") : undefined;
                    const connLabel = typeof st.label === "string" ? st.label : "";
                    const isEditingConnLabel = editingConnId === conn.id;
                    const labelW    = isEditingConnLabel ? 260 : 180;
                    const labelH    = isEditingConnLabel ? 82 : 28;
                    const labelLift = Math.max(2, labelH * 0.08);

                    // Build path based on connType
                    let d = "";
                    let labelPt = { x: 0, y: 0 };
                    let bezierInfo: ReturnType<typeof buildBezierPath> | null = null;

                    if (cType === "bezier") {
                      const cp1 = st.cp1 as { x: number; y: number } | undefined;
                      const cp2 = st.cp2 as { x: number; y: number } | undefined;
                      bezierInfo = buildBezierPath(srcR, tgtR, cp1, cp2, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      d = bezierInfo.d;
                      labelPt = {
                        x: 0.125 * bezierInfo.e1x + 0.375 * bezierInfo.cp1.x + 0.375 * bezierInfo.cp2.x + 0.125 * bezierInfo.e2x,
                        y: 0.125 * bezierInfo.e1y + 0.375 * bezierInfo.cp1.y + 0.375 * bezierInfo.cp2.y + 0.125 * bezierInfo.e2y,
                      };
                    } else if (cType === "curved") {
                      d = buildCurvedPath(srcR, tgtR, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      const obs2 = Object.values(state.bricksById)
                        .filter((b) => b.id !== src.id && b.id !== tgt.id)
                        .map((b) => mkObstaclePoly(b, gPos(b.id)));
                      const rp2 = buildConnPolyline(srcR, tgtR, obs2, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      labelPt = pointAtPolylineFraction(rp2, 0.5);
                    } else {
                      const obs = Object.values(state.bricksById)
                        .filter((b) => b.id !== src.id && b.id !== tgt.id)
                        .map((b) => mkObstaclePoly(b, gPos(b.id)));
                      const routePts = buildConnPolyline(srcR, tgtR, obs, sp, tp, srcPreset, tgtPreset, srcAnchor, tgtAnchor, srcVecPts, tgtVecPts);
                      d = cType === "handdrawn" ? handDrawnPath(routePts, conn.id) : smoothPoly(routePts, CORNER_R);
                      labelPt = pointAtPolylineFraction(routePts, 0.5);
                    }

                    return (
                      <g key={conn.id} style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); setSelectedConnId(conn.id); setSelectedId(null); setSelectedIds(new Set()); }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedConnId(conn.id);
                          setEditingConnId(conn.id);
                          if (!connLabel) {
                            setState((cur) => {
                              const co = cur.connectionsById[conn.id];
                              if (!co) return cur;
                              return {
                                ...cur,
                                connectionsById: {
                                  ...cur.connectionsById,
                                  [conn.id]: { ...co, style: { ...asRec(co.style), label: "" } },
                                },
                              };
                            });
                          }
                        }}>
                        {/* fat transparent hit area */}
                        <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke" }} />
                        <path d={d} fill="none" stroke={cs} strokeWidth={cType === "handdrawn" ? cw + 0.5 : cw}
                          strokeDasharray={dashed ? "6 4" : undefined}
                          strokeLinecap={cType === "handdrawn" ? "round" : "butt"}
                          strokeLinejoin={cType === "handdrawn" ? "round" : "miter"}
                          markerEnd={markerId} markerStart={markerStartId} opacity={0.9} />

                        {/* Bezier control point handles (vec mode + selected) */}
                        {cType === "bezier" && isSC && toolMode === "vec" && bezierInfo && (
                          <g style={{ pointerEvents: "auto" }}>
                            <line x1={bezierInfo.e1x} y1={bezierInfo.e1y} x2={bezierInfo.cp1.x} y2={bezierInfo.cp1.y} stroke={stroke} strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
                            <line x1={bezierInfo.e2x} y1={bezierInfo.e2y} x2={bezierInfo.cp2.x} y2={bezierInfo.cp2.y} stroke={stroke} strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
                            <circle cx={bezierInfo.cp1.x} cy={bezierInfo.cp1.y} r={6} fill={stroke} opacity={0.85} className="cursor-move"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                const pt = fromEv(e as unknown as React.MouseEvent);
                                setBezierCpDrag({ connId: conn.id, cp: 1, startMouse: pt, startCp: { ...bezierInfo!.cp1 } });
                              }} />
                            <circle cx={bezierInfo.cp2.x} cy={bezierInfo.cp2.y} r={6} fill={stroke} opacity={0.85} className="cursor-move"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                const pt = fromEv(e as unknown as React.MouseEvent);
                                setBezierCpDrag({ connId: conn.id, cp: 2, startMouse: pt, startCp: { ...bezierInfo!.cp2 } });
                              }} />
                          </g>
                        )}
                        {(connLabel || isEditingConnLabel) && (
                          <foreignObject
                            x={labelPt.x - labelW / 2}
                            y={labelPt.y - labelH / 2 - labelLift}
                            width={labelW}
                            height={labelH}
                            style={{ pointerEvents: "auto", overflow: "visible" }}
                          >
                            {isEditingConnLabel ? (
                              <div className="rounded border border-cyan-400/50 bg-slate-950/85 p-1 shadow-xl"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}>
                                <UnifiedTextBrick
                                  id={`conn-label-${conn.id}`}
                                  text={connLabel}
                                  onUpdate={(nextLabel) => {
                                    setState((cur) => {
                                      const co = cur.connectionsById[conn.id];
                                      if (!co) return cur;
                                      return {
                                        ...cur,
                                        connectionsById: {
                                          ...cur.connectionsById,
                                          [conn.id]: { ...co, style: { ...asRec(co.style), label: nextLabel } },
                                        },
                                      };
                                    });
                                  }}
                                  readonly={false}
                                  documents={refDocs as any}
                                  boards={refBoards as any}
                                  activeBricks={[]}
                                  users={[]}
                                />
                              </div>
                            ) : (
                              <div className="flex w-full justify-center" style={{ userSelect: "none" }} onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => {
                                e.stopPropagation();
                                setSelectedConnId(conn.id);
                                setEditingConnId(conn.id);
                              }}>
                                <div className={`max-w-[180px] truncate rounded px-1.5 py-0.5 text-[10px] leading-tight ${isSC ? "text-white" : "text-slate-300"} bg-slate-950/55 border border-white/10 shadow-sm [&_*]:text-inherit`}>
                                  <RichText content={connLabel} context={MESH_CONTEXT} className="inline" />
                                </div>
                              </div>
                            )}
                          </foreignObject>
                        )}
                      </g>
                    );
                  })}

                  {/* Ghost connection line */}
                  {toolMode === "conn" && connSrcId && pointer && (() => {
                    const src = state.bricksById[connSrcId];
                    if (!src) return null;
                    const sg = gPos(connSrcId);
                    const st = connStyle(connPreset);
                    const srcH2 = collapsedBoards.has(connSrcId) ? 28 : src.size.h;
                    const srcPresetGhost = presetOfBrick(src);
                    const srcVecPtsGhost = Array.isArray(asRec(src.content).vectorPoints) ? asRec(src.content).vectorPoints as VecPts : undefined;
                    const e = resolveConnEndpoint(
                      { x: sg.x, y: sg.y, w: src.size.w, h: srcH2 },
                      connSrcPort ?? undefined, srcPresetGhost, connSrcAnchor ?? undefined,
                      pointer, srcVecPtsGhost,
                    );
                    const end = snapTarget
                      ? (() => { const b = state.bricksById[snapTarget.brickId]; if (!b) return pointer; const g = gPos(snapTarget.brickId); const bp = presetOfBrick(b); const bvp = Array.isArray(asRec(b.content).vectorPoints) ? asRec(b.content).vectorPoints as VecPts : undefined; return shapePortAbsPos(g.x, g.y, b.size.w, b.size.h, bp, snapTarget.port, bvp); })()
                      : pointer;
                    return <>
                      <line x1={e.x} y1={e.y} x2={end.x} y2={end.y} stroke={String(st.stroke)} strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
                      {snapTarget && <circle cx={end.x} cy={end.y} r={7} fill="#22d3ee" opacity={0.7} />}
                    </>;
                  })()}

                  {/* Pen strokes (smooth filled paths via perfect-freehand) */}
                  {toolMode === "pen" && <>
                    {penStrokes.map((s, i) => <path key={i} d={strokeToFilledPath(s.points, (s.width ?? penStrokeWidth) * 2)} fill={s.color ?? penColor} stroke="none" opacity={0.7} />)}
                    {activePen && activePen.length > 1 && <path d={strokeToFilledPath(activePen, penStrokeWidth * 2)} fill={penColor} stroke="none" opacity={0.9} />}
                  </>}

                  {/* Rubber-band selection rect */}
                  {selRect && (
                    <rect
                      x={Math.min(selRect.x1, selRect.x2)} y={Math.min(selRect.y1, selRect.y2)}
                      width={Math.abs(selRect.x2 - selRect.x1)} height={Math.abs(selRect.y2 - selRect.y1)}
                      fill="rgba(34,211,238,0.06)" stroke="rgba(34,211,238,0.5)"
                      strokeWidth={1} strokeDasharray="4 2" style={{ pointerEvents: "none" }}
                    />
                  )}
                </svg>

                {/* Root bricks */}
                {rootBricks.map((b) => renderBrick(b))}
              </div>
            </div>
          )}

          {/* ── Zoom + Grid toolbar (bottom-right) ── */}
          <div className="pointer-events-none absolute bottom-4 right-3 z-30 flex flex-col items-end gap-1.5">
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-cyan-300/20 bg-slate-950/88 px-1.5 py-1 shadow-lg backdrop-blur-md">
              <button
                type="button"
                title="Mostrar/ocultar grilla"
                onClick={() => setShowGrid((v) => !v)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] transition-colors ${showGrid ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </button>

              <div className="mx-0.5 h-4 w-px bg-white/10" />

              <button
                type="button"
                title="Alejar (Ctrl+scroll)"
                onClick={() => {
                  const el = canvasRef.current;
                  const cx = el ? el.clientWidth / 2 : 0;
                  const cy = el ? el.clientHeight / 2 : 0;
                  setViewport((v) => {
                    const nz = Math.max(0.2, v.zoom * 0.8);
                    const wx = (cx - v.x) / v.zoom;
                    const wy = (cy - v.y) / v.zoom;
                    return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz };
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                title="Restablecer zoom (100%)"
                onClick={() => {
                  const el = canvasRef.current;
                  const cx = el ? el.clientWidth / 2 : 0;
                  const cy = el ? el.clientHeight / 2 : 0;
                  setViewport((v) => {
                    const nz = 1;
                    const wx = (cx - v.x) / v.zoom;
                    const wy = (cy - v.y) / v.zoom;
                    return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz };
                  });
                }}
                className="min-w-[36px] rounded-md px-1.5 py-0.5 text-center text-[9px] font-semibold tabular-nums text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {Math.round(viewport.zoom * 100)}%
              </button>

              <button
                type="button"
                title="Acercar (Ctrl+scroll)"
                onClick={() => {
                  const el = canvasRef.current;
                  const cx = el ? el.clientWidth / 2 : 0;
                  const cy = el ? el.clientHeight / 2 : 0;
                  setViewport((v) => {
                    const nz = Math.min(2.8, v.zoom * 1.25);
                    const wx = (cx - v.x) / v.zoom;
                    const wy = (cy - v.y) / v.zoom;
                    return { x: cx - wx * nz, y: cy - wy * nz, zoom: nz };
                  });
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={floatingToolbarRef}
            className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3 ${mobileMode ? "bottom-3 pb-[max(env(safe-area-inset-bottom),0px)]" : "bottom-4"}`}
          >
            <div className="pointer-events-auto flex max-w-full flex-col items-center gap-2">
              {toolbarPanel && (
                <div className={`max-h-[60vh] overflow-y-auto rounded-2xl border border-cyan-300/20 bg-slate-950 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.7)] ${mobileMode ? "w-[min(96vw,640px)]" : "w-[min(92vw,780px)]"}`}>
                  {toolbarPanel === "mode" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Modo</p>
                      <div className="grid grid-cols-5 gap-2">
                        {([
                          ["select", tMesh("toolbar.modes.select"), <MousePointer key="i-select" className="h-3.5 w-3.5" />],
                          ["pan",    tMesh("toolbar.modes.pan"),    <Hand key="i-pan" className="h-3.5 w-3.5" />],
                          ["pen",    tMesh("toolbar.modes.pen"),    <Pencil key="i-pen" className="h-3.5 w-3.5" />],
                          ["conn",   tMesh("toolbar.modes.conn"),   <Link2 key="i-conn" className="h-3.5 w-3.5" />],
                          ["vec",    tMesh("toolbar.modes.vec"),    <Edit3 key="i-vec" className="h-3.5 w-3.5" />],
                        ] as [ToolMode, string, React.ReactNode][]).map(([modeKey, label, icon]) => (
                          <button
                            key={modeKey}
                            type="button"
                            onClick={() => {
                              setToolMode(modeKey);
                              if (modeKey !== "conn") setConnSrcId(null);
                              setToolbarPanel(null);
                            }}
                            className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] transition-colors ${toolMode === modeKey ? "bg-cyan-400/20 text-cyan-100" : "bg-slate-900/80 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-100"}`}
                          >
                            {icon}
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "conn" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Conectores</p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {([
                          ["technical", "Technical", "─",   "#22d3ee"],
                          ["dashed",    "Dashed",    "- -", "#7dd3fc"],
                          ["handdrawn", "Hand",      "∿",   "#c4b5fd"],
                          ["bezier",    "Bezier",    "⌒",   "#6ee7b7"],
                          ["curved",    "Curved",    "◡",   "#fbbf24"],
                        ] as [ConnStyle, string, string, string][]).map(([presetKey, label, glyph, color]) => (
                          <button
                            key={presetKey}
                            type="button"
                            onClick={() => {
                              setConnPreset(presetKey);
                              setToolMode("conn");
                            }}
                            className={`h-12 rounded-lg border flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${connPreset === presetKey ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-100" : "border-white/10 bg-slate-900/80 text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"}`}
                          >
                            <span className="text-base leading-none" style={{ color: connPreset === presetKey ? "#fff" : color }}>{glyph}</span>
                            <span className="text-[9px]">{label}</span>
                          </button>
                        ))}
                      </div>
                      {connPreset === "bezier" && (
                        <p className="mt-2 text-[9px] text-slate-400">Selecciona la conexión y activa modo Vec para editar los puntos de control.</p>
                      )}
                    </div>
                  )}

                  {toolbarPanel === "basics" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Básicos</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {BASIC_BRICKS.map((entry, i) => (
                          <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                            onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                            onClick={() => { addMeta(entry); setToolbarPanel(null); }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "content" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Contenido</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CONTENT_BRICKS.map((entry, i) => (
                          <TBItem key={i} icon={entry.icon} label={entry.label} draggable
                            onDragStart={(e) => onToolDragStart(e, { type: "meta", entry })}
                            onClick={() => { addMeta(entry); setToolbarPanel(null); }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "shapes" && (
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Formas</p>
                      <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
                        {SHAPE_CATEGORIES.map((cat) => (
                          <div key={cat.label}>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-cyan-200/60">
                              {cat.icon}<span>{cat.label}</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {cat.shapes.map(({ preset, label }) => (
                                <button key={preset} type="button" title={label} draggable
                                  onClick={() => { addShape(preset); setToolbarPanel(null); }}
                                  onDragStart={(e) => onToolDragStart(e, { type: "shape", preset })}
                                  className="flex flex-col items-center gap-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground">
                                  <div className="relative h-[18px] w-[32px]">
                                    <ShapeSvg preset={preset} w={32} h={18} stroke="currentColor" fill="none" sw={1.5} />
                                  </div>
                                  <span className="max-w-[40px] truncate text-[7px] leading-none">{label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        {/* Charts — insert a data-driven chart metabrick (editable Mermaid source). */}
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-cyan-200/60">
                            <BarChart2 className="h-3 w-3" /><span>{tMesh("charts.groupLabel")}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            {CHART_PALETTE.map(({ key, labelKey }) => { const label = tMesh(`charts.types.${labelKey}` as any); return (
                              <button key={key} type="button" title={label} draggable
                                onClick={() => { addChart(key); setToolbarPanel(null); }}
                                onDragStart={(e) => onToolDragStart(e, { type: "chart", key })}
                                className="flex flex-col items-center gap-0.5 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground">
                                <div className="relative h-[26px] w-[40px] overflow-hidden rounded border border-white/10 bg-slate-900/60 [&_text]:hidden">
                                  <ChartBrickRender chart={defaultChartSpec(key)} w={360} h={300} className="h-full w-full" />
                                </div>
                                <span className="max-w-[44px] truncate text-[7px] leading-none">{label}</span>
                              </button>
                            ); })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "style" && (() => {
                    // Connection selected → edit its line style (color/width/pattern/type/bidir).
                    if (selectedConnId && state.connectionsById[selectedConnId]) {
                      const conn = state.connectionsById[selectedConnId];
                      const cs = asRec(conn.style);
                      const cStroke = typeof cs.stroke === "string" ? cs.stroke : "#22d3ee";
                      const cW = typeof cs.width === "number" ? cs.width : 2;
                      const cPattern = cs.pattern === "dashed" ? "dashed" : cs.pattern === "dotted" ? "dotted" : "solid";
                      const cType = typeof cs.connType === "string" ? cs.connType : "technical";
                      const cBidir = cs.bidir === true;
                      const patchConn = (patch: Record<string, unknown>) => setState((cur) => {
                        const c = cur.connectionsById[selectedConnId]; if (!c) return cur;
                        return { ...cur, connectionsById: { ...cur.connectionsById, [selectedConnId]: { ...c, style: { ...asRec(c.style), ...patch } } } };
                      });
                      const seg = (active: boolean) => `flex-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${active ? "bg-cyan-500/30 text-cyan-100 border border-cyan-400/40" : "bg-slate-800 text-slate-300 border border-white/10 hover:bg-slate-700"}`;
                      return (
                        <div className="space-y-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">{tMesh("connStyle.title")}</p>
                          <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-300">
                            <label className="flex flex-col gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-slate-400">{tMesh("connStyle.color")}</span>
                              <div className="flex items-center gap-1.5">
                                <input type="color" value={cStroke.startsWith("#") ? cStroke : "#22d3ee"} onChange={(e) => patchConn({ stroke: e.target.value })} className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                                <input type="text" value={cStroke} onChange={(e) => patchConn({ stroke: e.target.value })} className="h-7 w-full rounded border border-white/10 bg-slate-800 px-1.5 text-[9px] font-mono text-slate-200 outline-none focus:border-cyan-500/50" />
                              </div>
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-slate-400">{tMesh("connStyle.width")}</span>
                              <input type="number" min={1} max={10} step={0.5} value={cW} onChange={(e) => patchConn({ width: Number(e.target.value) })} className="h-7 w-full rounded border border-white/10 bg-slate-800 px-1.5 text-[9px] font-mono text-slate-200 outline-none focus:border-cyan-500/50" />
                            </label>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">{tMesh("connStyle.pattern")}</span>
                            <div className="flex gap-1">
                              {(["solid", "dashed", "dotted"] as const).map((p) => (
                                <button key={p} onClick={() => patchConn({ pattern: p })} className={seg(cPattern === p)}>{tMesh(`connStyle.${p}`)}</button>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">{tMesh("connStyle.type")}</span>
                            <div className="flex gap-1">
                              {(["technical", "curved", "bezier", "handdrawn"] as const).map((ct) => (
                                <button key={ct} onClick={() => patchConn({ connType: ct })} className={seg(cType === ct)}>{tMesh(`connStyle.${ct}`)}</button>
                              ))}
                            </div>
                          </div>
                          <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-[10px]">{tMesh("connStyle.bidir")}</span>
                            <input type="checkbox" checked={cBidir} onChange={() => patchConn({ bidir: !cBidir })} className="accent-cyan-400" />
                          </label>
                        </div>
                      );
                    }
                    const sb = selectedId ? state.bricksById[selectedId] : null;
                    const isStyleable = sb && (sb.kind === "board_empty" || sb.kind === "draw" || sb.kind === "frame");
                    if (!isStyleable || !sb) return (
                      <div className="text-[10px] text-slate-400">{tMesh("connStyle.selectHint")}</div>
                    );
                    const sbStyle = asRec(asRec(sb.content).style);
                    const curStroke = typeof sbStyle.stroke === "string" ? sbStyle.stroke : (sb.kind === "board_empty" ? "rgba(34,211,238,0.6)" : "#22d3ee");
                    const curFill   = typeof sbStyle.fill   === "string" ? sbStyle.fill   : (sb.kind === "board_empty" ? "" : "rgba(34,211,238,0.08)");
                    const curSW     = typeof sbStyle.strokeWidth === "number" ? sbStyle.strokeWidth : 2;
                    const patchStyle = (patch: Record<string, unknown>) => {
                      setState((cur) => {
                        const b = cur.bricksById[selectedId!];
                        if (!b) return cur;
                        const newContent = { ...asRec(b.content), style: { ...asRec(asRec(b.content).style), ...patch } };
                        return { ...cur, bricksById: { ...cur.bricksById, [selectedId!]: { ...b, content: newContent } } };
                      });
                    };
                    const sbContent = asRec(sb.content);
                    const sbChart: ChartSpec | null = sbContent.chart && typeof (sbContent.chart as any).type === "string" ? (sbContent.chart as ChartSpec) : null;
                    const setChart = (next: ChartSpec) => {
                      setState((cur) => {
                        const b = cur.bricksById[selectedId!];
                        if (!b) return cur;
                        return { ...cur, bricksById: { ...cur.bricksById, [selectedId!]: { ...b, content: { ...asRec(b.content), chart: next } } } };
                      });
                    };
                    return (
                      <div className="space-y-3">
                        {sbChart && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">{tMesh("charts.panelLabel")} · {tMesh(`charts.types.${sbChart.type}` as any)}</p>
                              <select value={sbChart.type} onChange={(e) => setChart(defaultChartSpec(e.target.value as ChartType))}
                                className="h-6 rounded border border-white/10 bg-slate-800 px-1.5 text-[9px] text-slate-200 outline-none focus:border-cyan-500/50">
                                {CHART_PALETTE.map(({ key, labelKey }) => <option key={key} value={key}>{tMesh(`charts.types.${labelKey}` as any)}</option>)}
                              </select>
                            </div>
                            <ChartBrickEditor chart={sbChart} onChange={setChart} />
                          </div>
                        )}
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Estilo</p>
                        <div className="grid grid-cols-3 gap-3 text-[10px] text-slate-300">
                          <label className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">Borde</span>
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={curStroke.startsWith("#") ? curStroke : "#22d3ee"}
                                onChange={(e) => patchStyle({ stroke: e.target.value })}
                                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={curStroke}
                                onChange={(e) => patchStyle({ stroke: e.target.value })}
                                className="h-7 w-full rounded border border-white/10 bg-slate-800 px-1.5 text-[9px] font-mono text-slate-200 outline-none focus:border-cyan-500/50" />
                            </div>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">Fondo</span>
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={curFill.startsWith("#") ? curFill : "#000000"}
                                onChange={(e) => patchStyle({ fill: e.target.value })}
                                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                              <input type="text" value={curFill}
                                onChange={(e) => patchStyle({ fill: e.target.value })}
                                className="h-7 w-full rounded border border-white/10 bg-slate-800 px-1.5 text-[9px] font-mono text-slate-200 outline-none focus:border-cyan-500/50" />
                            </div>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-400">Grosor</span>
                            <input type="number" min={0.5} max={10} step={0.5} value={curSW}
                              onChange={(e) => patchStyle({ strokeWidth: Number(e.target.value) })}
                              className="h-7 w-full rounded border border-white/10 bg-slate-800 px-1.5 text-[9px] font-mono text-slate-200 outline-none focus:border-cyan-500/50" />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[["transparent","Transparente"],["rgba(34,211,238,0.08)","Cyan sutil"],["rgba(99,102,241,0.15)","Violeta"],["rgba(234,179,8,0.15)","Ambar"],["rgba(239,68,68,0.15)","Rojo"],["rgba(34,197,94,0.15)","Verde"],["#1e293b","Azul oscuro"],["#0f172a","Negro"]]
                            .map(([v, n]) => (
                              <button key={v} title={n} onClick={() => patchStyle({ fill: v })}
                                className="h-5 w-5 rounded border border-white/20 transition-transform hover:scale-110"
                                style={{ background: v === "transparent" ? "repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 0 0 / 8px 8px" : v }} />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[["#22d3ee","Cyan"],["#818cf8","Indigo"],["#fb7185","Rosa"],["#4ade80","Verde"],["#fbbf24","Ambar"],["#f472b6","Fucsia"],["#94a3b8","Gris"],["#ffffff","Blanco"]]
                            .map(([v, n]) => (
                              <button key={v} title={`Borde: ${n}`} onClick={() => patchStyle({ stroke: v })}
                                className="h-5 w-5 rounded border-2 transition-transform hover:scale-110"
                                style={{ borderColor: v, background: "transparent" }} />
                            ))}
                        </div>
                        {(() => {
                          const curStrokeStyle = typeof sbStyle.strokeStyle === "string" ? sbStyle.strokeStyle : "solid";
                          const curEdges = sbStyle.edges === "sharp" ? "sharp" : "round";
                          const curOpacity = typeof sbStyle.opacity === "number" ? sbStyle.opacity : 1;
                          const segBtn = (active: boolean) =>
                            `flex-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${active ? "bg-cyan-500/30 text-cyan-100 border border-cyan-400/40" : "bg-slate-800 text-slate-300 border border-white/10 hover:bg-slate-700"}`;
                          return (
                            <>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">Trazo</span>
                                <div className="flex gap-1">
                                  {(["solid","dashed","dotted"] as const).map((s) => (
                                    <button key={s} onClick={() => patchStyle({ strokeStyle: s })} className={segBtn(curStrokeStyle === s)}>
                                      {s === "solid" ? "Sólido" : s === "dashed" ? "Guiones" : "Puntos"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">Esquinas</span>
                                <div className="flex gap-1">
                                  {(["round","sharp"] as const).map((s) => (
                                    <button key={s} onClick={() => patchStyle({ edges: s })} className={segBtn(curEdges === s)}>
                                      {s === "round" ? "Redondas" : "Rectas"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] uppercase tracking-wider text-slate-400">Opacidad · {Math.round(curOpacity * 100)}%</span>
                                <input type="range" min={0} max={100} step={5} value={Math.round(curOpacity * 100)}
                                  onChange={(e) => patchStyle({ opacity: Number(e.target.value) / 100 })}
                                  className="w-full accent-cyan-400" />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {toolbarPanel === "templates" && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">{tMesh("templates.title")}</p>
                        <button type="button" onClick={saveSelectionAsTemplate}
                          className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-1 text-[9px] font-medium text-cyan-100 hover:bg-cyan-500/25">
                          {tMesh("templates.saveSelection")}
                        </button>
                      </div>

                      {/* Category filter chips */}
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => setTplCategory("all")}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors ${tplCategory === "all" ? "border border-cyan-400/40 bg-cyan-500/25 text-cyan-100" : "border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"}`}>
                          {tMesh("templates.all")}
                        </button>
                        {TEMPLATE_CATEGORIES.map((cat) => (
                          <button key={cat.id} type="button" onClick={() => setTplCategory(cat.id)}
                            className={`rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors ${tplCategory === cat.id ? "border border-cyan-400/40 bg-cyan-500/25 text-cyan-100" : "border border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"}`}>
                            {tMesh(`templates.categories.${cat.id}`)}
                          </button>
                        ))}
                      </div>

                      {/* Gallery with previews */}
                      <div className="grid grid-cols-2 gap-2 pr-1 sm:grid-cols-3">
                        {TEMPLATE_CATALOG.filter((t) => tplCategory === "all" || t.category === tplCategory).map((t) => (
                          <button key={t.id} type="button" onClick={() => insertUserTemplate(t)}
                            className="group/tpl flex flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-900/70 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-slate-800 hover:shadow-[0_8px_20px_rgba(0,0,0,0.4)]">
                            <div className="relative aspect-[168/104] w-full overflow-hidden border-b border-white/5 bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.06),transparent_70%)]">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <MeshTemplateThumb tpl={t} />
                              </div>
                              <span className="absolute left-1 top-1 rounded px-1 py-px text-[7px] font-semibold uppercase tracking-wide"
                                style={{ color: t.accent, background: "rgba(2,6,23,0.55)" }}>
                                {tMesh(`templates.categories.${t.category}`)}
                              </span>
                            </div>
                            <span className="truncate px-1.5 py-1 text-[9.5px] font-medium text-slate-200 transition-colors group-hover/tpl:text-cyan-50">{t.name}</span>
                          </button>
                        ))}
                      </div>

                      {/* My templates */}
                      <div>
                        <p className="mb-1 text-[9px] uppercase tracking-wider text-slate-400">{tMesh("templates.mine")}</p>
                        {userTemplates.length === 0 ? (
                          <p className="text-[10px] text-slate-500">{tMesh("templates.empty")}</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 pr-1 sm:grid-cols-3">
                            {userTemplates.map((t) => (
                              <div key={t.id} className="group/u relative">
                                <button type="button" onClick={() => insertUserTemplate(t)}
                                  className="flex w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-900/70 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-slate-800">
                                  <div className="flex aspect-[168/104] w-full items-center justify-center overflow-hidden border-b border-white/5 bg-slate-950/40">
                                    <MeshTemplateThumb tpl={t} />
                                  </div>
                                  <span className="truncate px-1.5 py-1 text-[9.5px] text-slate-200">{t.name}</span>
                                </button>
                                <button type="button" title={tMesh("templates.delete")} onClick={() => deleteUserTemplate(t.id)}
                                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-slate-950/80 text-slate-400 hover:text-rose-300 group-hover/u:flex">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {toolbarPanel === "layers" && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">{tMesh("layers.title")}</p>
                      {!selectedId ? (
                        <p className="text-[10px] text-slate-400">{tMesh("layers.selectHint")}</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5">
                          <button type="button" title={tMesh("layers.toBack")} onClick={() => changeLayer("back")}
                            className="flex h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"><ChevronsDown className="h-4 w-4" /></button>
                          <button type="button" title={tMesh("layers.backward")} onClick={() => changeLayer("backward")}
                            className="flex h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"><ChevronDown className="h-4 w-4" /></button>
                          <button type="button" title={tMesh("layers.forward")} onClick={() => changeLayer("forward")}
                            className="flex h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"><ChevronUp className="h-4 w-4" /></button>
                          <button type="button" title={tMesh("layers.toFront")} onClick={() => changeLayer("front")}
                            className="flex h-9 items-center justify-center rounded-lg border border-white/10 bg-slate-800 text-slate-300 hover:border-cyan-300/40 hover:text-cyan-100"><ChevronsUp className="h-4 w-4" /></button>
                        </div>
                      )}
                    </div>
                  )}

                  {toolbarPanel === "status" && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 sm:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Bricks: <span className="font-semibold text-cyan-100">{Object.keys(state.bricksById).length}</span></div>
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Conns: <span className="font-semibold text-cyan-100">{Object.keys(state.connectionsById).length}</span></div>
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Modo: <span className="font-semibold text-cyan-100">{toolMode}</span></div>
                      <div className="rounded-lg border border-white/10 bg-slate-900/80 p-2">Sel: <span className="font-semibold text-cyan-100">{selectedIds.size || (selectedId ? 1 : 0)}</span></div>
                    </div>
                  )}
                </div>
              )}

              <div className={`flex max-w-full items-center gap-1 border px-2 shadow-[0_18px_36px_rgba(0,0,0,0.5)] backdrop-blur-md ${mobileMode ? "rounded-3xl border-cyan-200/35 bg-slate-950/70 py-2" : "rounded-2xl border-cyan-300/20 bg-slate-950/88 py-1"}`}>
                <button type="button" title="Select (S)" aria-label="Select (S)" onClick={() => { setToolMode("select"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "select")}><MousePointer className="h-4 w-4" /></button>
                <button type="button" title="Pan (H)" aria-label="Pan (H)" onClick={() => { setToolMode("pan"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "pan")}><Hand className="h-4 w-4" /></button>
                <button type="button" title="Pen (P)" aria-label="Pen (P)" onClick={() => { setToolMode("pen"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "pen")}><Pencil className="h-4 w-4" /></button>
                <button type="button" title="Conectores" aria-label="Conectores" onClick={() => setToolbarPanel((current) => current === "conn" ? null : "conn")} className={dockBtnClass(toolMode === "conn" || toolbarPanel === "conn")}><Link2 className="h-4 w-4" /></button>
                <button type="button" title="Vector" aria-label="Vector" onClick={() => { setToolMode("vec"); setConnSrcId(null); }} className={dockBtnClass(toolMode === "vec")}><Edit3 className="h-4 w-4" /></button>

                <div className="mx-1 h-6 w-px bg-white/10" />

                {/* The dock already exposes all cursor modes directly above, so the
                    "Modos" popover is only needed on the cramped mobile dock. */}
                {mobileMode && (
                  <button type="button" title="Modos" aria-label="Modos" onClick={() => setToolbarPanel((current) => current === "mode" ? null : "mode")} className={dockBtnClass(toolbarPanel === "mode")}><Wand2 className="h-4 w-4" /></button>
                )}
                <button type="button" title="Básicos" aria-label="Básicos" onClick={() => setToolbarPanel((current) => current === "basics" ? null : "basics")} className={dockBtnClass(toolbarPanel === "basics")}><LayoutGrid className="h-4 w-4" /></button>
                <button type="button" title="Contenido" aria-label="Contenido" onClick={() => setToolbarPanel((current) => current === "content" ? null : "content")} className={dockBtnClass(toolbarPanel === "content")}><FileText className="h-4 w-4" /></button>
                <button type="button" title="Formas" aria-label="Formas" onClick={() => setToolbarPanel((current) => current === "shapes" ? null : "shapes")} className={dockBtnClass(toolbarPanel === "shapes")}><Square className="h-4 w-4" /></button>
                <button type="button" title="Texto a diagrama (IA)" aria-label="Texto a diagrama (IA)" onClick={() => setIsTextToDiagramOpen((v) => !v)} className={dockBtnClass(isTextToDiagramOpen)}><Sparkles className="h-4 w-4" /></button>
                <button type="button" title="Plantillas" aria-label="Plantillas" onClick={() => setToolbarPanel((current) => current === "templates" ? null : "templates")} className={dockBtnClass(toolbarPanel === "templates")}><LayoutTemplate className="h-4 w-4" /></button>
                {selectedId && (() => {
                  const sb = state.bricksById[selectedId];
                  return sb && (sb.kind === "board_empty" || sb.kind === "draw" || sb.kind === "frame") ? (
                    <button type="button" title="Estilo" aria-label="Estilo" onClick={() => setToolbarPanel((current) => current === "style" ? null : "style")} className={dockBtnClass(toolbarPanel === "style")}><Palette className="h-4 w-4" /></button>
                  ) : null;
                })()}
                {selectedId && (
                  <button type="button" title="Capas" aria-label="Capas" onClick={() => setToolbarPanel((current) => current === "layers" ? null : "layers")} className={dockBtnClass(toolbarPanel === "layers")}><Layers className="h-4 w-4" /></button>
                )}
                <button type="button" title="Más" aria-label="Más" onClick={() => setToolbarPanel((current) => current === "status" ? null : "status")} className={dockBtnClass(toolbarPanel === "status")}><MoreHorizontal className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!mobileMode && (
      <>
      {/* ── Footer ── */}
      <div className="flex shrink-0 items-center gap-4 border-t border-border bg-card/40 px-4 py-1 text-[10px] text-muted-foreground">
        <span>{tMesh("footer.bricks")}: {Object.keys(state.bricksById).length}</span>
        <span>{tMesh("footer.conns")}: {Object.keys(state.connectionsById).length}</span>
        {updatedAt && <span>{tMesh("footer.saved")}: {new Date(updatedAt).toLocaleTimeString()}</span>}
        {toolMode === "vec"  && <span className="text-yellow-400">● Vec edit</span>}
        {toolMode === "conn" && <span className="text-cyan-400">● {connSrcId ? tMesh("footer.connecting") : "Conn"}</span>}
        {toolMode === "pen"  && <span className="text-purple-400">● Pen{recognizing ? " (reconociendo…)" : ""}</span>}
        {selectedIds.size > 1 && <span className="text-white/50">● {selectedIds.size} sel.</span>}
        {(selectedId || selectedConnId || selectedIds.size > 0) && <span className="ml-auto opacity-40">Del = eliminar</span>}
      </div>
      </>
      )}

      {/* BoardChatDrawer — inside the mesh container so absolute positioning is bounded here */}
      <BoardChatDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        boardId={localMode ? localFile : meshId}
        initialTab={sidebarTab}
        entityType="mesh"
        localMode={localMode}
        online={online}
      />
    </div>

    {/* ── Share modal ──────────────────────────────────────────────────────────────── */}
    <MeshShareModal
      isOpen={isShareModalOpen}
      onClose={() => setIsShareModalOpen(false)}
      meshId={meshId ?? ""}
      meshName={`Mesh ${(meshId ?? "").slice(0, 8)}`}
      accessToken={accessToken ?? ""}
    />

    <PublishLocalModal
      isOpen={isPublishOpen}
      onClose={() => setIsPublishOpen(false)}
      kind="mesh"
      online={online}
      canPublish={!!accessToken && !!activeTeamId}
      publish={async () => publishLocalMesh(
        serializeMeshToKm(state, { meshId: localFile, title: meshBoardName }),
        { teamId: activeTeamId as string, accessToken: accessToken as string },
        { readAsset: async (n) => { const dir = localWs.getDir(); if (!dir) return null; try { return await readAssetFile(dir, n); } catch { return null; } } },
      )}
    />

    {/* ── Board settings modal ─────────────────────────────────────────────────────── */}
    <BoardSettingsModal
      isOpen={isBoardSettingsOpen}
      onClose={() => setIsBoardSettingsOpen(false)}
      boardName={meshBoardName}
      boardDescription={meshBoardDescription}
      boardAppearance={meshAppearance as any}
      canManageBoard={true}
      canEdit={true}
      onSaveGeneral={async ({ name, description }) => {
        if (!meshId || !accessToken) return;
        await updateBoardDetails(meshId, { name, description }, accessToken);
        setMeshBoardName(name);
        setMeshBoardDescription(description);
        toast("Board updated", "success");
      }}
      onSaveAppearance={async (payload) => {
        if (!meshId || !accessToken) return;
        await updateBoardAppearance(meshId, payload as any, accessToken);
        setMeshAppearance(prev => ({ ...prev, ...payload }));
        toast("Appearance saved", "success");
      }}
      onOpenShare={() => { setIsBoardSettingsOpen(false); setIsShareModalOpen(true); }}
      onOpenDelete={async () => {
        if (typeof window !== "undefined" && !window.confirm(tMesh("confirmDelete.description") || "Eliminar este meshboard? Esta acción es permanente.")) return;
        try {
          if (localMode) {
            // The `.foo.km.h` activity sidecar is a separate file → preserved by
            // removeFile (which only deletes the named entity). Log the deletion
            // so history survives.
            const dir = localWs.getDir();
            if (dir) {
              try { await logLocalActivity(dir, localFile, { action: "mesh.deleted", actorId: user?.id ?? "local", scope: "mesh", scopeId: localFile }); } catch { /* noop */ }
            }
            await localWs.removeFile(localFile);
          } else if (meshId && accessToken) {
            await deleteBoard(meshId, accessToken);
          } else {
            return;
          }
          setIsBoardSettingsOpen(false);
          toast(tMesh("feedback.deleted") || "Eliminado", "success");
          router.push("/m");
        } catch (e) {
          toast((e as Error)?.message || "Error al eliminar", "error");
        }
      }}
    />

    {/* ── Entity selector modal (portal / mirror double-click) ──────────────────────── */}
    {portalPreview && (
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPortalPreview(null); }}>
        <div className="flex h-[85vh] w-[95vw] max-w-[1300px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium text-foreground">{portalPreview.title || "Portal preview"}</p>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent/20 hover:text-foreground" onClick={() => setPortalPreview(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <iframe src={portalPreview.url} title="portal-preview-iframe" className="h-full w-full" />
        </div>
      </div>
    )}

    {activeTeamId && accessToken && (
      <EntitySelectorModal
        isOpen={selectorModalBrickId !== null}
        onClose={() => setSelectorModalBrickId(null)}
        teamId={activeTeamId}
        accessToken={accessToken}
        selectionMode={selectorModalBrickKind === "portal" ? "portal" : "mirror"}
        allowedTypes={selectorModalBrickKind === "portal" ? ["mesh", "board", "document"] : ["mesh", "board", "document"]}
        onSelect={(result: EntitySelectorResult) => {
          if (!selectorModalBrickId) return;
          if (selectorModalBrickKind === "portal" && result.type === "mesh" && result.id === meshId) {
            toast(tMesh("errors.portalSelf"), "error");
            return;
          }
          void (async () => {
            let portalArtifact: { markdown: string; kind: string; subtitle: string; title: string } | null = null;
            if (selectorModalBrickKind === "portal") {
              portalArtifact = await loadPortalArtifact(result.type, result.id, result.label);
            }
            setState((cur) => {
              const b = cur.bricksById[selectorModalBrickId];
              if (!b) return cur;
              let updated: MeshBrick;
              if (selectorModalBrickKind === "portal") {
                updated = { ...b, content: { ...asRec(b.content),
                  targetId: result.id,
                  targetType: result.type,
                  targetLabel: result.label,
                  portalRenderMode: "artifact",
                  previewMarkdown: portalArtifact?.markdown ?? "",
                  previewKind: portalArtifact?.kind ?? "text",
                  previewSubtitle: portalArtifact?.subtitle ?? "",
                  previewTitle: portalArtifact?.title ?? result.label,
                  previewImageDataUrl: "",
                  previewImageSource: "",
                  previewImageCapturedAt: "",
                } };
              } else {
                updated = { ...b, content: { ...asRec(b.content),
                  sourceId: result.id,
                  sourceLabel: result.label + (result.context ? ` (${result.context})` : ""),
                  sourceType: result.sourceScopeType ?? result.type,
                  sourceScopeId: result.sourceScopeId,
                  sourceCardId: result.sourceCardId,
                  sourceListId: result.sourceListId,
                  sourcePath: result.context,
                  sourceBrickKind: result.brickKind,
                  previewMarkdown: result.previewMarkdown,
                  previewContent: result.previewContent,
                } };
              }

              return { ...cur, bricksById: { ...cur.bricksById, [selectorModalBrickId]: updated } };
            });
            setSelectorModalBrickId(null);
          })();
        }}
      />
    )}
    </>
  );
}
