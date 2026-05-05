/**
 * Table Brick Picker - Allows selecting a bountiful_table from local document,
 * another document, a mesh, OR a kanban board list (to create cards via form).
 */

"use client";

import React, { useState, useMemo, useEffect } from "react";
import { ChevronRight, ArrowLeft, Loader2, Search, LayoutDashboard, Table2, FileText, Layers } from "lucide-react";
import { DocumentSummary, getDocument } from "@/lib/api/documents";
import { BoardSummary, BoardView, getMesh, getBoard, getTagsByScope } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";

interface ActiveBrick {
  id: string;
  kind: string;
  content?: Record<string, any>;
  documentId?: string;
}

export interface TableBrickPickerSelection {
  token: string;
  label: string;
  brickId: string; // brickId for tables; listId for board source
  source: "local" | "document" | "mesh" | "board";
  documentId?: string;
  meshId?: string;
  boardId?: string;   // only for board source
  listId?: string;    // only for board source
  boardTags?: { id: string; name: string; color?: string }[]; // fetched board tags for tag field
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

type Mode =
  | "root"
  | "local-bricks"
  | "doc-list"
  | "doc-bricks"
  | "mesh-list"
  | "mesh-bricks"
  | "board-list"     // pick a kanban board
  | "board-lists";   // pick a list within a board

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
  const [selectedBoard, setSelectedBoard] = useState<BoardSummary | null>(null);
  const [docBricks, setDocBricks] = useState<ActiveBrick[]>([]);
  const [meshBricks, setMeshBricks] = useState<ActiveBrick[]>([]);
  const [boardLists, setBoardLists] = useState<{ id: string; name: string }[]>([]);
  const [boardTags, setBoardTags] = useState<{ id: string; name: string; color?: string }[]>([]);
  const [isLoadingDocBricks, setIsLoadingDocBricks] = useState(false);
  const [isLoadingMeshBricks, setIsLoadingMeshBricks] = useState(false);
  const [isLoadingBoardLists, setIsLoadingBoardLists] = useState(false);

  const localTableBricks = useMemo(() => filterTableBricks(activeBricks), [activeBricks]);

  const docsFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return documents.filter((doc) => doc.title?.toLowerCase().includes(q));
  }, [documents, query]);

  const meshesFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return boards
      .filter((b) => b.boardType === "mesh")
      .filter((m) => m.name?.toLowerCase().includes(q));
  }, [boards, query]);

  const kanbanBoardsFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return boards
      .filter((b) => b.boardType === "kanban")
      .filter((b) => b.name?.toLowerCase().includes(q));
  }, [boards, query]);

  const docBricksFiltered = useMemo(() => filterTableBricks(docBricks), [docBricks]);
  const meshBricksFiltered = useMemo(() => filterTableBricks(meshBricks), [meshBricks]);

  const localBricksFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return localTableBricks.filter((brick) => getBrickLabel(brick).toLowerCase().includes(q));
  }, [localTableBricks, query]);

  const boardListsFiltered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return boardLists.filter((l) => l.name.toLowerCase().includes(q));
  }, [boardLists, query]);

  const loadDocumentBricks = async (doc: DocumentSummary) => {
    setSelectedDoc(doc);
    setSelectedMesh(null);
    setQuery("");
    setIsLoadingDocBricks(true);
    try {
      if (!accessToken) { setDocBricks([]); setMode("doc-bricks"); return; }
      const view = await getDocument(doc.id, accessToken);
      setDocBricks(
        (view.bricks || []).map((b) => ({ id: b.id, kind: b.kind, content: b.content, documentId: b.documentId }))
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
      if (!accessToken) { setMeshBricks([]); setMode("mesh-bricks"); return; }
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

  const loadBoardLists = async (board: BoardSummary) => {
    setSelectedBoard(board);
    setQuery("");
    setIsLoadingBoardLists(true);
    try {
      if (!accessToken) { setBoardLists([]); setBoardTags([]); setMode("board-lists"); return; }
      const [boardView, tags] = await Promise.all([
        getBoard(board.id, accessToken),
        getTagsByScope('board', board.id, accessToken).catch(() => []),
      ]);
      setBoardLists((boardView.lists || []).map((l) => ({ id: l.id, name: l.name })));
      setBoardTags((tags || []).map((t: any) => ({ id: t.id, name: t.name, color: t.color })));
      setMode("board-lists");
    } catch {
      setBoardLists([]);
      setBoardTags([]);
      setMode("board-lists");
    } finally {
      setIsLoadingBoardLists(false);
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

  const selectBoardList = (list: { id: string; name: string }) => {
    if (!selectedBoard) return;
    onSelect({
      token: `$[board:${selectedBoard.id}:${list.id}]`,
      label: `${selectedBoard.name} · ${list.name} (Kanban)`,
      brickId: list.id,
      source: "board",
      boardId: selectedBoard.id,
      listId: list.id,
      boardTags: boardTags.length > 0 ? boardTags : undefined,
    });
  };

  const handleBack = () => {
    if (mode === "doc-bricks") { setSelectedDoc(null); setDocBricks([]); setMode("doc-list"); }
    else if (mode === "mesh-bricks") { setSelectedMesh(null); setMeshBricks([]); setMode("mesh-list"); }
    else if (mode === "board-lists") { setSelectedBoard(null); setBoardLists([]); setBoardTags([]); setMode("board-list"); }
    else setMode("root");
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Escape") onClose(); };

  const modeTitle =
    mode === "root" ? "Conectar a base de datos" :
    mode === "local-bricks" ? "Tablas locales" :
    mode === "doc-list" ? "Documentos" :
    mode === "doc-bricks" ? selectedDoc?.title || "Tablas del documento" :
    mode === "mesh-list" ? "Meshes" :
    mode === "mesh-bricks" ? selectedMesh?.name || "Tablas del mesh" :
    mode === "board-list" ? "Tableros Kanban" :
    selectedBoard?.name || "Listas del tablero";

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
            <button onClick={handleBack} className="p-1 hover:bg-accent/10 rounded-md transition-colors" title="Atrás">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-foreground flex-1 ml-2">{modeTitle}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">✕</button>
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
              {[
                { label: "Tablas locales", icon: <Table2 className="h-4 w-4 text-muted-foreground" />, action: () => setMode("local-bricks"), desc: "Bountiful Tables en este documento" },
                { label: "En documentos", icon: <FileText className="h-4 w-4 text-muted-foreground" />, action: () => setMode("doc-list"), desc: "Tablas en otros documentos" },
                { label: "En meshes", icon: <Layers className="h-4 w-4 text-muted-foreground" />, action: () => setMode("mesh-list"), desc: "Tablas en tableros mesh" },
                { label: "Lista Kanban", icon: <LayoutDashboard className="h-4 w-4 text-muted-foreground" />, action: () => setMode("board-list"), desc: "Crear cards en un tablero Kanban" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent/10 transition-colors flex items-center gap-3 text-sm"
                >
                  {item.icon}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.desc}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-60 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {mode === "local-bricks" && (
            <div className="space-y-1 p-2">
              {localBricksFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No hay tablas en este documento</div>
              ) : (
                localBricksFiltered.map((brick) => (
                  <button key={brick.id} onClick={() => selectLocalBrick(brick)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm">
                    {getBrickLabel(brick)}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "doc-list" && (
            <div className="space-y-1 p-2">
              {docsFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No hay documentos</div>
              ) : (
                docsFiltered.map((doc) => (
                  <button key={doc.id} onClick={() => loadDocumentBricks(doc)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm">
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
                <div className="p-4 text-center text-sm text-muted-foreground">No hay tablas en este documento</div>
              ) : (
                docBricksFiltered.map((brick) => (
                  <button key={brick.id} onClick={() => selectDocBrick(brick)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm">
                    {getBrickLabel(brick)}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "mesh-list" && (
            <div className="space-y-1 p-2">
              {meshesFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No hay meshes</div>
              ) : (
                meshesFiltered.map((mesh) => (
                  <button key={mesh.id} onClick={() => loadMeshBricks(mesh)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm">
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
                <div className="p-4 text-center text-sm text-muted-foreground">No hay tablas en este mesh</div>
              ) : (
                meshBricksFiltered.map((brick) => (
                  <button key={brick.id} onClick={() => selectMeshBrick(brick)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm">
                    {getBrickLabel(brick)}
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "board-list" && (
            <div className="space-y-1 p-2">
              {kanbanBoardsFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No hay tableros Kanban</div>
              ) : (
                kanbanBoardsFiltered.map((board) => (
                  <button key={board.id} onClick={() => loadBoardLists(board)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{board.name}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-60" />
                  </button>
                ))
              )}
            </div>
          )}

          {mode === "board-lists" && (
            <div className="space-y-1 p-2">
              {isLoadingBoardLists ? (
                <div className="p-8 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Cargando listas...</span>
                </div>
              ) : boardListsFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No hay listas en este tablero</div>
              ) : (
                <>
                  <p className="px-3 py-1 text-xs text-muted-foreground">Las respuestas del formulario crearán cards en la lista seleccionada.</p>
                  {boardListsFiltered.map((list) => (
                    <button key={list.id} onClick={() => selectBoardList(list)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-sm flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
                      {list.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
