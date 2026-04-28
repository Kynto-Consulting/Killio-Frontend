"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, Layers, LayoutGrid, Loader2, Search, X } from "lucide-react";
import { getBoard, getCard, getMesh, listTeamCatalog, type CardView, type TeamCatalog } from "@/lib/api/contracts";
import { getDocument, type DocumentBrick } from "@/lib/api/documents";

export type EntitySelectorResult = {
  id: string;
  type: "mesh" | "board" | "document" | "card";
  label: string;
  /** Additional context (board name for cards) */
  context?: string;
  /** Source scope metadata (for mirror) */
  sourceScopeType?: "mesh" | "board" | "document" | "card";
  sourceScopeId?: string;
  sourceScopeLabel?: string;
  sourceListId?: string;
  sourceListLabel?: string;
  sourceCardId?: string;
  sourceCardLabel?: string;
  brickKind?: string;
  previewMarkdown?: string;
  previewContent?: Record<string, unknown>;
};

interface EntitySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: EntitySelectorResult) => void;
  teamId: string;
  accessToken: string;
  /** Optionally restrict which types are shown */
  allowedTypes?: EntitySelectorResult["type"][];
  selectionMode?: "portal" | "mirror";
}

type SelectorBrick = {
  id: string;
  kind: string;
  label: string;
  preview: string;
  previewContent?: Record<string, unknown>;
};

function clonePreviewContent(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function toBoardBrickPreviewContent(brick: CardView["blocks"][number]): Record<string, unknown> | undefined {
  if (!brick || typeof brick !== "object") return undefined;

  if ((brick as any).content && typeof (brick as any).content === "object") {
    return clonePreviewContent((brick as any).content);
  }

  if (brick.kind === "text") {
    const markdown = String((brick as any).markdown || "");
    return { kind: "text", markdown, text: markdown, displayStyle: (brick as any).displayStyle || "paragraph" };
  }

  if (brick.kind === "table") {
    return { kind: "table", rows: Array.isArray((brick as any).rows) ? (brick as any).rows : [] };
  }

  if (brick.kind === "checklist") {
    return { kind: "checklist", items: Array.isArray((brick as any).items) ? (brick as any).items : [] };
  }

  if (brick.kind === "media") {
    return {
      kind: "media",
      mediaType: (brick as any).mediaType,
      title: (brick as any).title,
      url: (brick as any).url,
      mimeType: (brick as any).mimeType,
      sizeBytes: (brick as any).sizeBytes,
      caption: (brick as any).caption,
      assetId: (brick as any).assetId,
    };
  }

  if (brick.kind === "graph") {
    return {
      kind: "graph",
      type: (brick as any).type,
      data: Array.isArray((brick as any).data) ? (brick as any).data : [],
      title: (brick as any).title,
    };
  }

  if (brick.kind === "accordion") {
    return {
      ...(clonePreviewContent((brick as any).content) || {}),
      kind: "accordion",
      title: (brick as any).title || "",
      body: (brick as any).body || "",
      isExpanded: !!(brick as any).isExpanded,
    };
  }

  if (brick.kind === "tabs") {
    return {
      ...(clonePreviewContent((brick as any).content) || {}),
      kind: "tabs",
      tabs: Array.isArray((brick as any).tabs) ? (brick as any).tabs : [],
    };
  }

  if (brick.kind === "columns") {
    return {
      ...(clonePreviewContent((brick as any).content) || {}),
      kind: "columns",
      columns: Array.isArray((brick as any).columns) ? (brick as any).columns : [],
    };
  }

  return undefined;
}

type SelectorStep =
  | { kind: "entity" }
  | { kind: "board-list"; boardId: string; boardName: string; lists: Array<{ id: string; name: string; cards: CardView[] }> }
  | {
      kind: "board-card";
      boardId: string;
      boardName: string;
      lists: Array<{ id: string; name: string; cards: CardView[] }>;
      listId: string;
      listName: string;
      cards: CardView[];
    }
  | {
      kind: "brick";
      sourceType: "document" | "mesh" | "card";
      sourceId: string;
      sourceLabel: string;
      bricks: SelectorBrick[];
      contextPath?: string;
      sourceListId?: string;
      sourceListLabel?: string;
      sourceCardId?: string;
      sourceCardLabel?: string;
    };

function clip(text: string, max = 90): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function getDocBrickPreview(brick: DocumentBrick): SelectorBrick {
  const content = (brick.content && typeof brick.content === "object") ? (brick.content as Record<string, unknown>) : {};
  const markdown = typeof content.markdown === "string" ? content.markdown : "";
  const title = clip(markdown, 70) || `${brick.kind} · ${brick.id.slice(-6)}`;
  return {
    id: brick.id,
    kind: brick.kind,
    label: title,
    preview: markdown || `${brick.kind} (${brick.id})`,
    previewContent: clonePreviewContent(content),
  };
}

function getBoardBrickPreview(brick: CardView["blocks"][number]): SelectorBrick {
  const anyBrick = brick as Record<string, unknown>;
  const markdown = typeof anyBrick.markdown === "string" ? anyBrick.markdown : "";
  const summary = typeof anyBrick.summary === "string" ? anyBrick.summary : "";
  const title = clip(markdown || summary, 70) || `${brick.kind} · ${brick.id.slice(-6)}`;
  return {
    id: brick.id,
    kind: brick.kind,
    label: title,
    preview: markdown || summary || `${brick.kind} (${brick.id})`,
    previewContent: toBoardBrickPreviewContent(brick),
  };
}

function getMeshBrickPreview(brick: { id: string; kind: string; content?: Record<string, unknown> }): SelectorBrick {
  const content = (brick.content && typeof brick.content === "object") ? brick.content : {};
  const markdown = typeof content.markdown === "string" ? content.markdown : "";
  const label = typeof content.label === "string" ? content.label : "";
  const title = clip(markdown || label, 70) || `${brick.kind} · ${brick.id.slice(-6)}`;
  return {
    id: brick.id,
    kind: brick.kind,
    label: title,
    preview: markdown || label || `${brick.kind} (${brick.id})`,
    previewContent: clonePreviewContent(content),
  };
}

export function EntitySelectorModal({
  isOpen,
  onClose,
  onSelect,
  teamId,
  accessToken,
  allowedTypes,
  selectionMode = "portal",
}: EntitySelectorModalProps) {
  const [catalog, setCatalog] = useState<TeamCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "boards" | "docs" | "cards">("all");
  const [step, setStep] = useState<SelectorStep>({ kind: "entity" });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setCatalog(null);
      setStep({ kind: "entity" });
      setDetailLoading(false);
      return;
    }
    setLoading(true);
    listTeamCatalog(teamId, accessToken)
      .then(setCatalog)
      .catch(() => setCatalog({ boards: [], documents: [], cards: [] }))
      .finally(() => setLoading(false));
  }, [isOpen, teamId, accessToken]);

  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [isOpen]);

  if (!isOpen) return null;

  const goBack = () => {
    if (step.kind === "entity") return;
    if (step.kind === "board-card") {
      setStep({ kind: "board-list", boardId: step.boardId, boardName: step.boardName, lists: step.lists });
      return;
    }
    setStep({ kind: "entity" });
  };

  const handleEntitySelect = async (entity: { id: string; type: EntitySelectorResult["type"]; label: string; context?: string }) => {
    if (selectionMode === "portal") {
      onSelect(entity);
      return;
    }

    setDetailLoading(true);
    try {
      if (entity.type === "document") {
        const doc = await getDocument(entity.id, accessToken);
        setStep({
          kind: "brick",
          sourceType: "document",
          sourceId: doc.id,
          sourceLabel: doc.title || "Documento",
          bricks: (doc.bricks || []).map(getDocBrickPreview),
          contextPath: doc.title || "Documento",
        });
        return;
      }
      if (entity.type === "mesh") {
        const mesh = await getMesh(entity.id, accessToken);
        const bricks = Object.values(mesh.state.bricksById).map((b) => getMeshBrickPreview({ id: b.id, kind: b.kind, content: b.content }));
        setStep({
          kind: "brick",
          sourceType: "mesh",
          sourceId: mesh.meshId,
          sourceLabel: entity.label,
          bricks,
          contextPath: entity.label,
        });
        return;
      }
      if (entity.type === "board") {
        const board = await getBoard(entity.id, accessToken);
        setStep({ kind: "board-list", boardId: board.id, boardName: board.name, lists: board.lists });
        return;
      }
      if (entity.type === "card") {
        const card = await getCard(entity.id, accessToken);
        setStep({
          kind: "brick",
          sourceType: "card",
          sourceId: card.id,
          sourceLabel: card.title,
          bricks: (card.blocks || []).map(getBoardBrickPreview),
          sourceCardId: card.id,
          sourceCardLabel: card.title,
          contextPath: `${entity.context || "Board"} / ${card.title}`,
        });
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const q = query.toLowerCase();

  const meshBoards = !allowedTypes || allowedTypes.includes("mesh")
    ? (catalog?.boards ?? []).filter((b) => b.boardType === "mesh" && b.name.toLowerCase().includes(q))
    : [];
  const kanbanBoards = !allowedTypes || allowedTypes.includes("board")
    ? (catalog?.boards ?? []).filter((b) => b.boardType === "kanban" && b.name.toLowerCase().includes(q))
    : [];
  const docs = !allowedTypes || allowedTypes.includes("document")
    ? (catalog?.documents ?? []).filter((d) => d.title.toLowerCase().includes(q))
    : [];
  const cards = !allowedTypes || allowedTypes.includes("card")
    ? (catalog?.cards ?? []).filter((c) => c.title.toLowerCase().includes(q) || c.boardName.toLowerCase().includes(q))
    : [];

  const hasResults = meshBoards.length + kanbanBoards.length + docs.length + cards.length > 0;

  const TAB_COUNTS = {
    all: meshBoards.length + kanbanBoards.length + docs.length + cards.length,
    boards: meshBoards.length + kanbanBoards.length,
    docs: docs.length,
    cards: cards.length,
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex h-[520px] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          {step.kind !== "entity" && (
            <button
              type="button"
              onClick={goBack}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder={step.kind === "entity" ? "Buscar boards, documentos, cards..." : "Filtrar..."}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tabs */}
        {step.kind === "entity" && (
          <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-2 pt-1">
            {(["all", "boards", "docs", "cards"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex items-center gap-1 rounded-t px-3 py-1.5 text-[11px] font-medium transition-colors capitalize ${
                  tab === t
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "Todo" : t === "boards" ? "Boards" : t === "docs" ? "Docs" : "Cards"}
                <span className="rounded-full bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                  {TAB_COUNTS[t]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading || detailLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : step.kind === "board-list" ? (
            <section className="space-y-1">
              <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Listas · {step.boardName}</p>
              {step.lists
                .filter((l) => l.name.toLowerCase().includes(q))
                .map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                    onClick={() => setStep({ kind: "board-card", boardId: step.boardId, boardName: step.boardName, lists: step.lists, listId: l.id, listName: l.name, cards: l.cards })}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0 text-blue-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{l.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground/60">{l.cards.length} cards</p>
                    </div>
                  </button>
                ))}
            </section>
          ) : step.kind === "board-card" ? (
            <section className="space-y-1">
              <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Cards · {step.boardName} / {step.listName}</p>
              {step.cards
                .filter((c) => c.title.toLowerCase().includes(q))
                .map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                    onClick={async () => {
                      setDetailLoading(true);
                      try {
                        const fullCard = await getCard(card.id, accessToken);
                        setStep({
                          kind: "brick",
                          sourceType: "card",
                          sourceId: fullCard.id,
                          sourceLabel: fullCard.title,
                          bricks: (fullCard.blocks || []).map(getBoardBrickPreview),
                          sourceListId: step.listId,
                          sourceListLabel: step.listName,
                          sourceCardId: fullCard.id,
                          sourceCardLabel: fullCard.title,
                          contextPath: `${step.boardName} / ${step.listName} / ${fullCard.title}`,
                        });
                      } finally {
                        setDetailLoading(false);
                      }
                    }}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="flex-1 truncate text-foreground">{card.title || "(sin título)"}</span>
                  </button>
                ))}
            </section>
          ) : step.kind === "brick" ? (
            <section className="space-y-1">
              <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Bricks · {step.contextPath || step.sourceLabel}</p>
              {step.bricks
                .filter((b) => b.label.toLowerCase().includes(q) || b.kind.toLowerCase().includes(q))
                .map((brick) => (
                  <button
                    key={brick.id}
                    type="button"
                    className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                    onClick={() => onSelect({
                      id: brick.id,
                      type: step.sourceType,
                      label: brick.label,
                      context: step.contextPath,
                      sourceScopeType: step.sourceType,
                      sourceScopeId: step.sourceId,
                      sourceScopeLabel: step.sourceLabel,
                      sourceListId: step.sourceListId,
                      sourceListLabel: step.sourceListLabel,
                      sourceCardId: step.sourceCardId,
                      sourceCardLabel: step.sourceCardLabel,
                      brickKind: brick.kind,
                      previewMarkdown: brick.preview,
                      previewContent: brick.previewContent,
                    })}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{brick.label}</p>
                      <p className="truncate text-[10px] text-muted-foreground/60">{brick.kind} · {brick.id.slice(-8)}</p>
                    </div>
                  </button>
                ))}
            </section>
          ) : !hasResults ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground/50">Sin resultados</p>
            </div>
          ) : (
            <>
              {/* Mesh Boards */}
              {(tab === "all" || tab === "boards") && meshBoards.length > 0 && (
                <section className="mb-3">
                  <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Mesh Boards</p>
                  {meshBoards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                      onClick={() => void handleEntitySelect({ id: b.id, type: "mesh", label: b.name })}
                    >
                      <Layers className="h-4 w-4 shrink-0 text-cyan-400" />
                      <span className="flex-1 truncate text-foreground">{b.name}</span>
                    </button>
                  ))}
                </section>
              )}

              {/* Kanban Boards */}
              {(tab === "all" || tab === "boards") && kanbanBoards.length > 0 && (
                <section className="mb-3">
                  <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Kanban Boards</p>
                  {kanbanBoards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                      onClick={() => void handleEntitySelect({ id: b.id, type: "board", label: b.name })}
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0 text-blue-400" />
                      <span className="flex-1 truncate text-foreground">{b.name}</span>
                    </button>
                  ))}
                </section>
              )}

              {/* Documents */}
              {(tab === "all" || tab === "docs") && docs.length > 0 && (
                <section className="mb-3">
                  <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Documentos</p>
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                      onClick={() => void handleEntitySelect({ id: d.id, type: "document", label: d.title })}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-violet-400" />
                      <span className="flex-1 truncate text-foreground">{d.title || "(sin título)"}</span>
                    </button>
                  ))}
                </section>
              )}

              {/* Cards */}
              {(tab === "all" || tab === "cards") && cards.length > 0 && (
                <section className="mb-3">
                  <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Cards</p>
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors"
                      onClick={() => void handleEntitySelect({ id: c.id, type: "card", label: c.title, context: c.boardName })}
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0 text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">{c.title || "(sin título)"}</p>
                        <p className="truncate text-[10px] text-muted-foreground/60">{c.boardName}</p>
                      </div>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
