"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  FileText,
  LayoutDashboard,
  CreditCard,
  User,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Folder,
} from "lucide-react";
import { BoardSummary, getMesh } from "@/lib/api/contracts";
import { DocumentSummary, getDocument } from "@/lib/api/documents";
import { useSession } from "@/components/providers/session-provider";
import { WorkspaceMemberLike } from "@/lib/workspace-members";

type MentionType = "board" | "mesh" | "doc" | "card" | "user" | "folder";
type AllowedMentionType = MentionType | "document";

type ActiveBrick = {
  id: string;
  kind: string;
  content?: Record<string, any>;
  documentId?: string;
};

export interface ReferencePickerSelection {
  token: string;
  label: string;
  category: "mention" | "deep-local" | "deep-doc" | "deep-mesh" | "template";
  mentionType?: MentionType;
}

interface MentionResult extends ReferencePickerSelection {
  search: string;
  subtitle?: string;
  avatarUrl?: string | null;
}

interface ReferencePickerProps {
  onSelect: (item: ReferencePickerSelection) => void;
  onClose: () => void;
  boards: BoardSummary[];
  documents: DocumentSummary[];
  folders?: any[];
  users: WorkspaceMemberLike[];
  cards?: Array<{ id: string; title: string }>;
  activeBricks?: ActiveBrick[];
  localScopeId?: string;
  docScopeId?: string;
  allowedTypes?: AllowedMentionType[];
  onLoadDocumentsInFolder?: (folderId: string) => Promise<DocumentSummary[]>;
}

type PickerMode = "root" | "local-bricks" | "doc-list" | "doc-bricks" | "mesh-list" | "mesh-bricks" | "selectors";
type SelectorOption = { value: string; label: string };
type SelectorSuggestion = SelectorOption & { isCustom?: boolean };

const selectorOptionsByKind: Record<string, SelectorOption[]> = {
  text: [
    { value: "line:1", label: "Primera linea" },
    { value: "line:1-3", label: "Lineas 1-3" },
    { value: "chars:0-120", label: "Primeros 120 caracteres" },
  ],
  checklist: [
    { value: "item:1", label: "Primer item" },
    { value: "items:1-3", label: "Items 1-3" },
    { value: "checked", label: "Items completados" },
    { value: "unchecked", label: "Items pendientes" },
  ],
  table: [
    { value: "cell:A1", label: "Celda A1" },
    { value: "range:A1:A1", label: "Rango A1:A1" },
    { value: "row:1", label: "Fila 1" },
    { value: "col:A", label: "Columna A" },
    { value: "csv", label: "Tabla completa CSV" },
  ],
  accordion: [
    { value: "title", label: "Titulo" },
    { value: "body", label: "Contenido" },
  ],
  ai: [
    { value: "prompt", label: "Prompt" },
    { value: "response", label: "Respuesta" },
  ],
  media: [
    { value: "url", label: "URL" },
    { value: "title", label: "Titulo" },
    { value: "caption", label: "Caption" },
  ],
  image: [{ value: "url", label: "URL" }],
  file: [{ value: "url", label: "URL" }],
  graph: [
    { value: "series:value", label: "Serie value" },
    { value: "point:1", label: "Punto 1" },
  ],
};

function getBrickLabel(brick: ActiveBrick): string {
  const payload = brick.content || {};
  if (brick.kind === "text") {
    const text = String(payload.text || payload.markdown || "Texto").trim();
    return text.slice(0, 36) || "Texto";
  }
  if (brick.kind === "accordion") {
    return String(payload.title || "Accordion").slice(0, 36) || "Accordion";
  }
  if (brick.kind === "checklist") {
    const count = Array.isArray(payload.items) ? payload.items.length : 0;
    return `Checklist (${count})`;
  }
  return brick.kind;
}

function getSelectorOptions(kind: string): SelectorOption[] {
  return selectorOptionsByKind[String(kind || "").toLowerCase()] || [{ value: "line:1", label: "Primera linea" }];
}

function isCellAddress(value: string): boolean {
  return /^[A-Z]+[1-9]\d*$/i.test(value.trim());
}

function isRangeAddress(value: string): boolean {
  const [a, b] = value.split(":");
  if (!a || !b) return false;
  return isCellAddress(a) && isCellAddress(b);
}

function isInt(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function isIntRange(value: string): boolean {
  return /^\d+(?:-\d+)?$/.test(value.trim());
}

function validateCustomSelectorForKind(kind: string, selectorRaw: string): boolean {
  const trimmed = selectorRaw.trim();
  if (!trimmed) return false;

  const parts = trimmed.split(":");
  const name = (parts[0] || "").toLowerCase();
  const arg = parts.slice(1).join(":").trim();

  if (!name) return false;

  if (name === "json" || name === "raw" || name === "kind") {
    return parts.length === 1;
  }

  const normalizedKind = String(kind || "").toLowerCase();

  if (normalizedKind === "table") {
    if (name === "csv") return parts.length === 1;
    if (name === "cell") return isCellAddress(arg);
    if (name === "range") return isRangeAddress(arg);
    if (name === "row") return isInt(arg);
    if (name === "col") return /^[A-Z]+$/i.test(arg) || isInt(arg);
    return false;
  }

  if (normalizedKind === "checklist") {
    if (name === "checked" || name === "unchecked") return parts.length === 1;
    if (name === "item") return isInt(arg);
    if (name === "items") return isIntRange(arg);
    return false;
  }

  if (normalizedKind === "text") {
    if (name === "line" || name === "chars") return isIntRange(arg);
    return false;
  }

  if (normalizedKind === "accordion") {
    return (name === "title" || name === "body") && parts.length === 1;
  }

  if (normalizedKind === "ai") {
    return (name === "prompt" || name === "response") && parts.length === 1;
  }

  if (normalizedKind === "media" || normalizedKind === "image" || normalizedKind === "file") {
    return (name === "url" || name === "title" || name === "caption" || name === "mime" || name === "size" || name === "asset") && parts.length === 1;
  }

  if (normalizedKind === "graph") {
    if (name === "series") return arg.length > 0;
    if (name === "point") return isInt(arg);
    return false;
  }

  return /^[a-z][a-z0-9_-]*(?::.+)?$/i.test(trimmed);
}

export function ReferencePicker({
  onSelect,
  onClose,
  boards,
  documents,
  folders,
  users,
  cards = [],
  activeBricks = [],
  localScopeId = "local",
  allowedTypes,
  onLoadDocumentsInFolder,
}: ReferencePickerProps) {
  const { accessToken } = useSession();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PickerMode>("root");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState<DocumentSummary | null>(null);
  const [selectedMesh, setSelectedMesh] = useState<BoardSummary | null>(null);
  const [selectedBrick, setSelectedBrick] = useState<ActiveBrick | null>(null);
  const [selectedSource, setSelectedSource] = useState<"local" | "document" | "mesh" | null>(null);
  const [documentBricks, setDocumentBricks] = useState<ActiveBrick[]>([]);
  const [meshBricks, setMeshBricks] = useState<ActiveBrick[]>([]);

  // Expand documents to include nested ones from folders
  const expandedDocuments = useMemo(() => {
    if (!documents || !folders || folders.length === 0) return documents;
    
    // Map folder docs by folderId for quick lookup
    const docsInFolder = new Map<string, DocumentSummary[]>();
    for (const doc of documents) {
      if (doc.folderId) {
        if (!docsInFolder.has(doc.folderId)) {
          docsInFolder.set(doc.folderId, []);
        }
        docsInFolder.get(doc.folderId)!.push(doc);
      }
    }

    // Collect all docs: root + nested in each folder
    const result: DocumentSummary[] = [
      ...documents.filter((d) => !d.folderId),
    ];

    // Add docs from each folder
    for (const folder of folders) {
      const folderDocs = docsInFolder.get(folder.id) || [];
      result.push(...folderDocs);
    }

    return result;
  }, [documents, folders]);
  const [isLoadingDocBricks, setIsLoadingDocBricks] = useState(false);
  const [isLoadingMeshBricks, setIsLoadingMeshBricks] = useState(false);

  const normalizedAllowedTypes = useMemo(() => {
    if (!allowedTypes?.length) return undefined;
    const normalized = allowedTypes.map((type) => (type === "document" ? "doc" : type));
    if (normalized.includes("board") && !normalized.includes("mesh")) {
      normalized.push("mesh");
    }
    return normalized;
  }, [allowedTypes]);

  const meshBoards = useMemo(() => boards.filter((b) => b.boardType === "mesh"), [boards]);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (mode === "root") onClose();
        else handleBack();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
  }, [mode, onClose]);

  useEffect(() => {
    const selectedItem = itemRefs.current.get(selectedIndex);
    if (selectedItem) selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode, selectedDoc?.id, selectedMesh?.id, selectedBrick?.id, selectedSource]);

  const mentionResults = useMemo(() => {
    const q = query.toLowerCase().trim();
    let mentions: MentionResult[] = [
      ...boards.filter((b) => b.boardType !== "mesh").map((b) => ({
        token: `@[board:${b.id}:${b.name}]`,
        label: b.name,
        category: "mention" as const,
        mentionType: "board" as const,
        search: `board ${b.name} ${b.id}`.toLowerCase(),
      })),
      ...meshBoards.map((b) => ({
        token: `@[mesh:${b.id}:${b.name}]`,
        label: b.name,
        category: "mention" as const,
        mentionType: "mesh" as const,
        search: `mesh board ${b.name} ${b.id}`.toLowerCase(),
      })),
      ...expandedDocuments.map((d) => ({
        token: `@[doc:${d.id}:${d.title}]`,
        label: d.title,
        category: "mention" as const,
        mentionType: "doc" as const,
        search: `doc document ${d.title} ${d.id}`.toLowerCase(),
      })),
      ...users.map((u) => ({
        token: `@[user:${u.id}:${u.alias || u.name || u.email}]`,
        label: u.alias || u.name || u.email || "User",
        category: "mention" as const,
        mentionType: "user" as const,
        avatarUrl: u.avatarUrl!,
        search: `user ${u.alias || u.name} ${u.id}`.toLowerCase(),
      })),
        ...(cards || []).map((c) => ({
          token: `@[card:${c.id}:${c.title}]`,
          label: c.title,
          category: "mention" as const,
          mentionType: "card" as const,
          search: `card ${c.title} ${c.id}`.toLowerCase(),
        })),
        ...(folders || []).map((f) => ({
          token: `@[folder:${f.id}:${f.name}]`,
          label: f.name,
          category: "mention" as const,
          mentionType: "folder" as const,
          search: `folder ${f.name} ${f.id}`.toLowerCase(),
        })),
    ];

    if (normalizedAllowedTypes && normalizedAllowedTypes.length > 0) {
      mentions = mentions.filter(m => m.mentionType && normalizedAllowedTypes.includes(m.mentionType));
    }

    const filteredMentions = mentions.filter((m) => {
      if (!q) return true;
      return m.search.includes(q) || m.label.toLowerCase().includes(q);
    });

    let extra = [
      { key: "locals", label: "Locales", subtitle: "Referencia del documento actual" },
      { key: "documents", label: "Documentos", subtitle: "Referencia de otro documento" },
      { key: "meshes", label: "Meshes", subtitle: "Referencia de otro mesh board" },
    ];

    if (normalizedAllowedTypes && normalizedAllowedTypes.length > 0) {
      extra = []; // Hide extra complex pickers if restricted to just simple mentions
    }

    extra = extra.filter((it) => {
      if (!q) return true;
      return `${it.label} ${it.subtitle}`.toLowerCase().includes(q);
    });

    return { filteredMentions, extra };
  }, [boards, meshBoards, documents, users, cards, folders, query, normalizedAllowedTypes]);

  const currentSelectors = useMemo(() => {
    if (!selectedBrick) return [] as SelectorOption[];
    return getSelectorOptions(selectedBrick.kind);
  }, [selectedBrick]);

  const rootCount = mentionResults.filteredMentions.length + mentionResults.extra.length;
  const localBricksFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return activeBricks.filter((b) => {
      if (!q) return true;
      const label = getBrickLabel(b).toLowerCase();
      return label.includes(q) || b.kind.toLowerCase().includes(q);
    });
  }, [activeBricks, query]);

  const docsFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return expandedDocuments.filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [expandedDocuments, query]);

  const docBricksFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return documentBricks.filter((b) => {
      if (!q) return true;
      const label = getBrickLabel(b).toLowerCase();
      return label.includes(q) || b.kind.toLowerCase().includes(q);
    });
  }, [documentBricks, query]);

  const meshesFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return meshBoards.filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [meshBoards, query]);

  const meshBricksFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return meshBricks.filter((b) => {
      if (!q) return true;
      const label = getBrickLabel(b).toLowerCase();
      return label.includes(q) || b.kind.toLowerCase().includes(q);
    });
  }, [meshBricks, query]);

  const selectorFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return currentSelectors.filter((s) => !q || s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q));
  }, [currentSelectors, query]);

  const closeAndSelect = (item: ReferencePickerSelection) => {
    onSelect(item);
  };

  const openLocals = () => {
    setSelectedSource("local");
    setSelectedDoc(null);
    setSelectedMesh(null);
    setSelectedBrick(null);
    setQuery("");
    setMode("local-bricks");
  };

  const openDocuments = () => {
    setSelectedSource("document");
    setSelectedDoc(null);
    setSelectedMesh(null);
    setSelectedBrick(null);
    setDocumentBricks([]);
    setQuery("");
    setMode("doc-list");
  };

  const openMeshes = () => {
    setSelectedSource("mesh");
    setSelectedDoc(null);
    setSelectedMesh(null);
    setSelectedBrick(null);
    setMeshBricks([]);
    setQuery("");
    setMode("mesh-list");
  };

  const selectBrickAndGoSelectors = (brick: ActiveBrick) => {
    setSelectedBrick(brick);
    setQuery("");
    setMode("selectors");
  };

  const loadDocumentBricks = async (doc: DocumentSummary) => {
    setSelectedDoc(doc);
    setSelectedBrick(null);
    setQuery("");
    setIsLoadingDocBricks(true);
    try {
      if (!accessToken) {
        setDocumentBricks([]);
        setMode("doc-bricks");
        return;
      }
      const view = await getDocument(doc.id, accessToken);
      setDocumentBricks((view.bricks || []).map((b) => ({ id: b.id, kind: b.kind, content: b.content, documentId: b.documentId })));
      setMode("doc-bricks");
    } catch {
      setDocumentBricks([]);
      setMode("doc-bricks");
    } finally {
      setIsLoadingDocBricks(false);
    }
  };

  const loadMeshBricks = async (mesh: BoardSummary) => {
    setSelectedMesh(mesh);
    setSelectedBrick(null);
    setQuery("");
    setIsLoadingMeshBricks(true);
    try {
      if (!accessToken) {
        setMeshBricks([]);
        setMode("mesh-bricks");
        return;
      }
      const snapshot = await getMesh(mesh.id, accessToken);
      const bricks = Object.values(snapshot.state?.bricksById || {}).map((brick) => ({
        id: brick.id,
        kind: brick.kind,
        content: brick.content as Record<string, any>,
      }));
      setMeshBricks(bricks);
      setMode("mesh-bricks");
    } catch {
      setMeshBricks([]);
      setMode("mesh-bricks");
    } finally {
      setIsLoadingMeshBricks(false);
    }
  };

  const selectSelector = (selectorValue: string, selectorLabel: string) => {
    if (!selectedSource || !selectedBrick) return;

    if (selectedSource === "local") {
      const token = `#[${localScopeId}:${selectedBrick.id}:${selectorValue}]`;
      closeAndSelect({
        token,
        label: `${selectedBrick.kind} · ${selectorLabel}`,
        category: "deep-local",
      });
      return;
    }

    if (selectedSource === "document") {
      if (!selectedDoc) return;
      const token = `$[${selectedDoc.id}:${selectedBrick.id}:${selectorValue}]`;
      closeAndSelect({
        token,
        label: `${selectedDoc.title} · ${selectedBrick.kind} · ${selectorLabel}`,
        category: "deep-doc",
      });
      return;
    }

    if (!selectedMesh) return;
    const token = `$[mesh:${selectedMesh.id}:${selectedBrick.id}:${selectorValue}]`;
    closeAndSelect({
      token,
      label: `${selectedMesh.name} · ${selectedBrick.kind} · ${selectorLabel}`,
      category: "deep-mesh",
    });
  };

  const selectorSuggestions = useMemo((): SelectorSuggestion[] => {
    const base = selectorFiltered;
    const candidate = query.trim();
    if (!selectedBrick || !candidate) return base;

    const valid = validateCustomSelectorForKind(selectedBrick.kind, candidate);
    if (!valid) return base;

    const exists = base.some((s) => s.value.toLowerCase() === candidate.toLowerCase());
    if (exists) return base;

    return [{ value: candidate, label: `Personalizado · ${candidate}`, isCustom: true }, ...base];
  }, [selectorFiltered, query, selectedBrick]);

  const handleBack = () => {
    if (mode === "selectors") {
      if (selectedSource === "local") {
        setSelectedBrick(null);
        setMode("local-bricks");
      } else if (selectedSource === "document") {
        setSelectedBrick(null);
        setMode("doc-bricks");
      } else {
        setSelectedBrick(null);
        setMode("mesh-bricks");
      }
      return;
    }

    if (mode === "doc-bricks") {
      setSelectedDoc(null);
      setDocumentBricks([]);
      setMode("doc-list");
      return;
    }

    if (mode === "mesh-bricks") {
      setSelectedMesh(null);
      setMeshBricks([]);
      setMode("mesh-list");
      return;
    }

    setMode("root");
    setQuery("");
  };

  const getCurrentCount = () => {
    if (mode === "root") return rootCount;
    if (mode === "local-bricks") return localBricksFiltered.length;
    if (mode === "doc-list") return docsFiltered.length;
    if (mode === "doc-bricks") return docBricksFiltered.length;
    if (mode === "mesh-list") return meshesFiltered.length;
    if (mode === "mesh-bricks") return meshBricksFiltered.length;
    return selectorSuggestions.length;
  };

  const handleEnterByIndex = (index: number) => {
    if (mode === "root") {
      if (index < mentionResults.filteredMentions.length) {
        closeAndSelect(mentionResults.filteredMentions[index]);
        return;
      }
      const extraIndex = index - mentionResults.filteredMentions.length;
      const item = mentionResults.extra[extraIndex];
      if (!item) return;
      if (item.key === "locals") openLocals();
      if (item.key === "documents") openDocuments();
      if (item.key === "meshes") openMeshes();
      return;
    }

    if (mode === "local-bricks") {
      const brick = localBricksFiltered[index];
      if (brick) selectBrickAndGoSelectors(brick);
      return;
    }

    if (mode === "doc-list") {
      const doc = docsFiltered[index];
      if (doc) loadDocumentBricks(doc);
      return;
    }

    if (mode === "doc-bricks") {
      const brick = docBricksFiltered[index];
      if (brick) selectBrickAndGoSelectors(brick);
      return;
    }

    if (mode === "mesh-list") {
      const mesh = meshesFiltered[index];
      if (mesh) loadMeshBricks(mesh);
      return;
    }

    if (mode === "mesh-bricks") {
      const brick = meshBricksFiltered[index];
      if (brick) selectBrickAndGoSelectors(brick);
      return;
    }

    const selector = selectorSuggestions[index];
    if (selector) selectSelector(selector.value, selector.label);
  };

  const handleKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
    if ("stopPropagation" in e) e.stopPropagation();

    const count = getCurrentCount();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (count > 0 ? (prev + 1) % count : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (count > 0 ? (prev - 1 + count) % count : 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      handleEnterByIndex(Math.max(0, Math.min(selectedIndex, Math.max(0, count - 1))));
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (mode === "root") {
        onClose();
      } else {
        handleBack();
      }
    }
  };

  const headerTitle =
    mode === "root"
      ? "Referencias"
      : mode === "local-bricks"
        ? "Locales"
        : mode === "doc-list"
          ? "Documentos"
          : mode === "doc-bricks"
            ? selectedDoc?.title || "Bricks del documento"
            : mode === "mesh-list"
              ? "Meshes"
              : mode === "mesh-bricks"
                ? selectedMesh?.name || "Bricks del mesh"
            : `Selector ${selectedBrick?.kind || ""}`;

  const headerSubtitle =
    mode === "root"
      ? "Menciones, locales y documentos"
      : mode === "local-bricks"
        ? "Elige un brick local"
        : mode === "doc-list"
          ? "Elige documento origen"
          : mode === "doc-bricks"
            ? "Elige un brick del documento"
            : mode === "mesh-list"
              ? "Elige mesh origen"
              : mode === "mesh-bricks"
                ? "Elige un brick del mesh"
            : "Elige el selector segun tipo";

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-background/20 backdrop-blur-[2px]"
      onClick={(e) => {
        // Prevent default / propagation might not strictly be needed if not wrapped in button, but good measure
        onClose();
      }}
    >
      <div 
        className="bg-card w-full max-w-md border border-border shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-border flex items-center space-x-2">
          {mode !== "root" ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleBack}
              className="h-6 w-6 rounded hover:bg-accent/10 inline-flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{headerTitle}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{headerSubtitle}</div>
          </div>
        </div>

        <div className="p-3 border-b border-border/50">
          <input
            ref={inputRef}
            autoFocus
            className="w-full bg-transparent border border-input rounded-md h-9 px-3 outline-none text-sm placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-accent"
            placeholder={mode === "selectors" ? "Buscar selector..." : "Buscar..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {mode === "root" && (
            <>
              {mentionResults.filteredMentions.map((item, idx) => (
                <button
                  key={`${item.category}-${item.token}-${idx}`}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                    else itemRefs.current.delete(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => closeAndSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                  }`}
                >
                  {item.category === "mention" && item.mentionType === "board" && <LayoutDashboard className="h-4 w-4 opacity-70" />}
                  {item.category === "mention" && item.mentionType === "mesh" && <LayoutDashboard className="h-4 w-4 opacity-70" />}
                  {item.category === "mention" && item.mentionType === "doc" && <FileText className="h-4 w-4 opacity-70" />}
                  {item.category === "mention" && item.mentionType === "card" && <CreditCard className="h-4 w-4 opacity-70" />}
                  {item.category === "mention" && item.mentionType === "folder" && <Folder className="h-4 w-4 opacity-70" />}
                  {item.category === "mention" && item.mentionType === "user" &&
                    (item.avatarUrl ? <img src={item.avatarUrl} className="h-4 w-4 rounded-full" alt="avatar" /> : <User className="h-4 w-4 opacity-70" />)}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-50">{item.mentionType || item.category}</span>
                  </div>
                </button>
              ))}

              {mentionResults.extra.map((item, extraIdx) => {
                const idx = mentionResults.filteredMentions.length + extraIdx;
                return (
                  <button
                    key={item.key}
                    ref={(el) => {
                      if (el) itemRefs.current.set(idx, el);
                      else itemRefs.current.delete(idx);
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (item.key === "locals") openLocals();
                      else if (item.key === "documents") openDocuments();
                      else if (item.key === "meshes") openMeshes();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                      idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                    }`}
                  >
                    <FileText className="h-4 w-4 opacity-70" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{item.label} &gt;</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-50 truncate">{item.subtitle}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                );
              })}
            </>
          )}

          {mode === "local-bricks" && (
            <>
              {localBricksFiltered.map((brick, idx) => (
                <button
                  key={brick.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                    else itemRefs.current.delete(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectBrickAndGoSelectors(brick)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                  }`}
                >
                  <FileText className="h-4 w-4 opacity-70" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{getBrickLabel(brick)}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-50">{brick.kind}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-60" />
                </button>
              ))}
            </>
          )}

          {mode === "doc-list" && (
            <>
              {docsFiltered.map((doc, idx) => (
                <button
                  key={doc.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                    else itemRefs.current.delete(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => loadDocumentBricks(doc)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                  }`}
                >
                  <FileText className="h-4 w-4 opacity-70" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{doc.title}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-50 truncate">documento</span>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-60" />
                </button>
              ))}
            </>
          )}

          {mode === "doc-bricks" && (
            <>
              {isLoadingDocBricks ? (
                <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando bricks...
                </div>
              ) : (
                docBricksFiltered.map((brick, idx) => (
                  <button
                    key={brick.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(idx, el);
                      else itemRefs.current.delete(idx);
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectBrickAndGoSelectors(brick)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                      idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                    }`}
                  >
                    <FileText className="h-4 w-4 opacity-70" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{getBrickLabel(brick)}</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-50">{brick.kind}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                ))
              )}
            </>
          )}

          {mode === "mesh-list" && (
            <>
              {meshesFiltered.map((mesh, idx) => (
                <button
                  key={mesh.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                    else itemRefs.current.delete(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => loadMeshBricks(mesh)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4 opacity-70" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{mesh.name}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-50 truncate">mesh</span>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-60" />
                </button>
              ))}
            </>
          )}

          {mode === "mesh-bricks" && (
            <>
              {isLoadingMeshBricks ? (
                <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando bricks...
                </div>
              ) : (
                meshBricksFiltered.map((brick, idx) => (
                  <button
                    key={brick.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(idx, el);
                      else itemRefs.current.delete(idx);
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectBrickAndGoSelectors(brick)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                      idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                    }`}
                  >
                    <FileText className="h-4 w-4 opacity-70" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{getBrickLabel(brick)}</span>
                      <span className="text-[10px] uppercase tracking-wider opacity-50">{brick.kind}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                ))
              )}
            </>
          )}

          {mode === "selectors" && (
            <>
              {selectorSuggestions.map((sel, idx) => (
                <button
                  key={`${sel.value}-${idx}`}
                  ref={(el) => {
                    if (el) itemRefs.current.set(idx, el);
                    else itemRefs.current.delete(idx);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSelector(sel.value, sel.label)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/10"
                  }`}
                >
                  <ChevronRight className="h-4 w-4 opacity-70" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{sel.label}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-60 font-mono">{sel.value}</span>
                    {sel.isCustom && (
                      <span className="text-[10px] tracking-wider text-emerald-300 truncate">Selector personalizado valido</span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}

          {getCurrentCount() === 0 && !isLoadingDocBricks && !isLoadingMeshBricks && (
            <div className="p-8 text-center text-muted-foreground text-sm">No hay resultados para "{query}"</div>
          )}

          {mode === "doc-bricks" && !accessToken && !isLoadingDocBricks && (
            <div className="px-3 pb-3 text-[11px] text-amber-500">No hay sesion para cargar bricks del documento.</div>
          )}

          {mode === "mesh-bricks" && !accessToken && !isLoadingMeshBricks && (
            <div className="px-3 pb-3 text-[11px] text-amber-500">No hay sesion para cargar bricks del mesh.</div>
          )}
        </div>

        <div className="p-2 bg-accent/5 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-widest px-4">
          <span>↑↓ navegar</span>
          <span>↵ seleccionar</span>
          <span>esc volver/cerrar</span>
        </div>
      </div>
    </div>
  );
}
