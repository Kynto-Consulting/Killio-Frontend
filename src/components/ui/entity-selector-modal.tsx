"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Layers, LayoutGrid, Loader2, Search, X } from "lucide-react";
import { listTeamCatalog, type TeamCatalog } from "@/lib/api/contracts";

export type EntitySelectorResult = {
  id: string;
  type: "mesh" | "board" | "document" | "card";
  label: string;
  /** Additional context (board name for cards) */
  context?: string;
};

interface EntitySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: EntitySelectorResult) => void;
  teamId: string;
  accessToken: string;
  /** Optionally restrict which types are shown */
  allowedTypes?: EntitySelectorResult["type"][];
}

export function EntitySelectorModal({
  isOpen,
  onClose,
  onSelect,
  teamId,
  accessToken,
  allowedTypes,
}: EntitySelectorModalProps) {
  const [catalog, setCatalog] = useState<TeamCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "boards" | "docs" | "cards">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) { setQuery(""); setCatalog(null); return; }
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
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar boards, documentos, cards…"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
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
                      onClick={() => onSelect({ id: b.id, type: "mesh", label: b.name })}
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
                      onClick={() => onSelect({ id: b.id, type: "board", label: b.name })}
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
                      onClick={() => onSelect({ id: d.id, type: "document", label: d.title })}
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
                      onClick={() => onSelect({ id: c.id, type: "card", label: c.title, context: c.boardName })}
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
