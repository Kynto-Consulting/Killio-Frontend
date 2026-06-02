"use client";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useState, useEffect, useRef } from "react";
import { X, UploadCloud, FileAudio, Bot, Sparkles, Send, Loader2, Edit3, CheckSquare, Wrench, Volume2, VolumeX, ChevronRight, ChevronDown } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, getBoard, ListView, createCard, createCardBrick, generateCardsWithAi, generateDocumentsWithAi, generateBoardsWithAi, createBoard, createList, chatWithAiScope, listTeams } from "@/lib/api/contracts";
import { streamAgentChat, AgentStreamEvent, AgentToolManifestEntry, getAgentToolsManifest, scanAgentWorkspace, deleteAgentWorkspace, AgentVfsFile, AgentVfsFolderMeta } from "@/lib/api/agent";
import { generateWorkspaceSlug } from "@/lib/agent-workspace-slug";
import { importKillioFile } from "@/lib/killio-import-actions";
import { uploadFile } from "@/lib/api/uploads";
import { AssistantMessage } from "@/components/agent/AgentChatPanel";
import type { AgentMessage, ToolEvent } from "@/hooks/use-agent-chat";
import { FileText as FileTextIcon, Layout as LayoutIcon, Network as NetworkIcon, Workflow as WorkflowIcon, Folder as FolderIcon, Check as CheckIcon, X as XIcon, Loader2 as Loader2Icon } from "lucide-react";
import { CardDetailModal } from "./card-detail-modal";
import { listDocuments, DocumentSummary, createDocument, createDocumentBrick } from "@/lib/api/documents";
import { UnifiedBrickList } from "../bricks/unified-brick-list";
import { listTeamMembers } from "@/lib/api/contracts";
import { Plus, Layout, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { ReferenceTokenInput } from "./reference-token-input";
import { createScript, saveScriptGraph } from "@/lib/api/scripts";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
//comentario para forzar deploy
interface GeneratedCard {
  id: string;
  title: string;
  bricks: Array<{ kind: 'text' | 'checklist', content: any }>;
  suggestedBoard?: string;
  suggestedList?: string;
  isSelected: boolean;
  customBoardId?: string;
  customListId?: string;
  availableLists?: ListView[];
}

interface ToastMessage {
  id: string;
  variant: "success" | "error" | "info";
  text: string;
}

type ExtractSourceKind = "pdf" | "audio" | "image" | "excel" | "docx" | "pptx" | "killio" | "text";
type GenerationType = 'cards' | 'documents' | 'boards' | 'scripts' | 'agents';
// Backend tool names are dynamic. Frontend keeps them as plain strings —
// the manifest fetched at panel open defines the universe.
type AgentToolId = string;

// Default-deny categories. These tools have side effects the user almost
// always wants to opt into explicitly, so we start with them OFF even
// though the rest of the manifest is ON.
const DEFAULT_OFF_CATEGORIES = new Set(["web", "os", "git"]);

// Files Killio reads natively as text on the client (kaml-based formats).
const KILLIO_EXTS = /\.(kd|km|kb|ks|kaml|kts)$/i;
// Plain-text formats we read in-browser without round-tripping to backend.
const PLAINTEXT_EXTS = /\.(md|txt|csv|json|ya?ml|xml|html?|tsv|log|sql|tex|rtf|kd|km|kb|ks|kaml|kts)$/i;

interface GeneratedScriptDraft {
  id: string;
  name: string;
  description?: string;
  nodes: Array<{ id: string; kind: string; label?: string; config?: Record<string, any> }>;
  connections: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
  isSelected: boolean;
}

interface GeneratedAgentDraft {
  id: string;
  name: string;
  description: string;
  reasoning: string;
  response: string;
  selectedTools: AgentToolId[];
  isSelected: boolean;
}

// Legacy hardcoded option list removed — tool universe now comes from
// /agent/tools/manifest (see toolManifest state). Each entry maps 1-to-1
// with a real backend tool name; toggling here flows into the request as
// enabledToolIds, which the backend hard-filters before invoking the LLM.

// Split a streamed agent message into a clean "plan/reasoning" string and a
// clean "answer" string. The model interleaves <plan>, <pre_think>, <think>,
// <invoke>, <tool_status>, <tool_output> XML into the text; we surface the
// plan/think content in the Plan card and strip ALL machine tags from the
// visible final answer so the user never sees raw XML.
function splitAgentStream(raw: string): { plan: string; answer: string } {
  if (!raw) return { plan: "", answer: "" };
  const planParts: string[] = [];

  // <plan> ... </plan>  (preferred explicit plan)
  for (const m of raw.matchAll(/<plan\b[^>]*>([\s\S]*?)<\/plan>/gi)) {
    const steps = Array.from(m[1].matchAll(/<step\b[^>]*>([\s\S]*?)<\/step>/gi)).map((s) => s[1].trim());
    planParts.push(steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : m[1].trim());
  }
  // <pre_think> ... </pre_think>  → prefer the <strategy> sub-block
  for (const m of raw.matchAll(/<pre_think\b[^>]*>([\s\S]*?)<\/pre_think>/gi)) {
    const strat = m[1].match(/<strategy>([\s\S]*?)<\/strategy>/i);
    planParts.push((strat ? strat[1] : m[1]).replace(/<\/?[a-z_]+>/gi, "").trim());
  }
  // standalone <think> blocks
  for (const m of raw.matchAll(/<think\b[^>]*>([\s\S]*?)<\/think>/gi)) {
    const inner = m[1].trim();
    if (inner) planParts.push(inner);
  }

  let answer = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<plan\b[^>]*>[\s\S]*?<\/plan>/gi, "")
    .replace(/<pre_think\b[^>]*>[\s\S]*?<\/pre_think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<batch_invoke\b[^>]*>[\s\S]*?<\/batch_invoke>/gi, "")
    .replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "")
    .replace(/<tool_status\b[^>]*\/?>/gi, "")
    .replace(/<tool_output\b[^>]*>[\s\S]*?<\/tool_output>/gi, "")
    // malformed leaks like "<think<pre_think>" or unterminated trailing opens
    .replace(/<think<pre_think>/gi, "")
    .replace(/<\/?(plan|step|pre_think|think|invoke|parameters|batch_invoke|visual_description|assumptions|risks|strategy)\b[^>]*>/gi, "")
    .replace(/<(invoke|think|pre_think|batch_invoke|plan)\b[^>]*$/i, "") // unclosed trailing open tag while streaming
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { plan: planParts.join("\n\n").trim(), answer };
}

const extractJsonObject = (rawText: string): any | null => {
  if (!rawText) return null;
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const VALID_DATABASE_OPERATIONS = new Set(['query', 'insert', 'upsert', 'update', 'delete', 'count']);

const inferDatabaseOperation = (hint: unknown): string => {
  const normalized = String(hint || '').trim().toLowerCase();
  if (VALID_DATABASE_OPERATIONS.has(normalized)) return normalized;
  if (normalized.includes('insert') || normalized.includes('crear') || normalized.includes('agregar')) return 'insert';
  if (normalized.includes('upsert')) return 'upsert';
  if (normalized.includes('update') || normalized.includes('actualizar')) return 'update';
  if (normalized.includes('delete') || normalized.includes('eliminar') || normalized.includes('borrar')) return 'delete';
  if (normalized.includes('count') || normalized.includes('contar')) return 'count';
  return 'query';
};

type NormalizedDraftNode = {
  id: string;
  kind: string;
  label?: string;
  config: Record<string, any>;
};

type NormalizedDraftConnection = {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

const normalizeGeneratedScriptDraft = (script: any, index: number): GeneratedScriptDraft => {
  const rawNodes =
    (Array.isArray(script?.nodes) ? script.nodes : null)
    || (Array.isArray(script?.graph?.nodes) ? script.graph.nodes : null)
    || [];

  const usedNodeIds = new Set<string>();
  const makeUniqueId = (raw: unknown, fallback: string): string => {
    const base = String(raw || '').trim() || fallback;
    let candidate = base;
    let cursor = 2;
    while (usedNodeIds.has(candidate)) {
      candidate = `${base}-${cursor}`;
      cursor += 1;
    }
    usedNodeIds.add(candidate);
    return candidate;
  };

  const normalizedNodes: NormalizedDraftNode[] = rawNodes.map((rawNode: any, nodeIndex: number) => {
    const nodeLike = rawNode && typeof rawNode === 'object' ? rawNode : {};
    let kind = String(nodeLike.kind || nodeLike.nodeKind || nodeLike.type || '').trim() || 'core.transform.json_map';
    let config =
      nodeLike.config && typeof nodeLike.config === 'object' && !Array.isArray(nodeLike.config)
        ? { ...nodeLike.config }
        : {};

    if (kind === 'killio.database.action') {
      const operation = inferDatabaseOperation(config.operation || nodeLike.operation || nodeLike.label || nodeLike.name);
      if (!config.operation) config.operation = operation;
      if (!config.sourceBrickId && nodeLike.sourceBrickId) {
        config.sourceBrickId = String(nodeLike.sourceBrickId);
      }
      if (!config.sourceBrickId) {
        kind = 'killio.database.list';
        config = { source: 'all' };
      }
    }

    return {
      id: makeUniqueId(nodeLike.id || nodeLike.nodeId, `node-${nodeIndex + 1}`),
      kind,
      label: typeof nodeLike.label === 'string' ? nodeLike.label : undefined,
      config,
    };
  });

  if (normalizedNodes.length === 0) {
    normalizedNodes.push({ id: makeUniqueId('trigger-1', 'trigger-1'), kind: 'core.trigger.manual', label: 'Manual Trigger', config: {} });
  }

  const hasTrigger = normalizedNodes.some(
    (node: NormalizedDraftNode) =>
      node.kind === 'core.trigger.manual' || node.kind === 'core.trigger.webhook' || node.kind === 'github.trigger.commit',
  );

  if (!hasTrigger) {
    normalizedNodes.unshift({
      id: makeUniqueId('trigger-1', 'trigger-1'),
      kind: 'core.trigger.manual',
      label: 'Manual Trigger',
      config: {},
    });
  }

  const nodeIdSet = new Set(normalizedNodes.map((node: NormalizedDraftNode) => node.id));
  const rawConnections =
    (Array.isArray(script?.connections) ? script.connections : null)
    || (Array.isArray(script?.edges) ? script.edges : null)
    || (Array.isArray(script?.graph?.edges) ? script.graph.edges : null)
    || [];

  let normalizedConnections: NormalizedDraftConnection[] = rawConnections
    .map((rawEdge: any) => {
      const edgeLike = rawEdge && typeof rawEdge === 'object' ? rawEdge : {};
      const source = String(edgeLike.source ?? edgeLike.sourceNodeId ?? edgeLike.from ?? '').trim();
      const target = String(edgeLike.target ?? edgeLike.targetNodeId ?? edgeLike.to ?? '').trim();
      if (!source || !target) return null;
      return {
        source,
        target,
        sourceHandle: typeof edgeLike.sourceHandle === 'string' ? edgeLike.sourceHandle : undefined,
        targetHandle: typeof edgeLike.targetHandle === 'string' ? edgeLike.targetHandle : undefined,
      };
    })
    .filter((edge: NormalizedDraftConnection | null): edge is NormalizedDraftConnection => Boolean(edge))
    .filter(
      (edge: NormalizedDraftConnection) =>
        nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target) && edge.source !== edge.target,
    );

  if (normalizedConnections.length === 0 && normalizedNodes.length > 1) {
    normalizedConnections = normalizedNodes.slice(0, -1).map((node: NormalizedDraftNode, nodeIndex: number) => ({
      source: node.id,
      target: normalizedNodes[nodeIndex + 1].id,
    }));
  }

  return {
    id: script?.id || `draft-script-${Date.now()}-${index}`,
    name: String(script?.name || `Script ${index + 1}`),
    description: script?.description || 'Script generado por AI Draft Studio',
    nodes: normalizedNodes,
    connections: normalizedConnections,
    isSelected: true,
  };
};

const inferSourceKind = (file: File): ExtractSourceKind => {
  const fileType = (file.type || "").toLowerCase();
  const fileName = (file.name || "").toLowerCase();

  if (KILLIO_EXTS.test(fileName)) return "killio";
  if (fileType === "application/pdf" || fileName.endsWith(".pdf")) return "pdf";
  if (fileType.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/.test(fileName)) return "audio";
  if (fileType.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp|tiff|svg|avif)$/.test(fileName)) return "image";
  if (
    fileType.includes("wordprocessingml") ||
    fileType.includes("msword") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".odt")
  ) {
    return "docx";
  }
  if (
    fileType.includes("presentationml") ||
    fileType.includes("powerpoint") ||
    fileName.endsWith(".pptx") ||
    fileName.endsWith(".ppt") ||
    fileName.endsWith(".odp")
  ) {
    return "pptx";
  }
  if (
    fileType.includes("spreadsheet") ||
    fileType.includes("excel") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv") ||
    fileName.endsWith(".ods") ||
    fileName.endsWith(".tsv")
  ) {
    return "excel";
  }
  return "text";
};

export function AiGenerationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useTranslations("common");
  const { accessToken, activeTeamId, user } = useSession();
  const { mode: workspaceMode, writeFile: writeLocalFile } = useLocalWorkspace();
  const isLocalMode = workspaceMode === "local";
  // Agentic mode in local mode (or before user picks a team) falls back to the
  // user's personal scope so the agent has somewhere to plan against.
  const agentScope: 'personal' | 'team' = (isLocalMode || !activeTeamId) ? 'personal' : 'team';
  const agentScopeId: string = agentScope === 'team' ? (activeTeamId as string) : ((user as any)?.id || 'personal');

  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileText, setFileText] = useState<string>("");
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("killio_ai_voice") === "1"; } catch { return false; }
  });
  // Single assistant message rendered with the shared AgentChatPanel renderer
  // (tool-call chips, asset attachments, plan/pre-think — same as the real
  // agent chat) instead of a hand-rolled plain-text trail.
  const [agentMsg, setAgentMsg] = useState<AgentMessage | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  // Files scanned out of the agent's scratch folder once the stream ends.
  // Each entry → one selectable preview card; the user can import all or a
  // subset, then we delete the scratch folder.
  const [draftFiles, setDraftFiles] = useState<AgentVfsFile[]>([]);
  const [draftFolderMeta, setDraftFolderMeta] = useState<Record<string, AgentVfsFolderMeta>>({});
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set());
  const [draftSlug, setDraftSlug] = useState<string | null>(null);
  // Team used as the VFS owner scope for the scratch folder. In local mode
  // activeTeamId is null, so we remember the fallback team here so scan +
  // delete keep working after the stream ends.
  const teamForScanRef = useRef<string | null>(null);
  const [draftStatusByPath, setDraftStatusByPath] = useState<Record<string, "idle" | "importing" | "done" | "error">>({});
  const [draftErrorByPath, setDraftErrorByPath] = useState<Record<string, string>>({});
  const [draftImporting, setDraftImporting] = useState(false);
  // Scratch folder is private + ephemeral: auto-purge 30 min after the run
  // ends, or when the user dismisses the preview. expiresAt drives a live
  // countdown shown next to the import actions.
  const [draftExpiresAt, setDraftExpiresAt] = useState<number | null>(null);
  const draftExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Tool universe — every backend tool, fetched once when the panel opens.
  const [toolManifest, setToolManifest] = useState<AgentToolManifestEntry[]>([]);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [agentToolFilter, setAgentToolFilter] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);

  const [generationType, setGenerationType] = useState<GenerationType>('cards');
  const [previewCards, setPreviewCards] = useState<GeneratedCard[]>([]);
  const [previewDocuments, setPreviewDocuments] = useState<any[]>([]);
  const [previewBoards, setPreviewBoards] = useState<any[]>([]);
  const [previewScripts, setPreviewScripts] = useState<GeneratedScriptDraft[]>([]);
  const [previewAgents, setPreviewAgents] = useState<GeneratedAgentDraft[]>([]);
  const [expandedScriptPreviewIds, setExpandedScriptPreviewIds] = useState<string[]>([]);
  const [showGenerationTypeMenu, setShowGenerationTypeMenu] = useState(false);
  // Default selection is built off the fetched manifest (every tool whose
  // category is NOT in DEFAULT_OFF_CATEGORIES). Empty until manifest loads.
  const [enabledAgentTools, setEnabledAgentTools] = useState<AgentToolId[]>([]);
  const generationMenuRef = useRef<HTMLDivElement | null>(null);

  // State for Global Dispatching Dropdowns
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [defaultBoardId, setDefaultBoardId] = useState<string>("");
  const [defaultLists, setDefaultLists] = useState<ListView[]>([]);
  const [defaultListId, setDefaultListId] = useState<string>("");

  // Draft review modal state
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  // Dispatch state
  const [isDispatchingSelected, setIsDispatchingSelected] = useState(false);

  // Global Toast replaced by useToast or direct import

  // Target Card Modal states
  const [activeCardDetails, setActiveCardDetails] = useState<{
    card: any;
    listId: string;
    listName: string;
    boardId: string;
    boardName: string;
  } | null>(null);
  const [createdCardsQueue, setCreatedCardsQueue] = useState<any[]>([]);
  const [createdCardsQueueIndex, setCreatedCardsQueueIndex] = useState<number | null>(null);

  const [teamDocs, setTeamDocs] = useState<DocumentSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && accessToken && activeTeamId) {
      Promise.all([
        listTeamBoards(activeTeamId, accessToken),
        listDocuments(activeTeamId, accessToken),
        listTeamMembers(activeTeamId, accessToken)
      ]).then(([boards, docs, members]) => {
        setBoards(boards);
        if (boards.length > 0) setDefaultBoardId(boards[0].id);
        setTeamDocs(docs);
        setTeamMembers(members);
      }).catch(console.error);
    }
  }, [isOpen, accessToken, activeTeamId]);

  // Fetch the real tool manifest the first time the panel opens. The
  // returned list IS the source of truth — backend hard-filters every
  // request against enabledToolIds, so what's not in this manifest cannot
  // be granted.
  useEffect(() => {
    if (!isOpen || !accessToken || toolsLoaded) return;
    getAgentToolsManifest(accessToken).then((manifest) => {
      setToolManifest(manifest);
      setToolsLoaded(true);
      // Restore saved selection or default-on every tool whose category
      // isn't in DEFAULT_OFF_CATEGORIES.
      let restored: string[] | null = null;
      try {
        const raw = window.localStorage.getItem("killio_ai_enabled_tools");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) restored = parsed.filter((x) => typeof x === "string");
        }
      } catch { /* noop */ }
      const requiredNames = manifest.filter((m) => m.required).map((m) => m.name);
      if (restored && restored.length) {
        const universe = new Set(manifest.map((m) => m.name));
        const merged = new Set(restored.filter((n) => universe.has(n)));
        for (const r of requiredNames) merged.add(r);
        setEnabledAgentTools(Array.from(merged));
      } else {
        const def = new Set(manifest.filter((m) => !DEFAULT_OFF_CATEGORIES.has(m.category)).map((m) => m.name));
        for (const r of requiredNames) def.add(r);
        setEnabledAgentTools(Array.from(def));
      }
    }).catch((err) => {
      console.error("getAgentToolsManifest failed", err);
      setToolsLoaded(true);
    });
  }, [isOpen, accessToken, toolsLoaded]);

  // Persist the user's selection so the same toggles come back on next open.
  useEffect(() => {
    if (!toolsLoaded) return;
    try { window.localStorage.setItem("killio_ai_enabled_tools", JSON.stringify(enabledAgentTools)); }
    catch { /* noop */ }
  }, [enabledAgentTools, toolsLoaded]);

  useEffect(() => {
    if (defaultBoardId && accessToken) {
      getBoard(defaultBoardId, accessToken)
        .then(data => {
          setDefaultLists(data.lists);
          if (data.lists.length > 0) {
            setDefaultListId(data.lists[0].id);
          } else {
            setDefaultListId("");
          }
        })
        .catch(console.error);
    }
  }, [defaultBoardId, accessToken]);

  useEffect(() => {
    setShowGenerationTypeMenu(false);
  }, [generationType]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (generationMenuRef.current && !generationMenuRef.current.contains(target)) {
        setShowGenerationTypeMenu(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  // Tick once a minute while a scratch folder is alive so the expiry
  // countdown stays fresh. Also clean up the purge timer on unmount.
  useEffect(() => {
    if (!draftExpiresAt) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, [draftExpiresAt]);
  useEffect(() => () => { if (draftExpiryTimerRef.current) clearTimeout(draftExpiryTimerRef.current); }, []);

  const draftExpiryMins = draftExpiresAt ? Math.max(0, Math.ceil((draftExpiresAt - nowTick) / 60000)) : 0;

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const extractSingleFile = async (file: File): Promise<string> => {
    const fileType = (file.type || "").toLowerCase();
    const fileName = file.name.toLowerCase();
    const sourceKind = inferSourceKind(file);

    // Killio + plain-text formats read directly in the browser (no round-trip).
    if (sourceKind === "killio" || PLAINTEXT_EXTS.test(fileName) || fileType.includes("text") || fileType.includes("json") || fileType.includes("csv")) {
      try { return await file.text(); }
      catch { return `(No se pudo leer ${file.name})`; }
    }

    // Binary / complex formats — round-trip to backend extractor.
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceKind", sourceKind);
    try {
      const extractRes = await fetch(`${API}/ai/extract`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}` },
        body: formData,
      });
      if (extractRes.ok) {
        const extractData: { text?: string; warnings?: string[] } = await extractRes.json();
        if (Array.isArray(extractData.warnings) && extractData.warnings.length > 0) {
          pushToast("info", extractData.warnings[0]);
        }
        return (extractData.text || "").trim() || `(No se pudo extraer texto util de ${file.name})`;
      }
      return `(No se pudo extraer ${file.name})`;
    } catch {
      return `(Error al extraer ${file.name})`;
    }
  };

  const speak = (text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text.slice(0, 800));
      const lang = (typeof navigator !== "undefined" ? (navigator.language || "es-ES") : "es-ES");
      utter.lang = lang.startsWith("es") ? "es-ES" : lang;
      utter.rate = 1.05;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch { /* noop */ }
  };

  // Delete the scratch folder server-side and clear all draft preview state.
  // Called on: explicit dismiss (X), 30-min expiry, or after import-all.
  const discardDraftWorkspace = async () => {
    if (draftExpiryTimerRef.current) { clearTimeout(draftExpiryTimerRef.current); draftExpiryTimerRef.current = null; }
    const slug = draftSlug;
    const cleanupTeam = activeTeamId || teamForScanRef.current;
    setDraftFiles([]);
    setDraftFolderMeta({});
    setDraftSelected(new Set());
    setDraftStatusByPath({});
    setDraftErrorByPath({});
    setDraftExpiresAt(null);
    setDraftSlug(null);
    if (slug && cleanupTeam && accessToken) {
      try { await deleteAgentWorkspace({ slug, teamId: cleanupTeam }, accessToken); } catch { /* noop */ }
    }
  };

  // Arm a 30-minute auto-purge of the private scratch folder. Resets any
  // existing timer (e.g. on a fresh run).
  const armDraftExpiry = () => {
    if (draftExpiryTimerRef.current) clearTimeout(draftExpiryTimerRef.current);
    const ms = 30 * 60 * 1000;
    setDraftExpiresAt(Date.now() + ms);
    draftExpiryTimerRef.current = setTimeout(() => { void discardDraftWorkspace(); }, ms);
  };

  // Import a set of files from the agent's scratch folder, one by one, and
  // wipe the folder when every selected file has imported (success OR
  // error). The caller passes the subset of paths to import.
  const handleDraftImport = async (paths: string[]) => {
    if (!accessToken || paths.length === 0) return;
    // Cloud needs a team; local writes straight to the FS handle.
    if (!isLocalMode && !activeTeamId) return;
    setDraftImporting(true);
    const handledStatus: Record<string, "done" | "error"> = {};
    try {
      for (const p of paths) {
        const file = draftFiles.find((f) => f.path === p);
        if (!file) continue;
        if (draftStatusByPath[p] === 'done') { handledStatus[p] = 'done'; continue; }
        setDraftStatusByPath((s) => ({ ...s, [p]: 'importing' }));
        try {
          await importKillioFile(
            { kind: file.kind, name: file.name, content: file.content },
            isLocalMode
              ? { mode: 'local', writeLocal: writeLocalFile, folder: file.folder }
              : { mode: 'cloud', accessToken, activeTeamId: activeTeamId as string },
          );
          handledStatus[p] = 'done';
          setDraftStatusByPath((s) => ({ ...s, [p]: 'done' }));
        } catch (err: any) {
          handledStatus[p] = 'error';
          setDraftStatusByPath((s) => ({ ...s, [p]: 'error' }));
          setDraftErrorByPath((e) => ({ ...e, [p]: err?.message || 'Import failed' }));
        }
      }
      // If every file in the folder is now handled (done/error), purge it.
      const allHandled = draftFiles.every((f) => {
        const st = handledStatus[f.path] || draftStatusByPath[f.path];
        return st === 'done' || st === 'error';
      });
      if (allHandled) {
        await discardDraftWorkspace();
      }
    } finally {
      setDraftImporting(false);
    }
  };

  const toggleVoice = () => {
    setVoiceEnabled((v) => {
      const next = !v;
      try { window.localStorage.setItem("killio_ai_voice", next ? "1" : "0"); } catch { /* noop */ }
      if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedFiles.length === 0 && !fileText.trim()) return;
    setIsGenerating(true);
    setGenerationProgress(10);
    setPreviewCards([]);
    setPreviewDocuments([]);
    setPreviewBoards([]);
    setPreviewScripts([]);
    setPreviewAgents([]);
    setAgentMsg(null);
    setDraftFiles([]);
    setDraftFolderMeta({});
    setDraftSelected(new Set());
    setDraftStatusByPath({});
    setDraftErrorByPath({});
    setDraftExpiresAt(null);
    if (draftExpiryTimerRef.current) { clearTimeout(draftExpiryTimerRef.current); draftExpiryTimerRef.current = null; }
    setExpandedScriptPreviewIds([]);

    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 15);
      });
    }, 800);

    try {
      // Extract every file in parallel.
      const extracted = selectedFiles.length > 0
        ? await Promise.all(selectedFiles.map(async (f) => ({ name: f.name, text: await extractSingleFile(f) })))
        : [];

      setGenerationProgress(20);

      // Combine user text context + every extracted file.
      let finalContent = "";
      if (fileText.trim()) {
        finalContent += `Contexto Adicional del Usuario:\n${fileText.trim()}\n\n`;
      }
      for (const e of extracted) {
        finalContent += `Contenido del Archivo (${e.name}):\n${e.text}\n\n`;
      }
      finalContent = finalContent.trim();

      // Fallback
      if (!finalContent.trim()) {
        finalContent = t("aiPanel.insufficientInfo");
      }

      const existingEntitiesSummary = [
        ...boards.map(b => `Board: ${b.name}`),
        ...teamDocs.map(d => `Document: ${d.title}`)
      ].join("\n");

      if (generationType === 'cards') {
        const cards = await generateCardsWithAi({
          scope: 'personal',
          scopeId: 'personal',
          rawContent: finalContent,
          existingEntitiesSummary
        }, accessToken || "");

        const enrichedCards = (Array.isArray(cards) ? cards : []).map((c, index) => ({
          ...c,
          id: c.id || `draft-card-${Date.now()}-${index}`,
          bricks: c.bricks || [],
          isSelected: true,
          customBoardId: undefined,
          customListId: undefined,
          availableLists: defaultLists,
        }));
        setPreviewCards(enrichedCards);
      } else if (generationType === 'documents') {
        const docs = await generateDocumentsWithAi({
          scope: 'personal',
          scopeId: 'personal',
          rawContent: finalContent,
          existingEntitiesSummary
        }, accessToken || "");

        setPreviewDocuments((Array.isArray(docs) ? docs : []).map((d, index) => ({
          ...d,
          id: `draft-doc-${Date.now()}-${index}`,
          isSelected: true
        })));
      } else if (generationType === 'boards') {
        const generatedBoards = await generateBoardsWithAi({
          scope: 'personal',
          scopeId: 'personal',
          rawContent: finalContent,
          existingEntitiesSummary
        }, accessToken || "");

        setPreviewBoards((Array.isArray(generatedBoards) ? generatedBoards : []).map((b, index) => ({
          ...b,
          id: `draft-board-${Date.now()}-${index}`,
          isSelected: true
        })));
      } else if (generationType === 'scripts') {
        if (!activeTeamId) throw new Error('No active team selected');

        const scriptsRes = await fetch(`${API}/scripts/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            userPrompt: finalContent,
            teamId: activeTeamId,
          }),
        });

        if (!scriptsRes.ok) {
          throw new Error(`No se pudo generar script (${scriptsRes.status})`);
        }

        const generated = await scriptsRes.json();
        const scriptDrafts = (Array.isArray(generated) ? generated : [generated])
          .filter(Boolean)
          .map((script: any, index: number) => normalizeGeneratedScriptDraft(script, index));

        setPreviewScripts(scriptDrafts);
      } else if (generationType === 'agents') {
        // REAL agentic via the backend's /agent/chat/stream endpoint — same
        // engine that powers AgentChatPanel. The backend runs an LLM tool-use
        // loop, streaming tool_start/tool_done/delta/done events as it
        // searches, reads, edits, and writes real entities. We just render
        // the stream as a deep-think trail and keep the final text as the
        // agent draft.
        //
        // Backend requires a teamId. Local-only users get fallback to their
        // first available team — agentic mode needs a workspace to act on.
        let teamForAgent = activeTeamId;
        if (!teamForAgent && accessToken) {
          try {
            const list = await listTeams(accessToken);
            if (list?.length) teamForAgent = list[0].id;
          } catch { /* ignore */ }
        }
        if (!teamForAgent) {
          throw new Error(t("aiPanel.agentNeedsTeam"));
        }

        // Upload each source file as a real asset so the agent can re-read the
        // ORIGINAL (PDF/DOCX/XLSX) on demand via chat_read_attachment, not just
        // the inline-extracted text. Best-effort: a failed upload just omits
        // that asset tag.
        const assetTags: string[] = [];
        for (const f of selectedFiles) {
          try {
            const up = await uploadFile(f, accessToken || '', { ownerScopeType: 'team', ownerScopeId: teamForAgent as string });
            if (up?.url) assetTags.push(`<asset type="document" src="${up.url}" title="${f.name}" />`);
          } catch (e) { console.error('asset upload failed', f.name, e); }
        }

        const toolsHint = enabledAgentTools.length > 0
          ? `Herramientas habilitadas: ${enabledAgentTools.join(', ')}.`
          : '';
        const message = [
          toolsHint,
          assetTags.join('\n'),
          finalContent,
          'El texto de los archivos ya está incluido arriba y además quedan adjuntos como assets (puedes re-leer el original con chat_read_attachment usando el src del asset). Primero PLANIFICA (bloque <plan> con pasos), luego construye el proyecto escribiendo archivos Killio (.kd/.kb/.km/.ks) con write_file en tu carpeta de trabajo. Usa los formatos y bricks reales (no texto plano).',
        ].filter(Boolean).join('\n\n');

        setGenerationProgress(35);
        setAgentRunning(true);

        // Per-session scratch folder slug. Agent writes EVERY output here;
        // we scan + offer selective import once the stream ends.
        const sessionSlug = generateWorkspaceSlug();
        setDraftSlug(sessionSlug);
        teamForScanRef.current = teamForAgent as string;

        // Build a single AgentMessage we render with the shared AssistantMessage
        // component (tool chips, asset blocks, plan — identical to agent chat).
        const msgId = `draft-${Date.now()}`;
        let rawText = '';
        const toolEvts: ToolEvent[] = [];
        const pushMsg = (streaming: boolean) => setAgentMsg({
          id: msgId, role: 'assistant', text: rawText, toolEvents: [...toolEvts], isStreaming: streaming,
        });
        pushMsg(true);

        await new Promise<void>((resolve) => {
          const cancel = streamAgentChat(
            { teamId: teamForAgent as string, message, enabledToolIds: enabledAgentTools, workspaceSlug: sessionSlug, autoScan: true },
            accessToken || '',
            (event: AgentStreamEvent) => {
              if (event.type === 'tool_start') {
                toolEvts.push({ id: (event as any).id, tool: event.tool, input: event.input, phase: 'start' });
                pushMsg(true);
                setGenerationProgress((p) => Math.min(90, p + 5));
              } else if (event.type === 'tool_done' || event.type === 'tool_result') {
                const id = (event as any).id;
                const output: any = (event as any).output ?? (event as any).data;
                const idx = toolEvts.findIndex((e) => e.id === id && e.phase === 'start');
                const done: ToolEvent = {
                  id, tool: event.tool, input: (event as any).input,
                  output, success: (event as any).success ?? true,
                  durationMs: (event as any).durationMs, phase: 'done',
                };
                if (idx >= 0) toolEvts[idx] = done; else toolEvts.push(done);
                pushMsg(true);
              } else if (event.type === 'delta') {
                rawText += event.text;
                pushMsg(true);
              } else if (event.type === 'done') {
                rawText = event.text || rawText;
                pushMsg(false);
                const { answer } = splitAgentStream(rawText);
                speak(answer || rawText);
                setGenerationProgress(100);
                // Scan the scratch folder for everything the agent wrote.
                (async () => {
                  try {
                    const scan = await scanAgentWorkspace(
                      { slug: sessionSlug, teamId: teamForAgent as string },
                      accessToken || '',
                    );
                    setDraftFiles(scan.files);
                    setDraftFolderMeta(scan.folders ?? {});
                    setDraftSelected(new Set(scan.files.map((f) => f.path)));
                    if (scan.files.length > 0) armDraftExpiry();
                  } catch (err) {
                    console.error('scanAgentWorkspace failed', err);
                  }
                })();
                resolve();
              } else if (event.type === 'error') {
                rawText += `\n\nError: ${event.message}`;
                pushMsg(false);
                resolve();
              }
            },
          );
          // Hard ceiling so the panel never hangs forever on a stuck stream.
          setTimeout(() => { try { cancel(); } catch { /* noop */ } resolve(); }, 180000);
        });
        setAgentRunning(false);
      }

      setGenerationProgress(100);
    } catch (err) {
      console.error("AI Generation failed", err);
      pushToast("error", t("aiPanel.generationError"));
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
      }, 500);
    }
  };

  const handleToggleCardSelection = (id: string) => {
    setPreviewCards((prev) => prev.map((card) => card.id === id ? { ...card, isSelected: !card.isSelected } : card));
  };

  const pushToast = (variant: any, text: string) => {
    toast(text, variant === "error" ? "error" : variant === "success" ? "success" : "info");
  };

  const handleToggleSelectAll = () => {
    if (generationType === 'cards') {
      const allSelected = previewCards.length > 0 && previewCards.every((card) => card.isSelected);
      setPreviewCards((prev) => prev.map((card) => ({ ...card, isSelected: !allSelected })));
    } else if (generationType === 'documents') {
      const allSelected = previewDocuments.length > 0 && previewDocuments.every((doc) => doc.isSelected);
      setPreviewDocuments((prev) => prev.map((doc) => ({ ...doc, isSelected: !allSelected })));
    } else if (generationType === 'boards') {
      const allSelected = previewBoards.length > 0 && previewBoards.every((board) => board.isSelected);
      setPreviewBoards((prev) => prev.map((board) => ({ ...board, isSelected: !allSelected })));
    } else if (generationType === 'scripts') {
      const allSelected = previewScripts.length > 0 && previewScripts.every((script) => script.isSelected);
      setPreviewScripts((prev) => prev.map((script) => ({ ...script, isSelected: !allSelected })));
    } else if (generationType === 'agents') {
      const allSelected = previewAgents.length > 0 && previewAgents.every((agent) => agent.isSelected);
      setPreviewAgents((prev) => prev.map((agent) => ({ ...agent, isSelected: !allSelected })));
    }
  };

  const handleToggleDocSelection = (id: string) => {
    setPreviewDocuments((prev) => prev.map((doc) => doc.id === id ? { ...doc, isSelected: !doc.isSelected } : doc));
  };

  const handleToggleBoardSelection = (id: string) => {
    setPreviewBoards((prev) => prev.map((board) => board.id === id ? { ...board, isSelected: !board.isSelected } : board));
  };

  const handleToggleScriptSelection = (id: string) => {
    setPreviewScripts((prev) => prev.map((script) => script.id === id ? { ...script, isSelected: !script.isSelected } : script));
  };

  const handleToggleScriptPreview = (id: string) => {
    setExpandedScriptPreviewIds((prev) =>
      prev.includes(id) ? prev.filter((scriptId) => scriptId !== id) : [...prev, id],
    );
  };

  const handleToggleAgentSelection = (id: string) => {
    setPreviewAgents((prev) => prev.map((agent) => agent.id === id ? { ...agent, isSelected: !agent.isSelected } : agent));
  };

  const handleToggleAgentTool = (toolId: AgentToolId) => {
    // Required tools (backend-marked) can never be disabled — bail silently.
    const entry = toolManifest.find((m) => m.name === toolId);
    if (entry?.required) return;
    setEnabledAgentTools((prev) => {
      if (prev.includes(toolId)) {
        return prev.filter((id) => id !== toolId);
      }
      return [...prev, toolId];
    });
  };

  const openDraftEditor = (cardId: string) => {
    const target = previewCards.find((card) => card.id === cardId);
    if (!target) return;
    setEditingDraftId(cardId);
    setEditingTitle(target.title);
    // For editing draft in the generation panel, we still use a simple textarea, 
    // so we concatenate bricks for editing and will split them back or just store as text brick.
    const fullText = target.bricks.map(b => b.kind === 'text' ? b.content.markdown : `- [ ] ${b.content.items?.map((i: any) => i.label).join('\n- [ ] ')}`).join('\n\n');
    setEditingDescription(fullText);
  };

  const handleSaveDraftEditor = () => {
    if (!editingDraftId) return;
    setPreviewCards((prev) => prev.map((card) => card.id === editingDraftId
      ? {
        ...card,
        title: editingTitle.trim() || t("aiPanel.cardUntitled"),
        bricks: [{ kind: 'text', content: { markdown: editingDescription } }],
      }
      : card
    ));
    setEditingDraftId(null);
    setEditingTitle("");
    setEditingDescription("");
    pushToast("success", t("aiPanel.draftUpdated"));
  };

  const handleEnableCustomDestination = (cardId: string) => {
    setPreviewCards((prev) => prev.map((card) => card.id === cardId
      ? {
        ...card,
        customBoardId: defaultBoardId || card.customBoardId,
        customListId: defaultListId || card.customListId,
        availableLists: defaultLists,
      }
      : card
    ));
  };

  const handleDisableCustomDestination = (cardId: string) => {
    setPreviewCards((prev) => prev.map((card) => card.id === cardId
      ? {
        ...card,
        customBoardId: undefined,
        customListId: undefined,
      }
      : card
    ));
  };

  const handleCustomBoardChange = async (cardId: string, boardId: string) => {
    if (!accessToken) return;
    setPreviewCards((prev) => prev.map((card) => card.id === cardId
      ? {
        ...card,
        customBoardId: boardId,
        customListId: "",
        availableLists: [],
      }
      : card
    ));

    try {
      const board = await getBoard(boardId, accessToken);
      setPreviewCards((prev) => prev.map((card) => card.id === cardId
        ? {
          ...card,
          availableLists: board.lists,
          customListId: board.lists[0]?.id || "",
        }
        : card
      ));
    } catch (error) {
      console.error("Error fetching board lists", error);
      pushToast("error", t("aiPanel.listLoadError"));
    }
  };

  const handleCustomListChange = (cardId: string, listId: string) => {
    setPreviewCards((prev) => prev.map((card) => card.id === cardId
      ? {
        ...card,
        customListId: listId,
      }
      : card
    ));
  };

  const closeCardDetailsAndAdvance = () => {
    if (createdCardsQueueIndex === null || createdCardsQueue.length === 0) {
      setActiveCardDetails(null);
      return;
    }

    const nextIndex = createdCardsQueueIndex + 1;
    if (nextIndex < createdCardsQueue.length) {
      setCreatedCardsQueueIndex(nextIndex);
      setActiveCardDetails(createdCardsQueue[nextIndex]);
      return;
    }

    setCreatedCardsQueue([]);
    setCreatedCardsQueueIndex(null);
    setActiveCardDetails(null);
  };

  const handleDispatchSelected = async () => {
    if (!accessToken || !activeTeamId) return;

    if (generationType === 'cards') {
      if (!defaultBoardId || !defaultListId) {
        pushToast("error", t("aiPanel.selectDestinationFirst"));
        return;
      }
      const selectedDrafts = previewCards.filter((card) => card.isSelected);
      if (selectedDrafts.length === 0) {
        pushToast("info", t("aiPanel.selectAtLeastOneCard"));
        return;
      }
      setIsDispatchingSelected(true);
      try {
        const payloads = selectedDrafts.map((draft) => ({
          draft,
          boardId: draft.customBoardId || defaultBoardId,
          listId: draft.customListId || defaultListId,
        }));

        const results = await Promise.allSettled(
          payloads.map(async (entry) => {
            const card = await createCard({ listId: entry.listId, title: entry.draft.title?.trim() || t("aiPanel.cardUntitled") }, accessToken);
            if (entry.draft.bricks) {
              for (const brick of entry.draft.bricks) {
                await createCardBrick(card.id, {
                  kind: brick.kind,
                  markdown: brick.content.markdown,
                  items: brick.content.items,
                  displayStyle: 'paragraph'
                }, accessToken);
              }
            }
            return card;
          })
        );

        const createdCards: any[] = [];
        const createdDraftIds = new Set<string>();
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const payload = payloads[index];
            const boardName = boards.find(b => b.id === payload.boardId)?.name || "Board";
            const listName = (payload.draft.availableLists || defaultLists).find(l => l.id === payload.listId)?.name || "List";
            createdCards.push({ card: result.value, listId: payload.listId, listName, boardId: payload.boardId, boardName });
            createdDraftIds.add(payload.draft.id);
          }
        });

        if (createdCards.length > 0) {
          setPreviewCards(prev => prev.filter(c => !createdDraftIds.has(c.id)));
          setCreatedCardsQueue(createdCards);
          setCreatedCardsQueueIndex(0);
          setActiveCardDetails(createdCards[0]);
          pushToast("success", t("aiPanel.cardsSent", { count: createdCards.length }));
        }
      } catch (err: any) {
        pushToast("error", t("aiPanel.cardsError", { message: err?.message || t("aiPanel.unknownError") }));
      } finally {
        setIsDispatchingSelected(false);
      }
    } else if (generationType === 'documents') {
      const selectedDocs = previewDocuments.filter(d => d.isSelected);
      if (selectedDocs.length === 0) return;
      setIsDispatchingSelected(true);
      try {
        for (const docDraft of selectedDocs) {
          const doc = await createDocument({ teamId: activeTeamId, title: docDraft.title?.trim() || 'Untitled Document' }, accessToken);
          if (docDraft.bricks) {
            for (let i = 0; i < docDraft.bricks.length; i++) {
              const b = docDraft.bricks[i];
              await createDocumentBrick(doc.id, { kind: b.kind, position: i, content: b.content }, accessToken);
            }
          }
        }
        setPreviewDocuments(prev => prev.filter(d => !selectedDocs.find(sd => sd.id === d.id)));
        pushToast("success", t("aiPanel.documentsSent", { count: selectedDocs.length }));
      } catch (err: any) {
        pushToast("error", t("aiPanel.documentsError"));
      } finally {
        setIsDispatchingSelected(false);
      }
    } else if (generationType === 'boards') {
      const selectedBoards = previewBoards.filter(b => b.isSelected);
      if (selectedBoards.length === 0) return;
      setIsDispatchingSelected(true);
      try {
        for (const boardDraft of selectedBoards) {
          const board = await createBoard({ name: boardDraft.name, slug: boardDraft.slug }, activeTeamId, accessToken);
          if (boardDraft.lists) {
            for (let i = 0; i < boardDraft.lists.length; i++) {
              const lDraft = boardDraft.lists[i];
              const list = await createList(board.id, { name: lDraft.name, position: i }, accessToken);
              if (lDraft.cards) {
                for (const cDraft of lDraft.cards) {
                  const card = await createCard({ listId: list.id, title: cDraft.title }, accessToken);
                  if (cDraft.bricks) {
                    for (const bDraft of cDraft.bricks) {
                      await createCardBrick(card.id, { kind: bDraft.kind, markdown: bDraft.content.markdown, items: bDraft.content.items, displayStyle: 'paragraph' }, accessToken);
                    }
                  }
                }
              }
            }
          }
        }
        setPreviewBoards(prev => prev.filter(b => !selectedBoards.find(sb => sb.id === b.id)));
        pushToast("success", t("aiPanel.boardsSent", { count: selectedBoards.length }));
      } catch (err: any) {
        pushToast("error", t("aiPanel.boardsError"));
      } finally {
        setIsDispatchingSelected(false);
      }
    } else if (generationType === 'scripts') {
      const selectedScripts = previewScripts.filter((script) => script.isSelected);
      if (selectedScripts.length === 0 || !activeTeamId) return;

      setIsDispatchingSelected(true);
      try {
        for (const scriptDraft of selectedScripts) {
          const createdScript = await createScript(
            {
              teamId: activeTeamId,
              name: scriptDraft.name,
              description: scriptDraft.description,
              triggerConfig: { type: 'manual' },
            },
            accessToken,
          );

          const nodes = scriptDraft.nodes.map((node, index) => {
            const nodeLike = node && typeof node === 'object' ? node : ({} as any);
            let nodeKind = String((nodeLike as any).kind || (nodeLike as any).nodeKind || (nodeLike as any).type || 'core.trigger.manual');
            let config =
              nodeLike.config && typeof nodeLike.config === 'object' && !Array.isArray(nodeLike.config)
                ? { ...nodeLike.config }
                : {};

            if (nodeKind === 'killio.database.action') {
              if (!config.operation) {
                config.operation = inferDatabaseOperation(
                  config.operation || (nodeLike as any).operation || nodeLike.label || (nodeLike as any).name,
                );
              }

              if (!config.sourceBrickId && (nodeLike as any).sourceBrickId) {
                config.sourceBrickId = String((nodeLike as any).sourceBrickId);
              }

              if (!config.sourceBrickId) {
                nodeKind = 'killio.database.list';
                config = { source: 'all' };
              }
            }

            return {
              id: String(nodeLike.id || `node-${index + 1}`),
              scriptId: createdScript.id,
              nodeKind: nodeKind as any,
              label: nodeLike.label || null,
              config,
              positionX: 180 + index * 180,
              positionY: 140,
            };
          });

          const nodeIds = new Set(nodes.map((node) => node.id));
          let edges = scriptDraft.connections
            .map((edge, index) => {
              const edgeLike = edge && typeof edge === 'object' ? (edge as any) : {};
              const source = String(edgeLike.source ?? edgeLike.sourceNodeId ?? edgeLike.from ?? '').trim();
              const target = String(edgeLike.target ?? edgeLike.targetNodeId ?? edgeLike.to ?? '').trim();

              if (!source || !target || source === target) {
                return null;
              }

              return {
                id: `edge-${index + 1}`,
                scriptId: createdScript.id,
                sourceNodeId: source,
                targetNodeId: target,
                sourceHandle: edgeLike.sourceHandle || 'output',
                targetHandle: edgeLike.targetHandle || 'input',
              };
            })
            .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
            .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId));

          if (edges.length === 0 && nodes.length > 1) {
            edges = nodes.slice(0, -1).map((node, index) => ({
              id: `edge-seq-${index + 1}`,
              scriptId: createdScript.id,
              sourceNodeId: node.id,
              targetNodeId: nodes[index + 1].id,
              sourceHandle: 'output',
              targetHandle: 'input',
            }));
          }

          if (nodes.length > 0) {
            await saveScriptGraph(createdScript.id, activeTeamId, { nodes, edges }, accessToken);
          }
        }

        setPreviewScripts((prev) => prev.filter((script) => !selectedScripts.find((selected) => selected.id === script.id)));
        pushToast('success', t("aiPanel.scriptsSent", { count: selectedScripts.length }));
      } catch (err: any) {
        pushToast('error', t("aiPanel.scriptsError", { message: err?.message || t("aiPanel.unknownError") }));
      } finally {
        setIsDispatchingSelected(false);
      }
    } else if (generationType === 'agents') {
      const selectedAgents = previewAgents.filter((agent) => agent.isSelected);
      if (selectedAgents.length === 0) return;

      setIsDispatchingSelected(true);
      try {
        // Local mode: persist agent drafts to localStorage instead of the
        // team's document store. Cloud mode: each agent becomes a document.
        if (agentScope === 'personal' || !activeTeamId) {
          const KEY = "killio_personal_agents";
          let stored: any[] = [];
          try { stored = JSON.parse(window.localStorage.getItem(KEY) || "[]"); } catch { stored = []; }
          for (const a of selectedAgents) {
            stored.push({
              id: a.id,
              name: a.name,
              description: a.description,
              reasoning: a.reasoning,
              response: a.response,
              tools: a.selectedTools,
              createdAt: new Date().toISOString(),
            });
          }
          try { window.localStorage.setItem(KEY, JSON.stringify(stored)); } catch { /* noop */ }
          setPreviewAgents((prev) => prev.filter((agent) => !selectedAgents.find((selected) => selected.id === agent.id)));
          pushToast('success', t("aiPanel.createdAgents", { count: selectedAgents.length }));
          return;
        }

        for (const agentDraft of selectedAgents) {
          const agentDocument = await createDocument(
            { teamId: activeTeamId, title: `Agent: ${agentDraft.name}` },
            accessToken,
          );

          const toolList = agentDraft.selectedTools.map((tool) => `- ${tool}`).join('\n');
          const markdown = `## ${agentDraft.name}\n\n${agentDraft.description}\n\n### Tools habilitadas\n${toolList || '- (ninguna)'}\n\n### Reasoning\n${agentDraft.reasoning}\n\n### Respuesta\n${agentDraft.response}`;

          await createDocumentBrick(
            agentDocument.id,
            { kind: 'text', position: 0, content: { markdown } },
            accessToken,
          );
        }

        setPreviewAgents((prev) => prev.filter((agent) => !selectedAgents.find((selected) => selected.id === agent.id)));
        pushToast('success', t("aiPanel.createdAgents", { count: selectedAgents.length }));
      } catch (err: any) {
        pushToast('error', t("aiPanel.agentsError", { message: err?.message || t("aiPanel.unknownError") }));
      } finally {
        setIsDispatchingSelected(false);
      }
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-background/80 backdrop-blur-sm p-0 sm:p-4 md:p-6 overflow-y-auto">
        <div className="relative w-full max-w-6xl sm:rounded-2xl border border-border bg-card shadow-2xl flex flex-col md:flex-row sm:overflow-hidden animate-in fade-in zoom-in-95 duration-200 min-h-[100svh] sm:min-h-[600px] sm:max-h-[92vh]">

          {/* Left Panel: Upload & Input */}
          <div className="flex-1 lg:max-w-md border-r border-border p-4 sm:p-6 flex flex-col bg-card/50 min-h-0 md:overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold flex items-center tracking-tight">
                <Bot className="mr-2 h-7 w-7 text-accent" />
                AI Draft Studio
              </h2>
              <button onClick={onClose} className="md:hidden rounded-full p-2 hover:bg-accent/10 text-muted-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 mb-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("aiPanel.uploadDesc")}
              </p>
            </div>

            <div className="flex-1 flex flex-col relative overflow-visible">
              {/* Always-visible dropzone — multi-file. */}
              <div
                className={`mb-3 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-5 transition-all duration-200 ${dragActive ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/60 hover:bg-accent/5 cursor-pointer"}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                <UploadCloud className="h-6 w-6 text-accent mb-2" />
                <h3 className="text-sm font-semibold text-foreground">{t("aiPanel.uploadFilePlaceholder")}</h3>
                <p className="text-[11px] text-muted-foreground mt-1">PDF • DOCX • XLSX • PPTX • CSV • MD • TXT • Audio • Image • KD/KM/KB/KS</p>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : [];
                    if (list.length) setSelectedFiles((prev) => [...prev, ...list]);
                    e.target.value = "";
                  }}
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="mb-4 space-y-2 max-h-44 overflow-y-auto pr-1">
                  {selectedFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between border rounded-lg border-accent/30 bg-accent/5 p-2.5">
                      <div className="flex items-center min-w-0">
                        <FileAudio className="h-5 w-5 text-accent mr-2 shrink-0" />
                        <div className="min-w-0">
                          <h4 className="font-medium text-xs truncate text-foreground" title={f.name}>{f.name}</h4>
                          <p className="text-[10px] text-muted-foreground">{(f.size / 1024 / 1024).toFixed(2)} MB · {inferSourceKind(f)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                        title={t("aiPanel.removeFile")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Text Area (Main Content or Extra Context) */}
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  {selectedFiles.length > 0 ? t("aiPanel.additionalContextLabel") : t("aiPanel.pasteNotesLabel")}
                </label>
                <ReferenceTokenInput
                  value={fileText}
                  onChange={setFileText}
                  onPasteImage={(file) => setSelectedFiles((prev) => [...prev, file])}
                  placeholder={selectedFiles.length > 0 ? t("aiPanel.filterContextPlaceholder") : t("aiPanel.mainPlaceholder")}
                  documents={teamDocs}
                  boards={boards}
                  users={teamMembers}
                  className="flex-1"
                  inputClassName="h-full w-full min-h-[96px] sm:min-h-[120px] rounded-xl bg-background px-4 py-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-shadow align-top"
                />

              </div>

              {/* Generate Action */}
              <div className="mt-6">
                {isGenerating ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span className="flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> {t("aiPanel.analyzing")}</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300 ease-out"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleGenerate}
                      disabled={selectedFiles.length === 0 && !fileText.trim()}
                      className="flex-1 inline-flex items-center justify-center h-11 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Sparkles className="h-5 w-5 mr-2" />
                      {generationType === 'cards'
                        ? t("aiPanel.generateCards")
                        : generationType === 'documents'
                          ? t("aiPanel.generateDocuments")
                          : generationType === 'boards'
                            ? t("aiPanel.generateBoards")
                            : generationType === 'scripts'
                              ? t("aiPanel.generateScripts")
                              : t("aiPanel.designAgent")}
                    </button>
                    <div className="flex gap-2">
                      <div className="relative" ref={generationMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowGenerationTypeMenu((prev) => !prev)}
                          className="h-11 w-11 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-accent/5 transition-colors"
                          title={t("aiPanel.changeGenerationType")}
                        >
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        </button>
                        {showGenerationTypeMenu && (
                          <div className="absolute bottom-full right-0 w-52 bg-card border border-border rounded-xl shadow-xl p-1.5 transition-all origin-bottom-right z-30 mb-2">
                          <button onClick={() => { setGenerationType('cards'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'cards' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Layout className="h-3.5 w-3.5" /> {t("aiPanel.generateCards")}
                          </button>
                          <button onClick={() => { setGenerationType('documents'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'documents' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <FileText className="h-3.5 w-3.5" /> {t("aiPanel.generateDocuments")}
                          </button>
                          <button onClick={() => { setGenerationType('boards'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'boards' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Layout className="h-3.5 w-3.5" /> {t("aiPanel.generateBoards")}
                          </button>
                          <button onClick={() => { setGenerationType('scripts'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'scripts' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Sparkles className="h-3.5 w-3.5" /> {t("aiPanel.generateScripts")}
                          </button>
                          <button onClick={() => { setGenerationType('agents'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'agents' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Bot className="h-3.5 w-3.5" /> {t("aiPanel.agentMode")}
                          </button>
                        </div>
                        )}
                      </div>

                      {generationType === 'agents' && (
                        <button
                          type="button"
                          onClick={toggleVoice}
                          className={`h-11 w-11 rounded-lg border flex items-center justify-center transition-colors ${voiceEnabled ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-card hover:bg-accent/5 text-muted-foreground'}`}
                          title={voiceEnabled ? t("aiPanel.voiceOff") : t("aiPanel.voiceOn")}
                        >
                          {voiceEnabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
                        </button>
                      )}

                      {generationType === 'agents' && (() => {
                        const enabledSet = new Set(enabledAgentTools);
                        const filtered = agentToolFilter
                          ? toolManifest.filter((m) => {
                              const q = agentToolFilter.toLowerCase();
                              return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
                            })
                          : toolManifest;
                        const grouped = new Map<string, AgentToolManifestEntry[]>();
                        for (const tool of filtered) {
                          const arr = grouped.get(tool.category) || [];
                          arr.push(tool);
                          grouped.set(tool.category, arr);
                        }
                        const cats = Array.from(grouped.keys()).sort();
                        const totalEnabled = enabledAgentTools.length;
                        const totalAvailable = toolManifest.length;
                        return (
                          <div className="relative group/tools">
                            <button
                              type="button"
                              className="h-11 w-11 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-accent/5 transition-colors relative"
                              title={t("aiPanel.agentToolsTitle")}
                            >
                              <Wrench className="h-4.5 w-4.5 text-muted-foreground" />
                              {totalAvailable > 0 && (
                                <span className="absolute -top-1 -right-1 text-[9px] font-semibold rounded-full bg-accent text-accent-foreground px-1 min-w-[16px] text-center">{totalEnabled}</span>
                              )}
                            </button>
                            <div className="absolute bottom-full right-0 z-30 mb-2 w-96 rounded-xl border border-border bg-card shadow-xl p-3 opacity-0 pointer-events-none transition-all duration-150 group-hover/tools:opacity-100 group-hover/tools:pointer-events-auto">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                                  {totalEnabled}/{totalAvailable} {t("aiPanel.toolsSelected")}
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent/10"
                                    onClick={() => setEnabledAgentTools(toolManifest.map((m) => m.name))}
                                  >{t("aiPanel.toolsAll")}</button>
                                  <button
                                    type="button"
                                    className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent/10"
                                    onClick={() => setEnabledAgentTools(toolManifest.filter((m) => m.required).map((m) => m.name))}
                                  >{t("aiPanel.toolsNone")}</button>
                                </div>
                              </div>
                              <input
                                type="text"
                                value={agentToolFilter}
                                onChange={(e) => setAgentToolFilter(e.target.value)}
                                placeholder={t("aiPanel.toolsFilter")}
                                className="w-full mb-2 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                              {!toolsLoaded ? (
                                <div className="text-[11px] text-muted-foreground p-3 text-center">{t("aiPanel.toolsLoading")}</div>
                              ) : toolManifest.length === 0 ? (
                                <div className="text-[11px] text-muted-foreground p-3 text-center">{t("aiPanel.toolsEmpty")}</div>
                              ) : (
                                <div className="max-h-72 overflow-y-auto space-y-1">
                                  {cats.map((cat) => {
                                    const collapsed = collapsedCategories.has(cat);
                                    const tools = grouped.get(cat) || [];
                                    const catEnabled = tools.filter((t) => enabledSet.has(t.name)).length;
                                    return (
                                      <div key={cat} className="border border-border/60 rounded-lg overflow-hidden">
                                        <div className="flex items-center justify-between px-2 py-1.5 bg-secondary/30">
                                          <button
                                            type="button"
                                            onClick={() => setCollapsedCategories((prev) => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; })}
                                            className="flex-1 text-left flex items-center gap-1.5"
                                          >
                                            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">{cat}</span>
                                            <span className="text-[10px] text-muted-foreground">({catEnabled}/{tools.length})</span>
                                          </button>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => setEnabledAgentTools((prev) => Array.from(new Set([...prev, ...tools.map((t) => t.name)])))}
                                              className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-accent/10"
                                            >+</button>
                                            <button
                                              type="button"
                                              onClick={() => setEnabledAgentTools((prev) => prev.filter((n) => {
                                                const t = tools.find((x) => x.name === n);
                                                return !t || t.required;
                                              }))}
                                              className="text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-accent/10"
                                            >−</button>
                                          </div>
                                        </div>
                                        {!collapsed && (
                                          <div className="p-1 space-y-0.5">
                                            {tools.map((tool) => {
                                              const selected = enabledSet.has(tool.name);
                                              const locked = !!tool.required;
                                              return (
                                                <button
                                                  key={tool.name}
                                                  type="button"
                                                  disabled={locked}
                                                  onClick={() => handleToggleAgentTool(tool.name)}
                                                  className={`w-full text-left rounded p-1.5 transition-colors flex items-start gap-2 ${selected ? 'bg-accent/10' : 'hover:bg-secondary/40'} ${locked ? 'opacity-90 cursor-not-allowed' : ''}`}
                                                  title={locked ? t("aiPanel.toolRequired") : tool.name}
                                                >
                                                  <div className={`mt-0.5 h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center ${selected ? 'bg-accent border-accent text-accent-foreground' : 'border-border'}`}>
                                                    {selected && <CheckCircle2 className="h-3 w-3" />}
                                                  </div>
                                                  <div className="min-w-0">
                                                    <div className="text-[11px] font-mono font-semibold text-foreground truncate flex items-center gap-1">
                                                      {tool.name}
                                                      {locked && <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">req</span>}
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground line-clamp-2">{tool.description}</p>
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Preview Area */}
          <div className="flex-1 bg-background flex flex-col relative w-full min-h-0 overflow-hidden">
            <div className="hidden md:flex absolute top-4 right-4 z-10">
              <button onClick={onClose} className="rounded-full p-2 hover:bg-accent/10 text-muted-foreground transition-colors bg-background/50 backdrop-blur-sm border border-border/50 shadow-sm">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col overflow-y-auto hide-scrollbar min-h-0">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg text-foreground">
                  {generationType === 'cards'
                    ? t("aiPanel.draftTitles.cards")
                    : generationType === 'documents'
                      ? t("aiPanel.draftTitles.documents")
                      : generationType === 'boards'
                        ? t("aiPanel.draftTitles.boards")
                        : generationType === 'scripts'
                          ? t("aiPanel.draftTitles.scripts")
                          : t("aiPanel.draftTitles.agents")}
                </h3>
                {((generationType === 'cards' && previewCards.length > 0)
                  || (generationType === 'documents' && previewDocuments.length > 0)
                  || (generationType === 'boards' && previewBoards.length > 0)
                  || (generationType === 'scripts' && previewScripts.length > 0)
                  || (generationType === 'agents' && previewAgents.length > 0)) && (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {t("aiPanel.pendingCount", { count: generationType === 'cards'
                        ? previewCards.length
                        : generationType === 'documents'
                          ? previewDocuments.length
                          : generationType === 'boards'
                            ? previewBoards.length
                            : generationType === 'scripts'
                              ? previewScripts.length
                              : previewAgents.length })}
                    </span>
                    <button
                      onClick={handleToggleSelectAll}
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border border-input hover:bg-accent/5"
                    >
                      <CheckSquare className="h-3.5 w-3.5 mr-1" />
                      {((generationType === 'cards' && previewCards.every(c => c.isSelected))
                        || (generationType === 'documents' && previewDocuments.every(d => d.isSelected))
                        || (generationType === 'boards' && previewBoards.every(b => b.isSelected))
                        || (generationType === 'scripts' && previewScripts.every(s => s.isSelected))
                        || (generationType === 'agents' && previewAgents.every(a => a.isSelected))) ? t("aiPanel.deselectAll") : t("aiPanel.selectAll")}
                    </button>
                  </div>
                )}
              </div>

              {(
                (generationType === 'cards' && previewCards.length === 0) ||
                (generationType === 'documents' && previewDocuments.length === 0) ||
                (generationType === 'boards' && previewBoards.length === 0) ||
                (generationType === 'scripts' && previewScripts.length === 0) ||
                (generationType === 'agents' && previewAgents.length === 0 && !agentMsg)
              ) ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-70">
                  <div className="h-24 w-24 rounded-full bg-accent/5 flex items-center justify-center mb-6">
                    <Bot className="h-12 w-12 text-accent/40" />
                  </div>
                  <h4 className="text-lg font-medium mb-2">{t("aiPanel.noResults")}</h4>
                  <p className="text-sm text-center text-muted-foreground max-w-sm">
                    {generationType === 'cards'
                      ? t("aiPanel.noResultsDesc.cards")
                      : generationType === 'documents'
                        ? t("aiPanel.noResultsDesc.documents")
                        : generationType === 'boards'
                          ? t("aiPanel.noResultsDesc.boards")
                          : generationType === 'scripts'
                            ? t("aiPanel.noResultsDesc.scripts")
                            : t("aiPanel.noResultsDesc.agents")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1 pb-10">
                  {generationType === 'cards' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        {t("aiPanel.instructions.cards")}
                      </p>
                    </div>
                  )}
                  {generationType === 'documents' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        {t("aiPanel.instructions.documents")}
                      </p>
                    </div>
                  )}
                  {generationType === 'boards' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        {t("aiPanel.instructions.boards")}
                      </p>
                    </div>
                  )}
                  {generationType === 'scripts' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        {t("aiPanel.instructions.scripts")}
                      </p>
                    </div>
                  )}
                  {generationType === 'agents' && agentMsg && (
                    <div className="mb-4">
                      <AssistantMessage
                        t={t as any}
                        message={agentMsg}
                        isLast
                        toolsExpanded
                        onToggleTools={() => {}}
                        onCopy={() => { try { navigator.clipboard.writeText(splitAgentStream(agentMsg.text).answer || agentMsg.text); } catch { /* noop */ } }}
                        copied={false}
                        onThumb={() => {}}
                        onRetry={() => {}}
                      />
                    </div>
                  )}

                  {generationType === 'agents' && draftFiles.length > 0 && (() => {
                    const KIND_ICON: Record<string, React.ReactNode> = {
                      kd: <FileTextIcon className="h-4 w-4" />,
                      kb: <LayoutIcon className="h-4 w-4" />,
                      km: <NetworkIcon className="h-4 w-4" />,
                      ks: <WorkflowIcon className="h-4 w-4" />,
                    };
                    const toggleSel = (p: string) => setDraftSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(p)) next.delete(p); else next.add(p);
                      return next;
                    });
                    const allSelected = draftFiles.every((f) => draftSelected.has(f.path));
                    const selectedPaths = Array.from(draftSelected);
                    const groups = new Map<string, AgentVfsFile[]>();
                    for (const f of draftFiles) {
                      const key = f.folder || '';
                      const arr = groups.get(key) || [];
                      arr.push(f);
                      groups.set(key, arr);
                    }
                    return (
                      <div className="space-y-3 mt-4 rounded-xl border border-border/60 bg-card/40 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5 min-w-0">
                            <FolderIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t("aiPanel.draftWorkspace.title", { slug: draftSlug ?? '' })}</span>
                            {draftExpiresAt && (
                              <span className="ml-1 normal-case tracking-normal text-[10px] text-amber-500/90 inline-flex items-center gap-1">
                                <Loader2Icon className="h-3 w-3 opacity-0 w-0" />
                                {t("aiPanel.draftWorkspace.expiresIn", { mins: draftExpiryMins })}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5 items-center">
                            <button
                              type="button"
                              onClick={() => setDraftSelected(allSelected ? new Set() : new Set(draftFiles.map((f) => f.path)))}
                              className="text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent/5"
                            >{allSelected ? t("aiPanel.draftWorkspace.deselectAll") : t("aiPanel.draftWorkspace.selectAll")}</button>
                            <button
                              type="button"
                              onClick={() => handleDraftImport(selectedPaths)}
                              disabled={draftImporting || selectedPaths.length === 0}
                              className="text-[11px] px-2 py-1 rounded-md bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              {draftImporting ? <Loader2Icon className="h-3 w-3 animate-spin" /> : null}
                              {t("aiPanel.draftWorkspace.importSelected", { n: selectedPaths.length })}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDraftImport(draftFiles.map((f) => f.path))}
                              disabled={draftImporting || draftFiles.length === 0}
                              className="text-[11px] px-2 py-1 rounded-md border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
                            >{t("aiPanel.draftWorkspace.importAll")}</button>
                            <button
                              type="button"
                              onClick={() => { void discardDraftWorkspace(); }}
                              disabled={draftImporting}
                              title={t("aiPanel.draftWorkspace.discard")}
                              className="text-[11px] p-1.5 rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            ><XIcon className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                        {Array.from(groups.entries()).map(([folder, files]) => {
                          const meta = draftFolderMeta[folder];
                          return (
                            <div key={folder || '_root'} className="space-y-1.5">
                              {folder && (
                                <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                                  <FolderIcon className="h-3.5 w-3.5" style={meta?.color ? { color: meta.color } : undefined} />
                                  {meta?.name || folder}
                                </div>
                              )}
                              {files.map((f) => {
                                const sel = draftSelected.has(f.path);
                                const st = draftStatusByPath[f.path] || 'idle';
                                return (
                                  <button
                                    key={f.path}
                                    type="button"
                                    onClick={() => toggleSel(f.path)}
                                    disabled={st === 'importing' || st === 'done'}
                                    className={`w-full flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors ${sel ? 'border-accent/40 bg-accent/5' : 'border-border hover:bg-secondary/40'} ${st === 'done' ? 'opacity-70' : ''}`}
                                  >
                                    <div className={`mt-0.5 h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center ${sel ? 'bg-accent border-accent text-accent-foreground' : 'border-border'}`}>
                                      {sel && <CheckIcon className="h-3 w-3" />}
                                    </div>
                                    <div className="mt-0.5 text-accent shrink-0">{KIND_ICON[f.kind]}</div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold truncate">{f.name}</span>
                                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/10 text-accent">{f.kind}</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={f.path}>{f.path}</p>
                                      <div className="text-[10px] text-muted-foreground mt-1">
                                        {st === 'importing' && <span className="inline-flex items-center gap-1"><Loader2Icon className="h-3 w-3 animate-spin" />{t("aiPanel.draftWorkspace.importing")}</span>}
                                        {st === 'done' && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckIcon className="h-3 w-3" />{t("aiPanel.draftWorkspace.imported")}</span>}
                                        {st === 'error' && <span className="inline-flex items-center gap-1 text-red-500"><XIcon className="h-3 w-3" />{draftErrorByPath[f.path] || t("aiPanel.draftWorkspace.errGeneric")}</span>}
                                        {(st === 'idle' || !st) && <span>{(f.size / 1024).toFixed(1)} KB</span>}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {generationType === 'agents' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        {t("aiPanel.instructions.agents")}
                      </p>
                    </div>
                  )}

                  {generationType === 'cards' && (
                    <div className="bg-card border border-border rounded-lg p-4 flex flex-col md:flex-row gap-3 md:items-center">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold md:min-w-[150px]">{t("aiPanel.step2Destination")}</div>
                      <Select
                        sizeVariant="sm"
                        wrapperClassName="flex-1 min-w-[160px]"
                        value={defaultBoardId}
                        onChange={(e) => setDefaultBoardId(e.target.value)}
                        placeholder={t("aiPanel.selectBoard")}
                        options={boards.map((board) => ({ value: board.id, label: board.name }))}
                      />
                      <Select
                        sizeVariant="sm"
                        wrapperClassName="flex-1 min-w-[160px]"
                        value={defaultListId}
                        onChange={(e) => setDefaultListId(e.target.value)}
                        disabled={!defaultBoardId || defaultLists.length === 0}
                        placeholder={!defaultBoardId ? t("aiPanel.selectBoardFirst") : defaultLists.length === 0 ? t("aiPanel.noLists") : t("aiPanel.selectList")}
                        options={defaultLists.map((list) => ({ value: list.id, label: list.name }))}
                      />
                    <button
                      onClick={handleDispatchSelected}
                      disabled={isDispatchingSelected || !defaultBoardId || !defaultListId || !previewCards.some((card) => card.isSelected)}
                      className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground font-semibold hover:bg-accent/90 text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                    >
                      {isDispatchingSelected ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1.5" /> {t("aiPanel.sendSelected")}
                        </>
                      )}
                    </button>
                  </div>
                  )}

                  {generationType === 'documents' && previewDocuments.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleDispatchSelected}
                        disabled={isDispatchingSelected || !previewDocuments.some((doc) => doc.isSelected)}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground font-semibold hover:bg-accent/90 text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                      >
                        {isDispatchingSelected ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("aiPanel.createDocuments")}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {generationType === 'boards' && previewBoards.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleDispatchSelected}
                        disabled={isDispatchingSelected || !previewBoards.some((board) => board.isSelected)}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground font-semibold hover:bg-accent/90 text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                      >
                        {isDispatchingSelected ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("aiPanel.createBoards")}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {generationType === 'scripts' && previewScripts.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleDispatchSelected}
                        disabled={isDispatchingSelected || !previewScripts.some((script) => script.isSelected)}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground font-semibold hover:bg-accent/90 text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                      >
                        {isDispatchingSelected ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("aiPanel.createScripts")}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {generationType === 'agents' && previewAgents.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleDispatchSelected}
                        disabled={isDispatchingSelected || !previewAgents.some((agent) => agent.isSelected)}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground font-semibold hover:bg-accent/90 text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                      >
                        {isDispatchingSelected ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> {t("aiPanel.saveAgents")}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {generationType === 'cards' && previewCards.map((card) => (
                    <div
                      key={card.id}
                      className={`relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all p-5 overflow-hidden flex flex-col group cursor-pointer ${card.isSelected ? "border-accent/40" : "border-border"}`}
                      onClick={() => openDraftEditor(card.id)}
                    >
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <label className="inline-flex items-center mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={card.isSelected}
                            onChange={() => handleToggleCardSelection(card.id)}
                            className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
                          />
                        </label>
                        <h4 className="text-base font-semibold leading-tight text-foreground/90 group-hover:text-accent transition-colors">
                          {card.title}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDraftEditor(card.id);
                          }}
                          className="inline-flex items-center h-8 px-2.5 rounded-md border border-input text-xs font-medium hover:bg-accent/5"
                        >
                          <Edit3 className="h-3.5 w-3.5 mr-1" /> {t("aiPanel.review")}
                        </button>
                      </div>

                      <div className="text-sm text-muted-foreground leading-relaxed mb-4 pointer-events-none">
                        <UnifiedBrickList
                          bricks={card.bricks.slice(0, 2)}
                          canEdit={false}
                          onUpdateBrick={() => { }}
                          onDeleteBrick={() => { }}
                          onReorderBricks={() => { }}
                          onAddBrick={() => { }}
                          users={teamMembers}
                        />
                        {card.bricks.length > 2 && <div className="text-[10px] mt-1 italic opacity-60">{t("aiPanel.moreBricks", { count: card.bricks.length - 2 })}</div>}
                      </div>

                      <div className="rounded-md border border-border/60 p-3 bg-background/40 mb-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">{t("aiPanel.individualDestination")}</span>
                          {card.customBoardId ? (
                            <button
                              onClick={() => handleDisableCustomDestination(card.id)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {t("aiPanel.useGlobalDestination")}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleEnableCustomDestination(card.id)}
                              className="text-xs text-accent hover:underline"
                            >
                              {t("aiPanel.defineOwnDestination")}
                            </button>
                          )}
                        </div>

                        {card.customBoardId && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Select
                              sizeVariant="sm"
                              value={card.customBoardId}
                              onChange={(e) => handleCustomBoardChange(card.id, e.target.value)}
                              placeholder={t("aiPanel.boardPlaceholder")}
                              options={boards.map((board) => ({ value: board.id, label: board.name }))}
                            />
                            <Select
                              sizeVariant="sm"
                              value={card.customListId || ""}
                              onChange={(e) => handleCustomListChange(card.id, e.target.value)}
                              disabled={!card.customBoardId || (card.availableLists || []).length === 0}
                              placeholder={t("aiPanel.listPlaceholder")}
                              options={(card.availableLists || []).map((list) => ({ value: list.id, label: list.name }))}
                            />
                          </div>
                        )}
                      </div>
                      <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{card.isSelected ? t("aiPanel.selectedToSend") : t("aiPanel.notSelected")}</span>
                        <span className="text-accent">{t("aiPanel.clickToEdit")}</span>
                      </div>
                    </div>
                  ))}

                  {generationType === 'documents' && previewDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all p-5 flex flex-col group cursor-pointer ${doc.isSelected ? "border-accent/40" : "border-border"}`}
                    >
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <label className="inline-flex items-center mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={doc.isSelected}
                            onChange={() => handleToggleDocSelection(doc.id)}
                            className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
                          />
                        </label>
                        <h4 className="flex-1 text-base font-semibold leading-tight text-foreground/90">
                          {doc.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">DOC</span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground pointer-events-none opacity-80">
                        <UnifiedBrickList
                          bricks={doc.bricks.slice(0, 3)}
                          canEdit={false}
                          onUpdateBrick={() => { }}
                          onDeleteBrick={() => { }}
                          onReorderBricks={() => { }}
                          onAddBrick={() => { }}
                          users={teamMembers}
                        />
                      </div>
                    </div>
                  ))}

                  {generationType === 'boards' && previewBoards.map((board) => (
                    <div
                      key={board.id}
                      className={`relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all p-5 flex flex-col group cursor-pointer ${board.isSelected ? "border-accent/40" : "border-border"}`}
                    >
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <label className="inline-flex items-center mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={board.isSelected}
                            onChange={() => handleToggleBoardSelection(board.id)}
                            className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
                          />
                        </label>
                        <h4 className="flex-1 text-base font-semibold leading-tight text-foreground/90">
                          {board.name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">BOARD</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {board.lists.map((l: any, i: number) => (
                          <div key={i} className="text-[11px] bg-secondary/50 border border-border px-2 py-1 rounded-md flex items-center gap-1.5">
                            <Layout className="h-3 w-3 opacity-50" />
                            {l.name}
                            <span className="opacity-40 ml-1">({l.cards?.length || 0})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {generationType === 'scripts' && previewScripts.map((script) => (
                    <div
                      key={script.id}
                      className={`relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all p-5 flex flex-col group cursor-pointer ${script.isSelected ? "border-accent/40" : "border-border"}`}
                    >
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <label className="inline-flex items-center mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={script.isSelected}
                            onChange={() => handleToggleScriptSelection(script.id)}
                            className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
                          />
                        </label>
                        <h4 className="flex-1 text-base font-semibold leading-tight text-foreground/90">
                          {script.name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">SCRIPT</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{script.description || t("aiPanel.noDescription")}</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-[11px] bg-secondary/50 border border-border px-2 py-1 rounded-md">{t("aiPanel.nodesLabel")}: {script.nodes.length}</span>
                        <span className="text-[11px] bg-secondary/50 border border-border px-2 py-1 rounded-md">{t("aiPanel.connectionsLabel")}: {script.connections.length}</span>
                      </div>

                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleScriptPreview(script.id);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expandedScriptPreviewIds.includes(script.id) ? t("aiPanel.hidePreview") : t("aiPanel.previewScript")}
                        </button>
                      </div>

                      {expandedScriptPreviewIds.includes(script.id) && (
                        <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3 space-y-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">{t("aiPanel.nodesLabel")}</p>
                            <pre className="text-[11px] whitespace-pre-wrap text-foreground/80 leading-relaxed">
{script.nodes.map((node) => `- ${node.id} | ${node.kind}${node.label ? ` | ${node.label}` : ''}`).join('\n')}
                            </pre>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">{t("aiPanel.connectionsLabel")}</p>
                            <pre className="text-[11px] whitespace-pre-wrap text-foreground/80 leading-relaxed">
{script.connections.length > 0
  ? script.connections.map((edge) => `- ${edge.source} -> ${edge.target}`).join('\n')
  : `- ${t("aiPanel.noConnections")}`}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {generationType === 'agents' && previewAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className={`relative rounded-xl border bg-card shadow-sm hover:shadow-md transition-all p-5 flex flex-col group cursor-pointer ${agent.isSelected ? "border-accent/40" : "border-border"}`}
                    >
                      <div className="flex justify-between items-start gap-4 mb-3">
                        <label className="inline-flex items-center mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={agent.isSelected}
                            onChange={() => handleToggleAgentSelection(agent.id)}
                            className="h-4 w-4 rounded border-input text-accent focus:ring-accent"
                          />
                        </label>
                        <h4 className="flex-1 text-base font-semibold leading-tight text-foreground/90">{agent.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">AGENT</span>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">{agent.description}</p>

                      <div className="rounded-md border border-border/60 p-3 bg-background/40 mb-3">
                        <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Reasoning</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{agent.reasoning}</p>
                      </div>

                      <div className="rounded-md border border-border/60 p-3 bg-background/40 mb-3">
                        <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">{t("aiPanel.agentResponse")}</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{agent.response}</p>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {agent.selectedTools.map((tool) => (
                          <span key={tool} className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent font-semibold uppercase tracking-wide">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {activeCardDetails && (
        <CardDetailModal
          isOpen={true}
          onClose={closeCardDetailsAndAdvance}
          card={activeCardDetails.card}
          listId={activeCardDetails.listId}
          listName={activeCardDetails.listName}
          boardId={activeCardDetails.boardId}
          boardName={activeCardDetails.boardName}
        />
      )}

      {editingDraftId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t("aiPanel.reviewDraft")}</h3>
              <button
                onClick={() => setEditingDraftId(null)}
                className="rounded-full p-2 hover:bg-accent/10 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t("aiPanel.titleLabel")}</label>
                <input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder={t("aiPanel.cardTitlePlaceholder")}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">{t("aiPanel.descriptionLabel")}</label>
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  className="w-full min-h-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder={t("aiPanel.contentEditPlaceholder")}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("aiPanel.cardDetailHelper")}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingDraftId(null)}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-input text-sm hover:bg-accent/5"
              >
                {t("aiPanel.cancel")}
              </button>
              <button
                onClick={handleSaveDraftEditor}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
              >
                {t("aiPanel.saveChanges")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
