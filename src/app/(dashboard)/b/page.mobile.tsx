"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Layout, Plus, Search, Trash2, Clock, ChevronRight } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, deleteBoard, uploadFile, createBoard } from "@/lib/api/contracts";
import { CreateBoardModal, type CreateBoardSubmitPayload } from "@/components/ui/create-board-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { apiCache, CACHE_TTL, cacheKey } from "@/lib/api-cache";
import { SkeletonBoardCard } from "@/components/ui/skeleton";

function resolveBoardColor(board: BoardSummary): { className: string; style?: CSSProperties } {
  if (board.backgroundKind === "color" && board.backgroundValue) {
    return { className: "bg-slate-800", style: { backgroundColor: board.backgroundValue } };
  }
  if (board.backgroundKind === "gradient" && board.backgroundGradient) {
    if (board.backgroundGradient.startsWith("bg-")) return { className: board.backgroundGradient };
    return { className: "bg-slate-800", style: { background: board.backgroundGradient } };
  }
  if (board.backgroundKind === "preset" && board.backgroundValue) return { className: board.backgroundValue };
  if (board.backgroundKind === "image" && board.backgroundImageUrl) {
    return { className: "bg-slate-800 bg-cover bg-center", style: { backgroundImage: `url(${board.backgroundImageUrl})` } };
  }
  if (board.coverImageUrl) {
    return { className: "bg-slate-800 bg-cover bg-center", style: { backgroundImage: `url(${board.coverImageUrl})` } };
  }
  return { className: "bg-gradient-to-tr from-accent/30 to-primary/30" };
}

export default function BoardsPageMobile() {
  const t = useTranslations("boards");
  const { accessToken, activeTeamId } = useSession();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    const key = cacheKey.boards(activeTeamId);
    const cached = apiCache.get<BoardSummary[]>(key);
    if (cached) { setBoards(cached); } else { setIsLoading(true); }

    listTeamBoards(activeTeamId, accessToken)
      .then((fresh) => { apiCache.set(key, fresh, CACHE_TTL.BOARDS); setBoards(fresh); })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const handleCreateSubmit = async (payload: CreateBoardSubmitPayload) => {
    if (!accessToken || !activeTeamId) return;
    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;
    const newBoard = await createBoard({ ...payload, slug }, activeTeamId, accessToken);
    const updated = [...boards, newBoard];
    setBoards(updated);
    apiCache.set(cacheKey.boards(activeTeamId), updated, CACHE_TTL.BOARDS);
    toast(t("boardCreatedSuccess"), "success");
  };

  const handleUploadCover = async (file: File): Promise<string> => {
    if (!accessToken) throw new Error("Sesión expirada");
    const { url } = await uploadFile(file, accessToken, activeTeamId ? { ownerScopeType: "team", ownerScopeId: activeTeamId, usage: "board-cover" } : { usage: "board-cover" });
    return url;
  };

  const handleDelete = async () => {
    if (!accessToken || !boardToDelete || !activeTeamId) return;
    await deleteBoard(boardToDelete.id, accessToken);
    const updated = boards.filter(b => b.id !== boardToDelete.id);
    setBoards(updated);
    apiCache.set(cacheKey.boards(activeTeamId), updated, CACHE_TTL.BOARDS);
    setBoardToDelete(null);
    toast(t("boardDeleteSuccess"), "success");
  };

  const filtered = boards.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">{t("title")}</h1>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-accent-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 h-8 rounded-lg border border-border bg-card/60 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Board list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {isLoading && boards.length === 0 && (
          <>{[1,2,3,4].map(i => <SkeletonBoardCard key={i} className="h-16 rounded-xl" />)}</>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
              <Layout className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">{t("noBoardsFound")}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
              {search ? t("noBoardsMatch", { query: search }) : t("noBoardsEmpty")}
            </p>
            {!search && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-accent/10 text-accent text-sm font-medium"
              >
                {t("createFirstBoard")}
              </button>
            )}
          </div>
        )}

        {filtered.map((board) => {
          const cover = resolveBoardColor(board);
          return (
            <div key={board.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card overflow-hidden active:scale-[0.99] transition-transform">
              {/* Color strip */}
              <div
                className={`w-14 h-14 shrink-0 ${cover.className}`}
                style={cover.style}
              />
              <Link href={`/b/${board.id}`} className="flex-1 min-w-0 py-3">
                <p className="text-sm font-semibold truncate">{board.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  {new Date(board.updatedAt).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center gap-1 pr-3">
                <button
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.preventDefault(); setBoardToDelete({ id: board.id, name: board.name }); }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
            </div>
          );
        })}
      </div>

      <CreateBoardModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSubmit}
        onUploadCoverImage={handleUploadCover}
      />
      <ConfirmDeleteModal
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={handleDelete}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: boardToDelete?.name || "" })}
      />
    </div>
  );
}
