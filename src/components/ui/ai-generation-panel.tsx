"use client";

import { useState, useEffect, useRef } from "react";
import { X, UploadCloud, FileAudio, Bot, Sparkles, Send, Loader2, Edit3, CheckSquare, ChevronDown, Wrench } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, getBoard, ListView, createCard, createCardBrick, generateCardsWithAi, generateDocumentsWithAi, generateBoardsWithAi, createBoard, createList, chatWithAiScope } from "@/lib/api/contracts";
import { CardDetailModal } from "./card-detail-modal";
import { listDocuments, DocumentSummary, createDocument, createDocumentBrick } from "@/lib/api/documents";
import { UnifiedBrickList } from "../bricks/unified-brick-list";
import { listTeamMembers } from "@/lib/api/contracts";
import { Plus, Layout, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { ReferenceTokenInput } from "./reference-token-input";
import { createScript, saveScriptGraph } from "@/lib/api/scripts";

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

type ExtractSourceKind = "pdf" | "audio" | "image" | "excel" | "text";
type GenerationType = 'cards' | 'documents' | 'boards' | 'scripts' | 'agents';
type AgentToolId = 'search' | 'edit' | 'investigate' | 'docs' | 'boards' | 'scripts';

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

const AGENT_TOOL_OPTIONS: Array<{ id: AgentToolId; label: string; description: string }> = [
  { id: 'search', label: 'Search', description: 'Busca información en docs, cards y contexto' },
  { id: 'edit', label: 'Edit', description: 'Edita contenido con acciones propuestas' },
  { id: 'investigate', label: 'Investigate', description: 'Analiza métricas y estado del workspace' },
  { id: 'docs', label: 'Docs', description: 'Crea y organiza documentos' },
  { id: 'boards', label: 'Boards', description: 'Crea y actualiza tableros y listas' },
  { id: 'scripts', label: 'Scripts', description: 'Propone y configura automatizaciones' },
];

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

  if (fileType === "application/pdf" || fileName.endsWith(".pdf")) return "pdf";
  if (fileType.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/.test(fileName)) return "audio";
  if (fileType.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp|tiff)$/.test(fileName)) return "image";
  if (
    fileType.includes("spreadsheet") ||
    fileType.includes("excel") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv")
  ) {
    return "excel";
  }
  return "text";
};

export function AiGenerationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { accessToken, activeTeamId } = useSession();

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string>("");

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
  const [enabledAgentTools, setEnabledAgentTools] = useState<AgentToolId[]>(['search', 'investigate', 'docs', 'boards', 'scripts']);
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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleGenerate = async () => {
    if (!selectedFile && !fileText.trim()) return;
    setIsGenerating(true);
    setGenerationProgress(10);
    setPreviewCards([]);
    setPreviewDocuments([]);
    setPreviewBoards([]);
    setPreviewScripts([]);
    setPreviewAgents([]);
    setExpandedScriptPreviewIds([]);

    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 15);
      });
    }, 800);

    try {
      let extractedText = "";

      if (selectedFile) {
        const fileType = selectedFile.type;
        const fileName = selectedFile.name.toLowerCase();
        const sourceKind = inferSourceKind(selectedFile);

        // Read plain text formats directly in the browser
        if (fileType.includes("text") || fileType.includes("json") || fileType.includes("csv") || fileName.endsWith(".md") || fileName.endsWith(".txt") || fileName.endsWith(".csv")) {
          extractedText = await selectedFile.text();
        }
        // Parse binary / complex formats via Backend API
        else {
          const formData = new FormData();
          formData.append("file", selectedFile);
          formData.append("sourceKind", sourceKind);

          const extractRes = await fetch(`${API}/ai/extract`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`
            },
            body: formData
          });

          if (extractRes.ok) {
            const extractData: { text?: string; warnings?: string[] } = await extractRes.json();
            extractedText = extractData.text || "";

            if (Array.isArray(extractData.warnings) && extractData.warnings.length > 0) {
              pushToast("info", extractData.warnings[0]);
            }

            if (!extractedText.trim()) {
              extractedText = `(No se pudo extraer texto util del archivo ${selectedFile.name}. Usa el campo de contexto para guiar a la IA.)`;
            }
          } else {
            console.error("File extraction failed");
            pushToast("error", "No se pudo extraer el archivo. Se intentara continuar con el contexto manual.");
            extractedText = `(No se pudo extraer el contenido de ${selectedFile.name})`;
          }
        }
      }

      setGenerationProgress(20);

      // Combine user text context + extracted file logic
      let finalContent = "";
      if (fileText.trim()) {
        finalContent += `Contexto Adicional del Usuario:\n${fileText.trim()}\n\n`;
      }
      if (selectedFile && extractedText) {
        finalContent += `Contenido del Archivo (${selectedFile.name}):\n${extractedText}`;
      } else if (!selectedFile && fileText.trim()) {
        finalContent = fileText;
      }

      // Fallback
      if (!finalContent.trim()) {
        finalContent = "El usuario no proporcionó información suficiente.";
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
        if (!activeTeamId) throw new Error('No active team selected');

        const toolsSummary = enabledAgentTools.length > 0
          ? enabledAgentTools.join(', ')
          : 'ninguna';

        const agentPrompt = `
Eres un diseñador de agentes para Killio.
Herramientas habilitadas: ${toolsSummary}

Con base en el contexto del usuario, devuelve SOLO JSON con este formato exacto:
{
  "name": "Nombre del agente",
  "description": "Qué hace",
  "reasoning": "Resumen breve de razonamiento",
  "response": "Respuesta conversacional del agente"
}

Contexto del usuario:
${finalContent}
        `.trim();

        const chatRes = await chatWithAiScope(
          {
            scope: 'team',
            scopeId: activeTeamId,
            message: agentPrompt,
            contextSummary: existingEntitiesSummary,
          },
          accessToken || '',
        );

        const parsed = extractJsonObject(chatRes.text);
        const draft: GeneratedAgentDraft = {
          id: `draft-agent-${Date.now()}`,
          name: String(parsed?.name || 'Agent Draft'),
          description: String(parsed?.description || 'Agente generado para este workspace'),
          reasoning: String(parsed?.reasoning || 'No se devolvió razonamiento estructurado.'),
          response: String(parsed?.response || chatRes.text || ''),
          selectedTools: [...enabledAgentTools],
          isSelected: true,
        };

        setPreviewAgents([draft]);
      }

      setGenerationProgress(100);
    } catch (err) {
      console.error("AI Generation failed", err);
      pushToast("error", "Error conectando con la IA.");
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
        title: editingTitle.trim() || "Tarjeta sin titulo",
        bricks: [{ kind: 'text', content: { markdown: editingDescription } }],
      }
      : card
    ));
    setEditingDraftId(null);
    setEditingTitle("");
    setEditingDescription("");
    pushToast("success", "Borrador actualizado.");
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
      pushToast("error", "No se pudieron cargar las listas del tablero elegido.");
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
        pushToast("error", "Selecciona un tablero y lista de destino antes de enviar.");
        return;
      }
      const selectedDrafts = previewCards.filter((card) => card.isSelected);
      if (selectedDrafts.length === 0) {
        pushToast("info", "Selecciona al menos una tarjeta para enviar.");
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
            const card = await createCard({ listId: entry.listId, title: entry.draft.title?.trim() || "Tarjeta sin titulo" }, accessToken);
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
          pushToast("success", `Se enviaron ${createdCards.length} tarjetas.`);
        }
      } catch (err: any) {
        pushToast("error", "Error al enviar tarjetas: " + (err?.message || "Error desconocido"));
      } finally {
        setIsDispatchingSelected(false);
      }
    } else if (generationType === 'documents') {
      const selectedDocs = previewDocuments.filter(d => d.isSelected);
      if (selectedDocs.length === 0) return;
      setIsDispatchingSelected(true);
      try {
        for (const docDraft of selectedDocs) {
          const doc = await createDocument({ teamId: activeTeamId, title: docDraft.title }, accessToken);
          if (docDraft.bricks) {
            for (let i = 0; i < docDraft.bricks.length; i++) {
              const b = docDraft.bricks[i];
              await createDocumentBrick(doc.id, { kind: b.kind, position: i, content: b.content }, accessToken);
            }
          }
        }
        setPreviewDocuments(prev => prev.filter(d => !selectedDocs.find(sd => sd.id === d.id)));
        pushToast("success", `Se crearon ${selectedDocs.length} documentos.`);
      } catch (err: any) {
        pushToast("error", "Error al crear documentos.");
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
        pushToast("success", `Se crearon ${selectedBoards.length} tableros.`);
      } catch (err: any) {
        pushToast("error", "Error al crear tableros.");
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
        pushToast('success', `Se crearon ${selectedScripts.length} scripts.`);
      } catch (err: any) {
        pushToast('error', `Error al crear scripts: ${err?.message || 'Error desconocido'}`);
      } finally {
        setIsDispatchingSelected(false);
      }
    } else if (generationType === 'agents') {
      const selectedAgents = previewAgents.filter((agent) => agent.isSelected);
      if (selectedAgents.length === 0 || !activeTeamId) return;

      setIsDispatchingSelected(true);
      try {
        for (const agentDraft of selectedAgents) {
          const agentDocument = await createDocument(
            {
              teamId: activeTeamId,
              title: `Agent: ${agentDraft.name}`,
            },
            accessToken,
          );

          const toolList = agentDraft.selectedTools.map((tool) => `- ${tool}`).join('\n');
          const markdown = `## ${agentDraft.name}\n\n${agentDraft.description}\n\n### Tools habilitadas\n${toolList || '- (ninguna)'}\n\n### Reasoning\n${agentDraft.reasoning}\n\n### Respuesta\n${agentDraft.response}`;

          await createDocumentBrick(
            agentDocument.id,
            {
              kind: 'text',
              position: 0,
              content: { markdown },
            },
            accessToken,
          );
        }

        setPreviewAgents((prev) => prev.filter((agent) => !selectedAgents.find((selected) => selected.id === agent.id)));
        pushToast('success', `Se crearon ${selectedAgents.length} agentes como documentos de configuración.`);
      } catch (err: any) {
        pushToast('error', `Error al crear agentes: ${err?.message || 'Error desconocido'}`);
      } finally {
        setIsDispatchingSelected(false);
      }
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
        <div className="relative w-full max-w-6xl rounded-2xl border border-border bg-card shadow-2xl flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200 min-h-[600px] max-h-[90vh]">

          {/* Left Panel: Upload & Input */}
          <div className="flex-1 lg:max-w-md border-r border-border p-6 flex flex-col bg-card/50">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold flex items-center tracking-tight">
                <Bot className="mr-2 h-7 w-7 text-accent" />
                AI Draft Studio
              </h2>
              <button onClick={onClose} className="md:hidden rounded-full p-2 hover:bg-accent/10 text-muted-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sube tus Pdfs, Excels, notas, audios o imágenes. Nuestra IA analizará el contenido estrictamente para extraer tarjetas descriptivas listas para refinar.
              </p>
            </div>

            <div className="flex-1 flex flex-col relative overflow-visible">
              {/* Dropzone or File Indicator */}
              {!selectedFile ? (
                <div
                  className={`mb-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 transition-all duration-200 ${dragActive ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/60 hover:bg-accent/5 cursor-pointer"
                    }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <UploadCloud className="h-6 w-6 text-accent mb-2" />
                  <h3 className="text-sm font-semibold text-foreground">Sube tu archivo PDF, CSV, Audio...</h3>
                  <input id="file-upload" type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between border rounded-xl border-accent/30 bg-accent/5 p-4 shadow-sm relative">
                  <div className="flex items-center">
                    <FileAudio className="h-8 w-8 text-accent mr-3" />
                    <div>
                      <h4 className="font-medium text-sm truncate w-48 text-foreground" title={selectedFile.name}>{selectedFile.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedFile(null); }}
                    className="p-1.5 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Eliminar archivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Text Area (Main Content or Extra Context) */}
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  {selectedFile ? "Contexto Adicional (Opcional)" : "Pega tus notas o requerimientos"}
                </label>
                <ReferenceTokenInput
                  value={fileText}
                  onChange={setFileText}
                  onPasteImage={(file) => setSelectedFile(file)}
                  placeholder={selectedFile ? "Ej. Filtra solo las tareas de backend..." : "Añade toda la información necesaria para crear las tarjetas..."}
                  documents={teamDocs}
                  boards={boards}
                  users={teamMembers}
                  className="flex-1"
                  inputClassName="h-full w-full min-h-[160px] rounded-xl bg-background px-4 py-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-shadow align-top"
                />

              </div>

              {/* Generate Action */}
              <div className="mt-6">
                {isGenerating ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span className="flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Analizando contenido...</span>
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
                      disabled={!selectedFile && !fileText.trim()}
                      className="flex-1 inline-flex items-center justify-center h-11 rounded-lg bg-accent text-accent-foreground font-medium hover:bg-accent/90 shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Sparkles className="h-5 w-5 mr-2" />
                      {generationType === 'cards'
                        ? 'Generar Tarjetas'
                        : generationType === 'documents'
                          ? 'Generar Documentos'
                          : generationType === 'boards'
                            ? 'Generar Tableros'
                            : generationType === 'scripts'
                              ? 'Generar Scripts'
                              : 'Diseñar Agente'}
                    </button>
                    <div className="flex gap-2">
                      <div className="relative" ref={generationMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowGenerationTypeMenu((prev) => !prev)}
                          className="h-11 w-11 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-accent/5 transition-colors"
                          title="Cambiar tipo de generación"
                        >
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        </button>
                        {showGenerationTypeMenu && (
                          <div className="absolute bottom-full right-0 w-52 bg-card border border-border rounded-xl shadow-xl p-1.5 transition-all origin-bottom-right z-30 mb-2">
                          <button onClick={() => { setGenerationType('cards'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'cards' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Layout className="h-3.5 w-3.5" /> Generar Tarjetas
                          </button>
                          <button onClick={() => { setGenerationType('documents'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'documents' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <FileText className="h-3.5 w-3.5" /> Generar Documentos
                          </button>
                          <button onClick={() => { setGenerationType('boards'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'boards' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Layout className="h-3.5 w-3.5" /> Generar Tableros
                          </button>
                          <button onClick={() => { setGenerationType('scripts'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'scripts' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Sparkles className="h-3.5 w-3.5" /> Generar Scripts
                          </button>
                          <button onClick={() => { setGenerationType('agents'); setShowGenerationTypeMenu(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-semibold ${generationType === 'agents' ? 'bg-accent/10 text-accent' : 'hover:bg-accent/5 text-muted-foreground'}`}>
                            <Bot className="h-3.5 w-3.5" /> Modo Agente
                          </button>
                        </div>
                        )}
                      </div>

                      {generationType === 'agents' && (
                        <div className="relative group/tools">
                          <button
                            type="button"
                            className="h-11 w-11 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-accent/5 transition-colors"
                            title="Tools del agente"
                          >
                            <Wrench className="h-4.5 w-4.5 text-muted-foreground" />
                          </button>
                          <div className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-xl border border-border bg-card shadow-xl p-2 opacity-0 pointer-events-none transition-all duration-150 group-hover/tools:opacity-100 group-hover/tools:pointer-events-auto">
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {AGENT_TOOL_OPTIONS.map((tool) => {
                                const selected = enabledAgentTools.includes(tool.id);
                                return (
                                  <button
                                    key={tool.id}
                                    type="button"
                                    onClick={() => handleToggleAgentTool(tool.id)}
                                    className={`w-full text-left rounded-lg border p-2 transition-colors ${selected ? 'border-accent/40 bg-accent/5' : 'border-transparent hover:border-border hover:bg-secondary/40'}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-semibold text-foreground">{tool.label}</span>
                                      {selected && <CheckCircle2 className="h-3.5 w-3.5 text-accent" />}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-1">{tool.description}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Preview Area */}
          <div className="flex-1 bg-background flex flex-col relative w-full overflow-hidden">
            <div className="hidden md:flex absolute top-4 right-4 z-10">
              <button onClick={onClose} className="rounded-full p-2 hover:bg-accent/10 text-muted-foreground transition-colors bg-background/50 backdrop-blur-sm border border-border/50 shadow-sm">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 md:p-8 flex-1 flex flex-col overflow-y-auto hide-scrollbar">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-lg text-foreground">
                  {generationType === 'cards'
                    ? 'Borradores de Tarjetas'
                    : generationType === 'documents'
                      ? 'Borradores de Documentos'
                      : generationType === 'boards'
                        ? 'Borradores de Tableros'
                        : generationType === 'scripts'
                          ? 'Borradores de Scripts'
                          : 'Borradores de Agentes'}
                </h3>
                {((generationType === 'cards' && previewCards.length > 0)
                  || (generationType === 'documents' && previewDocuments.length > 0)
                  || (generationType === 'boards' && previewBoards.length > 0)
                  || (generationType === 'scripts' && previewScripts.length > 0)
                  || (generationType === 'agents' && previewAgents.length > 0)) && (
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {generationType === 'cards'
                        ? previewCards.length
                        : generationType === 'documents'
                          ? previewDocuments.length
                          : generationType === 'boards'
                            ? previewBoards.length
                            : generationType === 'scripts'
                              ? previewScripts.length
                              : previewAgents.length} en espera
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
                        || (generationType === 'agents' && previewAgents.every(a => a.isSelected))) ? "Deseleccionar" : "Seleccionar"} todas
                    </button>
                  </div>
                )}
              </div>

              {(
                (generationType === 'cards' && previewCards.length === 0) ||
                (generationType === 'documents' && previewDocuments.length === 0) ||
                (generationType === 'boards' && previewBoards.length === 0) ||
                (generationType === 'scripts' && previewScripts.length === 0) ||
                (generationType === 'agents' && previewAgents.length === 0)
              ) ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-70">
                  <div className="h-24 w-24 rounded-full bg-accent/5 flex items-center justify-center mb-6">
                    <Bot className="h-12 w-12 text-accent/40" />
                  </div>
                  <h4 className="text-lg font-medium mb-2">Aún no hay resultados</h4>
                  <p className="text-sm text-center text-muted-foreground max-w-sm">
                    {generationType === 'cards'
                      ? 'Sube un archivo o pega texto y haz clic en "Generar Tarjetas" para extraer ítems procesables.'
                      : generationType === 'documents'
                        ? 'Sube un archivo o pega texto y haz clic en "Generar Documentos" para crear documentos.'
                        : generationType === 'boards'
                          ? 'Sube un archivo o pega texto y haz clic en "Generar Tableros" para crear tableros.'
                          : generationType === 'scripts'
                            ? 'Sube un archivo o pega texto y haz clic en "Generar Scripts" para crear automatizaciones.'
                            : 'Describe tu agente y habilita tools para diseñarlo con reasoning y plan de acción.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1 pb-10">
                  {generationType === 'cards' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        Paso 1: haz clic en cualquier tarjeta para leerla y editarla. Paso 2: elige un tablero/lista y envía una o varias tarjetas seleccionadas.
                      </p>
                    </div>
                  )}
                  {generationType === 'documents' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        Selecciona los documentos que deseas crear y presiona "Crear documentos" para agregarlos a tu espacio.
                      </p>
                    </div>
                  )}
                  {generationType === 'boards' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        Selecciona los tableros que deseas crear y presiona "Crear tableros" para agregarlos a tu equipo.
                      </p>
                    </div>
                  )}
                  {generationType === 'scripts' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        Revisa la estructura del workflow y crea los scripts seleccionados para editarlos luego en el builder visual.
                      </p>
                    </div>
                  )}
                  {generationType === 'agents' && (
                    <div className="bg-primary/5 border border-primary/20 text-primary-foreground/90 p-4 rounded-lg text-sm flex items-start">
                      <Sparkles className="h-5 w-5 mr-3 shrink-0 text-primary" />
                      <p className="text-muted-foreground">
                        El agente usa las tools habilitadas para razonar, investigar y proponer acciones. Puedes guardar su configuración como documento.
                      </p>
                    </div>
                  )}

                  {generationType === 'cards' && (
                    <div className="bg-card border border-border rounded-lg p-4 flex flex-col md:flex-row gap-3 md:items-center">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold md:min-w-[150px]">Paso 2: Destino</div>
                      <div className="flex-1 min-w-[160px] relative">
                        <select
                          className="w-full h-9 appearance-none bg-background border border-input rounded-md pl-3 pr-8 text-xs focus-visible:ring-1 focus-visible:ring-accent font-medium text-muted-foreground"
                          value={defaultBoardId}
                          onChange={(e) => setDefaultBoardId(e.target.value)}
                        >
                          <option value="" disabled>Selecciona tablero...</option>
                          {boards.map((board) => (
                            <option key={board.id} value={board.id}>{board.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>
                      <div className="flex-1 min-w-[160px] relative">
                        <select
                          className="w-full h-9 appearance-none bg-background border border-input rounded-md pl-3 pr-8 text-xs focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 font-medium text-muted-foreground"
                          value={defaultListId}
                          onChange={(e) => setDefaultListId(e.target.value)}
                          disabled={!defaultBoardId || defaultLists.length === 0}
                        >
                          <option value="" disabled>
                            {!defaultBoardId ? "Tablero primero" : defaultLists.length === 0 ? "Sin listas" : "Selecciona lista..."}
                          </option>
                          {defaultLists.map((list) => (
                            <option key={list.id} value={list.id}>{list.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      </div>
                    <button
                      onClick={handleDispatchSelected}
                      disabled={isDispatchingSelected || !defaultBoardId || !defaultListId || !previewCards.some((card) => card.isSelected)}
                      className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground font-semibold hover:bg-accent/90 text-xs shadow-sm transition-all whitespace-nowrap disabled:opacity-50"
                    >
                      {isDispatchingSelected ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar seleccionadas
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
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear documentos
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
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear tableros
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
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Crear scripts
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
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Guardar agentes
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
                          <Edit3 className="h-3.5 w-3.5 mr-1" /> Revisar
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
                        {card.bricks.length > 2 && <div className="text-[10px] mt-1 italic opacity-60">+{card.bricks.length - 2} bricks más...</div>}
                      </div>

                      <div className="rounded-md border border-border/60 p-3 bg-background/40 mb-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">Destino individual (opcional)</span>
                          {card.customBoardId ? (
                            <button
                              onClick={() => handleDisableCustomDestination(card.id)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Usar destino global
                            </button>
                          ) : (
                            <button
                              onClick={() => handleEnableCustomDestination(card.id)}
                              className="text-xs text-accent hover:underline"
                            >
                              Definir destino propio
                            </button>
                          )}
                        </div>

                        {card.customBoardId && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="relative">
                              <select
                                className="w-full h-8 appearance-none bg-background border border-input rounded-md pl-2.5 pr-7 text-xs focus-visible:ring-1 focus-visible:ring-accent font-medium text-muted-foreground"
                                value={card.customBoardId}
                                onChange={(e) => handleCustomBoardChange(card.id, e.target.value)}
                              >
                                <option value="" disabled>Tablero...</option>
                                {boards.map((board) => (
                                  <option key={board.id} value={board.id}>{board.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                            </div>
                            <div className="relative">
                              <select
                                className="w-full h-8 appearance-none bg-background border border-input rounded-md pl-2.5 pr-7 text-xs focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50 font-medium text-muted-foreground"
                                value={card.customListId || ""}
                                onChange={(e) => handleCustomListChange(card.id, e.target.value)}
                                disabled={!card.customBoardId || (card.availableLists || []).length === 0}
                              >
                                <option value="" disabled>Lista...</option>
                                {(card.availableLists || []).map((list) => (
                                  <option key={list.id} value={list.id}>{list.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{card.isSelected ? "Seleccionada para enviar" : "No seleccionada"}</span>
                        <span className="text-accent">Haz click para editar</span>
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
                      <p className="text-sm text-muted-foreground mb-3">{script.description || 'Sin descripción'}</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className="text-[11px] bg-secondary/50 border border-border px-2 py-1 rounded-md">Nodos: {script.nodes.length}</span>
                        <span className="text-[11px] bg-secondary/50 border border-border px-2 py-1 rounded-md">Conexiones: {script.connections.length}</span>
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
                          {expandedScriptPreviewIds.includes(script.id) ? 'Ocultar previsualización' : 'Previsualizar script'}
                        </button>
                      </div>

                      {expandedScriptPreviewIds.includes(script.id) && (
                        <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3 space-y-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Nodos</p>
                            <pre className="text-[11px] whitespace-pre-wrap text-foreground/80 leading-relaxed">
{script.nodes.map((node) => `- ${node.id} | ${node.kind}${node.label ? ` | ${node.label}` : ''}`).join('\n')}
                            </pre>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Conexiones</p>
                            <pre className="text-[11px] whitespace-pre-wrap text-foreground/80 leading-relaxed">
{script.connections.length > 0
  ? script.connections.map((edge) => `- ${edge.source} -> ${edge.target}`).join('\n')
  : '- Sin conexiones'}
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
                        <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">Respuesta del agente</p>
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
              <h3 className="text-lg font-semibold">Revisar Borrador</h3>
              <button
                onClick={() => setEditingDraftId(null)}
                className="rounded-full p-2 hover:bg-accent/10 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Titulo</label>
                <input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="Titulo de la tarjeta"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Descripcion</label>
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  className="w-full min-h-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder="Revisa y edita el contenido antes de enviarlo..."
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Luego en el detalle de la card creada podras adjuntar imagenes, etiquetas y asignados.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditingDraftId(null)}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-input text-sm hover:bg-accent/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveDraftEditor}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
