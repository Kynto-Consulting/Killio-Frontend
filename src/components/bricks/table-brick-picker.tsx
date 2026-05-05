/**
 * Table Brick Picker - Similar to ReferencePicker but filtered for bountiful_table bricks only
 * Allows selecting a table brick from local document, another document, or a mesh
 */

"use client";

import React, { useState, useMemo, useEffect } from "react";
import { ChevronRight, ArrowLeft, Loader2, Search } from "lucide-react";
import { DocumentSummary, getDocument } from "@/lib/api/documents";
import { BoardSummary, getMesh } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

interface ActiveBrick {
  id: string;
  kind: string;
  content?: Record<string, any>;
  documentId?: string;
}

export interface TableBrickPickerSelection {
  token: string; // Format: #[local:brickId] or $[doc:docId:brickId] or $[mesh:meshId:brickId]
  label: string;
  brickId: string;
  source: "local" | "document" | "mesh";
  documentId?: string;
  meshId?: string;
  brickContent?: any;
}

interface TableBrickPickerProps {
  onSelect: (selection: TableBrickPickerSelection) => void;
  onClose: () => void;
  documents: DocumentSummary[];
  boards: BoardSummary[];
  activeBricks: ActiveBrick[];
  localScopeId?: string;
}

type Mode = "root" | "local-bricks" | "doc-list" | "doc-bricks" | "mesh-list" | "mesh-bricks";

/**
 * Filters bricks to only include bountiful_table kind
 */
function filterTableBricks(bricks: ActiveBrick[]): ActiveBrick[] {
  return bricks.filter((b) => {
    const kind = String(b.kind || "").toLowerCase();
    return kind === "bountiful_table" || kind === "beautiful_table" || kind === "database";
  });
}

function getBrickLabel(brick: ActiveBrick): string {
  const content = brick.content || {};
  if (brick.kind === "bountiful_table" || brick.kind === "beautiful_table") {
    const columns = Array.isArray(content.columns) ? content.columns : [];
    const title = String(content.title || "Table").slice(0, 40) || "Table";
    return `${title} (${columns.length} cols)`;
  }
  if (brick.kind === "database") {
    const columns = Array.isArray(content.columns) ? content.columns : [];
    return `Database (${columns.length} cols)`;
  }
  return brick.kind;
}

export function TableBrickPicker({
  onSelect,
  onClose,
  documents,
  boards,
  activeBricks,
  localScopeId = "local",
}: TableBrickPickerProps) {
  const t = useTranslations("document-detail");
  const { accessToken } = useSession();

  const [mode, setMode] = useState<Mode>("root");
  const [query, setQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<DocumentSummary | null>(null);
  const [selectedMesh, setSelectedMesh] = useState<BoardSummary | null>(null);
  const [docBricks, setDocBricks] = useState<ActiveBrick[]>([]);
  const [meshBricks, setMeshBricks] = useState<ActiveBrick[]>([]);
  const [isLoadingDocBricks, setIsLoadingDocBricks] = useState(false);
  const [isLoadingMeshBricks, setIsLoadingMeshBricks] = useState(false);

  // Filter local bricks (only bountiful_table)
  const localTableBricks = useMemo(() => {
    return filterTableBricks(activeBricks);
  }, [activeBricks]);

  // Filter documents
  const docsFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return documents.filter((doc) => doc.title?.toLowerCase().includes(q));
  }, [documents, query]);

  // Filter meshes
  const meshesFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return boards
      .filter((b) => b.boardType === "mesh")
      .filter((m) => m.name?.toLowerCase().includes(q));
  }, [boards, query]);

  // Filter doc bricks (only bountiful_table)
  const docBricksFiltered = useMemo(() => {
    return filterTableBricks(docBricks);
  }, [docBricks]);

  // Filter mesh bricks (only bountiful_table)
  const meshBricksFiltered = useMemo(() => {
    return filterTableBricks(meshBricks);
  }, [meshBricks]);

  // Filter local bricks by query
  const localBricksFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return localTableBricks.filter((brick) => {
      const label = getBrickLabel(brick);
      return label.toLowerCase().includes(q);
    });
  }, [localTableBricks, query]);

  const loadDocumentBricks = async (doc: DocumentSummary) => {
    setSelectedDoc(doc);
    setSelectedMesh(null);
    setQuery("");
    setIsLoadingDocBricks(true);
    try {
      if (!accessToken) {
        setDocBricks([]);
        setMode("doc-bricks");
        return;
      }
      const view = await getDocument(doc.id, accessToken);
      setDocBricks(
        (view.bricks || []).map((b) => ({
          id: b.id,
          kind: b.kind,
          content: b.content,
          documentId: b.documentId,
        }))
      );
      setMode("doc-bricks");
    } catch {
      setDocBricks([]);
      setMode("doc-bricks");
    } finally {
      setIsLoadingDocBricks(false);
    }
  };

  const loadMeshBricks = async (mesh: BoardSummary) => {
    setSelectedMesh(mesh);
    setSelectedDoc(null);
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

  const selectLocalBrick = (brick: ActiveBrick) => {
    onSelect({
      token: `#[${localScopeId}:${brick.id}]`,
      label: `${getBrickLabel(brick)} (local)`,
      brickId: brick.id,
      source: "local",
      brickContent: brick.content,
    });
  };

  const selectDocBrick = (brick: ActiveBrick) => {
    if (!selectedDoc) return;
    onSelect({
      token: `$[doc:${selectedDoc.id}:${brick.id}]`,
      label: `${selectedDoc.title} · ${getBrickLabel(brick)}`,
      brickId: brick.id,
      source: "document",
      documentId: selectedDoc.id,
      brickContent: brick.content,
    });
  };

  const selectMeshBrick = (brick: ActiveBrick) => {
    if (!selectedMesh) return;
    onSelect({
      token: `$[mesh:${selectedMesh.id}:${brick.id}]`,
      label: `${selectedMesh.name} · ${getBrickLabel(brick)}`,
      brickId: brick.id,
      source: "mesh",
      meshId: selectedMesh.id,
      brickContent: brick.content,
    });
  };

  const handleBack = () => {
    if (mode === "doc-bricks") {
      setSelectedDoc(null);
      setDocBricks([]);
      setMode("doc-list");
    } else if (mode === "mesh-bricks") {
      setSelectedMesh(null);
      setMeshBricks([]);
      setMode("mesh-list");
    } else {
      setMode("root");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const modeTitle =
    mode === "root"
      ? "Selecciona tabla"
      : mode === "local-bricks"
        ? "Tablas locales"
        : mode === "doc-list"
          ? "Documentos"
          : mode === "doc-bricks"
            ? selectedDoc?.title || "Tablas del documento"
            : mode === "mesh-list"
              ? "Meshes"
              : "Tablas del mesh";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-md max-h-[600px] flex flex-col bg-card border border-border rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          {mode !== "root" && (
            <button
              onClick={handleBack}
              className="p-1 hover:bg-accent/10 rounded-md transition-colors"
              title="Atrás"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-foreground flex-1 ml-2">{modeTitle}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {mode === "root" && (
            <div className="space-y-1 p-2">
              <button
                onClick={() => setMode("local-bricks")}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm"
              >
                <span>Tablas locales</span>
                <ChevronRight className="h-4 w-4 opacity-60" />
              </button>
              <button
                onClick={() => setMode("doc-list")}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm"
              >
                <span>En documentos</span>
                <ChevronRight className="h-4 w-4 opacity-60" />
              </button>
              <button
                onClick={() => setMode("mesh-list")}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm"
              >
                <span>En meshes</span>
                <ChevronRight className="h-4 w-4 opacity-60" />
              </button>
            </div>
          )}

          {mode === "local-bricks" && (
            <div className="space-y-1 p-2">
              {localBricksFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay tablas en este documento
                </div>
              ) : (
                localBricksFiltered.map((brick) => (
                  <button
                    key={brick.id}
                    onClick={() => selectLocalBrick(brick)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm"
                  >
                    {getBrickLabel(brick)}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "doc-list" && (
            <div className="space-y-1 p-2">
              {docsFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay documentos
                </div>
              ) : (
                docsFiltered.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => loadDocumentBricks(doc)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm"
                  >
                    <span>{doc.title}</span>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "doc-bricks" && (
            <div className="space-y-1 p-2">
              {isLoadingDocBricks ? (
                <div className="p-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : docBricksFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay tablas en este documento
                </div>
              ) : (
                docBricksFiltered.map((brick) => (
                  <button
                    key={brick.id}
                    onClick={() => selectDocBrick(brick)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm"
                  >
                    {getBrickLabel(brick)}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "mesh-list" && (
            <div className="space-y-1 p-2">
              {meshesFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay meshes
                </div>
              ) : (
                meshesFiltered.map((mesh) => (
                  <button
                    key={mesh.id}
                    onClick={() => loadMeshBricks(mesh)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm"
                  >
                    <span>{mesh.name}</span>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "mesh-bricks" && (
            <div className="space-y-1 p-2">
              {isLoadingMeshBricks ? (
                <div className="p-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : meshBricksFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No hay tablas en este mesh
                </div>
              ) : (
                meshBricksFiltered.map((brick) => (
                  <button
                    key={brick.id}
                    onClick={() => selectMeshBrick(brick)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm"
                  >
                    {getBrickLabel(brick)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
